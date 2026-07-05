import { jest } from '@jest/globals';
import { emitVoteUpdate } from '../controllers/voteController.js';

describe('emitVoteUpdate', () => {
  it('emits a vote:updated event to the post room', () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    const io = { to };

    emitVoteUpdate(io, 'post-123', 42);

    expect(to).toHaveBeenCalledWith('post:post-123');
    expect(emit).toHaveBeenCalledWith('vote:updated', {
      postId: 'post-123',
      newScore: 42,
    });
  });
});
