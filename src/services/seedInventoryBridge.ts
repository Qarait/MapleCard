import type { StoreProduct } from "../selectBestStore";
import { mapSyntheticIdToSeedId } from "../catalog/catalogIdMapping";
import type { StoreInventoryProvider } from "./catalogProvider";
import { syntheticStoreInventoryProvider } from "./syntheticCatalogProvider";

export function adaptSyntheticStoreProductToSeedInventory(product: StoreProduct): StoreProduct | null {
  const syntheticCanonicalId = (product.canonical_item_id ?? product.canonicalItemId ?? "").toString();
  const seedCanonicalId = mapSyntheticIdToSeedId(syntheticCanonicalId);

  if (!seedCanonicalId) return null;

  return {
    ...product,
    canonical_item_id: seedCanonicalId,
    canonicalItemId: seedCanonicalId,
  };
}

export function getSeedCompatibleSyntheticStoreProducts(storeProducts: StoreProduct[]): StoreProduct[] {
  return storeProducts
    .map((product) => adaptSyntheticStoreProductToSeedInventory(product))
    .filter((product): product is StoreProduct => product != null);
}

export const seedCompatibleSyntheticStoreInventoryProvider: StoreInventoryProvider = {
  async getStoreProducts() {
    const products = await syntheticStoreInventoryProvider.getStoreProducts();
    return getSeedCompatibleSyntheticStoreProducts(products);
  },
};