export type StoreScoringWeights = {
  coverage: number;
  matchConfidence: number;
  price: number;
  eta: number;
  substitutionRisk: number;
};

export type StoreScoringConfig = {
  version: string;
  weights: StoreScoringWeights;
};

export const DEFAULT_STORE_SCORING_CONFIG: StoreScoringConfig = {
  version: "2026-05-01.prototype.v1",
  weights: {
    coverage: 0.4,
    matchConfidence: 0.2,
    price: 0.2,
    eta: 0.1,
    substitutionRisk: 0.1,
  },
};