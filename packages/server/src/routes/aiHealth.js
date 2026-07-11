// server/src/routes/aiHealth.js
router.get('/api/ai/health', async (req, res) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    await model.embedContent('healthcheck');
    res.json({ data: { status: 'ok', gemini: 'connected' }, error: null, meta: {} });
  } catch (err) {
    res.status(503).json({ data: null, error: { message: 'Gemini unreachable' }, meta: {} });
  }
});