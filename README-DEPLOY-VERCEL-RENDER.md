# T-CARE — Vercel frontend + Render API + existing Supabase

This setup moves the React/Vite frontend to Vercel while retaining the existing Express API on Render and the existing Supabase database/storage. It uses a same-origin `/api/*` reverse-proxy rewrite so the browser talks to the Vercel origin for API calls. This is intended to avoid the browser treating the API cookies as third-party cookies; verify cookie storage and session persistence on the deployed Vercel domain before switching traffic permanently.

## What changed

- Added `vercel.json` with an external rewrite from `/api/*` to the existing Render service at `https://t-care-api.onrender.com/api/*`, followed by the Vite SPA fallback to `/index.html`.
- Updated `src/main.jsx` and `src/phase5Api.js`: if `VITE_API_BASE_URL` is supplied, it remains the override (so the current Netlify project can continue using its existing setting); otherwise production uses same-origin relative `/api/v1` calls and local development defaults to `http://localhost:4000`.
- Retained `netlify.toml` and `public/_redirects` as a fallback for the existing Netlify project. Do not delete the Netlify site until Vercel has passed the production smoke tests.

## Vercel project settings

Import `ppt-pixel/T-care` from GitHub and use branch `main` after this patch has been committed and pushed.

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Root directory | `./` (repository root) |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node.js version | `22.x` (or the project-pinned 22.22.0 if selectable) |

### Environment variables

For Vercel Production and Preview, leave `VITE_API_BASE_URL` **unset**. The updated production code will then call relative `/api/v1/...` paths, which `vercel.json` proxies to Render. Do not set this variable to the Render URL on Vercel, or browser requests will bypass the same-origin proxy.

The existing Netlify project's `VITE_API_BASE_URL` can remain set to its current Render base URL during migration. This keeps the old Netlify deployment usable as a fallback while Vercel is being tested.

## Render configuration after the first Vercel deployment

1. Deploy the Vercel project and copy its canonical production origin, e.g. `https://t-care.vercel.app` (use the actual URL Vercel assigns; do not copy a preview URL).
2. In Render → `t-care-api` → Environment, update `FRONTEND_ORIGIN` to that exact Vercel production origin, with no trailing slash.
3. Save and wait for the Render service to become Live.
4. If you still need the Netlify deployment to submit authenticated POST requests during the transition, the backend currently accepts only one `FRONTEND_ORIGIN`; use Vercel as the active origin and treat Netlify as a visual fallback only. Do not try a comma-separated value unless the backend is explicitly changed to support an origin allow-list.

No Supabase URL, database connection, secret key, JWT secret, Brevo key, or Render service configuration should be copied into Vercel. These secrets remain server-side on Render.

## Verification checklist

1. `https://<your-vercel-domain>/api/v1/health` should return the same health payload as the direct Render health endpoint.
2. In DevTools → Network, browser API calls should use the Vercel origin, e.g. `https://<your-vercel-domain>/api/v1/auth/session`, not `https://t-care-api.onrender.com/...`.
3. Complete a test registration or email verification. Inspect Application → Cookies under the Vercel domain and confirm `tcare_access` and `tcare_refresh` exist. Never share cookie values.
4. Refresh the page and confirm `/api/v1/auth/session` reports the authenticated user, not `UNAUTHENTICATED`.
5. Test login, logout, session refresh, and role-protected screens.
6. Keep the existing Netlify deployment until these checks pass.

## Important Vercel plan restriction

Vercel's Hobby plan is restricted to personal, non-commercial use. If T-CARE is operated as a commercial service or the deployment is used for financial gain, Vercel's terms require a Pro or Enterprise plan. Confirm the intended use and account plan before making this the production host.

## Existing backend and data

- Render continues to run the Express API from `backend/` using the existing `render.yaml` Blueprint.
- Supabase remains the existing PostgreSQL database and Storage provider. Do not create a replacement database or run `prisma migrate reset`.
- Brevo remains the transactional email provider for OTP delivery.
- Render Free may sleep after inactivity, so the first request can be slow. This Vercel change does not remove Render's free-tier cold starts.
