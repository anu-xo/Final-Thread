import request from 'supertest';
import mongoose from 'mongoose';
import app, { redis } from '../app.js';

describe('GET /api/health', () => {
  beforeAll(async () => {
    // Wait for mongoose connection to be established
    while (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
    await redis.quit();
  });

  it('returns 200 with status ok and db connected', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
  });
});