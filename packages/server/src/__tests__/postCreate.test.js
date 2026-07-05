import { jest } from '@jest/globals';

// Set up the mock for the embedding queue before any other modules load
const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'mock-job-uuid' }),
};

jest.unstable_mockModule('../jobs/embeddingQueue.js', () => ({
  getEmbeddingQueue: () => mockQueue,
}));

// Dynamically import dependencies so they receive the mocked queue
const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { default: jwt } = await import('jsonwebtoken');
const { default: app, redis } = await import('../app.js');
const { default: User } = await import('../models/User.js');
const { default: Community } = await import('../models/Community.js');
const { default: Post } = await import('../models/Post.js');

describe('POST /api/posts', () => {
  let testUser;
  let testCommunity;
  let authToken;

  beforeAll(async () => {
    // Wait for database connection
    while (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Create a clean test user
    testUser = await User.create({
      username: 'test_author',
      email: 'test_author@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    // Create a clean test community
    testCommunity = await Community.create({
      name: 'Test Community',
      slug: 'test_comm',
      description: 'A community for testing',
      createdBy: testUser._id,
      members: 1,
    });

    // Generate valid JWT token for test user
    authToken = jwt.sign(
      { userId: testUser._id, role: testUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    // Clean up all created test documents
    if (testUser) {
      await User.deleteOne({ _id: testUser._id });
      await Post.deleteMany({ author: testUser._id });
    }
    if (testCommunity) {
      await Community.deleteOne({ _id: testCommunity._id });
    }

    // Properly disconnect from DB and Redis
    await mongoose.connection.close();
    await redis.quit();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject unauthorized requests', async () => {
    const res = await request(app)
      .post('/api/posts')
      .send({
        title: 'Unauthorized Post',
        body: 'This should fail',
        community: 'test_comm',
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('No token provided.');
  });

  it('should reject requests with missing fields', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Missing Body',
        community: 'test_comm',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('title, body/content, and community are required');
  });

  it('should reject request if community does not exist', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Valid Title',
        body: 'Valid body description.',
        community: 'nonexistent_slug',
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Community not found');
  });

  it('should successfully create a post and dispatch a Bull queue job', async () => {
    const postPayload = {
      title: 'Testing Bull Job Dispatch',
      body: 'This is the body of the post we want to verify embedding queue dispatch for.',
      community: 'test_comm',
    };

    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${authToken}`)
      .send(postPayload);

    expect(res.status).toBe(201);
    expect(res.body.post).toBeDefined();
    expect(res.body.post.title).toBe(postPayload.title);
    expect(res.body.post.body).toBe(postPayload.body);
    expect(res.body.post.author).toBeDefined();
    expect(res.body.post.author.username).toBe('test_author');

    const postId = res.body.post._id;

    // Verify database record exists
    const dbPost = await Post.findById(postId);
    expect(dbPost).toBeDefined();
    expect(dbPost.title).toBe(postPayload.title);
    expect(dbPost.community.toString()).toBe(testCommunity._id.toString());

    // Verify Bull job was dispatched via our mocked embeddingQueue.js
    expect(mockQueue.add).toHaveBeenCalledTimes(1);

    // Verify payload dispatched matches buildEmbeddingPayload logic:
    // postId, communityId, and the concatenated text: `${title}\n\n${body}`
    const expectedJobPayload = {
      type: 'post',
      postId: postId.toString(),
      communityId: testCommunity._id.toString(),
      text: `${postPayload.title}\n\n${postPayload.body}`.trim(),
    };

    expect(mockQueue.add).toHaveBeenCalledWith(
      expectedJobPayload,
      expect.objectContaining({
        attempts: 3,
        backoff: expect.objectContaining({
          type: 'exponential',
          delay: 2000,
        }),
      })
    );
  });
});
