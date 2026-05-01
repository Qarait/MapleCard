import type { CanonicalMatch } from "./matchParsedLineToCanonical";

export type StoreProduct = {
  // In DB this is `store_id`, so accept both spellings.
  store_id?: string;
  storeId?: string;

  // External retail key (optional). If missing, we fall back to `store_id`.
  retailerKey?: string;

  // In DB this is `canonical_item_id`, so accept both spellings.
  canonical_item_id?: string;
  canonicalItemId?: string;

  price_cents: number;
  currency?: string;

  // In DB migration, availability is `availability_status` and also embedded in `metadata_json`.
  availability_status?: string;

  metadata_json?: any;
  attributes_json?: Record<string, any>;

  // If your app already denormalizes these, accept them too.
  eta_min?: number;
  etaMin?: number;
  in_stock?: boolean;
  inStock?: boolean;
};

export type SelectedStoreResult = {
  provider: string;
  retailerKey: string;
  subtotal: number;
  etaMin: number;
  coverageRatio: number;
  avgMatchConfidence: number;
  score: number;
  reason: string;
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
  // Migration uses `in_stock` string in availability_status.
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
  if (max <= min) return 0; // all equal => no penalty
  return clamp01((value - min) / (max - min));
}

function computeSubstitutionRisk(matches: CanonicalMatch[], covered: CanonicalMatch[]): number {
  if (covered.length === 0) return 1;

  const risks = covered.map((m) => {
    // Higher when we used defaults, had low confidence, or were generally uncertain.
    const lowConf = m.lowConfidence ? 1 : 0;
    const defaultUsed = m.usedDefault ? 1 : 0;
    const uncertainty = clamp01(1 - m.matchConfidence);
    // Weighted average => 0..1-ish
    return clamp01(0.5 * lowConf + 0.3 * defaultUsed + 0.2 * uncertainty);
  });

  const avg = risks.reduce((a, b) => a + b, 0) / risks.length;
  return clamp01(avg);
}

function computeStoreAttributesCompatibility(
  requestedAttributes: Record<string, any>,
  storeAttributes: any
): number {
  const keys = Object.keys(requestedAttributes ?? {});
  if (keys.length === 0) return 1;
  if (!storeAttributes || typeof storeAttributes !== "object") return 0;

  let matched = 0;
  let evaluated = 0;
  for (const k of keys) {
    evaluated++;
    if (k in storeAttributes && storeAttributes[k] === requestedAttributes[k]) matched++;
  }
  return evaluated === 0 ? 0 : matched / evaluated;
}

type StoreEval = {
  retailerKey: string;
  storeId: string;
  subtotal: number;
  etaMin: number;
  coveredCount: number;
  totalCount: number;
  coverageRatio: number;
  avgMatchConfidence: number;
  substitutionRisk: number;
  // Keep for explanation/debug
  selectedCanonicalItemIds: string[];
};

/**
 * Choose the best store based on coverage, price, ETA and substitution risk.
 *
 * Notes:
 * - "Subtotal" is the sum of the cheapest in-stock product per matched canonical item.
 * - "ETA" is the max `etaMin` among the selected items (time when you likely have everything).
 */
export function selectBestStore(
  matches: CanonicalMatch[],
  storeProducts: StoreProduct[]
): SelectedStoreResult {
  const provider = "deterministic-store-decision-v1";

  const required = matches.slice(); // preserve order
  if (required.length === 0) {
    return {
      provider,
      retailerKey: "",
      subtotal: 0,
      etaMin: 0,
      coverageRatio: 0,
      avgMatchConfidence: 0,
      score: 0,
      reason: "No matches to price; coverage is 0%.",
    };
  }

  // Group store products by store.
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

    // For each canonical match, pick cheapest in-stock product from this store.
    let subtotal = 0;
    const selectedEtaMins: number[] = [];
    const selectedCanonicalItemIds: string[] = [];

    const coveredMatches: CanonicalMatch[] = [];

    for (const m of required) {
      const canonicalId = m.canonicalItemId;
      const candidates = products.filter((p) => getCanonicalItemId(p) === canonicalId && isProductInStock(p));
      if (candidates.length === 0) continue;

      // Choose cheapest; tie-breaker: earliest eta.
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
      selectedEtaMins.push(getEtaMin(chosen) ?? Number.POSITIVE_INFINITY);
      selectedCanonicalItemIds.push(canonicalId);
      coveredMatches.push(m);
    }

    const coveredCount = selectedCanonicalItemIds.length;
    const totalCount = required.length;
    const coverageRatio = totalCount === 0 ? 0 : coveredCount / totalCount;

    const avgMatchConfidence =
      coveredMatches.length === 0
        ? 0
        : coveredMatches.reduce((a, b) => a + b.matchConfidence, 0) / coveredMatches.length;

    const substitutionRisk = computeSubstitutionRisk(required, coveredMatches);

    const etaMin = selectedEtaMins.length === 0 ? Number.POSITIVE_INFINITY : Math.max(...selectedEtaMins.filter((x) => Number.isFinite(x)));
    const etaMinSafe = Number.isFinite(etaMin) ? etaMin : Number.POSITIVE_INFINITY;

    storeEvaluations.push({
      retailerKey,
      storeId,
      subtotal,
      etaMin: etaMinSafe,
      coveredCount,
      totalCount,
      coverageRatio,
      avgMatchConfidence,
      substitutionRisk,
      selectedCanonicalItemIds,
    });
  }

  // If no store groups, return safe default.
  if (storeEvaluations.length === 0) {
    return {
      provider,
      retailerKey: "",
      subtotal: 0,
      etaMin: 0,
      coverageRatio: 0,
      avgMatchConfidence: 0,
      score: 0,
      reason: "No store products provided; cannot compute coverage or totals.",
    };
  }

  // Normalize total and eta across stores (lower is better).
  const totals = storeEvaluations.map((s) => s.subtotal);
  const etas = storeEvaluations.map((s) => (Number.isFinite(s.etaMin) ? s.etaMin : Number.POSITIVE_INFINITY));

  const minTotal = Math.min(...totals);
  const maxTotal = Math.max(...totals);

  const finiteEtas = etas.filter((e) => Number.isFinite(e));
  const minEta = finiteEtas.length ? Math.min(...finiteEtas) : 0;
  const maxEta = finiteEtas.length ? Math.max(...finiteEtas) : 1;

  const evaluationsWithScore = storeEvaluations.map((s) => {
    const normalizedTotal = normalizeMinMax(s.subtotal, minTotal, maxTotal);
    const normalizedEta = Number.isFinite(s.etaMin) ? normalizeMinMax(s.etaMin, minEta, maxEta) : 1;

    const score =
      0.40 * clamp01(s.coverageRatio) +
      0.20 * clamp01(s.avgMatchConfidence) -
      0.20 * normalizedTotal -
      0.10 * normalizedEta -
      0.10 * clamp01(s.substitutionRisk);

    return { ...s, normalizedTotal, normalizedEta, score };
  });

  evaluationsWithScore.sort((a, b) => b.score - a.score);
  const winner = evaluationsWithScore[0];

  // Build a deterministic, evidence-based reason using real values.
  const maxCoverage = Math.max(...evaluationsWithScore.map((s) => s.coverageRatio));
  const bestCoverageStores = evaluationsWithScore.filter((s) => Math.abs(s.coverageRatio - maxCoverage) < 1e-9);
  const minEtaAmongBestCoverage = Math.min(
    ...bestCoverageStores.map((s) => (Number.isFinite(s.etaMin) ? s.etaMin : Number.POSITIVE_INFINITY))
  );
  const sameDayBestCoverageStores = bestCoverageStores.filter((s) => {
    if (!Number.isFinite(minEtaAmongBestCoverage)) return false;
    return Math.abs(s.etaMin - minEtaAmongBestCoverage) < 1e-9;
  });
  const minTotalAmongSameDay = Math.min(...sameDayBestCoverageStores.map((s) => s.subtotal));

  const currency = (() => {
    const any = storeProducts.find((p) => getStoreId(p) === winner.storeId);
    return any?.currency;
  })();

  const winnerTotalStr = toCurrencyStringFromCents(winner.subtotal, currency);
  const winnerEtaStr = Number.isFinite(winner.etaMin) ? `${winner.etaMin} min` : "unknown ETA";
  const winnerCoverageStr = `${Math.round(winner.coverageRatio * 100)}%`;

  let reason = "";
  const isHighestCoverage = Math.abs(winner.coverageRatio - maxCoverage) < 1e-9;
  const isLowestTotalAmongSameDay =
    sameDayBestCoverageStores.length > 0 && Math.abs(winner.subtotal - minTotalAmongSameDay) < 1e-9;
  const isBestEtaAmongBestCoverage =
    sameDayBestCoverageStores.length > 0 && Number.isFinite(minEtaAmongBestCoverage) && Math.abs(winner.etaMin - minEtaAmongBestCoverage) < 1e-9;

  if (isHighestCoverage && isLowestTotalAmongSameDay && isBestEtaAmongBestCoverage) {
    reason = `Highest coverage (${winnerCoverageStr}) with lowest total among same-day options (ETA ${winnerEtaStr}), total ${winnerTotalStr}.`;
  } else if (isHighestCoverage) {
    reason = `Highest coverage (${winnerCoverageStr}) with total ${winnerTotalStr} and ETA ${winnerEtaStr}.`;
  } else if (winner.subtotal === Math.min(...evaluationsWithScore.map((s) => s.subtotal))) {
    reason = `Lowest total (${winnerTotalStr}) with coverage ${winnerCoverageStr} and ETA ${winnerEtaStr}.`;
  } else if (Number.isFinite(winner.etaMin) && winner.etaMin === Math.min(...evaluationsWithScore.map((s) => (Number.isFinite(s.etaMin) ? s.etaMin : Number.POSITIVE_INFINITY)))) {
    reason = `Fastest ETA (${winnerEtaStr}) with coverage ${winnerCoverageStr} and total ${winnerTotalStr}.`;
  } else {
    reason = `Best overall score (${winner.score.toFixed(3)}) with coverage ${winnerCoverageStr}, avg match confidence ${(winner.avgMatchConfidence * 100).toFixed(
      0
    )}%, total ${winnerTotalStr}, ETA ${winnerEtaStr}.`;
  }

  return {
    provider,
    retailerKey: winner.retailerKey,
    subtotal: winner.subtotal,
    etaMin: Number.isFinite(winner.etaMin) ? winner.etaMin : 0,
    coverageRatio: winner.coverageRatio,
    avgMatchConfidence: winner.avgMatchConfidence,
    score: winner.score,
    reason,
  };
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
        etaMin: 0,
        coverageRatio: 0,
        avgMatchConfidence: 0,
        score: 0,
        reason: "No matches to price; coverage is 0%.",
      },
      alternatives: [],
    };
  }

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
    const selectedEtaMins: number[] = [];
    const selectedCanonicalItemIds: string[] = [];
    const coveredMatches: CanonicalMatch[] = [];

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
      selectedEtaMins.push(getEtaMin(chosen) ?? Number.POSITIVE_INFINITY);
      selectedCanonicalItemIds.push(canonicalId);
      coveredMatches.push(m);
    }

    const coveredCount = selectedCanonicalItemIds.length;
    const totalCount = required.length;
    const coverageRatio = totalCount === 0 ? 0 : coveredCount / totalCount;

    const avgMatchConfidence =
      coveredMatches.length === 0 ? 0 : coveredMatches.reduce((a, b) => a + b.matchConfidence, 0) / coveredMatches.length;

    const substitutionRisk = computeSubstitutionRisk(required, coveredMatches);

    const etaMin = selectedEtaMins.length === 0 ? Number.POSITIVE_INFINITY : Math.max(...selectedEtaMins.filter((x) => Number.isFinite(x)));
    const etaMinSafe = Number.isFinite(etaMin) ? etaMin : Number.POSITIVE_INFINITY;

    storeEvaluations.push({
      retailerKey,
      storeId,
      subtotal,
      etaMin: etaMinSafe,
      coveredCount,
      totalCount,
      coverageRatio,
      avgMatchConfidence,
      substitutionRisk,
      selectedCanonicalItemIds,
    });
  }

  if (storeEvaluations.length === 0) {
    return {
      winner: {
        provider,
        retailerKey: "",
        subtotal: 0,
        etaMin: 0,
        coverageRatio: 0,
        avgMatchConfidence: 0,
        score: 0,
        reason: "No store products provided; cannot compute coverage or totals.",
      },
      alternatives: [],
    };
  }

  const totals = storeEvaluations.map((s) => s.subtotal);
  const etas = storeEvaluations.map((s) => (Number.isFinite(s.etaMin) ? s.etaMin : Number.POSITIVE_INFINITY));

  const minTotal = Math.min(...totals);
  const maxTotal = Math.max(...totals);

  const finiteEtas = etas.filter((e) => Number.isFinite(e));
  const minEta = finiteEtas.length ? Math.min(...finiteEtas) : 0;
  const maxEta = finiteEtas.length ? Math.max(...finiteEtas) : 1;

  const evaluationsWithScore = storeEvaluations.map((s) => {
    const normalizedTotal = normalizeMinMax(s.subtotal, minTotal, maxTotal);
    const normalizedEta = Number.isFinite(s.etaMin) ? normalizeMinMax(s.etaMin, minEta, maxEta) : 1;

    const score =
      0.40 * clamp01(s.coverageRatio) +
      0.20 * clamp01(s.avgMatchConfidence) -
      0.20 * normalizedTotal -
      0.10 * normalizedEta -
      0.10 * clamp01(s.substitutionRisk);

    return { ...s, normalizedTotal, normalizedEta, score };
  });

  evaluationsWithScore.sort((a, b) => b.score - a.score);
  const winner = evaluationsWithScore[0];

  const maxCoverage = Math.max(...evaluationsWithScore.map((s) => s.coverageRatio));
  const bestCoverageStores = evaluationsWithScore.filter((s) => Math.abs(s.coverageRatio - maxCoverage) < 1e-9);
  const minEtaAmongBestCoverage = Math.min(
    ...bestCoverageStores.map((s) => (Number.isFinite(s.etaMin) ? s.etaMin : Number.POSITIVE_INFINITY))
  );
  const sameDayBestCoverageStores = bestCoverageStores.filter((s) => {
    if (!Number.isFinite(minEtaAmongBestCoverage)) return false;
    return Math.abs(s.etaMin - minEtaAmongBestCoverage) < 1e-9;
  });
  const minTotalAmongSameDay = Math.min(...sameDayBestCoverageStores.map((s) => s.subtotal));

  const currency = (() => {
    const any = storeProducts.find((p) => getStoreId(p) === winner.storeId);
    return any?.currency;
  })();

  const winnerTotalStr = toCurrencyStringFromCents(winner.subtotal, currency);
  const winnerEtaStr = Number.isFinite(winner.etaMin) ? `${winner.etaMin} min` : "unknown ETA";
  const winnerCoverageStr = `${Math.round(winner.coverageRatio * 100)}%`;

  const isHighestCoverage = Math.abs(winner.coverageRatio - maxCoverage) < 1e-9;
  const isLowestTotalAmongSameDay =
    sameDayBestCoverageStores.length > 0 && Math.abs(winner.subtotal - minTotalAmongSameDay) < 1e-9;

  const isBestEtaAmongBestCoverage =
    sameDayBestCoverageStores.length > 0 &&
    Number.isFinite(minEtaAmongBestCoverage) &&
    Math.abs(winner.etaMin - minEtaAmongBestCoverage) < 1e-9;

  let winnerReason = "";
  if (isHighestCoverage && isLowestTotalAmongSameDay && isBestEtaAmongBestCoverage) {
    winnerReason = `Highest coverage (${winnerCoverageStr}) with lowest total among same-day options (ETA ${winnerEtaStr}), total ${winnerTotalStr}.`;
  } else if (isHighestCoverage) {
    winnerReason = `Highest coverage (${winnerCoverageStr}) with total ${winnerTotalStr} and ETA ${winnerEtaStr}.`;
  } else if (winner.subtotal === Math.min(...evaluationsWithScore.map((s) => s.subtotal))) {
    winnerReason = `Lowest total (${winnerTotalStr}) with coverage ${winnerCoverageStr} and ETA ${winnerEtaStr}.`;
  } else if (
    Number.isFinite(winner.etaMin) &&
    winner.etaMin === Math.min(...evaluationsWithScore.map((s) => (Number.isFinite(s.etaMin) ? s.etaMin : Number.POSITIVE_INFINITY)))
  ) {
    winnerReason = `Fastest ETA (${winnerEtaStr}) with coverage ${winnerCoverageStr} and total ${winnerTotalStr}.`;
  } else {
    winnerReason = `Best overall score (${winner.score.toFixed(3)}) with coverage ${winnerCoverageStr}, avg match confidence ${(winner.avgMatchConfidence * 100).toFixed(0)}%, total ${winnerTotalStr}, ETA ${winnerEtaStr}.`;
  }

  const winnerResult: SelectedStoreResult = {
    provider,
    retailerKey: winner.retailerKey,
    subtotal: winner.subtotal,
    etaMin: Number.isFinite(winner.etaMin) ? winner.etaMin : 0,
    coverageRatio: winner.coverageRatio,
    avgMatchConfidence: winner.avgMatchConfidence,
    score: winner.score,
    reason: winnerReason,
  };

  const alternatives: SelectedStoreResult[] = evaluationsWithScore.slice(1).map((s) => {
    const sCurrency = storeProducts.find((p) => getStoreId(p) === s.storeId)?.currency;
    const subtotalStr = toCurrencyStringFromCents(s.subtotal, sCurrency);
    const etaStr = Number.isFinite(s.etaMin) ? `${s.etaMin} min` : "unknown ETA";
    const coverageStr = `${Math.round(s.coverageRatio * 100)}%`;
    const avgConfStr = `${Math.round(s.avgMatchConfidence * 100)}%`;
    return {
      provider,
      retailerKey: s.retailerKey,
      subtotal: s.subtotal,
      etaMin: Number.isFinite(s.etaMin) ? s.etaMin : 0,
      coverageRatio: s.coverageRatio,
      avgMatchConfidence: s.avgMatchConfidence,
      score: s.score,
      reason: `Coverage ${coverageStr} with avg match confidence ${avgConfStr}, total ${subtotalStr}, ETA ${etaStr}.`,
    };
  });

  return { winner: winnerResult, alternatives };
}

