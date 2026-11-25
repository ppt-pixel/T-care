# T-CARE Hostinger cache policy

## Purpose

A static Vite/React deployment must not require a browser hard refresh after a new build is published. The browser must retrieve the current SPA shell, while content-hashed build assets may remain cached safely.

## Apache policy in `public/.htaccess`

- Default responses use `Cache-Control: no-cache, max-age=0, must-revalidate`, plus `Pragma: no-cache` and `Expires: 0`. Unversioned resources must be revalidated before reuse.
- The LiteSpeed-specific rewrite rule sets `E=Cache-Control:no-cache` for every URL other than a fingerprinted file beneath `/assets/`. This tells Hostinger's LiteSpeed Cache Manager not to serve a stale cached SPA shell or unversioned file.
- HTML responses use `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`. React Router history fallbacks are rewritten to `index.html`, so route navigations receive the fresh SPA shell too.
- Files with a Vite-style content-hash suffix beneath `/assets/` receive `Cache-Control: public, max-age=31536000, immutable`. A changed source asset produces a new filename, and the new uncached HTML points to it. The LiteSpeed bypass rule allows these fingerprinted assets to remain cacheable.
- Existing security headers and SPA history routing are retained. `/api/*` is not rewritten to the frontend.

There is no service worker in this frontend source. This policy therefore addresses the browser and standard Apache/LiteSpeed response caching path without needing a service-worker update cycle.

## Deployment requirements

1. Run a fresh production build from the current source. Do not reuse an old `dist` directory.
2. Upload the complete contents of the new `dist` directory into Hostinger `public_html`, including the new `index.html` and hidden `.htaccess` file.
3. Ensure the new `.htaccess` replaces the old one. Preserve unrelated files such as `.well-known` and any verified domain-validation files.
4. Purge the existing Hostinger Cache Manager and CDN cache once when deploying this policy, to remove entries cached under the previous rules. The no-cache LiteSpeed rewrite and the origin response headers then keep the SPA shell out of subsequent server/CDN caches. Hostinger's CDN is a separate cache layer from the LiteSpeed Cache Manager.
5. Verify the response headers on the homepage and a hashed asset. The homepage should return `no-store`/`no-cache` and should not be a CDN `HIT`; a hashed asset should return `public, max-age=31536000, immutable`.

## Expected behavior

- On the next normal page navigation or reload after deployment, the browser obtains the latest HTML and then downloads any newly fingerprinted JS/CSS assets.
- A hard refresh should not be needed to pick up a deployment.
- A tab that is already open and running the previous JavaScript bundle will not silently replace its executing code. It receives the new app on its next normal reload/navigation. Do not automatically reload during an active booking or payment flow.

## Regression coverage

`tests/hosting-routing-contract.test.js` verifies the SPA fallback, the HTML no-store rule, the default revalidation policy and the immutable policy's requirement for a content-hash suffix.
