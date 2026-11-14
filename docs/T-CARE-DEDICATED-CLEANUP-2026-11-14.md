# T-CARE — Dedicated cleanup checkpoint

**Date:** 14 November 2026  
**Source archive:** `Final(2).zip`  
**Scope:** Remove disconnected prototypes, fake sample records and non-functional UI controls without altering the live API-backed workspaces or production data.

## Removed from the active frontend source

- Removed the unmounted legacy Customer, Gardener and Admin prototype screens from `src/main.jsx`. These included hard-coded example customers, gardeners, bookings, jobs, plant records, revenue, ratings, trend charts, and frontend-only assignment/content changes.
- Removed the sample arrays and state/actions used exclusively by those screens (`seedPlants`, sample `bookings`, `bookingMeta`, `crewJobs`, status overrides, local Add Plant modal state, and related helpers).
- Removed unreferenced old UI helpers and imports, and retained the shared shell, role navigation, notification UI, authentication flow, route protection, loading/error states and the live Gardener profile route.
- Kept the routed Customer/Admin/Gardener workspace components mapped to `src/phase5.jsx`; the public Services, Plans, Store, Reviews and verified Gardener directory continue to load their records from the API.

## Removed misleading or non-functional controls

- Removed App Store and Play Store controls because no published app destinations were configured.
- Removed the inert Remember me checkbox and Forgot password prompt because neither was connected to an implemented auth flow.
- Removed the `to="soon"` placeholder link behavior.
- Removed clickable social buttons that only displayed a setup message. Footer social links now appear only when the owner supplies a valid HTTPS URL through `VITE_INSTAGRAM_URL`, `VITE_YOUTUBE_URL`, `VITE_FACEBOOK_URL` or `VITE_LINKEDIN_URL`.
- WhatsApp CTAs and the floating WhatsApp action are now omitted until a valid `VITE_WHATSAPP_NUMBER` is configured. The Contact page continues to explain when the business channel is not configured.
- Generic action buttons without an action handler are disabled rather than displaying a misleading frontend/backend placeholder toast.
- Replaced the cart’s clickable Checkout toast with a clear status note; browsing-cart state remains usable, but checkout and order fulfilment are not enabled.

## Deliberately retained

- Ordinary input hints such as “Your full name”, “Search gardeners” and note prompts. These are form guidance, not sample records.
- Honest loading, retry, error and empty-catalogue states. These are required because catalogues may legitimately be empty until Admin publishes approved records.
- The Terms & Privacy page's explicit draft warning. Final legal terms and privacy language were not supplied; replacing that warning with invented legal text would be unsafe. The page must be approved before public transactional launch.
- Empty `.env.example` values and deployment configuration examples. They are operator configuration instructions, not user-facing fake data.
- Illustrative makeover artwork, which is clearly labeled as concept imagery rather than customer work.

## Validation

- All frontend `.js` and `.jsx` files parsed with the installed TypeScript JSX parser with zero syntax diagnostics.
- Imports in `src/main.jsx`, `src/landing/Sections.jsx` and `src/landing/Pages.jsx` were checked; no unused imports remained in those files at the cleanup checkpoint.
- Active route definitions were retained; Customer/Admin routes still point to the API-backed Phase 5 page components, and `/crew/me` still points to the authenticated API-backed Gardener profile.
- Backend automated tests and the frontend production build are recorded separately after execution in this checkpoint.

## Not performed

- No `.env` or provider credentials were created or modified.
- No Supabase migration, production database mutation, Razorpay action, GitHub push, Netlify deploy or Render deploy was performed.
- No legal terms, contact details, social account URLs, catalogue values, testimonials or production user data were fabricated.
