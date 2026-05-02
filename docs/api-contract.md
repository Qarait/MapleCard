# MapleCard Public API Contract

This document describes the current public contract for the MapleCard backend endpoints used by the future mobile-first web and PWA clients.

The contract reflects current runtime behavior. It does not add session persistence, a database, retailer APIs, or frontend-specific state.

## Endpoints

### GET /healthz

Returns a simple health check payload.

Example response:

```json
{
  "ok": true
}
```

### POST /api/optimize

Accepts a raw shopping list, optionally accepts clarification answers from a prior response, and returns optimized store output plus any remaining clarification questions.

## Request Body

```json
{
  "rawInput": "yogurt\ncoffee",
  "clarificationAnswers": [
    {
      "questionId": "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
      "lineId": "line_0_yogurt_exact-item",
      "rawText": "yogurt",
      "attributeKey": "type",
      "value": "greek"
    }
  ]
}
```

Fields:

- `rawInput`: required string containing the user shopping list, usually newline-separated.
- `clarificationAnswers`: optional array of answer payloads.
- `questionId`: required stable clarification identifier. This is the primary clarification key for answer submission.
- `lineId`: optional stable shopping-line identifier. Recommended for duplicate-line targeting.
- `rawText`: required original line text the answer applies to.
- `attributeKey`: optional attribute key for attribute-based clarifications.
- `value`: required selected answer value.

Validation notes:

- `rawInput` must be a non-empty string.
- `clarificationAnswers`, when provided, must be an array.
- Each clarification answer must include non-empty `questionId`, `rawText`, and `value` strings.
- `attributeKey` and `lineId` must be strings when provided.
- Malformed answer payloads are rejected with structured `400` responses.

## Success Response

Top-level shape:

```json
{
  "items": [],
  "winner": {},
  "alternatives": [],
  "clarifications": [],
  "answerResults": []
}
```

Notes:

- `items`, `winner`, `alternatives`, and `clarifications` are always present on successful optimize responses.
- `answerResults` appears only when `clarificationAnswers` are submitted.
- The optimize endpoint is stateless. MapleCard does not persist user answers, user sessions, or clarification history yet.

### `items`

Each item represents one parsed shopping-list line plus its selected canonical match.

Example item excerpt:

```json
{
  "rawText": "yogurt",
  "lineType": "exact_item",
  "canonicalQuery": "yogurt",
  "attributes": {
    "type": "greek"
  },
  "suggestions": [],
  "needsUserChoice": true,
  "confidence": 0.95,
  "match": {
    "canonicalItemId": "seed-dairy-007",
    "canonicalName": "yogurt",
    "requestedAttributes": {
      "type": "greek"
    }
  }
}
```

### `winner`

The best-ranked store result.

Shape:

```json
{
  "provider": "synthetic",
  "retailerKey": "freshmart",
  "subtotal": 18.25,
  "etaMin": 25,
  "coverageRatio": 1,
  "avgMatchConfidence": 0.96,
  "score": 0.91,
  "reason": "Best overall score"
}
```

`etaMin` is `number | null`.

- A number means MapleCard has a known ETA estimate for the selected store.
- `null` means ETA is unknown and is intentionally surfaced as unknown rather than `0`.

### `alternatives`

Array of additional ranked store results with the same shape as `winner`, including `etaMin: number | null`.

### `clarifications`

Array of remaining clarification questions that the client may present to the user.

Shape:

```json
{
  "id": "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
  "lineId": "line_0_yogurt_exact-item",
  "rawText": "yogurt",
  "question": "Which yogurt type do you want?",
  "options": ["regular", "greek", "drinkable"],
  "attributeKey": "type"
}
```

Notes:

- `id` is the stable public clarification identifier and the primary answer key.
- `lineId` is a stable per-line instance identifier and is recommended when the original shopping list contains duplicate lines.
- Duplicate lines can produce different `lineId` values and different clarification `id` values even when `rawText` is the same.

### `answerResults`

Array describing whether each submitted clarification answer was applied or ignored.

Shape:

```json
{
  "questionId": "cq_line-0-yogurt-exact-item__yogurt__seed-dairy-007__yogurt__type__which-yogurt-type-do-you-want",
  "lineId": "line_0_yogurt_exact-item",
  "rawText": "yogurt",
  "attributeKey": "type",
  "value": "greek",
  "status": "applied",
  "message": "Answer was applied to the optimization request."
}
```

Current public status values include:

- `applied`
- `ignored_unknown_question`
- `ignored_line_mismatch`
- `ignored_raw_text_mismatch`
- `ignored_attribute_mismatch`
- `ignored_invalid_option`
- `ignored_unsupported_attribute`

`answerResults` is intended for frontend feedback so clients can tell the user whether an answer was applied or ignored.

## Error Response

Malformed requests return structured `400` responses.

Example invalid clarification answer response:

```json
{
  "error": {
    "code": "invalid_clarification_answer",
    "message": "Each clarification answer must include a non-empty `questionId`.",
    "details": {
      "index": 0,
      "field": "questionId"
    }
  }
}
```

## Mobile/PWA Fixture Set

The repository includes small fixture modules under `tests/fixtures/optimize/` for the expected client flows:

- raw yogurt request
- yogurt with answer
- duplicate yogurt lines
- coffee with answer
- invalid clarification answer
- normal grocery list with no answers

These fixtures are intended as readable request examples for future mobile-first web and PWA work.