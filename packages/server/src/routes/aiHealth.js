// server/src/routes/aiHealth.js
router.get('/api/ai/health', async (req, res) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
    await model.embedContent({
      content: { parts: [{ text: 'healthcheck' }] },
      outputDimensionality: 768,
    });
    res.json({ data: { status: 'ok', gemini: 'connected' }, error: null, meta: {} });
  } catch (err) {
    res.status(503).json({ data: null, error: { message: 'Gemini unreachable' }, meta: {} });
  }
});