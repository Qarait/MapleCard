import type { CanonicalItem } from "../matchParsedLineToCanonical";
import type { StoreProduct } from "../selectBestStore";

export type ProviderValidationResult<T> = {
  invalidCount: number;
  firstInvalidReason?: string;
  validItems: T[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function hasAvailabilityIndicator(product: StoreProduct): boolean {
  if (typeof product.availability_status === "string" && product.availability_status.trim().length > 0) return true;
  if (typeof product.in_stock === "boolean") return true;
  if (typeof product.inStock === "boolean") return true;
  if (isRecord(product.metadata_json) && typeof product.metadata_json.inStock === "boolean") return true;
  return false;
}

export function validateCanonicalItems(items: unknown): ProviderValidationResult<CanonicalItem> {
  if (!Array.isArray(items)) {
    return {
      invalidCount: 1,
      firstInvalidReason: "Provider returned a non-array canonical catalog payload.",
      validItems: [],
    };
  }

  const validItems: CanonicalItem[] = [];
  let invalidCount = 0;
  let firstInvalidReason: string | undefined;

  for (const item of items) {
    if (
      isRecord(item) &&
      typeof item.id === "string" &&
      item.id.trim().length > 0 &&
      typeof item.display_name === "string" &&
      item.display_name.trim().length > 0 &&
      typeof item.category === "string" &&
      item.category.trim().length > 0 &&
      isRecord(item.attribute_schema_json)
    ) {
      validItems.push(item as CanonicalItem);
      continue;
    }

    invalidCount += 1;
    firstInvalidReason ??= "Canonical item payload is missing one or more required fields.";
  }

  return { invalidCount, firstInvalidReason, validItems };
}

export function validateStoreProducts(products: unknown): ProviderValidationResult<StoreProduct> {
  if (!Array.isArray(products)) {
    return {
      invalidCount: 1,
      firstInvalidReason: "Provider returned a non-array store inventory payload.",
      validItems: [],
    };
  }

  const validItems: StoreProduct[] = [];
  let invalidCount = 0;
  let firstInvalidReason: string | undefined;

  for (const product of products) {
    const candidate = product as StoreProduct;
    const hasStoreId = typeof candidate.store_id === "string" || typeof candidate.storeId === "string";
    const hasCanonicalItemId =
      typeof candidate.canonical_item_id === "string" || typeof candidate.canonicalItemId === "string";
    const hasValidPrice = typeof candidate.price_cents === "number" && Number.isFinite(candidate.price_cents);
    const hasCurrency = typeof candidate.currency === "string" && candidate.currency.trim().length > 0;
    const hasAttributes = isRecord(candidate.attributes_json);

    if (hasStoreId && hasCanonicalItemId && hasValidPrice && hasCurrency && hasAvailabilityIndicator(candidate) && hasAttributes) {
      validItems.push(candidate);
      continue;
    }

    invalidCount += 1;
    firstInvalidReason ??= "Store product payload is missing one or more required fields.";
  }

  return { invalidCount, firstInvalidReason, validItems };
}