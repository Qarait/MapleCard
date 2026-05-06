# MapleCard Staging Observability

This guide describes the safe request-correlation and debugging behavior for the live staging deployment.

## Staging Endpoints

- Railway backend: `https://maplecard-production.up.railway.app`
- Vercel frontend: `https://maple-card.vercel.app`

## Request ID Behavior

- Every backend response includes `X-Request-Id`.
- MapleCard accepts an incoming `X-Request-Id` when it is present and matches the safe allowlist format.
- If no safe incoming request ID is provided, MapleCard generates a new UUID-style request ID.
- Clients are not required to send `X-Request-Id`.

## Error ID Behavior

- Structured API error responses include safe correlation fields in the JSON body:

```json
{
  "error": {
    "code": "...",
    "message": "...",
    "details": {},
    "requestId": "...",
    "errorId": "..."
  }
}
```

- `requestId` matches the `X-Request-Id` response header.
- `errorId` is a safe correlation identifier for backend failures or validation errors.
- MapleCard does not return stack traces, provider exception bodies, API keys, environment values, file paths, or raw internal exceptions in API errors.

## Frontend Error Display

- The web client keeps user-facing messages safe and generic.
- When the backend provides correlation fields, the frontend shows `Request ID` and/or `Error ID` in the error banner.
- The frontend does not display raw backend stack traces or raw provider failure messages.
- Network failures still show a friendly connectivity message for local or staging backend reachability problems.

## Structured Backend Logs

- Backend logs are emitted as structured JSON lines through the lightweight logger wrapper.
- Safe fields include:
  - `timestamp`
  - `level`
  - `message`
  - `requestId`
  - `errorId` when present
  - `method`
  - `path`
  - `statusCode`
  - `durationMs`
- Request completion logs are emitted for every request.
- Validation errors, controlled optimize failures, and unexpected server errors also emit structured correlation logs.

## What Not To Log

- Do not log `OPENAI_API_KEY`.
- Do not log raw request bodies.
- Do not log raw provider error bodies or provider exception messages.
- Do not log frontend environment secrets.
- Do not log stack traces in normal staging logs.

## Health Endpoint Behavior

- `GET /healthz` and `GET /healthz/` return the same health metadata payload.
- The payload stays backward-compatible and includes:
  - `ok: true`
  - `service`
  - `environment`
  - `catalogSource`
  - `parserMode`
- Health responses do not expose secrets.

## Debugging Staging

### Railway

- Open Railway logs for the backend service.
- Filter or search by `requestId` or `errorId` from the frontend error banner or browser network panel.
- Use `https://maplecard-production.up.railway.app/healthz` or `https://maplecard-production.up.railway.app/healthz/` to confirm the service is live.

### Vercel / Browser

- Open browser devtools on `https://maple-card.vercel.app`.
- Inspect failed `POST /api/optimize` requests in the Network panel.
- Copy the `X-Request-Id`, JSON `requestId`, or `errorId` before checking Railway logs.

## Bug Reports

- When reporting a staging bug, include:
  - what shopping list was attempted in general terms
  - approximate time of failure
  - `requestId` if shown
  - `errorId` if shown
  - whether the issue happened in Railway backend mode from Vercel staging

These IDs let MapleCard correlate the frontend failure with the matching Railway log line without exposing private request contents.