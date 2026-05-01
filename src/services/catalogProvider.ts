import type { CanonicalItem } from "../matchParsedLineToCanonical";
import type { StoreProduct } from "../selectBestStore";

export interface CanonicalCatalogProvider {
  getCanonicalItems(): Promise<CanonicalItem[]>;
}

export interface StoreInventoryProvider {
  getStoreProducts(): Promise<StoreProduct[]>;
}

export type CatalogProviders = {
  canonicalCatalogProvider: CanonicalCatalogProvider;
  storeInventoryProvider: StoreInventoryProvider;
};