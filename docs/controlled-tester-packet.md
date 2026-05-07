# MapleCard Controlled Tester Packet

Staging frontend URL: https://maple-card.vercel.app

## What MapleCard Is

MapleCard is a shopping-intelligence demo that turns a plain shopping list into
an initial store recommendation, alternative store options, and follow-up
clarification questions when your intent is ambiguous.

This tester round is meant to evaluate whether the flow feels understandable,
useful, and trustworthy before MapleCard adds real inventory, checkout,
database-backed state, or production-scale systems.

## What Testers Should Try

- enter a simple `yogurt` request and answer the follow-up questions
- enter a simple `coffee` request and answer the follow-up questions
- enter duplicate lines such as `yogurt` and `yogurt` to confirm the questions
  stay separate
- enter a normal grocery list such as milk, eggs, banana, and rice
- enter a comma-separated single line such as `milk, eggs, bread, yogurt,
  cheese` and note whether the helper guidance is clear
- try an empty input or intentionally incomplete input to see the safe error
  handling and guidance
- copy a feedback report after a successful or confusing flow

## What Not To Expect Yet

- inventory, pricing, ETA, and availability are synthetic, not real retailer
  data
- checkout and retailer handoff are not available
- MapleCard does not store user sessions, saved carts, or feedback submissions
- the current demo is for shopping-flow validation, not production use
- some results may reflect known synthetic-data limitations instead of real
  product readiness

## Privacy Note

Raw shopping-list text is excluded from copied feedback by default.

If you choose to include raw input in a copied report, do that intentionally and
only when it helps explain the issue.

## How To Copy A Feedback Report

1. Run a MapleCard flow in the staging app.
2. Use the current staging frontend URL: https://maple-card.vercel.app
2. Scroll to the `Demo feedback` panel.
3. Leave `Include my shopping-list text in this report` unchecked unless raw
   input is necessary for the report.
4. Click `Copy feedback report`.
5. If clipboard access is unavailable, copy the manually shown report text.

The copied report should include `requestId` when the backend provides one.
Structured backend errors may also include `errorId`.

## How To File A GitHub Demo Feedback Issue

1. Go to https://github.com/Qarait/MapleCard/issues/new/choose
2. Choose the `Demo feedback` template.
3. Paste the copied feedback report into the issue.
4. Add a short written summary of what you tried and what felt wrong,
   confusing, or unexpectedly good.
5. Include request or error IDs from the copied report when available.

## What To Include Manually

- what flow you were testing
- what you expected MapleCard to do
- what MapleCard actually did
- whether you could reproduce it
- whether the issue felt like a parser problem, clarification problem, frontend
  UX problem, or known limitation
- whether you intentionally included raw shopping-list text in the report
- whether the report showed `duplicateRawLinesPresent` for duplicate item lines

## Duplicate-Line Feedback Note

- Use `duplicateRawLinesPresent` to confirm whether the input contained duplicate
  normalized non-empty lines such as two `yogurt` entries.
- `duplicateLineIdsPresent` is narrower. It only refers to duplicate generated
  line IDs, which should usually stay false when MapleCard keeps duplicates
  separate correctly.

## Current Known Input Limitation

Comma-separated single-line grocery lists are not fully supported yet. The app
shows a tip for that case, but the most reliable tester flow is still one item
per line.

## Reminder About Synthetic Data

This staging round does not use real retailer inventory or pricing.

Please judge the clarity of the shopping flow, clarification behavior, and
feedback process more than the realism of the store data.