import request from 'supertest';
import app from '../app.js';     // export your express `app` (not httpServer) from app.js

describe('GET /api/health', () => {
  it('returns 200 with status ok and db connected', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
  });
});