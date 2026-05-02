# MapleCard

MapleCard is an Express + TypeScript shopping optimization backend.

## Current API Baseline

- Main endpoint: `POST /api/optimize`
- Health check: `GET /healthz`
- Request body: `{ rawInput: string, clarificationAnswers?: Array<{ questionId: string; rawText: string; attributeKey?: string; value: string }> }`
- Response body includes `items`, `winner`, `alternatives`, and `clarifications`
- `clarifications` now include a stable `id` for each question while preserving `rawText`, `question`, and `options`.
- Frontend or PWA clients should treat clarification `id` as the primary key for future answer submission flows.
- Frontend or PWA clients should submit clarification answers using the question `id` plus the selected answer `value`; `attributeKey` is optional metadata.
- Clarification answer submission is currently stateless; MapleCard does not persist user sessions or clarification history yet.
- `winner.etaMin` and alternative `etaMin` values are `number | null`; `null` means ETA is unknown

## Runtime Flow

1. The API accepts raw shopping-list text through `POST /api/optimize`.
2. `parseShoppingList` asynchronously parses each line into structured `ParsedLine` objects.
3. Parsing uses deterministic parser rules first, plus a limited seed-catalog lookup bridge for simple exact-item lines, plus an optional OpenAI path for ambiguous meal-intent lines.
4. `matchParsedLineToCanonical` performs token-based and Jaccard-style matching against canonical items.
5. `optimizeService` uses `selectBestStoreWithAlternatives` to produce a winning store and alternative store options.
6. `optimizeService` resolves catalog and inventory data through provider interfaces, with the runtime source selected through `MAPLECARD_CATALOG_SOURCE`.
7. Clarification questions are generated for low-confidence or user-choice-required cases, and optional clarification answers can be applied before store re-optimization.

## Runtime Catalog Source Configuration

- `MAPLECARD_CATALOG_SOURCE=synthetic | seed_bridge`
- Default runtime catalog source: `synthetic`
- `synthetic` uses the existing synthetic canonical provider plus synthetic store inventory provider.
- `seed_bridge` is experimental and uses the MapleCard-owned seed canonical provider plus the bridged synthetic inventory provider.
- Invalid `MAPLECARD_CATALOG_SOURCE` values fall back to `synthetic` and emit an internal warning through the logger.
- `seed_bridge` only provides runtime inventory coverage for explicitly mapped core items.
- Real store inventory, pricing, and ETA data remain synthetic in both modes.
- `seed_bridge` is a stepping stone toward a real catalog-backed runtime path, not production data.

## Provider Reliability

- Provider failures are handled at the service boundary before they reach API users.
- Canonical catalog provider failures and store inventory provider failures are converted into controlled service errors.
- Empty provider payloads are treated as controlled upstream failures rather than allowing the optimization pipeline to continue with missing catalog state.
- Invalid provider payloads are rejected by lightweight runtime validation before matching or scoring runs.
- Internal provider diagnostics currently track canonical item count, store product count, provider failure reason, and provider validation failure count.
- Provider diagnostics are internal only and currently flow through the logger wrapper.

## Store Scoring Configuration

- Store ranking weights are defined in `src/config/storeScoringConfig.ts`
- Current scoring config version: `2026-05-01.prototype.v1`
- Current weights:
	- coverage: `0.40`
	- matchConfidence: `0.20`
	- price: `0.20`
	- eta: `0.10`
	- substitutionRisk: `0.10`
- `selectBestStore.ts` uses the config module instead of inline scoring constants.

## Scripts

- `npm run dev`
- `npm run build`
- `npm start`

## Parser Configuration

- `MAPLECARD_PARSER_MODE=deterministic_only | llm_assisted`
- Default parser mode: `deterministic_only`
- In `deterministic_only`, MapleCard never calls OpenAI, even if `OPENAI_API_KEY` is present.
- In `llm_assisted`, MapleCard may call OpenAI only for ambiguous `meal_intent` lines, and only when `OPENAI_API_KEY` is present.
- If `MAPLECARD_PARSER_MODE=llm_assisted` but `OPENAI_API_KEY` is missing, MapleCard uses the deterministic fallback parser result and emits internal diagnostics/warnings.

## OpenAI Safety Configuration

- `OPENAI_MODEL` defaults to `gpt-4o-mini`
- `OPENAI_TIMEOUT_MS` defaults to `5000`
- `OPENAI_MAX_BATCH_ITEMS` defaults to `20`
- OpenAI requests are timeout-bounded.
- Ambiguous lines beyond `OPENAI_MAX_BATCH_ITEMS` are not sent to OpenAI and use deterministic fallback behavior instead.
- Parser diagnostics are request-scoped internally and are not included in the optimize success response.
- Parser warnings go through a lightweight logger wrapper instead of calling `console.warn` directly from parser code.

## Notes On Current Implementation

- `parseShoppingList` is async.
- The parser still has hardcoded rule coverage for the original synthetic item set.
- The parser now also uses the MapleCard-owned seed catalog as a bridge for simple exact-item lookups.
- Seed catalog clarification templates now influence parser-bridge suggestions for bridge-recognized items.
- Seed catalog clarification templates now also influence user-facing clarification questions.
- Sprint 14 adds internal clarification question ids and answer-payload readiness for future frontend or PWA answer flows.
- Sprint 15 exposes stable clarification ids publicly so frontend clients can safely persist and submit user choices later.
- Sprint 16 allows `POST /api/optimize` to accept optional clarification answers and rerun optimization without adding a separate answer endpoint.
- This parser bridge is intentionally limited and is not a full schema-driven parser yet.
- Generic product terms should not be silently over-mapped to a more specific variant when user intent is broader.
- The OpenAI branch is only used for ambiguous `meal_intent` lines.
- Store scoring returns both a `winner` and `alternatives`.
- Missing store ETA values are returned as `null`, not `0`.
- Stores with missing ETA are penalized during scoring using internal defaulted ETA metadata, but unknown ETA is still surfaced as `null` in the response.
- The default runtime service path is still backed by synthetic in-memory catalog and store data through provider adapters.
- The optional `seed_bridge` runtime path reuses synthetic store inventory by remapping only mapped core items into seed canonical ids.

## Catalog and Inventory Provider Contracts

- MapleCard currently uses provider interfaces in `src/services/catalogProvider.ts` to separate the optimization pipeline from any concrete catalog source.
- The active implementation is still synthetic and lives behind `src/services/syntheticCatalogProvider.ts`.

Expected canonical item shape:
- `id`: stable canonical item identifier
- `name`: current code uses `display_name` for the human-readable canonical name
- `category`: canonical category used by matcher and downstream ranking
- `attribute schema`: current code uses `attribute_schema_json`
- `default attributes`: current code uses `default_attributes_json` when applicable
- `clarification options`: currently derived from `attribute_schema_json` and alias data when applicable

Expected store product or inventory shape:
- `store id`: current code uses `store_id` or `storeId`
- `retailer key`: current code uses `retailerKey`
- `canonical item id`: current code uses `canonical_item_id` or `canonicalItemId`
- `price cents`: current code uses `price_cents`
- `currency`: current code uses `currency`
- `availability / stock status`: current code uses `availability_status`, `in_stock`, and optional metadata
- `ETA`: current code uses `eta_min`, `etaMin`, or metadata-derived ETA
- `attributes`: current code uses `attributes_json`

- Current provider-backed data is still synthetic; no real database or retailer API integration has been added.

Validation expectations:
- Canonical items must include `id`, `display_name`, `category`, and `attribute_schema_json`.
- Store products must include a store identifier, canonical item identifier, `price_cents`, `currency`, an availability indicator, and `attributes_json`.
- Runtime validation is intentionally lightweight and TypeScript-based for now; MapleCard does not yet use a heavy schema-validation dependency at this boundary.

## Canonical Catalog Schema Roadmap

- MapleCard now has a code-managed canonical catalog schema module in `src/catalog/catalogSchema.ts`.
- The current canonical catalog data is still synthetic and remains in-memory only.
- Future DB-backed catalog storage should implement the same schema concepts rather than introducing a separate shape.
- The schema currently models canonical items, attribute definitions, attribute options, quantity policy, clarification templates, item aliases, and category metadata.
- Quantity policy is now explicit for schema planning purposes:
	- eggs: countable
	- bananas: countable
	- chicken: ambiguous bare-number item with weight or package interpretation
	- rice: ambiguous bare-number item with weight or package interpretation
	- milk: volume-based, but bare-number milk input should still require clarification unless a unit is present
- The parser is still rule-based today, but it should eventually read item attributes and quantity policy from the catalog schema instead of hardcoded parser rules.
- Synthetic canonical items can now be projected into schema records and validated against the new schema expectations.

## Real Catalog Seed

- MapleCard now includes a real code-managed canonical grocery seed in `src/catalog/seedCanonicalCatalog.ts`.
- The seed is MapleCard-owned and uses generic grocery concepts only; it is not copied from Open Food Facts, USDA, CNF, Instacart, Kroger, or retailer product data.
- The current seed includes common grocery concepts across dairy, eggs, produce, meat, seafood, pantry, bakery, frozen, beverages, and household basics.
- The seed is schema-validated through the Sprint 6 catalog schema helpers and is intended to become the stable internal catalog truth before any database is added.
- MapleCard also includes a seed catalog adapter in `src/services/seedCatalogProvider.ts` that can project the seed into the runtime `CanonicalItem` provider shape.
- The seed catalog is being adapted toward runtime use, but the synthetic provider remains the default runtime catalog source until store inventory compatibility is solved.
- The parser now also uses seed-catalog aliases and quantity policy in a limited bridge mode for simple exact-item recognition.
- MapleCard now also includes an explicit inventory bridge for mapped core items only, so seed catalog records can be paired with adapted synthetic inventory in compatibility tests.
- The bridge is limited to mapped legacy synthetic IDs for milk, eggs, bananas, chicken breast, and rice; unmapped seed items still do not have runtime inventory coverage.
- The bridge can now be selected at runtime through `MAPLECARD_CATALOG_SOURCE=seed_bridge`, but it remains experimental and is not the default.
- Open Food Facts, USDA, and CNF remain possible future enrichment sources only; they are not the current source of truth.
- Store price, store inventory, and ETA data are still synthetic today and are not yet backed by real retailer integrations.

## Parser Roadmap

- The current catalog-aware parser support is a bridge only, not a full schema-driven parser rewrite.
- Existing hardcoded deterministic rules for milk, eggs, banana, chicken, and rice still remain in place.
- Catalog aliases should preserve user intent and avoid hidden assumptions when a generic term could refer to multiple variants.
- Future work should move all ambiguity handling and question generation more fully into schema-backed catalog logic.
- This is a step toward schema-driven UX rather than the final parser architecture.
- Future work should move item attributes, aliases, and quantity decisions more fully into the catalog schema over time.
- Frontend or PWA answer submission is still stateless and uses the existing optimize endpoint; there is no user session or database persistence yet.
- Public clarification objects still retain `rawText`, `question`, and `options` for backward compatibility even though `id` should now be treated as the primary answer key.
- Malformed clarification answer payloads are rejected with `400` errors, while structurally valid but inapplicable answers are ignored safely.

## CI

- GitHub Actions CI is configured in `.github/workflows/ci.yml`.
- CI runs on `push` and `pull_request`.
- The workflow runs `npm ci`, `npm run build`, and `npm test`.
- CI verifies the current TypeScript build and test suite only; it does not add any real database or retailer integration.

## Production Risks

- OpenAI dependency: ambiguous meal-intent parsing can call the OpenAI Chat Completions API only when `MAPLECARD_PARSER_MODE=llm_assisted` and `OPENAI_API_KEY` is set.
- Synthetic catalog/store data: optimization currently runs on mock in-memory data from `syntheticCatalogService`.
- Provider-backed catalog access is now more defensive, but real upstream reliability concerns like retries, timeouts, and partial data recovery are still not implemented.
- Hardcoded parser schema: known items, attribute schemas, aliases, and category suggestions are embedded in code.
- Scoring weights are versioned in code, but they are still code-configured rather than externally managed.
- Attribute normalization aliases are conservative and code-managed today; a real production schema should eventually be DB-driven.
- Input validation is still limited to request-shape and size constraints; it does not validate semantic item quality beyond those bounds.
- Observability is still minimal: warnings now flow through a logger abstraction, but there is still no structured logging backend, metrics, or tracing.
- Attribute schema drift is reduced by conservative key alias normalization, but value semantics and broader schema evolution still need stronger governance.
- Missing ETA handling is safer now, but ETA defaulting and penalty metadata remain internal-only and are not yet surfaced for debugging or analytics.

## Attribute Normalization

- MapleCard normalizes a conservative set of attribute keys before canonical matching and store-attribute scoring.
- Alias coverage is intentionally narrow and only includes explicitly safe key mappings such as `bio -> organic`.
- Semantically different concepts are not collapsed; for example, `natural` is not treated as `organic`.
- The current alias configuration is code-managed in `src/config/attributeAliases.ts`.
- A production-grade attribute schema should eventually be DB-driven rather than maintained only in code.