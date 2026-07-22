// packages/server/src/__tests__\minhash.test.js
import {
  shingle,
  minHashSignature,
  estimateJaccard,
  findDuplicateGroups,
  preFilterBatch,
  mapEmbeddingsToOriginal,
} from '../utils/minhash.js';

describe('MinHash pre-filter', () => {
  describe('shingle()', () => {
    test('generates word-level shingles of correct size', () => {
      const result = shingle('hello world foo bar baz', 3);
      expect(result).toContain('hello world foo');
      expect(result).toContain('world foo bar');
      expect(result).toContain('foo bar baz');
      expect(result.size).toBe(3);
    });

    test('lowercases and strips punctuation', () => {
      const result = shingle('Hello, World! This is a TEST.', 2);
      expect(result).toContain('hello world');
      expect(result).toContain('world this');
      expect(result).toContain('this is');
    });

    test('handles text shorter than shingle size', () => {
      const result = shingle('hi', 3);
      expect(result.size).toBe(1);
      expect(result.has('hi')).toBe(true);
    });

    test('handles empty string', () => {
      const result = shingle('', 3);
      expect(result.size).toBe(0);
    });
  });

  describe('minHashSignature()', () => {
    test('returns array of fixed length', () => {
      const sig = minHashSignature(new Set(['hello world']));
      expect(sig.length).toBe(128);
    });

    test('same shingles produce identical signatures', () => {
      const sig1 = minHashSignature(new Set(['hello world foo']));
      const sig2 = minHashSignature(new Set(['hello world foo']));
      expect(sig1).toEqual(sig2);
    });

    test('different shingles produce different signatures', () => {
      const sig1 = minHashSignature(new Set(['hello world']));
      const sig2 = minHashSignature(new Set(['completely different words']));
      expect(sig1).not.toEqual(sig2);
    });
  });

  describe('estimateJaccard()', () => {
    test('returns 1.0 for identical signatures', () => {
      const sig = new Array(128).fill(42);
      expect(estimateJaccard(sig, sig)).toBe(1.0);
    });

    test('returns 0.0 for completely different signatures', () => {
      const sig1 = new Array(128).fill(0);
      const sig2 = new Array(128).fill(1);
      expect(estimateJaccard(sig1, sig2)).toBe(0.0);
    });

    test('returns value between 0 and 1 for partial matches', () => {
      const sig1 = new Array(128).fill(0);
      const sig2 = new Array(128).fill(0);
      for (let i = 0; i < 64; i++) sig2[i] = 1;
      const jaccard = estimateJaccard(sig1, sig2);
      expect(jaccard).toBeGreaterThanOrEqual(0);
      expect(jaccard).toBeLessThanOrEqual(1);
      expect(jaccard).toBeCloseTo(0.5, 1);
    });
  });

  describe('findDuplicateGroups()', () => {
    test('identifies exact duplicates', () => {
      const texts = [
        'Hello world this is a test post',
        'Hello world this is a test post',
        'Completely different content here',
      ];
      const { uniqueIndices, duplicateMap } = findDuplicateGroups(texts);
      expect(uniqueIndices).toHaveLength(2);
      expect(duplicateMap.has(1)).toBe(true);
      expect(duplicateMap.get(1)).toBe(0);
    });

    test('identifies near-duplicates above threshold', () => {
      const texts = [
        'The quick brown fox jumps over the lazy dog in the park',
        'The quick brown fox jumps over the lazy dog in the park today',
        'Something completely unrelated to anything else',
      ];
      const { uniqueIndices, duplicateMap } = findDuplicateGroups(texts, 0.5);
      expect(duplicateMap.has(1)).toBe(true);
    });

    test('returns all indices as unique when no duplicates exist', () => {
      const texts = [
        'Completely unique text about dogs',
        'Entirely different text about cats',
        'Yet another distinct text about fish',
      ];
      const { uniqueIndices, duplicateMap } = findDuplicateGroups(texts);
      expect(uniqueIndices).toHaveLength(3);
      expect(duplicateMap.size).toBe(0);
    });

    test('handles single text', () => {
      const { uniqueIndices, duplicateMap } = findDuplicateGroups(['hello']);
      expect(uniqueIndices).toHaveLength(1);
      expect(duplicateMap.size).toBe(0);
    });
  });

  describe('preFilterBatch()', () => {
    test('deduplicates batch before Gemini call', () => {
      const texts = [
        'Post about react hooks and useState',
        'Post about react hooks and useState',
        'Post about database indexing strategies',
      ];
      const { uniqueTexts, dedupCount } = preFilterBatch(texts);
      expect(uniqueTexts.length).toBeLessThan(texts.length);
      expect(dedupCount).toBe(1);
    });

    test('returns all texts when no duplicates', () => {
      const texts = [
        'Unique post about JavaScript',
        'Unique post about Python',
        'Unique post about Rust',
      ];
      const { uniqueTexts, dedupCount } = preFilterBatch(texts);
      expect(uniqueTexts).toHaveLength(3);
      expect(dedupCount).toBe(0);
    });

    test('preserves originalIndexMap for embedding reconstruction', () => {
      const texts = ['Same text', 'Same text', 'Different text'];
      const { originalIndexMap } = preFilterBatch(texts);
      expect(originalIndexMap.length).toBe(2);
      expect(originalIndexMap[0]).toBe(0);
      expect(originalIndexMap[1]).toBe(2);
    });
  });

  describe('mapEmbeddingsToOriginal()', () => {
    test('maps unique embeddings back to original batch positions', () => {
      const uniqueEmbeddings = [
        [0.1, 0.2],
        [0.3, 0.4],
      ];
      const originalIndexMap = [0, 2];
      const totalSize = 3;

      const result = mapEmbeddingsToOriginal(uniqueEmbeddings, originalIndexMap, totalSize);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual([0.1, 0.2]);
      expect(result[1]).toBeUndefined();
      expect(result[2]).toEqual([0.3, 0.4]);
    });

    test('duplicate positions get same embedding as their unique counterpart', () => {
      const uniqueEmbeddings = [[0.5]];
      const originalIndexMap = [0];
      const texts = ['Same', 'Same'];
      const { duplicateMap } = findDuplicateGroups(texts);

      const result = mapEmbeddingsToOriginal(uniqueEmbeddings, originalIndexMap, texts.length);
      result[1] = result[duplicateMap.get(1)];

      expect(result[0]).toEqual([0.5]);
      expect(result[1]).toEqual([0.5]);
    });
  });

  describe('end-to-end MinHash -> dedup pipeline', () => {
    test('reduces batch size for repeated content', () => {
      const communitySpam = Array(10).fill(
        'Join our discord server for free crypto airdrops!!! Click now before its too late'
      );
      const uniquePost = 'I think the new React compiler is a game changer for performance';
      const texts = [...communitySpam, uniquePost];

      const { uniqueTexts, dedupCount } = preFilterBatch(texts);

      // MinHash should collapse the 10 spam messages into 1
      expect(dedupCount).toBeGreaterThanOrEqual(9);
      expect(uniqueTexts.length).toBeLessThanOrEqual(2);
    });

    test('preserves all unique content in mixed batch', () => {
      const texts = [
        'First unique post about machine learning',
        'Second unique post about web development',
        'Third unique post about database design',
      ];

      const { uniqueTexts, dedupCount } = preFilterBatch(texts);
      expect(uniqueTexts).toHaveLength(3);
      expect(dedupCount).toBe(0);
    });
  });
});
