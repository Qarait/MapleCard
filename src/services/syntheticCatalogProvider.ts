import type { CanonicalCatalogProvider, StoreInventoryProvider } from "./catalogProvider";
import { getSyntheticCanonicalItems, getSyntheticStoreProducts } from "./syntheticCatalogService";

export const syntheticCanonicalCatalogProvider: CanonicalCatalogProvider = {
  async getCanonicalItems() {
    return getSyntheticCanonicalItems();
  },
};

export const syntheticStoreInventoryProvider: StoreInventoryProvider = {
  async getStoreProducts() {
    return getSyntheticStoreProducts();
  },
};