# MapleCard Demo Acceptance Checklist

Use this checklist before public demos or broader staging sharing.

## Current Verification Snapshot

Last verified on 2026-05-07.

- [x] Frontend loads successfully.
- [ ] Staging banner is visible.
- [x] Yogurt flow works.
- [ ] Coffee flow works.
- [x] Duplicate yogurt `lineId` flow works.
- [ ] Empty input safe error behavior works.
- [x] Feedback report copies successfully.
- [ ] Raw input is excluded by default.
- [ ] Rate limiting is not triggered during normal demo usage.
- [x] `/healthz` returns healthy.
- [ ] No secrets are exposed in frontend-visible responses or copied feedback reports.

## Verification Notes

- Duplicate yogurt verification confirmed distinct `line_0_yogurt_exact-item` and
	`line_1_yogurt_exact-item` targeting in the staging flow.
- This snapshot reflects a manual staging verification pass only. Do not mark the
	remaining items complete without an explicit check.