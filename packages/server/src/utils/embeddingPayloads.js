export function buildEmbeddingPayload({ type, document, communityId }) {
  if (type === 'comment') {
    const title = document.postTitle ? String(document.postTitle).trim() : 'Untitled';
    const body = document.body?.trim() || '';

    return {
      type,
      postId: document.post?.toString(),
      commentId: document._id?.toString(),
      communityId: communityId?.toString(),
      text: `Post: [${title}] │ Comment: [${body}]`,
    };
  }

  return {
    type,
    postId: document._id?.toString(),
    communityId: communityId?.toString(),
    text: `${document.title || ''}\n\n${document.body || ''}`.trim(),
  };
}
