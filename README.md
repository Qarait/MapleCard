# MapleCard

MapleCard is an Express + TypeScript shopping optimization backend.

## Current API Baseline

- Main endpoint: `POST /api/optimize`
- Health check: `GET /healthz`
- Request body: `{ rawInput: string }`
- Response body includes `items`, `winner`, `alternatives`, and `clarifications`
- `winner.etaMin` and alternative `etaMin` values are `number | null`; `null` means ETA is unknown

## Runtime Flow

1. The API accepts raw shopping-list text through `POST /api/optimize`.
2. `parseShoppingList` asynchronously parses each line into structured `ParsedLine` objects.
3. Parsing uses deterministic parser rules first, plus an optional OpenAI path for ambiguous meal-intent lines.
4. `matchParsedLineToCanonical` performs token-based and Jaccard-style matching against canonical items.
5. `optimizeService` uses `selectBestStoreWithAlternatives` to produce a winning store and alternative store options.
6. `optimizeService` resolves catalog and inventory data through provider interfaces, which currently use synthetic in-memory providers.
7. Clarification questions are generated for low-confidence or user-choice-required cases.

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
- The parser has hardcoded rule coverage for a small synthetic item set.
- The OpenAI branch is only used for ambiguous `meal_intent` lines.
- Store scoring returns both a `winner` and `alternatives`.
- Missing store ETA values are returned as `null`, not `0`.
- Stores with missing ETA are penalized during scoring using internal defaulted ETA metadata, but unknown ETA is still surfaced as `null` in the response.
- The service is currently backed by synthetic in-memory catalog and store data through provider adapters.

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
	- milk: volume-based
- The parser is still rule-based today, but it should eventually read item attributes and quantity policy from the catalog schema instead of hardcoded parser rules.
- Synthetic canonical items can now be projected into schema records and validated against the new schema expectations.

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