# T-CARE Desktop Performance Optimization — 25 November 2026

## 1. Hostinger desktop baseline

| Metric | Reported result |
|---|---:|
| Performance score | 93/100 |
| First Contentful Paint | 0.5 s |
| Speed Index | 2.6 s |
| Largest Contentful Paint | 0.9 s |
| Total Blocking Time | 20 ms |
| Cumulative Layout Shift | 0 |

The existing FCP, LCP, TBT and CLS results are already strong. Speed Index is the main measured metric to investigate. These are desktop-only results; no mobile conclusion is made in this report.

The supplied diagnostic screenshots show category names and generic guidance, but do not identify concrete affected URLs, image byte savings, render-blocking request names, or time savings. Do not infer that every listed category is a confirmed defect or replace production images based only on these headings.

## 2. Source-level changes

### Route-level code splitting

- Removed static imports of the full customer/gardener/admin workspace module, standalone public-page module, and store checkout module from `src/main.jsx`.
- Added named lazy imports for those route modules.
- Added a React `Suspense` fallback for route transitions and direct navigation while a route chunk loads.
- Vite can now emit those modules and their imported CSS as on-demand chunks. Visitors to `/` no longer need to download those page modules before using the public homepage.

### Homepage catalogue payload

- Changed the homepage Market request from `/products?limit=100` to `/products?limit=8`.
- The homepage renders at most eight products, so the request now matches the rendered item count.
- The dedicated Store page retains its own catalogue request and is not capped by this homepage change.

### Product image loading

- Kept homepage product images lazy-loaded.
- Added asynchronous image decoding.
- Ensured `.pimg img` styling is available in the always-loaded landing stylesheet. This avoids relying on `pages.css`, which is now loaded only with the standalone page module.

## 3. Deliberately unchanged

- Existing visual design, animation behavior, public copy, authentication, booking, subscription and payment workflows.
- Existing Google Fonts setup already has preconnect hints and `display=swap`; no font-family or typography change was made without request-level evidence.
- Existing Hostinger `.htaccess` cache policy. It already gives the SPA shell revalidation behavior and allows long-lived caching for fingerprinted assets.
- Product image source URLs. The supplied report does not identify which image URLs are large or whether the image host supports responsive transformations.

## 4. Automated verification

- Frontend tests: **85 passed, 0 failed** (`npm test`).
- Added regression checks for lazy module imports, exported component names, the Suspense fallback, the eight-product homepage limit, lazy image loading, asynchronous decoding and shared image styling.

## 5. Build and deployment status

A fresh production build was not generated in this execution environment. The project requires Node `>=22.22.0 <23`; the available runtime is Node `22.16.0`. The sandbox could not complete dependency installation because the npm registry was unreachable, and the installed Vite/Rolldown package lacked its Linux native binding. No claim is made that a new production build or live deployment has passed.

This archive is a **source-code update**, not a Hostinger `public_html` upload package. Do not upload it directly as the production site and do not reuse an older `dist` directory with this source.

On a machine with Node 22.22.x and working npm access, run from the project root:

```bash
npm ci
npm test
npm run build
npm run preview
```

Then verify:

1. `/` loads without console errors and displays the full homepage, including the Plant Store cards.
2. The initial `/` network load does not request the lazy public-page, Store checkout, or workspace chunks.
3. Visiting `/services`, `/store`, `/store/checkout`, `/garden`, `/crew`, and `/hq` loads each required route chunk and CSS without blank screens or missing styles.
4. Authentication, booking, cart, checkout, payment return and dashboard flows still work.
5. Upload only the newly generated `dist` contents to Hostinger `public_html`, preserving the existing `.htaccess` and unrelated site files.
6. Re-run Hostinger's desktop test with the same device/settings and compare all metrics. Then run the mobile test separately.

The new Hostinger report is the authority for whether the score changed. No target score is promised before that measurement.
