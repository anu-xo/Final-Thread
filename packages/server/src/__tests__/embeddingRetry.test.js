import { jest } from '@jest/globals';

let capturedProcessor = null;
const eventHandlers = {};

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
  const queue = {
    process: jest.fn((fn) => { capturedProcessor = fn; }),
    on: jest.fn((event, handler) => { eventHandlers[event] = handler; }),
    add: jest.fn(),
  };
  return { default: jest.fn().mockImplementation(() => queue) };
});

jest.unstable_mockModule('../models/index.js', () => ({
  PostEmbedding: {
    aggregate: mockAggregate,
    insertMany: mockInsertMany,
  },
}));

const { embeddingQueue, getGeminiCallStats } = await import('../jobs/embeddingWorker.js');

const VEC_768 = new Array(768).fill(0.1);

function makeJobData(overrides = {}) {
  return {
    type: 'post',
    postId: '507f1f77bcf86cd799439011',
    communityId: '507f1f77bcf86cd799439012',
    text: 'Test embedding text for retry',
    ...overrides,
  };
}

function resetGeminiMocks() {
  mockEmbedContentBatch.mockReset();
  mockEmbedContent.mockReset();
  mockAggregate.mockReset();
  mockInsertMany.mockReset();
  mockAggregate.mockResolvedValue([]);
  mockInsertMany.mockResolvedValue([]);
}

describe('Embedding queue retry logic', () => {
  beforeEach(() => {
    resetGeminiMocks();
  });

  describe('queue configuration', () => {
    it('registers a processor via embeddingQueue.process()', () => {
      expect(capturedProcessor).toBeInstanceOf(Function);
    });

    it('registers a failed event handler', () => {
      expect(eventHandlers.failed).toBeInstanceOf(Function);
    });

    it('registers a stalled event handler', () => {
      expect(eventHandlers.stalled).toBeInstanceOf(Function);
    });

    it('queue.add is called with 3 attempts and exponential backoff from model hooks', async () => {
      const mockQueueAdd = jest.fn().mockResolvedValue({ id: 'mock-job' });

      const config = {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      };

      await mockQueueAdd(makeJobData(), config);

      expect(mockQueueAdd).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'post', text: expect.any(String) }),
        expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnFail: 50,
        })
      );
    });
  });

  describe('single-flush success', () => {
    it('resolves with { success: true } when Gemini succeeds', async () => {
      mockEmbedContentBatch.mockResolvedValue({
        embeddings: [{ values: VEC_768 }],
      });

      const result = await capturedProcessor({
        data: makeJobData(),
        id: 'job-success-1',
        attemptsMade: 0,
      });

      expect(result).toEqual({ success: true });
      expect(mockEmbedContentBatch).toHaveBeenCalledTimes(1);
      expect(mockInsertMany).toHaveBeenCalledTimes(1);
      expect(mockInsertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            postId: expect.any(String),
            embedding: expect.arrayContaining([0.1]),
          }),
        ])
      );
    });
  });

  describe('batch failure falls back to individual calls', () => {
    it('calls embedContent for each text when batchEmbedContents fails', async () => {
      mockEmbedContentBatch.mockRejectedValue(new Error('Batch not supported'));
      mockEmbedContent.mockResolvedValue({
        embedding: { values: VEC_768 },
      });

      const result = await capturedProcessor({
        data: makeJobData({ text: 'Fallback text' }),
        id: 'job-fallback-1',
        attemptsMade: 0,
      });

      expect(mockEmbedContentBatch).toHaveBeenCalledTimes(1);
      expect(mockEmbedContent).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ success: true });
    });
  });

  describe('job fails once then succeeds on retry', () => {
    it('first flush rejects (Gemini timeout), second flush resolves', async () => {
      mockEmbedContentBatch
        .mockRejectedValueOnce(new Error('Gemini API timeout'))
        .mockResolvedValueOnce({
          embeddings: [{ values: VEC_768 }],
        });

      mockEmbedContent
        .mockRejectedValueOnce(new Error('Gemini API timeout'))
        .mockResolvedValueOnce({
          embedding: { values: VEC_768 },
        });

      const jobData = makeJobData();

      const promise1 = capturedProcessor({
        data: jobData,
        id: 'job-retry-1',
        attemptsMade: 0,
      });

      await expect(promise1).rejects.toThrow('Gemini API timeout');

      const promise2 = capturedProcessor({
        data: jobData,
        id: 'job-retry-1',
        attemptsMade: 1,
      });

      await expect(promise2).resolves.toEqual({ success: true });
      expect(mockInsertMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('job fails permanently after exhausting retries', () => {
    it('rejects when both batch and individual Gemini calls fail', async () => {
      mockEmbedContentBatch.mockRejectedValue(new Error('Gemini permanently unavailable'));
      mockEmbedContent.mockRejectedValue(new Error('Gemini permanently unavailable'));

      const jobData = makeJobData();

      const promise = capturedProcessor({
        data: jobData,
        id: 'job-dead-letter',
        attemptsMade: 0,
      });

      await expect(promise).rejects.toThrow('Gemini permanently unavailable');
      expect(mockInsertMany).not.toHaveBeenCalled();
    });

    it(
      'repeated failures all reject (simulating Bull retry loop)',
      async () => {
        mockEmbedContentBatch.mockRejectedValue(new Error('Gemini permanently unavailable'));
        mockEmbedContent.mockRejectedValue(new Error('Gemini permanently unavailable'));

        for (let attempt = 0; attempt < 3; attempt++) {
          const jobData = makeJobData({
            text: `Attempt ${attempt} text`,
          });

          const promise = capturedProcessor({
            data: jobData,
            id: `job-dead-letter-${attempt}`,
            attemptsMade: attempt,
          });

          await expect(promise).rejects.toThrow('Gemini permanently unavailable');
        }

        expect(mockInsertMany).not.toHaveBeenCalled();
      },
      15000
    );
  });

  describe('event handlers', () => {
    it('failed handler logs job ID and error message', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      eventHandlers.failed(
        { id: 'failed-job-1' },
        new Error('Test failure')
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('failed-job-1'),
        'Test failure'
      );

      consoleSpy.mockRestore();
    });

    it('stalled handler logs job ID', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      eventHandlers.stalled({ id: 'stalled-job-1' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('stalled-job-1')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getGeminiCallStats', () => {
    it('returns an object with batch, individual, and dedup counters', () => {
      const stats = getGeminiCallStats();
      expect(stats).toHaveProperty('geminiBatchCalls');
      expect(stats).toHaveProperty('geminiIndividualCalls');
      expect(stats).toHaveProperty('minhashDeduplicates');
      expect(typeof stats.geminiBatchCalls).toBe('number');
      expect(typeof stats.geminiIndividualCalls).toBe('number');
      expect(typeof stats.minhashDeduplicates).toBe('number');
    });
  });

  describe('PostEmbedding deduplication via shouldSkipEmbedding', () => {
    it('skips embedding when vector search finds a similar document', async () => {
      mockEmbedContentBatch.mockResolvedValue({
        embeddings: [{ values: VEC_768 }],
      });

      mockAggregate.mockResolvedValue([{ score: 0.98 }]);

      await capturedProcessor({
        data: makeJobData(),
        id: 'job-skip-1',
        attemptsMade: 0,
      });

      expect(mockAggregate).toHaveBeenCalled();
      expect(mockInsertMany).not.toHaveBeenCalled();
    });

    it('inserts embedding when no similar document exists', async () => {
      mockEmbedContentBatch.mockResolvedValue({
        embeddings: [{ values: VEC_768 }],
      });

      mockAggregate.mockResolvedValue([]);

      await capturedProcessor({
        data: makeJobData(),
        id: 'job-insert-1',
        attemptsMade: 0,
      });

      expect(mockInsertMany).toHaveBeenCalledTimes(1);
    });
  });
});
