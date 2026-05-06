# MapleCard Staging Deployment

This guide prepares MapleCard for MVP staging deployment without changing backend runtime behavior or adding deployment automation from code.

Live staging endpoints:

- Railway backend: `https://maplecard-production.up.railway.app`
- Vercel frontend: `https://maple-card.vercel.app`

Config files now reduce dashboard copy-paste errors:

- `railway.json` codifies the backend build command, start command, health check path, and restart policy.
- `web/vercel.json` codifies the frontend framework, install command, build command, and output directory.
- Dashboard environment variables are still required on Railway and Vercel.

## Railway Backend Setup

- Root directory: `/`
- Build command: `npm ci && npm run build:backend`
- Start command: `npm start`
- Health check path: `/healthz`
- Leave `PORT` unset unless Railway explicitly requires otherwise.
- `railway.json` now records these backend build and deploy settings in the repository.

Recommended backend environment variables:

```env
NODE_ENV=production
MAPLECARD_PARSER_MODE=deterministic_only
MAPLECARD_CATALOG_SOURCE=seed_bridge
MAPLECARD_CORS_ORIGINS=https://maple-card.vercel.app
OPENAI_MODEL=gpt-4o-mini
OPENAI_TIMEOUT_MS=5000
OPENAI_MAX_BATCH_ITEMS=20
```

Optional backend environment variable:

```env
# Only set this if you intentionally switch MAPLECARD_PARSER_MODE to llm_assisted.
OPENAI_API_KEY=your-server-side-secret
```

Notes:

- `seed_bridge` is the recommended staging runtime source so the frontend can exercise richer clarification flows, but it is not the code default.
- Keep `OPENAI_API_KEY` on the backend only.
- `OPENAI_API_KEY` is not needed for deterministic staging.
- Do not expose server secrets through frontend Vite variables.

## Vercel Frontend Setup

- Root directory: `web`
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`
- `web/vercel.json` now records these frontend build settings in the repository.

Recommended frontend environment variables:

```env
VITE_MAPLECARD_API_MODE=backend
VITE_MAPLECARD_API_BASE_URL=https://maplecard-production.up.railway.app
```

Warnings:

- Do not include `/api` in `VITE_MAPLECARD_API_BASE_URL`.
- `VITE_MAPLECARD_API_BASE_URL` must be the backend origin only.
- Frontend Vite environment variables are public browser-exposed values.
- Do not place `OPENAI_API_KEY` or other secrets in frontend environment variables.

## CORS Notes

- If `MAPLECARD_CORS_ORIGINS` is unset, the backend keeps permissive `cors()` behavior for local and development compatibility.
- If `MAPLECARD_CORS_ORIGINS` is set, the backend only reflects configured comma-separated origins and safely omits CORS headers for unknown origins.
- Recommended Railway staging value:

```env
MAPLECARD_CORS_ORIGINS=https://maple-card.vercel.app
```

## Smoke Test

1. Open the Railway backend health check at `/healthz` and verify it responds successfully.
2. Open the Vercel frontend and confirm it loads in backend mode.
3. Submit `yogurt` and verify the result renders.
4. Answer the yogurt type clarification and verify `answerResults` appear.
5. Submit duplicate yogurt lines.
6. Verify duplicate lines remain visually separate.
7. Verify line targeting still works through `lineId` handling when answering only one duplicate line.