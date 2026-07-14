// Confidence score calculation utilities

export interface ConfidenceInput { sourceConfidence: number; evidenceStrength: number; recency: number; }
export type ConfidenceTier = 'HIGH' | 'MEDIUM' | 'LOW';
export interface ConfidenceThresholds { high: number; medium: number; }

export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds = { high: 0.7, medium: 0.4 };

export const CONFIDENCE_TIERS: Record<ConfidenceTier, { min: number; max: number; color: string; label: string }> = {
  HIGH: { min: 0.7, max: 1.0, color: '#22c55e', label: 'High Confidence' },
  MEDIUM: { min: 0.4, max: 0.69, color: '#eab308', label: 'Medium Confidence' },
  LOW: { min: 0.0, max: 0.39, color: '#ef4444', label: 'Low Confidence' },
};

export function computeConfidence(input: ConfidenceInput): number {
  const { sourceConfidence, evidenceStrength, recency } = input;
  return weightedAverage([
    { value: sourceConfidence, weight: 0.3 },
    { value: evidenceStrength, weight: 0.4 },
    { value: recency, weight: 0.3 },
  ]);
}

export function combineConfidenceScores(scores: number[]): number {
  if (scores.length === 0) return 0;
  if (scores.length === 1) return scores[0];
  return scores.reduce((acc, s) => acc + (1 - acc) * s, 0);
}

export function isConfidenceAbove(score: number, threshold: number): boolean {
  return score >= threshold;
}

export function confidenceTier(score: number, thresholds: ConfidenceThresholds = DEFAULT_CONFIDENCE_THRESHOLDS): ConfidenceTier {
  if (score >= thresholds.high) return 'HIGH';
  if (score >= thresholds.medium) return 'MEDIUM';
  return 'LOW';
}

export function weightedAverage(items: { value: number; weight: number }[]): number {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight === 0) return 0;
  return items.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

export function bayesianUpdate(prior: number, likelihood: number): number {
  if (prior <= 0 || prior >= 1) return likelihood;
  const odds = (prior / (1 - prior)) * (likelihood / (1 - likelihood));
  return odds / (1 + odds);
}
