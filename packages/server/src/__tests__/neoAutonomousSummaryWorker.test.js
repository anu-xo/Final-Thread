import { jest } from '@jest/globals';

let capturedProcessor = null;
const eventHandlers = {};
const processors = {};

const mockCommentFind = jest.fn();
const mockCommentCreate = jest.fn();
const mockUserFindOne = jest.fn();
const mockPostFindById = jest.fn();
const mockPostFindByIdAndUpdate = jest.fn();
const mockCommunityFindById = jest.fn();
const mockNeoLogCreate = jest.fn();
const mockEmbedQuery = jest.fn();
const mockRetrieveContext = jest.fn();
const mockBuildPromptWithinBudget = jest.fn();
const mockBuildSystemPrompt = jest.fn();
const mockGenerateNonStreamingResponse = jest.fn();
const mockBuildThreadSummaryPrompt = jest.fn();
const mockEmit = jest.fn();
const mockIoTo = jest.fn().mockReturnValue({ emit: mockEmit });
const mockIo = { to: mockIoTo };

jest.unstable_mockModule('bull', () => {
  const queue = {
    process: jest.fn((name, fn) => {
      processors[name] = fn;
      capturedProcessor = fn;
    }),
    on: jest.fn((event, handler) => { eventHandlers[event] = handler; }),
    add: jest.fn(),
  };
  return { default: jest.fn().mockImplementation(() => queue) };
});

jest.unstable_mockModule('../models/Comment.js', () => ({
  default: { find: mockCommentFind, create: mockCommentCreate },
}));

jest.unstable_mockModule('../models/User.js', () => ({
  default: { findOne: mockUserFindOne },
}));

jest.unstable_mockModule('../models/Post.js', () => ({
  default: { findById: mockPostFindById, findByIdAndUpdate: mockPostFindByIdAndUpdate },
}));

jest.unstable_mockModule('../models/Community.js', () => ({
  default: { findById: mockCommunityFindById },
}));

jest.unstable_mockModule('../models/NeoLog.js', () => ({
  default: { create: mockNeoLogCreate },
}));

jest.unstable_mockModule('../socket.js', () => ({
  getIO: () => mockIo,
  initIO: jest.fn(),
}));

jest.unstable_mockModule('../services/aiService.js', () => ({
  embedQuery: mockEmbedQuery,
  retrieveContext: mockRetrieveContext,
  buildPromptWithinBudget: mockBuildPromptWithinBudget,
  buildSystemPrompt: mockBuildSystemPrompt,
  generateNonStreamingResponse: mockGenerateNonStreamingResponse,
}));

jest.unstable_mockModule('../services/prompts/threadSummary.js', () => ({
  buildThreadSummaryPrompt: mockBuildThreadSummaryPrompt,
  THREAD_SUMMARY_SYSTEM_PROMPT: 'summary system prompt',
}));

const { processNeoSummaryJob } = await import('../jobs/neoAutonomousWorker.js');

const SUMMARY_JOB_DATA = {
  postId: '507f1f77bcf86cd799439012',
  communityId: '507f1f77bcf86cd799439013',
  requestingUserId: '507f1f77bcf86cd799439014',
};

function makePostDoc() {
  return {
    _id: SUMMARY_JOB_DATA.postId,
    title: 'What is the best pizza topping?',
    body: 'Long running debate post body',
  };
}

function makeCommentDocs() {
  return [
    { _id: 'comment-1', body: 'Pineapple forever', author: 'u-a', score: 42, depth: 0 },
    { _id: 'comment-2', body: 'Pineapple is a crime', author: 'u-b', score: 21, depth: 0 },
  ];
}

function makeSummaryCommentDoc() {
  return {
    _id: 'summary-comment-id-1',
    body: 'Summary text',
    author: 'neo-user-id',
    post: SUMMARY_JOB_DATA.postId,
    parent: null,
    depth: 0,
    isNeo: true,
    neoTrigger: 'summary',
    isPinned: true,
    populate: jest.fn().mockResolvedValue({
      toObject: () => ({
        _id: 'summary-comment-id-1',
        body: 'Summary text',
        author: { _id: 'neo-user-id', username: 'neo-ai', karma: 0 },
        post: SUMMARY_JOB_DATA.postId,
        parent: null,
        depth: 0,
        isNeo: true,
        neoTrigger: 'summary',
        isPinned: true,
      }),
    }),
  };
}

const mockLean = jest.fn();
const mockSelect = jest.fn();
const mockLimit = jest.fn();
const mockSort = jest.fn();

function resetMocks() {
  mockCommentFind.mockReset();
  mockCommentCreate.mockReset();
  mockUserFindOne.mockReset();
  mockPostFindById.mockReset();
  mockPostFindByIdAndUpdate.mockReset();
  mockCommunityFindById.mockReset();
  mockNeoLogCreate.mockReset();
  mockEmbedQuery.mockReset();
  mockRetrieveContext.mockReset();
  mockBuildPromptWithinBudget.mockReset();
  mockBuildSystemPrompt.mockReset();
  mockGenerateNonStreamingResponse.mockReset();
  mockBuildThreadSummaryPrompt.mockReset();
  mockEmit.mockReset();
  mockLean.mockReset();
  mockSelect.mockReset();
  mockLimit.mockReset();
  mockSort.mockReset();

  mockPostFindById.mockResolvedValue(makePostDoc());
  mockPostFindByIdAndUpdate.mockResolvedValue({ _id: SUMMARY_JOB_DATA.postId });
  mockUserFindOne.mockResolvedValue({ _id: 'neo-user-id', username: 'neo-ai' });
  mockCommunityFindById.mockReturnValue({
    select: jest.fn().mockResolvedValue({ name: 'Test Community' }),
  });
  mockNeoLogCreate.mockResolvedValue({});
  mockGenerateNonStreamingResponse.mockResolvedValue('Summary text');
  mockBuildThreadSummaryPrompt.mockReturnValue('assembled summary prompt');
  mockCommentCreate.mockResolvedValue(makeSummaryCommentDoc());

  mockLean.mockResolvedValue(makeCommentDocs());
  mockSelect.mockReturnValue({ lean: mockLean });
  mockLimit.mockReturnValue({ select: mockSelect });
  mockSort.mockReturnValue({ limit: mockLimit });
  mockCommentFind.mockReturnValue({ sort: mockSort });
}

describe('neo-autonomous worker (summary)', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('queue registration', () => {
    it('registers processors for both "mention" and "summary"', () => {
      expect(processors.mention).toBeInstanceOf(Function);
      expect(processors.summary).toBeInstanceOf(Function);
      expect(capturedProcessor).toBe(processors.summary);
    });

    it('registers failed + stalled event handlers', () => {
      expect(eventHandlers.failed).toBeInstanceOf(Function);
      expect(eventHandlers.stalled).toBeInstanceOf(Function);
    });
  });

  describe('successful summary job', () => {
    it('fetches top comments, builds a thread summary prompt, generates non-streaming, pins a Neo summary, logs, and pushes live', async () => {
      const result = await processNeoSummaryJob({
        data: SUMMARY_JOB_DATA,
        id: 'job-1',
      });

      expect(mockCommentFind).toHaveBeenCalledWith({
        post: SUMMARY_JOB_DATA.postId,
        isRemoved: false,
      });
      expect(mockSort).toHaveBeenCalledWith({ score: -1, createdAt: 1 });
      expect(mockLimit).toHaveBeenCalledWith(30);
      expect(mockSelect).toHaveBeenCalledWith('body author score depth');
      expect(mockLean).toHaveBeenCalled();

      expect(mockBuildThreadSummaryPrompt).toHaveBeenCalledWith({
        post: makePostDoc(),
        topComments: makeCommentDocs(),
      });
      expect(mockGenerateNonStreamingResponse).toHaveBeenCalledWith(
        'assembled summary prompt'
      );

      expect(mockCommentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Summary text',
          author: 'neo-user-id',
          post: SUMMARY_JOB_DATA.postId,
          parent: null,
          depth: 0,
          isNeo: true,
          neoTrigger: 'summary',
          isPinned: true,
        })
      );

      expect(mockPostFindByIdAndUpdate).toHaveBeenCalledWith(
        SUMMARY_JOB_DATA.postId,
        { $inc: { commentCount: 1 } }
      );

      expect(mockNeoLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          triggerType: 'autonomous_summary',
          layerUsed: 'aggregation',
          sourcePostIds: [SUMMARY_JOB_DATA.postId],
          communityId: SUMMARY_JOB_DATA.communityId,
          targetUserId: SUMMARY_JOB_DATA.requestingUserId,
          latencyMs: expect.any(Number),
        })
      );

      expect(mockIoTo).toHaveBeenCalledWith(`post:${SUMMARY_JOB_DATA.postId}`);
      expect(mockEmit).toHaveBeenCalledWith(
        'comment:ai_posted',
        expect.objectContaining({
          postId: SUMMARY_JOB_DATA.postId,
          comment: expect.objectContaining({
            isNeo: true,
            neoTrigger: 'summary',
            isPinned: true,
            author: expect.objectContaining({ username: 'neo-ai' }),
          }),
        })
      );

      expect(result).toEqual({ commentId: 'summary-comment-id-1' });
    });

    it('handles a thread with no comments yet', async () => {
      mockLean.mockResolvedValue([]);

      const result = await processNeoSummaryJob({
        data: SUMMARY_JOB_DATA,
        id: 'job-empty-thread',
      });

      expect(mockBuildThreadSummaryPrompt).toHaveBeenCalledWith({
        post: makePostDoc(),
        topComments: [],
      });
      expect(mockCommentCreate).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ commentId: 'summary-comment-id-1' });
    });
  });

  describe('permanent setup failures', () => {
    it('bails without creating anything when the post is missing', async () => {
      mockPostFindById.mockResolvedValue(null);

      await processNeoSummaryJob({ data: SUMMARY_JOB_DATA, id: 'job-no-post' });

      expect(mockCommentCreate).not.toHaveBeenCalled();
      expect(mockNeoLogCreate).not.toHaveBeenCalled();
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('bails without creating anything when the neo-ai user is not seeded', async () => {
      mockUserFindOne.mockResolvedValue(null);

      await processNeoSummaryJob({ data: SUMMARY_JOB_DATA, id: 'job-no-neo-user' });

      expect(mockCommentCreate).not.toHaveBeenCalled();
      expect(mockNeoLogCreate).not.toHaveBeenCalled();
      expect(mockEmit).not.toHaveBeenCalled();
    });
  });

  describe('transient failures', () => {
    it('propagates Gemini errors so Bull retries', async () => {
      mockGenerateNonStreamingResponse.mockRejectedValue(new Error('Gemini API timeout'));

      await expect(
        processNeoSummaryJob({ data: SUMMARY_JOB_DATA, id: 'job-retry' })
      ).rejects.toThrow('Gemini API timeout');

      expect(mockCommentCreate).not.toHaveBeenCalled();
      expect(mockNeoLogCreate).not.toHaveBeenCalled();
    });
  });
});
