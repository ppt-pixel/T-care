# T-CARE Homepage Rendering Fix — 25 November 2026

## Defect

The public `Home` component passed `authReady` into the landing-page `Market` component, but did not read `authReady` from the application context. Rendering the homepage therefore referenced an undeclared JavaScript identifier and could cause the React application error boundary to replace the page with its fallback screen.

## Change

Updated `Home` in `src/main.jsx` to destructure `authReady` from `useApp()` alongside the other application context values. The `Market` component now receives the value supplied by `Provider`.

Added `tests/home-rendering-contract.test.js` to guard the exact failure mode: the Home component must read `authReady` from `useApp()` before passing it to `Market`.

## Validation

- Frontend automated tests: **78/78 passed** (`npm test`).
- Production build: **not completed in this environment**. The required Node version in `.node-version` is 22.22.0; the available runtime is 22.16.0. The attempted dependency installation timed out. A pre-existing dependency folder from the duplicate archive copy was also unsuitable for Linux because its Rolldown native binding was for Windows. No build success is claimed.
- Live hosting, browser end-to-end, backend/database and payment tests were not performed. This source fix does not itself deploy the site.

## Packaging

The corrected archive contains the canonical `T-CARE/` project folder only. The duplicate nested `Final/tcare/` copy from the upload was excluded because it contained a separate `.env` file and `node_modules`; neither is required in the source release package.
