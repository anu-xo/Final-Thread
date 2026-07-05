export function buildVectorSearchPipeline({ queryVector, communityId, type, limit = 8, numCandidates = 50 }) {
  return [
    {
      $vectorSearch: {
        index: 'postembeddings_vector_index',
        path: 'embedding',
        queryVector,
        numCandidates,
        limit,
        filter: {
          communityId,
          type,
        },
      },
    },
    {
      $project: {
        postId: 1,
        commentId: 1,
        type: 1,
        text: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ];
}
