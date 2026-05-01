export type StoreScoringWeights = {
  coverage: number;
  matchConfidence: number;
  price: number;
  eta: number;
  substitutionRisk: number;
};

export type SubstitutionRiskBlend = {
  baseRisk: number;
  attributeMismatchRisk: number;
};

export type StoreScoringConfig = {
  version: string;
  weights: StoreScoringWeights;
  substitutionRiskBlend: SubstitutionRiskBlend;
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
  substitutionRiskBlend: {
    baseRisk: 0.7,
    attributeMismatchRisk: 0.3,
  },
};