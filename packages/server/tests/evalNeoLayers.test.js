import { jest } from '@jest/globals';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const mockEmbedQuery = jest.fn();
const mockRetrieveContext = jest.fn();
const mockBuildPromptWithinBudget = jest.fn();
const mockBuildSystemPrompt = jest.fn();
const mockBuildThreadSummaryPrompt = jest.fn();
const mockBuildDigestHighlightPrompt = jest.fn();
const mockGenerateNonStreamingResponse = jest.fn();

jest.unstable_mockModule('../src/services/aiService.js', () => ({
  embedQuery: mockEmbedQuery,
  retrieveContext: mockRetrieveContext,
  buildPrompt: jest.fn(),
  buildPromptWithinBudget: mockBuildPromptWithinBudget,
  buildSystemPrompt: mockBuildSystemPrompt,
  buildThreadSummaryPrompt: mockBuildThreadSummaryPrompt,
  buildDigestHighlightPrompt: mockBuildDigestHighlightPrompt,
  generateNonStreamingResponse: mockGenerateNonStreamingResponse,
  THREAD_SUMMARY_PROMPT_VERSION: 'summary-v1.0',
  DIGEST_HIGHLIGHT_PROMPT_VERSION: 'digest-v1.0',
}));

jest.unstable_mockModule('node-cron', () => ({
  default: { schedule: jest.fn() },
}));

jest.unstable_mockModule('../src/jobs/embeddingQueue.js', () => ({
  getEmbeddingQueue: () => ({
    add: jest.fn().mockResolvedValue({ id: 'mock-embedding-job-uuid' }),
  }),
}));

jest.unstable_mockModule('../src/socket.js', () => ({
  getIO: () => ({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) }),
  initIO: jest.fn(),
}));

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongoServer = await MongoMemoryServer.create();
const { default: mongoose } = await import('mongoose');
await mongoose.connect(mongoServer.getUri());

const { default: User } = await import('../src/models/User.js');
const { default: Community } = await import('../src/models/Community.js');
const { default: Post } = await import('../src/models/Post.js');
const { default: Comment } = await import('../src/models/Comment.js');
const { default: EvalResult } = await import('../src/models/EvalResult.js');

const {
  resolveMentionFixtures,
  resolveSummaryFixtures,
  resolveDigestFixtures,
} = await import('../src/scripts/evalFixtures/index.js');
const {
  runMentionSuite,
  runSummarySuite,
  runDigestSuite,
} = await import('../src/jobs/evalNeoLayers.js');

const GRADE_JSON = '{"relevance": 4, "groundedness": 4, "faithfulness": 5}';

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

async function createPost(title, community, { score = 10 } = {}) {
  return Post.create({
    title,
    body: `body for ${title}`,
    content: `content for ${title}`,
    author: author._id,
    community: community._id,
    type: 'text',
    upvotes: score,
    downvotes: 0,
    score,
    createdAt: new Date(),
  });
}

let author;
let communityA;
let communityB;

beforeEach(async () => {
  author = await User.create({
    username: 'eval-author',
    email: 'eval-author@test.dev',
    passwordHash: 'dummy',
    role: 'user',
  });

  communityA = await Community.create({
    _id: new mongoose.Types.ObjectId('6a5f85bd0d968cc815a85c51'),
    name: 'React Developers',
    slug: 'reactjs',
    description: 'test',
    createdBy: author._id,
    mods: [author._id],
    members: 1,
    aiEnabled: true,
  });

  communityB = await Community.create({
    name: 'Node.js',
    slug: 'nodejs',
    description: 'test',
    createdBy: author._id,
    mods: [author._id],
    members: 1,
    aiEnabled: true,
  });

  mockGenerateNonStreamingResponse.mockResolvedValue(GRADE_JSON);
  mockEmbedQuery.mockResolvedValue([0.1, 0.2, 0.3]);
  mockRetrieveContext.mockResolvedValue([
    { postId: 'mock-post-id', type: 'post', text: 'retrieved chunk', score: 0.9 },
  ]);
  mockBuildPromptWithinBudget.mockResolvedValue({ prompt: 'built prompt', tokenCount: 100 });
  mockBuildSystemPrompt.mockReturnValue('system prompt');
  mockBuildThreadSummaryPrompt.mockReturnValue('summary prompt');
  mockBuildDigestHighlightPrompt.mockReturnValue('digest prompt');
});

afterEach(async () => {
  jest.clearAllMocks();
  await Promise.all([
    User.deleteMany({}),
    Community.deleteMany({}),
    Post.deleteMany({}),
    Comment.deleteMany({}),
    EvalResult.deleteMany({}),
  ]);
});

describe('evalFixtures — runtime DB resolution', () => {
  test('resolveMentionFixtures pairs authored questions with real seeded posts', async () => {
    await createPost('React list rendering performance', communityA, { score: 50 });
    await createPost('Node streams', communityB, { score: 10 });

    const fixtures = await resolveMentionFixtures();
    expect(fixtures.length).toBe(2);
    expect(fixtures[0].postId).toBeTruthy();
    expect(fixtures[0].communityId).toBeTruthy();
    expect(fixtures[0].question).toBeTruthy();
    expect(fixtures[0].triggerCommentBody).toBeTruthy();
  });

  test('resolveMentionFixtures uses a real comment from the post when one exists', async () => {
    const post = await createPost('React list rendering performance', communityA, { score: 50 });
    await Comment.create({
      body: 'I have a long list that re-renders on every keystroke and it is getting slow.',
      author: author._id,
      post: post._id,
      score: 5,
    });

    const fixtures = await resolveMentionFixtures();
    expect(fixtures[0].triggerCommentBody).toContain('long list that re-renders');
  });

  test('resolveSummaryFixtures only returns threads with a healthy comment count', async () => {
    const thin = await createPost('Thin thread', communityA, { score: 100 });
    await Comment.create({ body: 'solo', author: author._id, post: thin._id, score: 1 });

    const healthy = await createPost('Healthy thread', communityB, { score: 90 });
    for (let i = 0; i < 6; i++) {
      await Comment.create({ body: `comment ${i}`, author: author._id, post: healthy._id, score: i });
    }

    const fixtures = await resolveSummaryFixtures();
    expect(fixtures.length).toBe(1);
    expect(fixtures[0].postId).toBe(healthy._id.toString());
    expect(fixtures[0].commentCount).toBe(6);
  });

  test('resolveDigestFixtures returns the stable community references', async () => {
    const fixtures = await resolveDigestFixtures();
    expect(fixtures.length).toBeGreaterThan(0);
    expect(fixtures[0]).toHaveProperty('communityId');
  });
});

describe('neo-layer eval suites', () => {
  test('runMentionSuite drives the real worker path and persists autonomous_mention rows', async () => {
    const post = await createPost('React list rendering performance', communityA, { score: 50 });
    await Comment.create({
      body: 'I have a long list that re-renders on every keystroke.',
      author: author._id,
      post: post._id,
      score: 5,
    });

    const suite = await runMentionSuite({ runId: 'eval-test-1', evalLabel: 'test' });
    expect(suite.type).toBe('autonomous_mention');
    expect(suite.results.length).toBe(1);

    expect(mockEmbedQuery).toHaveBeenCalled();
    expect(mockRetrieveContext).toHaveBeenCalledWith(
      expect.objectContaining({ postId: post._id.toString() })
    );
    expect(mockBuildPromptWithinBudget).toHaveBeenCalledWith(
      expect.objectContaining({ userMessage: expect.any(String) })
    );
    expect(mockGenerateNonStreamingResponse).toHaveBeenCalled();

    const row = await EvalResult.findOne({ triggerType: 'autonomous_mention' });
    expect(row).toBeTruthy();
    expect(row.relevance).toBe(4);
    expect(row.community.toString()).toBe(communityA._id.toString());
  });

  test('runSummarySuite uses buildThreadSummaryPrompt on healthy threads and persists autonomous_summary rows', async () => {
    const post = await createPost('Healthy thread', communityB, { score: 90 });
    for (let i = 0; i < 6; i++) {
      await Comment.create({ body: `comment ${i}`, author: author._id, post: post._id, score: i });
    }

    const suite = await runSummarySuite({ runId: 'eval-test-2', evalLabel: 'test' });
    expect(suite.type).toBe('autonomous_summary');
    expect(suite.results.length).toBe(1);
    expect(mockBuildThreadSummaryPrompt).toHaveBeenCalled();
    expect(mockGenerateNonStreamingResponse).toHaveBeenCalled();

    const row = await EvalResult.findOne({ triggerType: 'autonomous_summary' });
    expect(row).toBeTruthy();
    expect(row.relevance).toBe(4);
    expect(row.question).toContain('Healthy thread');
  });

  test('runDigestSuite uses buildDigestHighlightPrompt against the community top posts this week', async () => {
    await createPost('React perf post', communityA, { score: 40 });
    await createPost('Hooks post', communityA, { score: 30 });

    const suite = await runDigestSuite({ runId: 'eval-test-3', evalLabel: 'test' });
    expect(suite.type).toBe('digest_highlight');
    expect(suite.note).toContain('time-varying');
    expect(suite.results.length).toBe(1);
    expect(mockBuildDigestHighlightPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ communityName: 'React Developers' })
    );

    const row = await EvalResult.findOne({ triggerType: 'digest_highlight' });
    expect(row).toBeTruthy();
    expect(row.relevance).toBe(4);
  });

  test('unparseable judge output skips the sample but keeps the run alive', async () => {
    const post = await createPost('React list rendering performance', communityA, { score: 50 });
    await Comment.create({
      body: 'I have a long list that re-renders on every keystroke.',
      author: author._id,
      post: post._id,
      score: 5,
    });

    mockGenerateNonStreamingResponse
      .mockResolvedValueOnce('Here is my reply with a citation')
      .mockResolvedValue('not json at all');

    const suite = await runMentionSuite({ runId: 'eval-test-4', evalLabel: 'test' });
    expect(suite.results.length).toBe(0);
    expect(await EvalResult.countDocuments({ triggerType: 'autonomous_mention' })).toBe(0);
  });
});
