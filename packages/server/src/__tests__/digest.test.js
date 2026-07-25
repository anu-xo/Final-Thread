import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod;
let sendWeeklyDigest;
let User, CommunityMember, Post;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  // Dynamic imports after mongoose is connected
  const userMod = await import('../models/User.js');
  const cmMod = await import('../models/CommunityMember.js');
  const postMod = await import('../models/Post.js');
  const digestMod = await import('../services/emailService.js');

  User = userMod.default;
  CommunityMember = cmMod.default;
  Post = postMod.default;
  sendWeeklyDigest = digestMod.sendWeeklyDigest;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await CommunityMember.deleteMany({});
  await Post.deleteMany({});
});

describe('sendWeeklyDigest', () => {
  it('returns { sent: 0, skipped: 0, failed: 0 } when no users have digest enabled', async () => {
    await User.create({
      username: 'nodigest',
      email: 'no@test.com',
      password: 'hashed',
      notifPrefs: { digest: false },
    });

    const result = await sendWeeklyDigest();
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('skips users with no community memberships', async () => {
    const user = await User.create({
      username: 'lonely',
      email: 'lonely@test.com',
      password: 'hashed',
      notifPrefs: { digest: true },
    });

    // No CommunityMember entries for this user
    const result = await sendWeeklyDigest();
    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(0);
  });

  it('skips users with no posts in the last 7 days', async () => {
    const user = await User.create({
      username: 'noposts',
      email: 'noposts@test.com',
      password: 'hashed',
      notifPrefs: { digest: true },
    });

    const communityId = new mongoose.Types.ObjectId();
    await CommunityMember.create({ user: user._id, community: communityId });

    // No posts created
    const result = await sendWeeklyDigest();
    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(0);
  });

  it('skips banned users even if digest is enabled', async () => {
    await User.create({
      username: 'banned',
      email: 'banned@test.com',
      password: 'hashed',
      notifPrefs: { digest: true },
      isBanned: true,
    });

    const result = await sendWeeklyDigest();
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(0);
  });
});
