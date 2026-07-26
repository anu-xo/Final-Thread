import { jest } from '@jest/globals';
import {
  wilsonScore,
  computeHotScore,
  computeRisingScore,
} from '../utils/scoring.js';

describe('Feed Algorithm Edge Cases', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockImplementation(() => new Date('2026-07-26T12:00:00Z').getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── wilsonScore edge cases ──────────────────────────────────────────────────

  describe('wilsonScore', () => {
    it('returns 0 for empty subscriptions (0 ups, 0 downs)', () => {
      expect(wilsonScore(0, 0)).toBe(0);
    });

    it('returns a positive score for a single upvote', () => {
      const score = wilsonScore(1, 0);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('returns 0 for a single downvote (phat=0 with Wilson lower bound)', () => {
      const score = wilsonScore(0, 1);
      expect(score).toBe(0);
    });

    it('favors a 90% upvoted post with 100 votes over a 100% upvoted post with 1 vote', () => {
      const highVolume90 = wilsonScore(90, 10);
      const lowVolume100 = wilsonScore(1, 0);
      expect(highVolume90).toBeGreaterThan(lowVolume100);
    });

    it('is monotonically non-decreasing in ups for fixed downs', () => {
      const scores = [];
      for (let ups = 0; ups <= 20; ups++) {
        scores.push(wilsonScore(ups, 5));
      }
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
      }
    });
  });

  // ── computeHotScore edge cases ─────────────────────────────────────────────

  describe('computeHotScore', () => {
    it('returns 0 for a post with zero votes (empty subscriptions scenario)', () => {
      const now = new Date('2026-07-26T12:00:00Z');
      expect(computeHotScore(0, 0, now)).toBe(0);
    });

    it('returns a non-zero score for a single-post community (1 upvote, 0 downs)', () => {
      const now = new Date('2026-07-26T12:00:00Z');
      const score = computeHotScore(1, 0, now);
      expect(score).toBeGreaterThan(0);
    });

    it('decays over time: brand-new post scores higher than 1-day-old post', () => {
      const now = new Date('2026-07-26T12:00:00Z');
      const oneDayAgo = new Date('2026-07-25T12:00:00Z');

      const freshScore = computeHotScore(5, 1, now);
      const oldScore = computeHotScore(5, 1, oneDayAgo);

      expect(freshScore).toBeGreaterThan(oldScore);
    });

    it('decays to near-zero after 7 days (well past the 36-hour half-life)', () => {
      const sevenDaysAgo = new Date('2026-07-19T12:00:00Z');
      const score = computeHotScore(10, 0, sevenDaysAgo);
      expect(score).toBeLessThan(0.01);
    });

    it('produces identical hotScore for two different posts with identical votes and creation time', () => {
      const createdAt = new Date('2026-07-26T10:00:00Z');
      const scoreA = computeHotScore(10, 2, createdAt);
      const scoreB = computeHotScore(10, 2, createdAt);
      expect(scoreA).toBe(scoreB);
    });

    it('produces different hotScores for same votes but different creation times', () => {
      const timeA = new Date('2026-07-26T12:00:00Z');
      const timeB = new Date('2026-07-26T06:00:00Z');

      const scoreA = computeHotScore(10, 2, timeA);
      const scoreB = computeHotScore(10, 2, timeB);

      expect(scoreA).not.toBe(scoreB);
    });

    it('a post with more upvotes scores higher than one with fewer, same age', () => {
      const now = new Date('2026-07-26T12:00:00Z');
      const scoreFewer = computeHotScore(3, 0, now);
      const scoreMore = computeHotScore(20, 0, now);
      expect(scoreMore).toBeGreaterThan(scoreFewer);
    });
  });

  // ── computeRisingScore edge cases ──────────────────────────────────────────

  describe('computeRisingScore', () => {
    it('returns 0 rising score for an empty vote log', () => {
      const createdAt = new Date('2026-07-26T10:00:00Z');
      const { risingScore, trimmedLog } = computeRisingScore([], createdAt);
      expect(risingScore).toBe(0);
      expect(trimmedLog).toEqual([]);
    });

    it('returns 0 rising score for null/undefined vote log', () => {
      const createdAt = new Date('2026-07-26T10:00:00Z');
      const { risingScore } = computeRisingScore(null, createdAt);
      expect(risingScore).toBe(0);
    });

    it('trims all votes older than 6 hours', () => {
      const createdAt = new Date('2026-07-26T02:00:00Z'); // 10 hours ago
      const voteLog = [
        { value: 1, at: new Date('2026-07-26T03:00:00Z') }, // 9h ago (outside window)
        { value: 1, at: new Date('2026-07-26T05:00:00Z') }, // 7h ago (outside window)
        { value: 1, at: new Date('2026-07-26T07:00:00Z') }, // 5h ago (inside window)
      ];

      const { trimmedLog } = computeRisingScore(voteLog, createdAt);
      expect(trimmedLog).toHaveLength(1);
      expect(trimmedLog[0].value).toBe(1);
    });

    it('computes net vote velocity within the 6-hour window', () => {
      const createdAt = new Date('2026-07-26T10:00:00Z'); // 2 hours ago
      const voteLog = [
        { value: 1, at: new Date('2026-07-26T11:00:00Z') }, // 1h ago
        { value: 1, at: new Date('2026-07-26T11:30:00Z') }, // 30min ago
        { value: -1, at: new Date('2026-07-26T11:45:00Z') }, // 15min ago
      ];

      const { risingScore } = computeRisingScore(voteLog, createdAt);
      // netVotes = 1 + 1 - 1 = 1
      // ageHours = 2h, capped at min(ageHours, 6) = 2h
      // risingScore = 1 / 2 = 0.5
      expect(risingScore).toBeCloseTo(0.5, 4);
    });

    it('floors elapsed time at 15 minutes for very new posts', () => {
      const createdAt = new Date('2026-07-26T11:58:00Z'); // 2 minutes ago
      const voteLog = [
        { value: 1, at: new Date('2026-07-26T11:59:00Z') },
      ];

      const { risingScore } = computeRisingScore(voteLog, createdAt);
      // netVotes = 1, ageHours = 2/60 ≈ 0.033h, floored to 0.25h
      // risingScore = 1 / 0.25 = 4
      expect(risingScore).toBeCloseTo(4, 4);
    });

    it('caps elapsed time at 6 hours for old posts with recent votes', () => {
      const createdAt = new Date('2026-07-25T12:00:00Z'); // 24 hours ago
      const voteLog = [
        { value: 1, at: new Date('2026-07-26T10:00:00Z') },
        { value: 1, at: new Date('2026-07-26T11:00:00Z') },
      ];

      const { risingScore } = computeRisingScore(voteLog, createdAt);
      // netVotes = 2, ageHours = 24h, capped at 6h
      // risingScore = 2 / 6 ≈ 0.333
      expect(risingScore).toBeCloseTo(2 / 6, 4);
    });

    it('returns all votes when all are within the 6-hour window', () => {
      const createdAt = new Date('2026-07-26T10:00:00Z');
      const voteLog = [
        { value: 1, at: new Date('2026-07-26T10:30:00Z') },
        { value: 1, at: new Date('2026-07-26T11:00:00Z') },
        { value: -1, at: new Date('2026-07-26T11:30:00Z') },
        { value: 1, at: new Date('2026-07-26T11:59:00Z') },
      ];

      const { trimmedLog } = computeRisingScore(voteLog, createdAt);
      expect(trimmedLog).toHaveLength(4);
    });
  });

  // ── Sort tiebreaker edge cases ─────────────────────────────────────────────

  describe('Sort tiebreaker edge cases', () => {
    function sortPosts(posts, sortField) {
      return [...posts].sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        if (valA instanceof Date) valA = valA.getTime();
        if (valB instanceof Date) valB = valB.getTime();
        if (valB !== valA) return valB - valA;
        return String(b._id).localeCompare(String(a._id));
      });
    }

    it('New sort: identical createdAt is broken by _id descending', () => {
      const posts = [
        { _id: 'aaa', createdAt: new Date('2026-07-26T12:00:00Z') },
        { _id: 'zzz', createdAt: new Date('2026-07-26T12:00:00Z') },
        { _id: 'mmm', createdAt: new Date('2026-07-26T12:00:00Z') },
      ];
      const sorted = sortPosts(posts, 'createdAt');
      expect(sorted.map(p => p._id)).toEqual(['zzz', 'mmm', 'aaa']);
    });

    it('Hot sort: identical hotScore is broken by _id descending', () => {
      const posts = [
        { _id: 'aaa', hotScore: 0.42 },
        { _id: 'zzz', hotScore: 0.42 },
        { _id: 'mmm', hotScore: 0.42 },
      ];
      const sorted = sortPosts(posts, 'hotScore');
      expect(sorted.map(p => p._id)).toEqual(['zzz', 'mmm', 'aaa']);
    });

    it('Top sort: identical score is broken by _id descending', () => {
      const posts = [
        { _id: 'aaa', score: 100 },
        { _id: 'zzz', score: 100 },
        { _id: 'mmm', score: 100 },
      ];
      const sorted = sortPosts(posts, 'score');
      expect(sorted.map(p => p._id)).toEqual(['zzz', 'mmm', 'aaa']);
    });

    it('New sort with single-post community returns that one post', () => {
      const posts = [
        { _id: 'only', createdAt: new Date('2026-07-26T12:00:00Z'), score: 5 },
      ];
      const sorted = sortPosts(posts, 'createdAt');
      expect(sorted).toHaveLength(1);
      expect(sorted[0]._id).toBe('only');
    });

    it('handles empty post list for any sort field', () => {
      for (const field of ['createdAt', 'hotScore', 'score', 'risingScore']) {
        expect(sortPosts([], field)).toEqual([]);
      }
    });

    it('preserves deterministic order across multiple runs with identical sort values', () => {
      const posts = Array.from({ length: 20 }, (_, i) => ({
        _id: `post_${String(i).padStart(2, '0')}`,
        createdAt: new Date('2026-07-26T12:00:00Z'),
        score: 50,
        hotScore: 0.75,
      }));

      const runs = Array.from({ length: 10 }, () =>
        sortPosts(posts, 'createdAt').map(p => p._id)
      );

      for (const run of runs) {
        expect(run).toEqual(runs[0]);
      }
    });
  });
});
