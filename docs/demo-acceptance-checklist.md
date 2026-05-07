# MapleCard Demo Acceptance Checklist

Use this checklist before public demos or broader staging sharing.

- [ ] Frontend loads successfully.
- [ ] Staging banner is visible.
- [ ] Yogurt flow works.
- [ ] Coffee flow works.
- [ ] Duplicate yogurt `lineId` flow works.
- [ ] Empty input safe error behavior works.
- [ ] Feedback report copies successfully.
- [ ] Raw input is excluded by default.
- [ ] Rate limiting is not triggered during normal demo usage.
- [ ] `/healthz` returns healthy.
- [ ] No secrets are exposed in frontend-visible responses or copied feedback reports.