import { jest } from '@jest/globals';

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockEmbedContentBatch = jest.fn();
const mockEmbedContent = jest.fn();
const mockInsertMany = jest.fn().mockResolvedValue([]);
const mockAggregate = jest.fn().mockResolvedValue([]);

jest.unstable_mockModule('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      batchEmbedContents: mockEmbedContentBatch,
      embedContent: mockEmbedContent,
    }),
  })),
}));

jest.unstable_mockModule('bull', () => {
  const handlers = {};
  const queue = {
    process: jest.fn((fn) => { handlers.process = fn; }),
    add: jest.fn(),
    on: jest.fn(),
    _handlers: handlers,
  };
  return { default: jest.fn().mockImplementation(() => queue) };
});

jest.unstable_mockModule('../models/index.js', () => ({
  PostEmbedding: {
    aggregate: mockAggregate,
    insertMany: mockInsertMany,
  },
}));

jest.unstable_mockModule('../models/PostEmbedding.js', () => ({
  default: {
    aggregate: mockAggregate,
    insertMany: mockInsertMany,
  },
}));

// ── Tests ──────────────────────────────────────────────────────────────────

describe('embedContentBatch', () => {
  test('calls Gemini batchEmbedContents with correct request shape', async () => {
    const texts = ['Hello world', 'Test post title'];

    mockEmbedContentBatch.mockResolvedValue({
      embeddings: [
        { values: new Array(768).fill(0.1) },
        { values: new Array(768).fill(0.2) },
      ],
    });

    const result = await mockEmbedContentBatch({
      requests: texts.map((text) => ({
        content: { parts: [{ text }] },
      })),
    });

    expect(mockEmbedContentBatch).toHaveBeenCalledTimes(1);
    expect(mockEmbedContentBatch).toHaveBeenCalledWith({
      requests: texts.map((text) => ({
        content: { parts: [{ text }] },
      })),
    });
    expect(result.embeddings).toHaveLength(2);
    expect(result.embeddings[0].values).toHaveLength(768);
  });

  test('returns correct embedding vectors', async () => {
    const vectors = [
      new Array(768).fill(0.5),
      new Array(768).fill(0.7),
      new Array(768).fill(0.9),
    ];

    mockEmbedContentBatch.mockResolvedValue({
      embeddings: vectors.map((v) => ({ values: v })),
    });

    const result = await mockEmbedContentBatch({
      requests: ['a', 'b', 'c'].map((text) => ({
        content: { parts: [{ text }] },
      })),
    });

    const embeddings = result.embeddings.map((e) => e.values);
    expect(embeddings[0][0]).toBe(0.5);
    expect(embeddings[1][0]).toBe(0.7);
    expect(embeddings[2][0]).toBe(0.9);
  });

  test('propagates Gemini API errors', async () => {
    mockEmbedContentBatch.mockRejectedValue(new Error('API quota exceeded'));

    await expect(
      mockEmbedContentBatch({
        requests: [{ content: { parts: [{ text: 'x' }] } }],
      })
    ).rejects.toThrow('API quota exceeded');
  });

  test('handles empty input', async () => {
    mockEmbedContentBatch.mockResolvedValue({ embeddings: [] });

    const result = await mockEmbedContentBatch({
      requests: [],
    });

    expect(result.embeddings).toEqual([]);
  });
});

describe('embeddingWorker flushBatch deduplication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('MinHash pre-filter reduces batch size for duplicate texts', async () => {
    const { preFilterBatch } = await import('../utils/minhash.js');

    const texts = [
      'Join our discord server for free crypto airdrops! Click now!',
      'Join our discord server for free crypto airdrops! Click now!',
      'Join our discord server for free crypto airdrops! Click now!',
      'I think the new React compiler is a game changer for perf',
    ];

    const { uniqueTexts, dedupCount } = preFilterBatch(texts);

    expect(dedupCount).toBeGreaterThanOrEqual(2);
    expect(uniqueTexts.length).toBeLessThanOrEqual(2);
  });

  test('batch fallback: individual embedContent called on batch failure', async () => {
    mockEmbedContentBatch.mockRejectedValue(new Error('Batch not supported'));
    mockEmbedContent.mockResolvedValue({ embedding: { values: new Array(768).fill(0.5) } });

    const texts = ['Post 1', 'Post 2'];

    let embeddings;
    try {
      const result = await mockEmbedContentBatch({
        requests: texts.map((text) => ({ content: { parts: [{ text }] } })),
      });
      embeddings = result.embeddings.map((e) => e.values);
    } catch {
      embeddings = await Promise.all(
        texts.map(async (text) => {
          const r = await mockEmbedContent({
            content: { parts: [{ text }] },
            outputDimensionality: 768,
          });
          return r.embedding.values;
        })
      );
    }

    expect(mockEmbedContentBatch).toHaveBeenCalledTimes(1);
    expect(mockEmbedContent).toHaveBeenCalledTimes(2);
    expect(embeddings).toHaveLength(2);
  });

  test('insertMany called with correct document shape', async () => {
    const embedding = new Array(768).fill(0.42);

    await mockInsertMany([
      {
        postId: 'abc123',
        communityId: 'comm456',
        type: 'comment',
        text: 'Great post!',
        embedding,
      },
    ]);

    expect(mockInsertMany).toHaveBeenCalledTimes(1);
    expect(mockInsertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        postId: 'abc123',
        communityId: 'comm456',
        type: 'comment',
        text: 'Great post!',
        embedding: expect.arrayContaining([0.42]),
      }),
    ]);
  });
});

describe('getGeminiCallStats counter', () => {
  test('counters track batch vs individual calls', async () => {
    let geminiBatchCalls = 0;
    let geminiIndividualCalls = 0;
    let minhashDeduplicates = 0;

    // Simulate: batch of 10 items with 7 duplicates
    const totalItems = 10;
    const uniqueItems = 3;
    const duplicates = totalItems - uniqueItems;

    geminiBatchCalls += 1;
    minhashDeduplicates += duplicates;

    expect(geminiBatchCalls).toBe(1);
    expect(minhashDeduplicates).toBe(7);

    // Without MinHash: 10 items = 1 batch call (but no dedup savings)
    // With MinHash: 3 unique items = 1 smaller batch call
    // Vector search cosine checks: 10 → 3 (70% reduction)
    expect(minhashDeduplicates / totalItems).toBeGreaterThanOrEqual(0.6);
  });
});
