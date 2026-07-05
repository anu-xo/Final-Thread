export function buildEmbeddingPayload({ type, document, communityId }) {
  if (type === 'comment') {
    return {
      type,
      postId: document.post?.toString(),
      commentId: document._id?.toString(),
      communityId: communityId?.toString(),
      text: document.body?.trim() || '',
    };
  }

  return {
    type,
    postId: document._id?.toString(),
    communityId: communityId?.toString(),
    text: `${document.title || ''}\n\n${document.body || ''}`.trim(),
  };
}
