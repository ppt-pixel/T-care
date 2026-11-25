# T-CARE Homepage Runtime Fix — Deployment Package

Date: 25 November 2026

## Confirmed defect

The browser console screenshot showed `ReferenceError: authReady is not defined` in the JavaScript bundle loaded by `https://t-care.in`. The original source correction was present in `src/main.jsx`, but the previously supplied ZIP did not include a corrected production `dist` directory. The live site therefore continued to serve an older compiled asset.

## Correction included in this package

- `src/main.jsx`: `Home()` reads `authReady` from `useApp()` and passes it to the landing-page `Market` component.
- `dist/assets/`: the matching compiled Home function now destructures `authReady` from the app context and passes that local value into `Market`.
- `dist/index.html`: now references a newly fingerprinted JS filename, rather than the stale bundle filename. This forces a fresh asset request after the deployment.
- Existing CSS, public brand assets, SPA rewrite rules and Hostinger `.htaccess` cache policy are retained.

## Validation

- Frontend automated tests: 78/78 passed (`npm test`).
- Corrected production JavaScript: `node --check` passed.
- Compiled-bundle contract: corrected Home binding and `Market` prop verified; old broken compiled expression absent.
- Package integrity: ZIP test passed.
- Live hosting/deployment: not performed from this workspace. The package must be uploaded to Hostinger `public_html` before the live URL changes.

## Hostinger deployment

1. Extract this ZIP. Open `T-CARE/dist/`.
2. Upload the **contents** of `dist/` to Hostinger `public_html`, replacing the old `index.html` and existing `/assets/` files. Upload hidden files too, especially `.htaccess`.
3. Preserve unrelated verified files such as `.well-known` entries. Do not upload `src/` as the production site; Hostinger must serve the contents of `dist/`.
4. Purge Hostinger/LiteSpeed Cache Manager and any enabled CDN cache once after upload.
5. Open `https://t-care.in/` in a new tab and inspect DevTools Network: the new `index-*.js` asset referenced by `index.html` must load with HTTP 200. The old `index-M0m2ZxJm.js` / `index-Bgqgn06W.js` must no longer be referenced by the new HTML.
6. Check the Console. The `authReady is not defined` error must be absent. Also test the homepage's Plant Store section and cart entry point.

An already-open tab can keep executing its old JavaScript until it is reloaded. Do not force-reload while a booking or payment is in progress.
