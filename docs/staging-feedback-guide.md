# MapleCard Staging Feedback Guide

Use this guide when testing the public staging app and sending demo feedback back to the team.

- Frontend: `https://maple-card.vercel.app`
- Backend: `https://maplecard-production.up.railway.app`

## How Testers Should Use The Staging App

1. Open the staging frontend.
2. Confirm the staging banner explains that inventory and pricing are synthetic.
3. Try one of the recommended flows below.
4. If something looks wrong, confusing, or broken, use `Copy feedback report`.
5. Paste the copied report into your message to the team.
6. Add a short human note describing what you expected and what happened.

## Recommended Flows To Test

### Yogurt

1. Submit `yogurt`.
2. Confirm clarification questions appear.
3. Pick an answer such as `greek`.
4. Confirm answer feedback appears.

### Coffee

1. Submit `coffee`.
2. Confirm coffee-specific clarification questions appear, such as format and roast.

### Duplicate Yogurt Lines

1. Submit:

```text
yogurt
yogurt
```

2. Confirm the UI keeps the duplicate lines separate.
3. Confirm duplicate requests remain distinguishable by line targeting.

### Invalid Or Empty Input

1. Try submitting with an empty input.
2. In backend mode, try malformed clarification-answer flows if you are reproducing an API issue.
3. If the app shows a safe error banner, copy the feedback report and include that message.

## How To Copy A Feedback Report

1. Use the `Copy feedback report` button in the app.
2. By default, the report excludes your shopping-list text.
3. If you want the team to see the exact shopping list, check `Include my shopping-list text in this report` first.
4. If clipboard access is unavailable, the app will show the full report in a textarea so you can copy it manually.

## Why Raw Shopping-List Text Is Excluded By Default

- Shopping-list text may contain personal preferences or household details.
- Most debugging can start from request correlation IDs, answer-result statuses, counts, and visible UI state.
- Raw input should only be included when it materially helps reproduce the issue.

## What To Paste Back To The Team

- The copied feedback report
- A short summary of what you tried
- What you expected to happen
- What actually happened
- Whether the issue is repeatable
- Screenshots, if helpful

## How RequestId And ErrorId Help Debugging

- `requestId` helps trace a request across frontend-visible failures and backend logs.
- `errorId` helps isolate a specific error path when a request fails.
- These IDs connect the staging observability work from Sprint 26 to demo feedback without exposing stack traces or backend internals.

## Known Limitations

- Inventory and pricing are synthetic.
- Checkout is not available.
- User or session persistence is not implemented.
- OpenAI is disabled in current staging.
- Real retailer data is not connected.