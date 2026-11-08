# T-CARE Render staging deployment

This project is deployed as two Render services from the same private GitHub repository:

- Frontend: Render Static Site (repository root)
- Backend: Render Web Service (`backend` root directory)
- Database and object storage: existing Supabase project (no data migration to Render)

## Frontend Static Site

- Branch: `main`
- Root Directory: leave blank (repository root)
- Build Command: `npm ci && npm run build`
- Publish Directory: `dist`
- Environment Variable: `VITE_API_BASE_URL=https://<exact-backend-service>.onrender.com`

The `public/_redirects` file provides SPA fallback to `index.html` for React Router routes.

## Backend Web Service

- Branch: `main`
- Runtime: Node
- Root Directory: `backend`
- Build Command: `npm ci && npx prisma generate`
- Start Command: `npm start`
- Health Check Path: `/api/v1/health`
- Region: Singapore (closest Render region to the existing Tokyo Supabase region)

Do not set a fixed `PORT`; Render supplies it. The server binds to `0.0.0.0`.

## Backend environment variables

Set these in Render's Environment screen, never in GitHub:

- `NODE_ENV=production`
- `DATABASE_URL` (Supabase pooled PostgreSQL connection string)
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (server-only `sb_secret_` key)
- `SUPABASE_STORAGE_BUCKET=tcare-media` (or the exact private bucket configured for T-CARE)
- `FRONTEND_ORIGIN=https://<exact-frontend-static-site>.onrender.com` (no trailing slash)
- `JWT_ACCESS_SECRET` (new, random, at least 32 characters)
- `JWT_REFRESH_SECRET` (different new random secret, at least 32 characters)
- `ACCESS_TOKEN_TTL=15m`
- `REFRESH_TOKEN_TTL=7d`
- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=465`
- `SMTP_SECURE=true`
- `SMTP_USER`
- `SMTP_PASSWORD` (Google App Password)
- `SMTP_FROM` (optional)
- `OTP_TTL_MINUTES=10`
- `OTP_RESEND_COOLDOWN_SECONDS=60`
- `OTP_MAX_ATTEMPTS=5`

The backend currently allows exactly one `FRONTEND_ORIGIN`. Use the stable Render static-site origin, not a preview URL. Update this value after the static site URL is known, then redeploy the backend.

Do not add `VITE_` variables to the backend. Do not expose `SUPABASE_SECRET_KEY`, `DATABASE_URL`, JWT secrets, SMTP password, or Razorpay secrets to the frontend.

## Database migrations

The Supabase database has already had the project's migrations applied by the owner. Do not run `prisma migrate reset`. The Render build command only generates Prisma Client; it does not migrate the database on every deploy. If a future migration is intentionally introduced, back up the database and run `npx prisma migrate deploy` as a controlled release step.

## First deployment order

1. Create backend Web Service with a temporary valid `FRONTEND_ORIGIN` URL; deploy and copy its exact `onrender.com` URL.
2. Create frontend Static Site with `VITE_API_BASE_URL` set to the backend URL; deploy and copy the exact frontend URL.
3. Update backend `FRONTEND_ORIGIN` to the exact frontend URL (no trailing slash), then redeploy backend.
4. Confirm both deployments are healthy and test `/api/v1/health`.
5. Test registration/OTP, login/logout/refresh, roles, Customer/Gardener workspaces, Storage upload, booking lifecycle, notifications, KYC and Admin workflows.

## Free-plan warning

Render Free web services spin down after 15 minutes without inbound traffic and can take about a minute to start again. Free services are intended for previews/testing, not production. Render's service filesystem is ephemeral; T-CARE must continue using Supabase for durable database and file storage. Consider a paid backend instance before relying on the service for active team operations.
