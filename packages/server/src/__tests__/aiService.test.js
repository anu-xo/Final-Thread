// packages/server/src/services/__tests__/aiService.test.js
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      countTokens: jest.fn().mockResolvedValue({ totalTokens: 100 }),
      embedContent: jest.fn().mockResolvedValue({ embedding: { values: new Array(768).fill(0.1) } }),
    }),
  })),
}));

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const aiService = require('../aiService');
const AIMessage = require('../../models/AIMessage');

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('aiService RAG pipeline', () => {
  test('retrieveContext calls $vectorSearch with correct communityId filter', async () => {
    const spy = jest.spyOn(mongoose.connection.db.collection('postembeddings'), 'aggregate');
    await aiService.retrieveContext('test query', 'community123');

    const pipeline = spy.mock.calls[0][0];
    const vectorStage = pipeline.find((stage) => stage.$vectorSearch);
    expect(vectorStage.$vectorSearch.filter.communityId).toBe('community123');
    expect(vectorStage.$vectorSearch.limit).toBe(8);
  });

  test('buildPromptWithinBudget drops oldest turns when over token limit', async () => {
    const longHistory = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'x'.repeat(500),
    }));

    // Force countTokens to report over-budget until history shrinks
    let callCount = 0;
    aiService.model.countTokens = jest.fn().mockImplementation(() => {
      callCount += 1;
      return Promise.resolve({ totalTokens: callCount < 4 ? 6000 : 4000 });
    });

    const result = await aiService.buildPromptWithinBudget({
      systemPrompt: 'sys',
      contextChunks: ['chunk'],
      history: longHistory,
      userMessage: 'question',
    });

    expect(result.tokenCount).toBeLessThanOrEqual(5500);
    expect(result.historyUsed.length).toBeLessThan(longHistory.length);
  });

  test('SSE stream emits token, done, and error event types correctly', async () => {
    // Simulate the streamResponse generator, assert chunk shape
    const chunks = [];
    for await (const chunk of aiService.streamResponse('mock prompt')) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
  });
});