# MapleCard

MapleCard is an Express + TypeScript shopping optimization backend.

## Current API Baseline

- Main endpoint: `POST /api/optimize`
- Health check: `GET /healthz`
- Request body: `{ rawInput: string }`
- Response body includes `items`, `winner`, `alternatives`, and `clarifications`

## Runtime Flow

1. The API accepts raw shopping-list text through `POST /api/optimize`.
2. `parseShoppingList` asynchronously parses each line into structured `ParsedLine` objects.
3. Parsing uses deterministic parser rules first, plus an optional OpenAI path for ambiguous meal-intent lines.
4. `matchParsedLineToCanonical` performs token-based and Jaccard-style matching against canonical items.
5. `optimizeService` uses `selectBestStoreWithAlternatives` to produce a winning store and alternative store options.
6. `syntheticCatalogService` is the current mock canonical-item and store-product data source.
7. Clarification questions are generated for low-confidence or user-choice-required cases.

## Scripts

- `npm run dev`
- `npm run build`
- `npm start`

## Notes On Current Implementation

- `parseShoppingList` is async.
- The parser has hardcoded rule coverage for a small synthetic item set.
- The OpenAI branch is only used for ambiguous `meal_intent` lines.
- Store scoring returns both a `winner` and `alternatives`.
- The service is currently backed by synthetic in-memory catalog and store data.

## Production Risks

- OpenAI dependency: ambiguous meal-intent parsing can call the OpenAI Chat Completions API when `OPENAI_API_KEY` is set.
- Synthetic catalog/store data: optimization currently runs on mock in-memory data from `syntheticCatalogService`.
- Hardcoded parser schema: known items, attribute schemas, aliases, and category suggestions are embedded in code.
- Hardcoded scoring weights: store ranking weights are fixed in code and not configurable.
- Weak input validation: the optimize endpoint only checks that `rawInput` is a string.
- Missing observability: there is no structured logging, metrics, tracing, or OpenAI call instrumentation.
- Possible attribute schema mismatch: parsed attributes and store product attributes are compared by exact keys/values.
- Missing ETA fallback behavior: stores with missing ETA values can degrade to `Infinity` during scoring and are later surfaced as `etaMin: 0` in results.