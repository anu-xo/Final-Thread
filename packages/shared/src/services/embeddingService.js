const { GoogleGenerativeAI } = require('@google/generative-ai')

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

/**
 * Generate a 768-dimensional embedding vector for a given text
 * using Gemini text-embedding-004
 */
async function embedText(text) {
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' })
  const result = await model.embedContent(text)
  const embedding = result.embedding.values

  if (embedding.length !== 768) {
    throw new Error(`Expected 768 dimensions, got ${embedding.length}`)
  }

  return embedding
}

/**
 * Test the embedding connection — called on server startup
 */
async function testEmbeddingConnection() {
  try {
    const testVector = await embedText('ThreadVerse connection test')
    console.log(`✅ Gemini embedding connected (${testVector.length} dims)`)
    return true
  } catch (err) {
    console.warn('⚠️  Gemini embedding not available:', err.message)
    return false
  }
}

module.exports = { embedText, testEmbeddingConnection }