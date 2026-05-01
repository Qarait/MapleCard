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
- Parser diagnostics are kept internal and are not included in the optimize success response.

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
- Input validation is still limited to request-shape and size constraints; it does not validate semantic item quality beyond those bounds.
- Missing observability: there is no structured logging, metrics, tracing, or OpenAI call instrumentation.
- Possible attribute schema mismatch: parsed attributes and store product attributes are compared by exact keys/values.
- Missing ETA fallback behavior: stores with missing ETA values can degrade to `Infinity` during scoring and are later surfaced as `etaMin: 0` in results.