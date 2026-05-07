# MapleCard Staging Demo Script

Use this script when demoing the public staging app:

- Frontend: `https://maple-card.vercel.app`
- Backend: `https://maplecard-production.up.railway.app`

## Demo Flow

1. Open the frontend and point out the staging banner.
2. Explain that MapleCard staging currently uses synthetic inventory with a seed-backed catalog bridge for demo coverage.
3. Submit `yogurt`.
4. Verify that yogurt clarification questions appear.
5. Answer `type = greek`.
6. Verify that `answerResults` confirms the answer was applied.
7. Submit duplicate yogurt lines:

```text
yogurt
yogurt
```

8. Verify the duplicate-line UI keeps both requests separate.
9. Explain that `lineId` targeting keeps duplicate grocery lines independently addressable.
10. Submit `coffee`.
11. Verify that coffee clarification questions appear, including format and roast.
12. After each flow, use `Copy feedback report` if you notice a bug, confusing state, or unexpected result.
13. If the app shows a request or error correlation ID, include it in the pasted feedback report and your note back to the team.

## Talking Points

- MapleCard is validating the shopping-intelligence flow, not real checkout.
- Clarification questions help turn ambiguous shopping text into a structured request.
- Duplicate lines are intentionally preserved instead of being silently merged.
- Safe request and error IDs are available for staging debugging if something fails.
- The feedback helper is copy-only and does not automatically send anything to MapleCard.

## Known Limitations During Demo

- Inventory and pricing are synthetic.
- Checkout is not available.
- Real retailer prices are not connected.
- User/session persistence is not implemented.
- OpenAI is disabled in current staging.