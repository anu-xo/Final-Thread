import mongoose from 'mongoose';
import PostEmbedding from '../models/PostEmbedding.js';

const VECTOR_INDEX = process.env.POST_EMBEDDINGS_VECTOR_INDEX || 'post_embedding_vector_index';
const TEXT_INDEX = process.env.POST_EMBEDDINGS_TEXT_INDEX || 'postembeddings_text_index';

function normalizeCommunityId(communityId) {
  if (!communityId) return null;
  return mongoose.isValidObjectId(communityId)
    ? new mongoose.Types.ObjectId(communityId)
    : communityId;
}

function buildFilter({ communityId, type } = {}) {
  const filter = {};

  if (communityId) {
    filter.communityId = normalizeCommunityId(communityId);
  }

  if (type) {
    filter.type = type;
  }

  return filter;
}

export async function searchByVector({ queryEmbedding, communityId, type, limit = 20, numCandidates = 100 }) {
  const filter = buildFilter({ communityId, type });

  return PostEmbedding.aggregate([
    {
      $vectorSearch: {
        index: VECTOR_INDEX,
        path: 'embedding',
        queryVector: queryEmbedding,
        filter,
        numCandidates,
        limit,
      },
    },
    {
      $project: {
        postId: 1,
        commentId: 1,
        communityId: 1,
        type: 1,
        text: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ]);
}

export async function searchByText({ queryText, communityId, type, limit = 20 }) {
  const filter = buildFilter({ communityId, type });

  return PostEmbedding.aggregate([
    {
      $search: {
        index: TEXT_INDEX,
        text: {
          query: queryText,
          path: 'text',
        },
      },
    },
    {
      $match: filter,
    },
    { $limit: limit },
    {
      $project: {
        postId: 1,
        commentId: 1,
        communityId: 1,
        type: 1,
        text: 1,
        score: { $meta: 'searchScore' },
      },
    },
  ]);
}

export function fuseHybridSearchResults(vectorResults, textResults, { vectorWeight = 0.7, textWeight = 0.3, topK = 8 } = {}) {
  const scores = new Map();

  const addScores = (list, weight) => {
    list.forEach((doc, rank) => {
      const key = String(doc.postId || doc.commentId || doc._id);
      const rrf = weight * (1 / (60 + rank));

      scores.set(key, {
        score: (scores.get(key)?.score || 0) + rrf,
        doc: scores.get(key)?.doc || doc,
      });
    });
  };

  addScores(vectorResults, vectorWeight);
  addScores(textResults, textWeight);

  return [...scores.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, topK)
    .map(([key, value]) => ({
      id: key,
      score: value.score,
      doc: value.doc,
    }));
}

export async function hybridSearch(queryText, queryEmbedding, communityId, topK = 8, options = {}) {
  const [vectorResults, textResults] = await Promise.all([
    searchByVector({
      queryEmbedding,
      communityId,
      type: options.type,
      limit: options.limit ?? 20,
      numCandidates: options.numCandidates ?? 100,
    }),
    searchByText({
      queryText,
      communityId,
      type: options.type,
      limit: options.limit ?? 20,
    }),
  ]);

  const ranked = fuseHybridSearchResults(vectorResults, textResults, {
    vectorWeight: options.vectorWeight ?? 0.7,
    textWeight: options.textWeight ?? 0.3,
    topK,
  });

  const idToDoc = new Map([...vectorResults, ...textResults].map((doc) => [String(doc.postId || doc.commentId || doc._id), doc]));

  return ranked.map(({ id, score }) => ({
    ...idToDoc.get(id),
    rrfScore: score,
  }));
}

export async function pureVectorSearch(queryEmbedding, communityId, topK = 8, options = {}) {
  const results = await searchByVector({
    queryEmbedding,
    communityId,
    type: options.type,
    limit: options.limit ?? 20,
    numCandidates: options.numCandidates ?? 100,
  });

  return results.slice(0, topK);
}