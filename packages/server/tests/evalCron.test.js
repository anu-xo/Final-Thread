import { jest } from '@jest/globals';

process.env.GEMINI_API_KEY = 'test-key';
process.env.GROQ_API_KEY = 'test-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const mockGenerateNonStreamingResponse = jest.fn();
const mockEmbedQuery = jest.fn();
const mockRetrieveContext = jest.fn();
const mockBuildPrompt = jest.fn();
const mockBuildPromptWithinBudget = jest.fn();
const mockBuildSystemPrompt = jest.fn();
const mockBuildThreadSummaryPrompt = jest.fn();
const mockBuildDigestHighlightPrompt = jest.fn();
const mockEvalResultCreate = jest.fn();
const mockCommunityFindById = jest.fn();
const mockAxiosPost = jest.fn();
const mockRunMentionSuite = jest.fn();
const mockRunSummarySuite = jest.fn();
const mockRunDigestSuite = jest.fn();

jest.unstable_mockModule('../src/services/aiService.js', () => ({
  generateNonStreamingResponse: mockGenerateNonStreamingResponse,
  embedQuery: mockEmbedQuery,
  retrieveContext: mockRetrieveContext,
  buildPrompt: mockBuildPrompt,
  buildPromptWithinBudget: mockBuildPromptWithinBudget,
  buildSystemPrompt: mockBuildSystemPrompt,
  buildThreadSummaryPrompt: mockBuildThreadSummaryPrompt,
  buildDigestHighlightPrompt: mockBuildDigestHighlightPrompt,
  THREAD_SUMMARY_PROMPT_VERSION: 'summary-v1.0',
  DIGEST_HIGHLIGHT_PROMPT_VERSION: 'digest-v1.0',
}));

jest.unstable_mockModule('../src/jobs/embeddingQueue.js', () => ({
  getEmbeddingQueue: () => ({ add: jest.fn().mockResolvedValue({ id: 'mock-embedding-job-uuid' }) }),
}));

jest.unstable_mockModule('../src/socket.js', () => ({
  getIO: () => ({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) }),
  initIO: jest.fn(),
}));

jest.unstable_mockModule('node-cron', () => ({
  default: { schedule: jest.fn() },
}));

jest.unstable_mockModule('axios', () => ({
  default: { post: mockAxiosPost },
}));

jest.unstable_mockModule('../src/models/EvalResult.js', () => ({
  default: { create: mockEvalResultCreate },
}));

jest.unstable_mockModule('../src/models/Community.js', () => ({
  default: { findById: mockCommunityFindById },
}));

jest.unstable_mockModule('../src/jobs/evalNeoLayers.js', () => ({
  runMentionSuite: mockRunMentionSuite,
  runSummarySuite: mockRunSummarySuite,
  runDigestSuite: mockRunDigestSuite,
}));

const {
  buildJudgePrompt,
  buildPerTypeReport,
  notifyDiscord,
  runNightlyEval,
} = await import('../src/jobs/evalCron.js');

const { default: questionsByCommunity } = await import('../src/scripts/evalQuestions.json', {
  with: { type: 'json' },
});
const TOTAL_QUESTIONS = Object.values(questionsByCommunity).reduce(
  (sum, qs) => sum + qs.length,
  0
);

const VALID_GRADE_JSON = '{"relevance": 4, "groundedness": 4, "faithfulness": 4}';

describe('buildJudgePrompt — type-aware rubric', () => {
  test('autonomous_summary uses the summary dimension definitions, not the passive_chat ones', () => {
    const prompt = buildJudgePrompt(
      'autonomous_summary',
      'A and B disagree on pricing.',
      'POST: ...\nCOMMENT A: ...\nCOMMENT B: ...'
    );

    expect(prompt).toContain('Does it capture the actual themes/points raised, not generic filler?');
    expect(prompt).toContain('Are all summarized points traceable to the top comments provided?');
    expect(prompt).toContain('Does it stay neutral and avoid asserting a side was "right"?');

    expect(prompt).not.toContain('Does the response actually address the user\'s question?');
    expect(prompt).not.toContain('Is every claim traceable to the provided post/comment context?');
  });
});

describe('runNightlyEval — malformed judge JSON resilience', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateNonStreamingResponse.mockResolvedValue(VALID_GRADE_JSON);
    mockEmbedQuery.mockResolvedValue([0.1, 0.2, 0.3]);
    mockRetrieveContext.mockResolvedValue([]);
    mockBuildPrompt.mockReturnValue('built prompt');
    mockCommunityFindById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ name: 'Test Community', slug: 'test' }),
    });
    mockEvalResultCreate.mockImplementation(async (data) => ({
      _id: 'mock-doc-id',
      question: data.question,
      isEdgeCase: data.isEdgeCase === true,
    }));
    mockRunMentionSuite.mockResolvedValue({
      type: 'autonomous_mention',
      label: 'Autonomous Mention',
      results: [],
    });
    mockRunSummarySuite.mockResolvedValue({
      type: 'autonomous_summary',
      label: 'Autonomous Summary',
      results: [],
    });
    mockRunDigestSuite.mockResolvedValue({
      type: 'digest_highlight',
      label: 'Digest Highlight',
      results: [],
    });
  });

  test('malformed judge JSON skips the row, cron continues, does not throw', async () => {
    const originalSetTimeout = global.setTimeout;
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay) => {
      if (delay === 500) {
        fn();
        return 0;
      }
      return originalSetTimeout(fn, delay);
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      mockGenerateNonStreamingResponse
        .mockResolvedValueOnce(VALID_GRADE_JSON)
        .mockResolvedValueOnce('here is my assessment — relevance 4/5, not JSON')
        .mockResolvedValue(VALID_GRADE_JSON);

      const summary = await runNightlyEval('nightly');

      // One question's judge output was malformed → its row was skipped, the
      // rest of the run survived and persisted every other question.
      expect(summary.total).toBe(TOTAL_QUESTIONS - 1);
      expect(summary.results.length).toBe(TOTAL_QUESTIONS - 1);
      expect(mockEvalResultCreate).toHaveBeenCalledTimes(TOTAL_QUESTIONS - 1);

      const logged = errorSpy.mock.calls.flat().join(' ');
      expect(logged).toContain('skipping eval row');
      expect(logged).toContain('here is my assessment');
    } finally {
      setTimeoutSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});

describe('per-type Discord alert', () => {
  test('buildPerTypeReport groups by trigger type and only flags types below 3.0', () => {
    const allResults = [
      { grade: { relevance: 4, groundedness: 4, faithfulness: 5 } },
      { grade: { relevance: 4, groundedness: 3, faithfulness: 4 } },
    ];
    const suites = [
      {
        type: 'autonomous_mention',
        results: [{ grade: { relevance: 3, groundedness: 3, faithfulness: 3 } }],
      },
      {
        type: 'autonomous_summary',
        results: [{ grade: { relevance: 2, groundedness: 2, faithfulness: 2 } }],
      },
      { type: 'digest_highlight', results: [] },
    ];

    const report = buildPerTypeReport(allResults, suites);
    const byType = Object.fromEntries(report.map((t) => [t.type, t]));

    expect(byType.passive_chat).toMatchObject({ samples: 2, avgScore: 4.25, below: false });
    expect(byType.autonomous_mention).toMatchObject({ samples: 1, avgScore: 3, below: false });
    expect(byType.autonomous_summary).toMatchObject({ samples: 1, avgScore: 2, below: true });
    expect(byType.digest_highlight).toMatchObject({ samples: 0, avgScore: null, below: false });
  });

  test('Discord payload includes every type and only flags types individually below 3.0', async () => {
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.test/webhook';
    const perType = [
      { type: 'passive_chat', samples: 20, avgScore: 3.8, below: false },
      { type: 'autonomous_mention', samples: 8, avgScore: 3.2, below: false },
      { type: 'autonomous_summary', samples: 5, avgScore: 2.6, below: true },
      { type: 'digest_highlight', samples: 5, avgScore: 3.9, below: false },
    ];

    try {
      await notifyDiscord(perType, 'nightly');

      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
      const [url, payload] = mockAxiosPost.mock.calls[0];
      expect(url).toBe('https://discord.test/webhook');

      const content = payload.content;
      expect(content).toContain('ThreadVerse Neo nightly eval');
      expect(content).toContain('passive_chat: 3.8 avg (20 samples)');
      expect(content).toContain('autonomous_mention: 3.2 avg (8 samples)');
      expect(content).toContain('autonomous_summary: 2.6 avg (5 samples)');
      expect(content).toContain('digest_highlight: 3.9 avg (5 samples)');

      const flaggedLines = content.split('\n').filter((l) => l.includes('BELOW THRESHOLD'));
      expect(flaggedLines).toHaveLength(1);
      expect(flaggedLines[0]).toContain('autonomous_summary');

      // Healthy types must not be swept into a warning triggered by another type.
      expect(content).not.toMatch(/passive_chat: 3\.8 avg \(20 samples\).*⚠️/);
      expect(content).not.toMatch(/autonomous_mention: 3\.2 avg \(8 samples\).*⚠️/);
      expect(content).not.toMatch(/digest_highlight: 3\.9 avg \(5 samples\).*⚠️/);
    } finally {
      delete process.env.DISCORD_WEBHOOK_URL;
    }
  });
});
