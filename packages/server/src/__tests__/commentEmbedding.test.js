import { buildEmbeddingPayload } from '../utils/embeddingPayloads.js';

describe('buildEmbeddingPayload', () => {
  it('creates a comment embedding payload with the comment id and parent post id', () => {
    const payload = buildEmbeddingPayload({
      type: 'comment',
      document: {
        _id: 'comment-123',
        body: 'This is a great comment',
        post: 'post-456',
      },
      communityId: 'community-789',
    });

    expect(payload).toEqual(
      expect.objectContaining({
        type: 'comment',
        text: 'This is a great comment',
        postId: 'post-456',
        commentId: 'comment-123',
        communityId: 'community-789',
      })
    );
  });
});
