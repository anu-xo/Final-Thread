import { jest } from '@jest/globals';

let capturedProcessor = null;
const eventHandlers = {};

const mockCommentFindById = jest.fn();
const mockCommentCreate = jest.fn();
const mockUserFindOne = jest.fn();
const mockPostFindByIdAndUpdate = jest.fn();
const mockCommunityFindById = jest.fn();
const mockNeoLogCreate = jest.fn();
const mockEmbedQuery = jest.fn();
const mockRetrieveContext = jest.fn();
const mockBuildPromptWithinBudget = jest.fn();
const mockBuildSystemPrompt = jest.fn();
const mockGenerateNonStreamingResponse = jest.fn();
const mockEmit = jest.fn();
const mockIoTo = jest.fn().mockReturnValue({ emit: mockEmit });
const mockIo = { to: mockIoTo };

jest.unstable_mockModule('bull', () => {
  const queue = {
    process: jest.fn((name, fn) => { capturedProcessor = fn; }),
    on: jest.fn((event, handler) => { eventHandlers[event] = handler; }),
    add: jest.fn(),
  };
  return { default: jest.fn().mockImplementation(() => queue) };
});

jest.unstable_mockModule('../models/Comment.js', () => ({
  default: { findById: mockCommentFindById, create: mockCommentCreate },
}));

jest.unstable_mockModule('../models/User.js', () => ({
  default: { findOne: mockUserFindOne },
}));

jest.unstable_mockModule('../models/Post.js', () => ({
  default: { findByIdAndUpdate: mockPostFindByIdAndUpdate },
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
  buildThreadSummaryPrompt: jest.fn(),
  generateNonStreamingResponse: mockGenerateNonStreamingResponse,
}));

const { processNeoMentionJob } = await import('../jobs/neoAutonomousWorker.js');

const JOB_DATA = {
  triggerCommentId: '507f1f77bcf86cd799439011',
  postId: '507f1f77bcf86cd799439012',
  communityId: '507f1f77bcf86cd799439013',
  requestingUserId: '507f1f77bcf86cd799439014',
  question: 'What do you think about this thread?',
};

function makeTriggerComment(depth = 0, parent = null) {
  return { _id: JOB_DATA.triggerCommentId, depth, parent };
}

function makeNeoCommentDoc() {
  return {
    _id: 'neo-comment-id-1',
    body: 'Neo reply text',
    author: 'neo-user-id',
    post: JOB_DATA.postId,
    parent: JOB_DATA.triggerCommentId,
    depth: 1,
    isNeo: true,
    neoTrigger: 'mention',
    populate: jest.fn().mockResolvedValue({
      toObject: () => ({
        _id: 'neo-comment-id-1',
        body: 'Neo reply text',
        author: { _id: 'neo-user-id', username: 'neo-ai', karma: 0 },
        post: JOB_DATA.postId,
        parent: JOB_DATA.triggerCommentId,
        depth: 1,
        isNeo: true,
        neoTrigger: 'mention',
      }),
    }),
  };
}

function resetMocks() {
  mockCommentFindById.mockReset();
  mockCommentCreate.mockReset();
  mockUserFindOne.mockReset();
  mockPostFindByIdAndUpdate.mockReset();
  mockCommunityFindById.mockReset();
  mockNeoLogCreate.mockReset();
  mockEmbedQuery.mockReset();
  mockRetrieveContext.mockReset();
  mockBuildPromptWithinBudget.mockReset();
  mockBuildSystemPrompt.mockReset();
  mockGenerateNonStreamingResponse.mockReset();
  mockEmit.mockReset();

  mockCommentFindById.mockResolvedValue(makeTriggerComment());
  mockCommentCreate.mockResolvedValue(makeNeoCommentDoc());
  mockUserFindOne.mockResolvedValue({ _id: 'neo-user-id', username: 'neo-ai' });
  mockCommunityFindById.mockReturnValue({
    select: jest.fn().mockResolvedValue({ name: 'Test Community' }),
  });
  mockNeoLogCreate.mockResolvedValue({});
  mockEmbedQuery.mockResolvedValue(new Array(768).fill(0.1));
  mockRetrieveContext.mockResolvedValue([{ text: 'chunk one', postId: JOB_DATA.postId }]);
  mockBuildPromptWithinBudget.mockResolvedValue({ prompt: 'assembled prompt', tokenCount: 42, historyUsed: [] });
  mockBuildSystemPrompt.mockReturnValue('system prompt');
  mockGenerateNonStreamingResponse.mockResolvedValue('Neo reply text');
}

describe('neo-autonomous worker (mention)', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('queue registration', () => {
    it('registers a processor for the "mention" job name', () => {
      expect(capturedProcessor).toBeInstanceOf(Function);
    });

    it('registers failed + stalled event handlers', () => {
      expect(eventHandlers.failed).toBeInstanceOf(Function);
      expect(eventHandlers.stalled).toBeInstanceOf(Function);
    });
  });

  describe('successful mention job', () => {
    it('grounds with RAG, generates non-streaming, posts a Neo comment, logs, and pushes live', async () => {
      const result = await processNeoMentionJob({ data: JOB_DATA, id: 'job-1' });

      expect(mockEmbedQuery).toHaveBeenCalledWith(JOB_DATA.question);
      expect(mockRetrieveContext).toHaveBeenCalledWith(
        expect.objectContaining({
          communityId: JOB_DATA.communityId,
          postId: JOB_DATA.postId,
        })
      );
      expect(mockBuildPromptWithinBudget).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: 'system prompt',
          userMessage: JOB_DATA.question,
        })
      );
      expect(mockGenerateNonStreamingResponse).toHaveBeenCalledWith('assembled prompt');

      expect(mockCommentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Neo reply text',
          author: 'neo-user-id',
          post: JOB_DATA.postId,
          parent: JOB_DATA.triggerCommentId,
          depth: 1,
          isNeo: true,
          neoTrigger: 'mention',
        })
      );

      expect(mockNeoLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          triggerType: 'autonomous_mention',
          layerUsed: 'vector_search',
          sourcePostIds: [JOB_DATA.postId],
          communityId: JOB_DATA.communityId,
          targetUserId: JOB_DATA.requestingUserId,
          query: JOB_DATA.question,
          latencyMs: expect.any(Number),
        })
      );

      expect(mockIoTo).toHaveBeenCalledWith(`post:${JOB_DATA.postId}`);
      expect(mockEmit).toHaveBeenCalledWith(
        'comment:ai_posted',
        expect.objectContaining({
          postId: JOB_DATA.postId,
          comment: expect.objectContaining({
            isNeo: true,
            neoTrigger: 'mention',
            author: expect.objectContaining({ username: 'neo-ai' }),
          }),
        })
      );

      expect(mockPostFindByIdAndUpdate).toHaveBeenCalledWith(
        JOB_DATA.postId,
        {
          $inc: { commentCount: 1 },
          lastNeoReplyAt: expect.any(Date),
        }
      );

      expect(result).toEqual({ commentId: 'neo-comment-id-1' });
    });

    it('attaches the reply as a sibling at depth 5 (not 6) when the trigger comment is at depth 5', async () => {
      const siblingParent = '507f1f77bcf86cd799439099';
      mockCommentFindById.mockResolvedValue(makeTriggerComment(5, siblingParent));

      await processNeoMentionJob({ data: JOB_DATA, id: 'job-depth' });

      expect(mockCommentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          depth: 5,
          parent: siblingParent,
        })
      );
      expect(mockCommentCreate).not.toHaveBeenCalledWith(
        expect.objectContaining({ depth: 6 })
      );
    });
  });

  describe('permanent setup failures', () => {
    it('bails without creating anything when the trigger comment is missing', async () => {
      mockCommentFindById.mockResolvedValue(null);

      await processNeoMentionJob({ data: JOB_DATA, id: 'job-null-trigger' });

      expect(mockCommentCreate).not.toHaveBeenCalled();
      expect(mockNeoLogCreate).not.toHaveBeenCalled();
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('bails without creating anything when the neo-ai user is not seeded', async () => {
      mockUserFindOne.mockResolvedValue(null);

      await processNeoMentionJob({ data: JOB_DATA, id: 'job-no-neo-user' });

      expect(mockCommentCreate).not.toHaveBeenCalled();
      expect(mockNeoLogCreate).not.toHaveBeenCalled();
      expect(mockEmit).not.toHaveBeenCalled();
    });
  });

  describe('transient failures', () => {
    it('propagates Gemini errors so Bull retries', async () => {
      mockGenerateNonStreamingResponse.mockRejectedValue(new Error('Gemini API timeout'));

      await expect(
        processNeoMentionJob({ data: JOB_DATA, id: 'job-retry' })
      ).rejects.toThrow('Gemini API timeout');

      expect(mockCommentCreate).not.toHaveBeenCalled();
      expect(mockNeoLogCreate).not.toHaveBeenCalled();
    });
  });

  describe('event handlers', () => {
    it('failed handler logs job id and error', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      eventHandlers.failed({ id: 'failed-1', attemptsMade: 2 }, new Error('boom'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('failed-1'), 'boom');
      consoleSpy.mockRestore();
    });

    it('stalled handler logs job id', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      eventHandlers.stalled({ id: 'stalled-1' });
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('stalled-1'));
      consoleSpy.mockRestore();
    });
  });
});
