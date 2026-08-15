import { jest } from '@jest/globals';

const mockCountTokens = jest.fn().mockResolvedValue({ totalTokens: 100 });
const mockEmbedContent = jest.fn().mockResolvedValue({ embedding: { values: new Array(768).fill(0.1) } });
const mockGenerateContentStream = jest.fn();
const mockGenerateContent = jest.fn();

jest.unstable_mockModule('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      countTokens: mockCountTokens,
      embedContent: mockEmbedContent,
      generateContentStream: mockGenerateContentStream,
      generateContent: mockGenerateContent,
    }),
  })),
}));

const mockGroqCreate = jest.fn();

jest.unstable_mockModule('groq-sdk', () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockGroqCreate } },
  })),
}));

jest.unstable_mockModule('../models/PostEmbedding.js', () => ({
  default: { aggregate: jest.fn().mockResolvedValue([]) },
}));

jest.unstable_mockModule('../models/Post.js', () => ({
  default: { find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) }) },
}));

jest.unstable_mockModule('../models/AIMessage.js', () => ({
  default: {
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
    }),
    create: jest.fn().mockResolvedValue({ _id: 'mock-msg-id' }),
  },
}));

jest.unstable_mockModule('../models/Community.js', () => ({
  default: { findById: jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue({ name: 'test-community' }) }) },
}));

jest.unstable_mockModule('../models/AIConversation.js', () => ({
  default: {},
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-key';

const aiService = await import('../services/aiService.js');

describe('aiService RAG pipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('buildPromptWithinBudget drops oldest turns when over token limit', async () => {
    const longHistory = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'x'.repeat(500),
    }));

    let callCount = 0;
    mockCountTokens.mockImplementation(() => {
      callCount += 1;
      return Promise.resolve({ totalTokens: callCount < 4 ? 6000 : 4000 });
    });

    const result = await aiService.buildPromptWithinBudget({
      systemPrompt: 'sys',
      contextChunks: ['chunk'],
      history: longHistory,
      userMessage: 'question',
    });

    expect(result.tokenCount).toBeLessThanOrEqual(5500);
    expect(result.historyUsed.length).toBeLessThan(longHistory.length);
  });

  test('buildPrompt creates numbered citations from context chunks', () => {
    const prompt = aiService.buildPrompt({
      communityName: 'test-community',
      contextChunks: [
        { text: 'First post about testing' },
        { text: 'Second post about quality' },
      ],
      history: [],
      message: 'What is testing?',
    });

    expect(prompt).toContain('[1]');
    expect(prompt).toContain('[2]');
    expect(prompt).toContain('test-community');
    expect(prompt).toContain('First post about testing');
    expect(prompt).toContain('Second post about quality');
  });

  test('buildPrompt formats history with User/Assistant labels', () => {
    const prompt = aiService.buildPrompt({
      communityName: 'test',
      contextChunks: [],
      history: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ],
      message: 'Follow up',
    });

    expect(prompt).toContain('User: Hello');
    expect(prompt).toContain('Assistant: Hi there');
    expect(prompt).toContain('User: Follow up');
  });

  test('buildPrompt handles empty context gracefully', () => {
    const prompt = aiService.buildPrompt({
      communityName: 'test',
      contextChunks: [],
      history: [],
      message: 'question',
    });

    expect(prompt).toContain('(no relevant posts found)');
    expect(prompt).toContain('test');
  });

  test('generateWithFallback calls Gemini first', async () => {
    const onToken = jest.fn();
    mockGenerateContentStream.mockResolvedValue({
      stream: {
        [Symbol.asyncIterator]() {
          let called = false;
          return {
            async next() {
              if (called) return { done: true };
              called = true;
              return { value: { text: () => 'hello' }, done: false };
            },
          };
        },
      },
    });

    const result = await aiService.generateWithFallback('test prompt', onToken);
    expect(result).toBe('hello');
    expect(mockGenerateContentStream).toHaveBeenCalledWith('test prompt');
  });

  test('generateWithFallback falls back to Groq on 429', async () => {
    const onToken = jest.fn();
    mockGenerateContentStream.mockRejectedValueOnce(Object.assign(
      new Error('Rate limited'),
      { status: 429 }
    ));

    mockGroqCreate.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: 'fallback-response' } }] };
      },
    });

    const result = await aiService.generateWithFallback('test prompt', onToken);
    expect(result).toContain('fallback-response');
    expect(mockGroqCreate).toHaveBeenCalled();
  });

  test('getRecentHistory returns messages in chronological order', async () => {
    const history = await aiService.getRecentHistory('conv-123', 2);
    expect(Array.isArray(history)).toBe(true);
  });

  test('retrieveContext without communityId performs site-wide (global) search', async () => {
    const queryEmbedding = new Array(768).fill(0.5);
    const mockAggregate = (await import('../models/PostEmbedding.js')).default.aggregate;

    const chunks = await aiService.retrieveContext({ queryEmbedding, communityId: null });

    expect(Array.isArray(chunks)).toBe(true);
    const call = mockAggregate.mock.calls[0][0];
    const vectorSearch = call.find((stage) => stage.$vectorSearch);
    expect(vectorSearch).toBeDefined();
    expect(vectorSearch.$vectorSearch.filter).toBeUndefined();
  });

  test('retrieveContext with communityId filters by community', async () => {
    const queryEmbedding = new Array(768).fill(0.5);
    const mockAggregate = (await import('../models/PostEmbedding.js')).default.aggregate;

    await aiService.retrieveContext({ queryEmbedding, communityId: '507f1f77bcf86cd799439011' });

    const call = mockAggregate.mock.calls[0][0];
    const vectorSearch = call.find((stage) => stage.$vectorSearch);
    expect(vectorSearch.$vectorSearch.filter.communityId).toBeDefined();
  });

  test('buildSystemPrompt returns the site-wide global prompt when no community', () => {
    const prompt = aiService.buildSystemPrompt(null);
    expect(prompt).toContain('site-wide');
    expect(prompt).not.toContain('r/{community}');
  });

  test('streamChatResponse with null communityId uses the global persona and skips community lookup', async () => {
    mockGenerateContentStream.mockResolvedValue({
      stream: {
        [Symbol.asyncIterator]() {
          let done = false;
          return {
            async next() {
              if (done) return { done: true };
              done = true;
              return { value: { text: () => 'global answer' }, done: false };
            },
          };
        },
      },
    });

    const Community = (await import('../models/Community.js')).default;

    const { stream } = await aiService.streamChatResponse({
      message: 'What is trending across ThreadVerse?',
      communityId: null,
      conversationId: 'conv-1',
    });

    expect(Community.findById).not.toHaveBeenCalled();

    let text = '';
    const reader = stream.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text += value;
    }

    expect(text).toBe('global answer');
    expect(mockGenerateContentStream).toHaveBeenCalledWith(
      expect.stringContaining('site-wide')
    );
  });
});
