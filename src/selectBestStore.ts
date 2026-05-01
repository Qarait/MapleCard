import { DEFAULT_STORE_SCORING_CONFIG } from "./config/storeScoringConfig";
import type { CanonicalMatch } from "./matchParsedLineToCanonical";
import { normalizeAttributeRecord } from "./normalizeAttributes";

export type StoreProduct = {
  store_id?: string;
  storeId?: string;
  retailerKey?: string;
  canonical_item_id?: string;
  canonicalItemId?: string;
  price_cents: number;
  currency?: string;
  availability_status?: string;
  metadata_json?: any;
  attributes_json?: Record<string, any>;
  eta_min?: number;
  etaMin?: number;
  in_stock?: boolean;
  inStock?: boolean;
};

export type SelectedStoreResult = {
  provider: string;
  retailerKey: string;
  subtotal: number;
  etaMin: number | null;
  coverageRatio: number;
  avgMatchConfidence: number;
  score: number;
  reason: string;
};

type StoreEtaMetadata = {
  displayEtaMin: number | null;
  hasKnownEta: boolean;
  scoringEtaMin: number;
  wasDefaulted: boolean;
  wasPenalized: boolean;
};

type StoreEval = {
  retailerKey: string;
  storeId: string;
  subtotal: number;
  coverageRatio: number;
  avgMatchConfidence: number;
  substitutionRisk: number;
  eta: StoreEtaMetadata;
};

type RankedStoreEval = StoreEval & {
  normalizedTotal: number;
  normalizedEta: number;
  score: number;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function getStoreId(p: StoreProduct): string {
  return (p.store_id ?? p.storeId ?? "").toString();
}

function getCanonicalItemId(p: StoreProduct): string {
  return (p.canonical_item_id ?? p.canonicalItemId ?? "").toString();
}

function getRetailerKey(p: StoreProduct): string {
  return (p.retailerKey ?? getStoreId(p) ?? "").toString();
}

function isProductInStock(p: StoreProduct): boolean {
  const meta = p.metadata_json ?? {};
  const metaInStock = typeof meta.inStock === "boolean" ? meta.inStock : undefined;
  const explicitInStock = typeof p.in_stock === "boolean" ? p.in_stock : undefined;
  const explicitInStock2 = typeof p.inStock === "boolean" ? p.inStock : undefined;

  const availability = p.availability_status?.toLowerCase?.() ?? "";
  const availabilitySaysInStock = availability === "in_stock" || availability === "in stock" || availability === "available";

  if (typeof explicitInStock === "boolean") return explicitInStock;
  if (typeof explicitInStock2 === "boolean") return explicitInStock2;
  if (typeof metaInStock === "boolean") return metaInStock;
  return availabilitySaysInStock;
}

function getEtaMin(p: StoreProduct): number | undefined {
  if (typeof p.etaMin === "number" && Number.isFinite(p.etaMin)) return p.etaMin;
  if (typeof p.eta_min === "number" && Number.isFinite(p.eta_min)) return p.eta_min;
  const meta = p.metadata_json ?? {};
  const v = meta.etaMin ?? meta.eta_min ?? meta.eta;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
}

function toCurrencyStringFromCents(cents: number, currency?: string): string {
  const amount = cents / 100;
  const cur = currency ?? "CAD";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(amount);
  } catch {
    return `${cur} ${amount.toFixed(2)}`;
  }
}

function normalizeMinMax(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 1;
  if (max <= min) return 0;
  return clamp01((value - min) / (max - min));
}

function computeSubstitutionRisk(matches: CanonicalMatch[], covered: CanonicalMatch[]): number {
  if (covered.length === 0) return 1;

  const risks = covered.map((m) => {
    const lowConf = m.lowConfidence ? 1 : 0;
    const defaultUsed = m.usedDefault ? 1 : 0;
    const uncertainty = clamp01(1 - m.matchConfidence);
    return clamp01(0.5 * lowConf + 0.3 * defaultUsed + 0.2 * uncertainty);
  });

  const avg = risks.reduce((a, b) => a + b, 0) / risks.length;
  return clamp01(avg);
}

function combineSubstitutionRisk(baseRisk: number, avgAttributeCompatibility: number): number {
  const blend = DEFAULT_STORE_SCORING_CONFIG.substitutionRiskBlend;
  const attributeMismatchRisk = clamp01(1 - avgAttributeCompatibility);
  return clamp01(
    baseRisk * clamp01(blend.baseRisk) + attributeMismatchRisk * clamp01(blend.attributeMismatchRisk)
  );
}

function computeStoreAttributesCompatibility(requestedAttributes: Record<string, any>, storeAttributes: any): number {
  const normalizedRequestedAttributes = normalizeAttributeRecord(requestedAttributes ?? {});
  const normalizedStoreAttributes = normalizeAttributeRecord(storeAttributes ?? {});
  const keys = Object.keys(normalizedRequestedAttributes);
  if (keys.length === 0) return 1;
  if (Object.keys(normalizedStoreAttributes).length === 0) return 0;

  let matched = 0;
  let evaluated = 0;
  for (const k of keys) {
    evaluated++;
    if (k in normalizedStoreAttributes && normalizedStoreAttributes[k] === normalizedRequestedAttributes[k]) matched++;
  }
  return evaluated === 0 ? 0 : matched / evaluated;
}

function evaluateStoreEta(selectedKnownEtaMins: number[], selectedMissingEtaCount: number): StoreEtaMetadata {
  if (selectedKnownEtaMins.length === 0 || selectedMissingEtaCount > 0) {
    return {
      displayEtaMin: null,
      hasKnownEta: false,
      scoringEtaMin: Number.NaN,
      wasDefaulted: false,
      wasPenalized: false,
    };
  }

  const displayEtaMin = Math.max(...selectedKnownEtaMins);
  return {
    displayEtaMin,
    hasKnownEta: true,
    scoringEtaMin: displayEtaMin,
    wasDefaulted: false,
    wasPenalized: false,
  };
}

function buildStoreEvaluations(matches: CanonicalMatch[], storeProducts: StoreProduct[]): StoreEval[] {
  const required = matches.slice();
  const byStore = new Map<string, StoreProduct[]>();
  for (const p of storeProducts) {
    const storeId = getStoreId(p);
    if (!storeId) continue;
    const list = byStore.get(storeId) ?? [];
    list.push(p);
    byStore.set(storeId, list);
  }

  const storeEvaluations: StoreEval[] = [];
  for (const [storeId, products] of byStore.entries()) {
    const retailerKey = getRetailerKey(products[0]);
    let subtotal = 0;
    const selectedKnownEtaMins: number[] = [];
    let selectedMissingEtaCount = 0;
    const coveredMatches: CanonicalMatch[] = [];
    const selectedAttributeCompatibilities: number[] = [];

    for (const m of required) {
      const canonicalId = m.canonicalItemId;
      const candidates = products.filter((p) => getCanonicalItemId(p) === canonicalId && isProductInStock(p));
      if (candidates.length === 0) continue;

      candidates.sort((a, b) => {
        const requested = m.requestedAttributes ?? {};
        const compA = computeStoreAttributesCompatibility(requested, a.attributes_json ?? {});
        const compB = computeStoreAttributesCompatibility(requested, b.attributes_json ?? {});
        if (compA !== compB) return compB - compA;

        const pa = a.price_cents ?? 0;
        const pb = b.price_cents ?? 0;
        if (pa !== pb) return pa - pb;

        const ea = getEtaMin(a);
        const eb = getEtaMin(b);
        const eav = ea ?? Number.POSITIVE_INFINITY;
        const ebv = eb ?? Number.POSITIVE_INFINITY;
        return eav - ebv;
      });

      const chosen = candidates[0];
      subtotal += chosen.price_cents ?? 0;
      const etaMin = getEtaMin(chosen);
      if (etaMin == null) selectedMissingEtaCount += 1;
      else selectedKnownEtaMins.push(etaMin);
      coveredMatches.push(m);
      selectedAttributeCompatibilities.push(
        computeStoreAttributesCompatibility(m.requestedAttributes ?? {}, chosen.attributes_json ?? {})
      );
    }

    const avgAttributeCompatibility =
      selectedAttributeCompatibilities.length === 0
        ? 1
        : selectedAttributeCompatibilities.reduce((sum, value) => sum + value, 0) / selectedAttributeCompatibilities.length;

    storeEvaluations.push({
      retailerKey,
      storeId,
      subtotal,
      coverageRatio: required.length === 0 ? 0 : coveredMatches.length / required.length,
      avgMatchConfidence:
        coveredMatches.length === 0 ? 0 : coveredMatches.reduce((a, b) => a + b.matchConfidence, 0) / coveredMatches.length,
      substitutionRisk: combineSubstitutionRisk(computeSubstitutionRisk(required, coveredMatches), avgAttributeCompatibility),
      eta: evaluateStoreEta(selectedKnownEtaMins, selectedMissingEtaCount),
    });
  }

  return storeEvaluations;
}

function applyEtaScoringMetadata(storeEvaluations: StoreEval[]): StoreEval[] {
  const knownEtas = storeEvaluations
    .map((evaluation) => evaluation.eta.displayEtaMin)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const maxKnownEta = knownEtas.length > 0 ? Math.max(...knownEtas) : 60;
  const defaultPenaltyEtaMin = maxKnownEta + 60;

  return storeEvaluations.map((evaluation) => {
    if (evaluation.eta.hasKnownEta && evaluation.eta.displayEtaMin != null) {
      return {
        ...evaluation,
        eta: {
          ...evaluation.eta,
          scoringEtaMin: evaluation.eta.displayEtaMin,
        },
      };
    }

    return {
      ...evaluation,
      eta: {
        ...evaluation.eta,
        scoringEtaMin: defaultPenaltyEtaMin,
        wasDefaulted: true,
        wasPenalized: true,
      },
    };
  });
}

function rankStoreEvaluations(matches: CanonicalMatch[], storeProducts: StoreProduct[]): RankedStoreEval[] {
  const storeEvaluations = applyEtaScoringMetadata(buildStoreEvaluations(matches, storeProducts));
  const totals = storeEvaluations.map((s) => s.subtotal);
  const scoringEtas = storeEvaluations.map((s) => s.eta.scoringEtaMin);
  const minTotal = totals.length > 0 ? Math.min(...totals) : 0;
  const maxTotal = totals.length > 0 ? Math.max(...totals) : 0;
  const minEta = scoringEtas.length > 0 ? Math.min(...scoringEtas) : 0;
  const maxEta = scoringEtas.length > 0 ? Math.max(...scoringEtas) : 0;
  const weights = DEFAULT_STORE_SCORING_CONFIG.weights;

  return storeEvaluations
    .map((evaluation) => {
      const normalizedTotal = normalizeMinMax(evaluation.subtotal, minTotal, maxTotal);
      const normalizedEta = normalizeMinMax(evaluation.eta.scoringEtaMin, minEta, maxEta);
      const score =
        weights.coverage * clamp01(evaluation.coverageRatio) +
        weights.matchConfidence * clamp01(evaluation.avgMatchConfidence) -
        weights.price * normalizedTotal -
        weights.eta * normalizedEta -
        weights.substitutionRisk * clamp01(evaluation.substitutionRisk);

      return {
        ...evaluation,
        normalizedTotal,
        normalizedEta,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function buildReason(evaluation: RankedStoreEval, rankedEvals: RankedStoreEval[], storeProducts: StoreProduct[]): string {
  const maxCoverage = Math.max(...rankedEvals.map((s) => s.coverageRatio));
  const bestCoverageStores = rankedEvals.filter((s) => Math.abs(s.coverageRatio - maxCoverage) < 1e-9);
  const minEtaAmongBestCoverage = Math.min(...bestCoverageStores.map((s) => s.eta.scoringEtaMin));
  const sameDayBestCoverageStores = bestCoverageStores.filter((s) => Math.abs(s.eta.scoringEtaMin - minEtaAmongBestCoverage) < 1e-9);
  const minTotalAmongSameDay = Math.min(...sameDayBestCoverageStores.map((s) => s.subtotal));
  const currency = storeProducts.find((p) => getStoreId(p) === evaluation.storeId)?.currency;

  const totalStr = toCurrencyStringFromCents(evaluation.subtotal, currency);
  const etaStr = evaluation.eta.displayEtaMin == null ? "unknown ETA" : `${evaluation.eta.displayEtaMin} min`;
  const coverageStr = `${Math.round(evaluation.coverageRatio * 100)}%`;
  const isHighestCoverage = Math.abs(evaluation.coverageRatio - maxCoverage) < 1e-9;
  const isLowestTotalAmongSameDay = sameDayBestCoverageStores.length > 0 && Math.abs(evaluation.subtotal - minTotalAmongSameDay) < 1e-9;
  const isBestEtaAmongBestCoverage = sameDayBestCoverageStores.length > 0 && Math.abs(evaluation.eta.scoringEtaMin - minEtaAmongBestCoverage) < 1e-9;

  if (isHighestCoverage && isLowestTotalAmongSameDay && isBestEtaAmongBestCoverage) {
    return `Highest coverage (${coverageStr}) with lowest total among best-ranked ETA options (ETA ${etaStr}), total ${totalStr}.`;
  }
  if (isHighestCoverage) {
    return `Highest coverage (${coverageStr}) with total ${totalStr} and ETA ${etaStr}.`;
  }
  if (evaluation.subtotal === Math.min(...rankedEvals.map((s) => s.subtotal))) {
    return `Lowest total (${totalStr}) with coverage ${coverageStr} and ETA ${etaStr}.`;
  }
  if (Math.abs(evaluation.eta.scoringEtaMin - Math.min(...rankedEvals.map((s) => s.eta.scoringEtaMin))) < 1e-9) {
    return `Fastest ranked ETA (${etaStr}) with coverage ${coverageStr} and total ${totalStr}.`;
  }
  return `Best overall score (${evaluation.score.toFixed(3)}) with coverage ${coverageStr}, avg match confidence ${(evaluation.avgMatchConfidence * 100).toFixed(0)}%, total ${totalStr}, ETA ${etaStr}.`;
}

function buildSelectedStoreResult(evaluation: RankedStoreEval, rankedEvals: RankedStoreEval[], storeProducts: StoreProduct[]): SelectedStoreResult {
  return {
    provider: "deterministic-store-decision-v1",
    retailerKey: evaluation.retailerKey,
    subtotal: evaluation.subtotal,
    etaMin: evaluation.eta.displayEtaMin,
    coverageRatio: evaluation.coverageRatio,
    avgMatchConfidence: evaluation.avgMatchConfidence,
    score: evaluation.score,
    reason: buildReason(evaluation, rankedEvals, storeProducts),
  };
}

export function selectBestStore(matches: CanonicalMatch[], storeProducts: StoreProduct[]): SelectedStoreResult {
  const provider = "deterministic-store-decision-v1";
  const required = matches.slice();
  if (required.length === 0) {
    return {
      provider,
      retailerKey: "",
      subtotal: 0,
      etaMin: null,
      coverageRatio: 0,
      avgMatchConfidence: 0,
      score: 0,
      reason: "No matches to price; coverage is 0%.",
    };
  }

  const rankedEvals = rankStoreEvaluations(required, storeProducts);
  if (rankedEvals.length === 0) {
    return {
      provider,
      retailerKey: "",
      subtotal: 0,
      etaMin: null,
      coverageRatio: 0,
      avgMatchConfidence: 0,
      score: 0,
      reason: "No store products provided; cannot compute coverage or totals.",
    };
  }

  return buildSelectedStoreResult(rankedEvals[0], rankedEvals, storeProducts);
}

export function selectBestStoreWithAlternatives(
  matches: CanonicalMatch[],
  storeProducts: StoreProduct[]
): { winner: SelectedStoreResult; alternatives: SelectedStoreResult[] } {
  const provider = "deterministic-store-decision-v1";
  const required = matches.slice();
  if (required.length === 0) {
    return {
      winner: {
        provider,
        retailerKey: "",
        subtotal: 0,
        etaMin: null,
        coverageRatio: 0,
        avgMatchConfidence: 0,
        score: 0,
        reason: "No matches to price; coverage is 0%.",
      },
      alternatives: [],
    };
  }

  const rankedEvals = rankStoreEvaluations(required, storeProducts);
  if (rankedEvals.length === 0) {
    return {
      winner: {
        provider,
        retailerKey: "",
        subtotal: 0,
        etaMin: null,
        coverageRatio: 0,
        avgMatchConfidence: 0,
        score: 0,
        reason: "No store products provided; cannot compute coverage or totals.",
      },
      alternatives: [],
    };
  }

  const winner = buildSelectedStoreResult(rankedEvals[0], rankedEvals, storeProducts);
  const alternatives = rankedEvals.slice(1).map((evaluation) => {
    const currency = storeProducts.find((p) => getStoreId(p) === evaluation.storeId)?.currency;
    const subtotalStr = toCurrencyStringFromCents(evaluation.subtotal, currency);
    const etaStr = evaluation.eta.displayEtaMin == null ? "unknown ETA" : `${evaluation.eta.displayEtaMin} min`;
    const coverageStr = `${Math.round(evaluation.coverageRatio * 100)}%`;
    const avgConfStr = `${Math.round(evaluation.avgMatchConfidence * 100)}%`;

    return {
      provider,
      retailerKey: evaluation.retailerKey,
      subtotal: evaluation.subtotal,
      etaMin: evaluation.eta.displayEtaMin,
      coverageRatio: evaluation.coverageRatio,
      avgMatchConfidence: evaluation.avgMatchConfidence,
      score: evaluation.score,
      reason: `Coverage ${coverageStr} with avg match confidence ${avgConfStr}, total ${subtotalStr}, ETA ${etaStr}.`,
    };
  });

  return { winner, alternatives };
}