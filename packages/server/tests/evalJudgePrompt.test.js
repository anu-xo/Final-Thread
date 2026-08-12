import { jest } from '@jest/globals';

process.env.GEMINI_API_KEY = 'test-key';
process.env.GROQ_API_KEY = 'test-key';

const mockGenerateNonStreamingResponse = jest.fn();

jest.unstable_mockModule('../src/services/aiService.js', () => ({
  generateNonStreamingResponse: mockGenerateNonStreamingResponse,
  embedQuery: jest.fn(),
  retrieveContext: jest.fn(),
  buildPrompt: jest.fn(),
  buildPromptWithinBudget: jest.fn(),
  buildSystemPrompt: jest.fn(),
  buildThreadSummaryPrompt: jest.fn(),
  buildDigestHighlightPrompt: jest.fn(),
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

const { buildJudgePrompt, judgeOutput } = await import('../src/jobs/evalCron.js');

describe('buildJudgePrompt — single type-aware judge', () => {
  const types = ['passive_chat', 'autonomous_mention', 'autonomous_summary', 'digest_highlight'];

  it.each(types)('tags the prompt with task type %s', (type) => {
    const prompt = buildJudgePrompt(type, 'some output', 'some context');
    expect(prompt).toContain(`Task type: ${type}`);
    expect(prompt).toContain('some output');
    expect(prompt).toContain('some context');
    expect(prompt).toContain('{"relevance": N, "groundedness": N, "faithfulness": N}');
  });

  it('uses the passive_chat rubric for Q&A', () => {
    const prompt = buildJudgePrompt(
      'passive_chat',
      'React uses the virtual DOM.',
      'QUESTION: How does React work?'
    );
    expect(prompt).toContain('Does the response actually address the user\'s question?');
    expect(prompt).toContain('Is every claim traceable to the provided post/comment context?');
  });

  it('uses the summary rubric (neutrality) for autonomous_summary', () => {
    const prompt = buildJudgePrompt(
      'autonomous_summary',
      'comment A and comment B disagree on pricing.',
      'POST: ...\nCOMMENT A: ...\nCOMMENT B: ...'
    );
    expect(prompt).toContain('Does it stay neutral and avoid asserting a side was "right"?');
    expect(prompt).toContain('Are all summarized points traceable to the top comments provided?');
  });
});

describe('judgeOutput', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parses a plain JSON grade', async () => {
    mockGenerateNonStreamingResponse.mockResolvedValue(
      '{"relevance": 4, "groundedness": 3, "faithfulness": 5}'
    );

    const grade = await judgeOutput('passive_chat', 'answer', 'context');
    expect(grade).toEqual({ relevance: 4, groundedness: 3, faithfulness: 5 });
    expect(mockGenerateNonStreamingResponse).toHaveBeenCalledWith(
      expect.stringContaining('Task type: passive_chat')
    );
  });

  it('strips markdown code fences before parsing', async () => {
    mockGenerateNonStreamingResponse.mockResolvedValue(
      '```json\n{"relevance": 5, "groundedness": 4, "faithfulness": 5}\n```'
    );

    const grade = await judgeOutput('digest_highlight', 'answer', 'context');
    expect(grade).toEqual({ relevance: 5, groundedness: 4, faithfulness: 5 });
  });

  it('logs the raw response and throws when JSON is malformed (row skipped, run survives)', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGenerateNonStreamingResponse.mockResolvedValue('Sure, here is my assessment — relevance 4/5');

    await expect(judgeOutput('autonomous_mention', 'answer', 'context')).rejects.toThrow();

    const logged = errorSpy.mock.calls.flat().join(' ');
    expect(logged).toContain('skipping eval row');
    expect(logged).toContain('Sure, here is my assessment — relevance 4/5');
    errorSpy.mockRestore();
  });

  it('throws on an out-of-range score instead of persisting a bad grade', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGenerateNonStreamingResponse.mockResolvedValue(
      '{"relevance": 9, "groundedness": 3, "faithfulness": 2}'
    );

    await expect(judgeOutput('passive_chat', 'answer', 'context')).rejects.toThrow(/out of range/);
    errorSpy.mockRestore();
  });

  it('rejects unknown types before calling the LLM', async () => {
    await expect(judgeOutput('bogus_type', 'answer', 'context')).rejects.toThrow('unknown judge type');
    expect(mockGenerateNonStreamingResponse).not.toHaveBeenCalled();
  });
});
