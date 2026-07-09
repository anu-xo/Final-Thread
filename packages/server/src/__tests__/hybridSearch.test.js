import { jest } from '@jest/globals';

const mockEmbeddings = {
  aggregate: jest.fn(),
};

jest.unstable_mockModule('../models/PostEmbedding.js', () => ({
  default: mockEmbeddings,
}));

const { fuseHybridSearchResults } = await import('../services/hybridSearchService.js');

describe('fuseHybridSearchResults', () => {
  it('promotes items that appear in both vector and text results', () => {
    const vectorResults = [
      { postId: 'a', text: 'vector a' },
      { postId: 'b', text: 'vector b' },
      { postId: 'c', text: 'vector c' },
    ];

    const textResults = [
      { postId: 'x', text: 'text x' },
      { postId: 'b', text: 'text b' },
      { postId: 'y', text: 'text y' },
    ];

    const ranked = fuseHybridSearchResults(vectorResults, textResults, {
      vectorWeight: 0.7,
      textWeight: 0.3,
      topK: 3,
    });

    expect(ranked.map((item) => item.id)).toEqual(['b', 'a', 'c']);
    expect(ranked[0].doc.postId).toBe('b');
  });
});