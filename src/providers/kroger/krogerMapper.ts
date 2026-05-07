import type { KrogerProductSearchResult } from "./krogerClient";

export type RealStoreProductCandidate = {
  provider: "kroger";
  locationId: string;
  productId: string;
  upc?: string;
  description: string;
  brand?: string;
  priceCents?: number;
  currency: "USD";
  available: boolean | "unknown";
  fulfillment?: string[];
  rawProvider: "kroger";
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeFulfillmentValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function getCandidateUpc(product: KrogerProductSearchResult): string | undefined {
  const topLevelUpc = asString(product.raw.upc);
  if (topLevelUpc) {
    return topLevelUpc;
  }

  for (const item of product.items) {
    const itemUpc = asString(item.upc) ?? asString(item.gtin14) ?? asString(item.itemId);
    if (itemUpc) {
      return itemUpc;
    }
  }

  return undefined;
}

function getCandidatePriceCents(product: KrogerProductSearchResult): number | undefined {
  const prices: number[] = [];

  for (const item of product.items) {
    const itemPrice = asRecord(item.price);

    if (!itemPrice) {
      continue;
    }

    const promoPrice = asNumber(itemPrice.promo);
    const regularPrice = asNumber(itemPrice.regular);
    const chosenPrice = promoPrice ?? regularPrice;

    if (typeof chosenPrice === "number") {
      prices.push(Math.round(chosenPrice * 100));
    }
  }

  if (prices.length === 0) {
    return undefined;
  }

  return Math.min(...prices);
}

function getCandidateFulfillment(product: KrogerProductSearchResult): string[] | undefined {
  const values = new Set<string>();

  for (const item of product.items) {
    const fulfillment = Array.isArray(item.fulfillment) ? item.fulfillment : [];

    for (const fulfillmentEntry of fulfillment) {
      const record = asRecord(fulfillmentEntry);
      if (!record) {
        continue;
      }

      const type = asString(record.type) ?? asString(record.fulfillmentType) ?? asString(record.mode);
      if (type) {
        values.add(normalizeFulfillmentValue(type));
      }
    }
  }

  return values.size > 0 ? Array.from(values) : undefined;
}

function getCandidateAvailability(product: KrogerProductSearchResult): boolean | "unknown" {
  let sawKnownAvailability = false;

  for (const item of product.items) {
    const inventory = asRecord(item.inventory);
    const fulfillment = Array.isArray(item.fulfillment) ? item.fulfillment : [];

    const stockLevel = asString(inventory?.stockLevel)?.toLowerCase();
    if (stockLevel) {
      sawKnownAvailability = true;

      if (!["out_of_stock", "temporarily_out_of_stock", "unavailable"].includes(stockLevel)) {
        return true;
      }
    }

    for (const fulfillmentEntry of fulfillment) {
      const record = asRecord(fulfillmentEntry);
      if (!record) {
        continue;
      }

      const availability = asString(record.availability) ?? asString(record.status);
      if (!availability) {
        continue;
      }

      sawKnownAvailability = true;

      if (!["out_of_stock", "temporarily_out_of_stock", "unavailable", "false"].includes(availability.toLowerCase())) {
        return true;
      }
    }
  }

  return sawKnownAvailability ? false : "unknown";
}

export function mapKrogerProductToCandidate(
  product: KrogerProductSearchResult,
  locationId: string
): RealStoreProductCandidate {
  return {
    provider: "kroger",
    locationId,
    productId: product.productId,
    ...(getCandidateUpc(product) ? { upc: getCandidateUpc(product) } : {}),
    description: product.description?.trim() || product.productId,
    ...(product.brand ? { brand: product.brand } : {}),
    ...(typeof getCandidatePriceCents(product) === "number" ? { priceCents: getCandidatePriceCents(product) } : {}),
    currency: "USD",
    available: getCandidateAvailability(product),
    ...(getCandidateFulfillment(product) ? { fulfillment: getCandidateFulfillment(product) } : {}),
    rawProvider: "kroger",
  };
}

export function mapKrogerProductsToCandidates(
  products: KrogerProductSearchResult[],
  locationId: string,
  maxCandidates?: number
): RealStoreProductCandidate[] {
  const mappedCandidates = products.map((product) => mapKrogerProductToCandidate(product, locationId));

  return typeof maxCandidates === "number" && maxCandidates >= 0
    ? mappedCandidates.slice(0, maxCandidates)
    : mappedCandidates;
}