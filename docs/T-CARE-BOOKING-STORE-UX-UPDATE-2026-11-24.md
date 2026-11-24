# T-CARE Booking and Plant Store UX Update — 24 November 2026

## Customer booking

- Reduced the booking flow to three steps: Plan & service, Visit details, and Review.
- Removed individual plant selection from the Customer booking flow.
- All plants registered to the Customer account are included automatically in the booking payload. The backend's existing `plantIds` contract is preserved.
- The selected plan's configured plant allowance is checked against the Customer's complete registered plant count. A plan that does not cover the full account plant count cannot be submitted.
- Existing subscription visit-credit, minimum-interval, idempotency, one-time service and payment behavior is preserved.
- Replaced manual `datetime-local` entry with horizontally scrollable date and time selectors. Cards use horizontal scroll-snap and a 3D cylinder-style perspective effect, with arrows, touch scrolling and selected-card centering.
- Date and time choices use the visitor's local timezone, display 30-minute request windows, observe a one-hour minimum lead time and fit the selected service duration within the 09:00–17:00 request window.
- The selected date/time is explicitly described as a preference, not a confirmed appointment. T-CARE must still confirm service-area and Gardener availability.

## Plant Store access

- Public visitors can view the catalogue, categories and product details.
- Adding products to the cart, opening the cart and proceeding to checkout require a signed-in `CUSTOMER` account.
- Guest cart actions route to Customer login or registration and retain the requested return route.
- Direct access to `/store/checkout` shows a sign-in/create-account gate without exposing cart contents, order summary, delivery fields or payment controls.
- After Customer authentication, checkout waits for the matching account-owned cart to finish restoring before rendering any order or delivery details.
- The cart is now scoped to the authenticated Customer ID in `tcare-cart-v2`. Legacy unowned `tcare-cart` contents are discarded; one Customer's cart cannot be loaded for another Customer. Cart mutation/open methods also reject non-Customer or not-yet-restored sessions.
- The existing `STORE_CHECKOUT_ENABLED` / payment feature flags were not changed. This UX update does not enable Store ordering or payments.

## Validation

- Frontend Node test suite: 76/76 passed.
- JSX/TSX syntax parsing: all 8 JSX/TSX source files parsed without syntax diagnostics.
- A Vite production build was not completed in the packaging environment: dependency installation timed out. The environment's Node.js was v22.16.0, below the repository engine requirement (`>=22.22.0 <23`).

## Production build on the deployment workstation

Use Node.js 22.22.x, then from the project root:

```cmd
npm ci
set "VITE_API_BASE_URL=https://api.t-care.in"
npm run build
```

Upload the contents of `dist` to Hostinger `public_html` after taking a backup. Keep the current production Render, Supabase and Razorpay environment configuration unchanged for this frontend UX update.
