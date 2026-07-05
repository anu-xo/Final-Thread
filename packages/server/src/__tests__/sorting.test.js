import { jest } from '@jest/globals';
import {
  wilsonScore,
  computeHotScore,
  computeRisingScore,
} from '../utils/scoring.js';

// Replicate the exact sort function used in postController / Mongoose queries.
// sorting order: sortField descending, then _id descending (as tiebreaker)
function sortPosts(posts, sortField) {
  return [...posts].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];

    if (valA instanceof Date) valA = valA.getTime();
    if (valB instanceof Date) valB = valB.getTime();

    if (valB !== valA) {
      return valB - valA;
    }
    // Tiebreaker: descending sort on _id
    const idA = String(a._id);
    const idB = String(b._id);
    return idB.localeCompare(idA);
  });
}

describe('Post Sorting Algorithms in Isolation', () => {
  const mockPosts = [
    {
      _id: 'post_1',
      createdAt: new Date('2026-07-05T10:00:00Z'),
      score: 10,
      hotScore: 0.2,
      risingScore: 1.5,
    },
    {
      _id: 'post_2',
      createdAt: new Date('2026-07-05T12:00:00Z'),
      score: 5,
      hotScore: 0.5,
      risingScore: 3.0,
    },
    {
      _id: 'post_3',
      createdAt: new Date('2026-07-05T14:00:00Z'),
      score: 25,
      hotScore: 0.8,
      risingScore: 0.5,
    },
    {
      _id: 'post_4',
      createdAt: new Date('2026-07-05T08:00:00Z'),
      score: 100,
      hotScore: 0.95,
      risingScore: 4.5,
    },
  ];

  describe('1. New Sort (by createdAt)', () => {
    it('should sort posts by createdAt in descending order', () => {
      const sorted = sortPosts(mockPosts, 'createdAt');
      const sortedIds = sorted.map((p) => p._id);
      expect(sortedIds).toEqual(['post_3', 'post_2', 'post_1', 'post_4']);
    });

    it('should fall back to _id descending as a tiebreaker when createdAt is identical', () => {
      const sameTimePosts = [
        { _id: 'post_abc', createdAt: new Date('2026-07-05T12:00:00Z') },
        { _id: 'post_xyz', createdAt: new Date('2026-07-05T12:00:00Z') },
        { _id: 'post_def', createdAt: new Date('2026-07-05T12:00:00Z') },
      ];
      const sorted = sortPosts(sameTimePosts, 'createdAt');
      const sortedIds = sorted.map((p) => p._id);
      // 'post_xyz' > 'post_def' > 'post_abc' lexicographically
      expect(sortedIds).toEqual(['post_xyz', 'post_def', 'post_abc']);
    });
  });

  describe('2. Top Sort (by score)', () => {
    it('should sort posts by score in descending order', () => {
      const sorted = sortPosts(mockPosts, 'score');
      const sortedIds = sorted.map((p) => p._id);
      expect(sortedIds).toEqual(['post_4', 'post_3', 'post_1', 'post_2']);
    });

    it('should fall back to _id descending as a tiebreaker when score is identical', () => {
      const sameScorePosts = [
        { _id: 'post_abc', score: 10 },
        { _id: 'post_xyz', score: 10 },
        { _id: 'post_def', score: 10 },
      ];
      const sorted = sortPosts(sameScorePosts, 'score');
      const sortedIds = sorted.map((p) => p._id);
      expect(sortedIds).toEqual(['post_xyz', 'post_def', 'post_abc']);
    });
  });

  describe('3. Hot Sort (by hotScore)', () => {
    it('should sort posts by hotScore in descending order', () => {
      const sorted = sortPosts(mockPosts, 'hotScore');
      const sortedIds = sorted.map((p) => p._id);
      expect(sortedIds).toEqual(['post_4', 'post_3', 'post_2', 'post_1']);
    });

    it('should fall back to _id descending as a tiebreaker when hotScore is identical', () => {
      const sameHotPosts = [
        { _id: 'post_abc', hotScore: 0.5 },
        { _id: 'post_xyz', hotScore: 0.5 },
        { _id: 'post_def', hotScore: 0.5 },
      ];
      const sorted = sortPosts(sameHotPosts, 'hotScore');
      const sortedIds = sorted.map((p) => p._id);
      expect(sortedIds).toEqual(['post_xyz', 'post_def', 'post_abc']);
    });
  });

  describe('4. Rising Sort (by risingScore)', () => {
    it('should sort posts by risingScore in descending order', () => {
      const sorted = sortPosts(mockPosts, 'risingScore');
      const sortedIds = sorted.map((p) => p._id);
      expect(sortedIds).toEqual(['post_4', 'post_2', 'post_1', 'post_3']);
    });

    it('should fall back to _id descending as a tiebreaker when risingScore is identical', () => {
      const sameRisingPosts = [
        { _id: 'post_abc', risingScore: 2.0 },
        { _id: 'post_xyz', risingScore: 2.0 },
        { _id: 'post_def', risingScore: 2.0 },
      ];
      const sorted = sortPosts(sameRisingPosts, 'risingScore');
      const sortedIds = sorted.map((p) => p._id);
      expect(sortedIds).toEqual(['post_xyz', 'post_def', 'post_abc']);
    });
  });
});

describe('Scoring Utility Mathematical Functions', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockImplementation(() => new Date('2026-07-05T12:00:00Z').getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('wilsonScore', () => {
    it('returns 0 when total votes is 0', () => {
      expect(wilsonScore(0, 0)).toBe(0);
    });

    it('favors higher total votes over low volume 100% upvoted post', () => {
      const smallVol = wilsonScore(1, 0); // 1 up, 0 down (100% upvoted)
      const highVol = wilsonScore(90, 10); // 90 up, 10 down (90% upvoted)
      expect(highVol).toBeGreaterThan(smallVol);
    });
  });

  describe('computeHotScore', () => {
    it('decays exponentially based on age', () => {
      const now = new Date('2026-07-05T12:00:00Z');
      const oneDayAgo = new Date('2026-07-04T12:00:00Z');

      const hotNow = computeHotScore(10, 0, now);
      const hotOld = computeHotScore(10, 0, oneDayAgo);

      expect(hotNow).toBeGreaterThan(hotOld);
    });
  });

  describe('computeRisingScore', () => {
    it('trims votes outside the 6-hour window and calculates net score', () => {
      const createdAt = new Date('2026-07-05T04:00:00Z'); // 8 hours ago
      
      const voteLog = [
        { value: 1, at: new Date('2026-07-05T05:00:00Z') }, // 7 hours ago (should be trimmed)
        { value: 1, at: new Date('2026-07-05T07:00:00Z') }, // 5 hours ago (keep)
        { value: 1, at: new Date('2026-07-05T10:00:00Z') }, // 2 hours ago (keep)
        { value: -1, at: new Date('2026-07-05T11:00:00Z') }, // 1 hour ago (keep)
      ];

      const { risingScore, trimmedLog } = computeRisingScore(voteLog, createdAt);

      // Kept: 3 votes (2 positive, 1 negative) -> netVotesInWindow = 1
      expect(trimmedLog.length).toBe(3);
      expect(trimmedLog.map(v => v.value)).toEqual([1, 1, -1]);
      
      // Hours elapsed since post creation (capped at 6h, minimum 0.25h)
      // ageHours = (12:00 - 04:00) = 8 hours. Capped at 6 hours.
      // risingScore = netVotesInWindow / hoursElapsed = 1 / 6 = ~0.166
      expect(risingScore).toBeCloseTo(1 / 6, 4);
    });
  });
});
