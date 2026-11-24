# T-CARE Booking and Store Checkout UX Update

Date: 24 November 2026

## Customer booking

The single long booking form is now a four-step guided flow:

1. **Plan and service** — select pay-per-service or an eligible plan using large selectable cards, then choose a service.
2. **Plants** — select the plants that need care using larger, easier-to-tap cards; plan plant limits remain enforced.
3. **Visit details** — choose a local date/time, select a saved service address or add one, and enter optional visit instructions.
4. **Review** — review the selected plan, service, plants, time, address, notes and amount before submitting.

The flow includes step-by-step validation, back navigation, progress indication, accessible focus states, mobile layouts and a persistent action area. Booking request fields, subscription-credit checks, idempotency behavior and server-side payment handling are retained.

## Plant Store checkout readability

Light checkout cards now use a consistent dark text palette, including the sign-in prompt and cart summary, so text remains readable while the application is in dark theme. Store-availability messaging now explains clearly that browsing/cart use remains available but online store orders and payment are not active when the backend feature flag is off.

No Store checkout feature flag or payment configuration was changed by this UX update.

## Build and deployment

Use the project's required Node.js 22.22.x runtime. From the project root on Windows CMD:

```cmd
npm ci
set "VITE_API_BASE_URL=https://api.t-care.in"
npm run build
```

Publish the generated `dist` contents to Hostinger `public_html`, preserving the existing `.well-known` directory and uploading the generated `.htaccess` file.

This source archive intentionally excludes `dist`, `node_modules`, `.git`, and private `.env` files. The existing `.env.example` files are included. Keep private environment files and credentials from the current working project outside this archive.
