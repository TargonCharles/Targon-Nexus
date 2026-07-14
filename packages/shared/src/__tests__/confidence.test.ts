// Confidence score unit tests
import {
  computeConfidence,
  combineConfidenceScores,
  confidenceTier,
  weightedAverage,
  bayesianUpdate,
} from '../confidence';

describe('confidence', () => {
  describe('weightedAverage', () => {
    it('computes correct weighted average', () => {
      const result = weightedAverage([
        { value: 0.5, weight: 0.5 },
        { value: 1.0, weight: 0.5 },
      ]);
      expect(result).toBeCloseTo(0.75);
    });

    it('returns 0 when total weight is 0', () => {
      expect(weightedAverage([])).toBe(0);
      expect(weightedAverage([{ value: 0.8, weight: 0 }])).toBe(0);
    });

    it('handles single item', () => {
      expect(weightedAverage([{ value: 0.7, weight: 1 }])).toBeCloseTo(0.7);
    });
  });

  describe('computeConfidence', () => {
    it('combines source, evidence, and recency with correct weights', () => {
      const result = computeConfidence({
        sourceConfidence: 0.8,
        evidenceStrength: 0.6,
        recency: 1.0,
      });
      // 0.8*0.3 + 0.6*0.4 + 1.0*0.3 = 0.24 + 0.24 + 0.30 = 0.78
      expect(result).toBeCloseTo(0.78);
    });

    it('returns 0 for all-zero inputs', () => {
      expect(computeConfidence({ sourceConfidence: 0, evidenceStrength: 0, recency: 0 })).toBe(0);
    });
  });

  describe('combineConfidenceScores', () => {
    it('combines scores with complementary probability', () => {
      const result = combineConfidenceScores([0.5, 0.5]);
      // 0.5 + (1-0.5)*0.5 = 0.75
      expect(result).toBeCloseTo(0.75);
    });

    it('returns 0 for empty array', () => {
      expect(combineConfidenceScores([])).toBe(0);
    });

    it('returns single score unchanged', () => {
      expect(combineConfidenceScores([0.42])).toBe(0.42);
    });

    it('never exceeds 1 with many high scores', () => {
      const scores = Array(10).fill(0.9);
      expect(combineConfidenceScores(scores)).toBeLessThanOrEqual(1);
    });
  });

  describe('confidenceTier', () => {
    it('returns HIGH for scores >= 0.7', () => {
      expect(confidenceTier(0.7)).toBe('HIGH');
      expect(confidenceTier(0.95)).toBe('HIGH');
    });

    it('returns MEDIUM for scores >= 0.4 and < 0.7', () => {
      expect(confidenceTier(0.4)).toBe('MEDIUM');
      expect(confidenceTier(0.69)).toBe('MEDIUM');
    });

    it('returns LOW for scores < 0.4', () => {
      expect(confidenceTier(0.39)).toBe('LOW');
      expect(confidenceTier(0)).toBe('LOW');
    });

    it('uses custom thresholds', () => {
      expect(confidenceTier(0.6, { high: 0.8, medium: 0.5 })).toBe('MEDIUM');
      expect(confidenceTier(0.4, { high: 0.8, medium: 0.5 })).toBe('LOW');
    });
  });

  describe('bayesianUpdate', () => {
    it('updates prior with likelihood', () => {
      const result = bayesianUpdate(0.5, 0.8);
      // odds = (0.5/0.5)*(0.8/0.2) = 1*4 = 4
      // posterior = 4/5 = 0.8
      expect(result).toBeCloseTo(0.8);
    });

    it('returns likelihood when prior is 0', () => {
      expect(bayesianUpdate(0, 0.7)).toBe(0.7);
    });

    it('returns likelihood when prior is 1', () => {
      expect(bayesianUpdate(1, 0.7)).toBe(0.7);
    });
  });
});
