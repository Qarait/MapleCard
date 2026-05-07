# MapleCard Real Inventory / Pricing Plan

This document tracks MapleCard's first live inventory and pricing provider spike.

## Current Pilot

- Kroger is the first live inventory and pricing pilot.
- Kroger is backend-only and provider-limited.
- Kroger is US-only for this pilot path.
- The Kroger provider is disabled by default.
- Synthetic catalog and synthetic inventory remain the default runtime behavior.

## Security Boundaries

- Kroger credentials are backend-only.
- Kroger client secrets must never be exposed to the frontend.
- Kroger credentials must not be placed in Vercel frontend environment variables.
- Real credential values must not be committed.

## Current Scope

- This sprint is a provider spike, not a production rollout.
- The spike currently covers config, OAuth client access, location search, product search, mapping to backend-only candidate shape, and a service-only probe path.
- `/api/optimize` is unchanged.
- MapleCard does not use Kroger as the default provider.
- MapleCard does not yet convert Kroger data into the full runtime `StoreProduct` shape by default.

## Staging Direction

- Staging can later enable a controlled real-data experiment mode.
- Any future real-data staging mode should remain explicitly opt-in and reversible.
- Synthetic remains the default baseline even if a controlled real-data experiment is added.

## Out Of Scope For This Sprint

- No production rollout yet.
- No Instacart integration yet.
- Instacart remains a future shoppable handoff path, not part of this sprint.
- No Open Food Facts ingestion.
- Open Food Facts remains future enrichment only, not a live price source.
- No database persistence.
- No user accounts.
- No frontend secret handling for Kroger.

## Near-Term Follow-Up

- Add an optional adapter from Kroger probe candidates into a runtime inventory-provider experiment without changing the default path.
- Decide whether a disabled-by-default internal probe endpoint is worth adding after the service contract settles.
- Define safe staging-only activation rules before any live-data experiment is exposed beyond backend development.