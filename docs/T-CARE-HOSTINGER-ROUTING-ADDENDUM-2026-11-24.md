# T-CARE — Hostinger Routing Addendum

**Applies to:** the Phase 6 release candidate dated 23 November 2026.

## Client-side route fallback

The Vite build copies `public/.htaccess` into `dist/.htaccess`. When the contents of `dist/` are published at the Hostinger document root, Apache serves existing assets normally and rewrites unknown frontend paths to `index.html`. This is required for direct navigation and refresh on routes such as `/garden`, `/crew/jobs`, and `/hq`.

The `/api/*` path is deliberately excluded from the SPA fallback. A broken API base configuration should return a backend/proxy error, not the React HTML document.

## API origin is a build-time setting

This release candidate has two supported hosting patterns:

- **Netlify:** leave `VITE_API_BASE_URL` unset in the production build. `public/_redirects` proxies `/api/*` to the configured Render service.
- **Hostinger:** set `VITE_API_BASE_URL` to the exact public HTTPS API origin before running the production build. Vite embeds this value in the generated JavaScript; adding it only after uploading `dist/` does not change the built application.

PowerShell example, after confirming the actual Render or custom API hostname:

```powershell
$env:VITE_API_BASE_URL = "https://api.example.com"
npm ci
npm test
npm run build
```

`https://api.example.com` is an example only. Replace it with the hostname actually assigned to the backend. The current Netlify rewrite references `https://t-care-api.onrender.com`; confirm that the live Render service uses that exact hostname before using it as the Hostinger build value.

Set Render `FRONTEND_ORIGIN` to the exact browser-visible frontend origin (scheme and host only, without a path or trailing slash). Keep the Supabase server key, JWT secrets, and Razorpay secrets exclusively in Render's private environment.

## Hostinger verification after publishing

1. Open `/`, `/garden`, `/crew/jobs`, and `/hq` directly in a new tab.
2. Refresh each path. The frontend shell should load, not a Hostinger 404.
3. Confirm `https://<api-origin>/api/v1/health` returns the backend health JSON.
4. Confirm frontend API calls use the configured API origin and do not receive the frontend's `index.html` in place of JSON.
5. Test login, refresh, logout, and a protected workspace in the target browser. Production auth cookies are `Secure`, `HttpOnly`, and `SameSite=None`; cross-origin browser cookie policies can affect a Hostinger-to-Render setup. A custom API subdomain on the same site as the frontend is preferable where available.

This addendum does not proxy API traffic from Hostinger. The API origin setting is required for that purpose.
