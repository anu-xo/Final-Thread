import { jest } from '@jest/globals';

const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'mock-job-uuid' }),
};

const mockRedis = {
  on: jest.fn().mockReturnThis(),
  ping: jest.fn().mockResolvedValue('PONG'),
  quit: jest.fn().mockResolvedValue(undefined),
};

jest.unstable_mockModule('../jobs/embeddingQueue.js', () => ({
  getEmbeddingQueue: () => mockQueue,
}));

jest.unstable_mockModule('ioredis', () => ({
  Redis: jest.fn(() => mockRedis),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongoServer = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongoServer.getUri();
process.env.REDIS_URL = 'redis://localhost:6379';

const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { default: jwt } = await import('jsonwebtoken');
const { default: app, redis } = await import('../app.js');
const { default: User } = await import('../models/User.js');
const { default: Community } = await import('../models/Community.js');
const { default: Post } = await import('../models/Post.js');

describe('GET /api/search', () => {
  let testUser;
  let authToken;

  beforeAll(async () => {
    while (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    testUser = await User.create({
      username: 'searcher',
      email: 'searcher@threadverse.dev',
      passwordHash: 'dummy_hash',
      role: 'user',
    });

    await Community.create({
      name: 'Searchable Community',
      slug: 'searchable-community',
      description: 'A place for search tests',
      createdBy: testUser._id,
      members: 1,
    });

    await Post.create({
      title: 'Searchable Post',
      body: 'This post should be found by Atlas Search.',
      author: testUser._id,
      community: (await Community.findOne({ slug: 'searchable-community' }))._id,
    });

    authToken = jwt.sign(
      { userId: testUser._id, role: testUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await Post.deleteMany({ author: testUser?._id });
    await Community.deleteMany({ createdBy: testUser?._id });
    await User.deleteOne({ _id: testUser?._id });

    await mongoose.connection.close();
    await redis.quit();
    await mongoServer.stop();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty buckets for short queries', async () => {
    const response = await request(app)
      .get('/api/search')
      .set('Authorization', `Bearer ${authToken}`)
      .query({ q: 'a' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ posts: [], communities: [], users: [] });
  });

  it('runs Atlas Search pipelines for each requested collection', async () => {
    const postAggregate = jest.spyOn(Post, 'aggregate').mockResolvedValue([{ title: 'Searchable Post' }]);
    const communityAggregate = jest.spyOn(Community, 'aggregate').mockResolvedValue([{ name: 'Searchable Community' }]);
    const userAggregate = jest.spyOn(User, 'aggregate').mockResolvedValue([{ username: 'searcher' }]);

    const response = await request(app)
      .get('/api/search')
      .set('Authorization', `Bearer ${authToken}`)
      .query({ q: 'search', type: 'all', limit: 5 });

    expect(response.status).toBe(200);
    expect(response.body.data.posts).toHaveLength(1);
    expect(response.body.data.communities).toHaveLength(1);
    expect(response.body.data.users).toHaveLength(1);

    expect(postAggregate).toHaveBeenCalledWith([
      {
        $search: {
          index: 'default',
          text: {
            query: 'search',
            path: ['title', 'body'],
          },
        },
      },
      { $limit: 5 },
      {
        $project: {
          title: 1,
          body: 1,
          content: 1,
          author: 1,
          community: 1,
          score: 1,
          commentCount: 1,
          hotScore: 1,
          risingScore: 1,
          flair: 1,
          createdAt: 1,
        },
      },
    ]);

    expect(communityAggregate).toHaveBeenCalledWith([
      {
        $search: {
          index: 'default',
          text: {
            query: 'search',
            path: ['name', 'description'],
          },
        },
      },
      { $limit: 5 },
      {
        $project: {
          name: 1,
          slug: 1,
          description: 1,
          members: 1,
          icon: 1,
          banner: 1,
          createdAt: 1,
        },
      },
    ]);

    expect(userAggregate).toHaveBeenCalledWith([
      {
        $search: {
          index: 'default',
          text: {
            query: 'search',
            path: ['username'],
          },
        },
      },
      { $limit: 5 },
      {
        $project: {
          username: 1,
          role: 1,
          karma: 1,
          createdAt: 1,
        },
      },
    ]);

    postAggregate.mockRestore();
    communityAggregate.mockRestore();
    userAggregate.mockRestore();
  });
});