# MapleCard Local Full-Stack Smoke Test

This smoke path proves that the mobile-first web client can call the local MapleCard backend while fixture mode remains the default for frontend development and CI.

## Prerequisites

- Install backend dependencies with `npm ci`
- Install frontend dependencies with `npm --prefix web ci`

## Start The Backend

Run:

```bash
npm run dev:backend
```

For the yogurt clarification-answer flow in this document, start the backend shell with `MAPLECARD_CATALOG_SOURCE=seed_bridge` first. This keeps `synthetic` as the default runtime source while using the existing experimental bridge path for richer yogurt attribute clarifications.

Expected result:

- MapleCard listens on `http://localhost:3000`

## Start The Web Client In Backend Mode

Option 1:

```bash
npm run dev:web:backend
```

Option 2:

```bash
npm run dev:fullstack
```

If you prefer env-based startup instead of the built-in backend-mode script, copy the checked-in `web/.env.example` file to `web/.env.local` and switch it to backend mode:

```env
VITE_MAPLECARD_API_BASE_URL=http://localhost:3000
# VITE_MAPLECARD_API_MODE=backend
VITE_MAPLECARD_API_MODE=backend
```

Expected result:

- Vite serves the web app on `http://127.0.0.1:5173`

## Smoke Steps

### 1. Submit yogurt

- Open `http://127.0.0.1:5173`
- Replace the default shopping list with `yogurt`
- Tap `Optimize shopping list`

Verify:

- The winner store card appears
- Yogurt clarification questions appear
- Each clarification shows a stable `id` and `lineId`

### 2. Answer yogurt type

- Tap `greek` on the yogurt type clarification

Verify:

- `answerResults` shows an `applied` status
- The answer feedback message says the answer was applied
- Remaining clarifications still show yogurt flavor, fat, and size

### 3. Submit duplicate yogurt lines

- Replace the list with:

```text
yogurt
yogurt
```

- Tap `Optimize shopping list`

Verify:

- Duplicate yogurt clarification groups appear separately
- The two groups have different `lineId` values
- The type clarification ids differ across line 0 and line 1

### 4. Verify lineId targeting

- Tap `greek` on only one duplicate yogurt line

Verify:

- The answered line shows the applied result
- The unanswered duplicate line still shows its remaining clarification questions
- The submitted payload preview includes both `questionId` and `lineId`

## Notes

- Fixture mode remains the default for frontend tests and normal UI development.
- CI still uses fixture or mocked frontend tests only; it does not require a live backend.
- This smoke path does not add production deployment, a database, retailer APIs, or checkout integrations.