# MapleCard Staging Known Limitations

Current staging is suitable for demos and limited external testing, but it is not a production shopping system yet.

## Current Limitations

- Inventory and pricing are synthetic rather than live retailer data.
- `MAPLECARD_CATALOG_SOURCE=seed_bridge` is still experimental and is not the code default.
- Checkout is not implemented.
- Retailer APIs are not connected.
- A real database is not present.
- User/session persistence is not implemented.
- OpenAI is disabled in current staging.
- Catalog coverage is partial and still biased toward the current demo-ready item set.
- PWA offline support and a service worker are not implemented.

## Demo Positioning

- Staging is for validating shopping-intelligence flow quality.
- Staging is not a live grocery marketplace.
- Staging should not be presented as real-time inventory or checkout.