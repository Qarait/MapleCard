export class OptimizeServiceError extends Error {
  constructor(
    public readonly code:
      | "catalog_provider_failed"
      | "inventory_provider_failed"
      | "empty_canonical_catalog"
      | "empty_store_inventory"
      | "invalid_canonical_catalog"
      | "invalid_store_inventory",
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "OptimizeServiceError";
  }
}