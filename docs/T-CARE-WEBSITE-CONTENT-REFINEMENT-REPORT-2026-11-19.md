# T-CARE Website-Wide Content Refinement Report

**Source archive:** `tcare.zip`  
**Review date:** 19 November 2026  
**Scope:** Public website, Customer workspace, Gardener workspace, Admin workspace and shared UI copy.

## Objective

Improve customer- and staff-facing wording so each page explains its purpose in clear, natural language. Remove system-oriented or generic descriptions where they do not help the reader. Preserve layout, navigation, permissions, workflows, data handling and business rules.

## Pages and areas reviewed

### Public website
- Home page and shared hero sections
- Services and service details
- About T-CARE and Gardener directory
- Subscription plans and billing FAQ
- Plant Store, product listings and cart
- Green Makeover and its steps/FAQ
- Contact page and contact options
- Terms & Conditions and Privacy Policy pages
- Sign-in, registration, email verification and password recovery
- Shared navigation, footer, WhatsApp entry point, search and not-found page

### Customer workspace
- Dashboard
- Services
- Booking creation, booking details and visit history
- Plants and plant details/care history
- Saved addresses
- Subscription plans and subscription history
- Payments and refunds
- Notifications/inbox
- Profile and password/security page

### Gardener workspace
- Route/dashboard
- Assigned jobs and job details
- Service reports and completed reports
- Availability
- Identity verification and profile
- Payouts and notifications
- Password/security page

### Admin workspace
- Overview and recent activity
- Account management and account details
- Gardener verification
- Bookings and assignments
- Service catalogue and pricing
- Plant Store and inventory
- Subscription plans and customer subscriptions
- Plant-care library and customer plant records
- Finance, payments, receipts and payouts
- Analytics
- Website content management
- Customer reviews, issues and notifications
- Password/security page

## Content improvements made

- Rewrote the shared page-hero text so it describes T-CARE's customer benefits rather than using generic promotional wording.
- Refined public About, Services, Plans, Store, Makeover and Contact introductions.
- Rewrote the public FAQ answers about booking, Gardener verification, service availability, property access and plant follow-up in clearer language.
- Improved service-inclusion, booking-step and brand-story descriptions.
- Reworded Customer booking guidance, service/plan descriptions, and empty states for addresses, visits, subscriptions, payments and notifications.
- Reworded Gardener-facing descriptions and empty states for assignments, reports and availability.
- Reworded Admin-facing empty states for accounts, Gardeners, bookings, reviews, issues, plans, content, plant-care guides, payments, payouts and inventory.
- Replaced the generic “No records found” message with contextual empty-state titles and optional guidance.
- Improved error-state headings so they tell users what happened and offer a retry action.
- Updated the public navigation label from “AI care” to “My care”.
- Changed the footer link “Join as a gardener” to “Gardener enquiries” and directed it to Contact; public registration creates Customer accounts, so the previous label was misleading.
- Removed browser-specific wording from the cart note; it now describes what customers can and cannot do in the store.
- Replaced generic plan and product empty states on the home page with clear next steps.
- Reworded payment and clipboard error messages to explain the issue and the action a user can take, without exposing implementation details.
- Made the popular-services reporting period explicit (“last 30 days”) and clarified the Admin analytics date ranges.
- Corrected the Customer navigation condition so the collapsible sidebar remains limited to Admin and Gardener workspaces; Customer navigation retains its existing dock.
- Corrected missing separators in the `STORY_VALUES` data array so all four story values remain distinct entries.

## Representative wording changes

| Previous wording | Refined wording |
|---|---|
| “Meet Gardeners, read customer reviews and browse the store.” | “Find plant-care services, meet verified Gardeners and read feedback from customers.” |
| “Choose an Admin-approved service.” (example supplied by the requester; not present verbatim in this archive) | Current booking guidance: “Select a service, choose the plants to include, then set your address and visit time.” |
| “Join as a gardener” | “Gardener enquiries” |
| “No records found” | Context-specific messages such as “No saved addresses” or “No assignments yet”, with a next step where appropriate |
| “You can save items in this browser…” | “You can add items to your cart…” |

## Content intentionally left unchanged

- Terms & Conditions and Privacy Policy body text: legal wording was not rewritten without business/legal approval.
- Service, plan and product names/descriptions stored in the database or managed through the Admin dashboard: these are business-owned catalogue details and should not be invented or silently changed.
- Customer reviews, Gardener biographies, CMS announcements and service reports: these are user- or Admin-authored records, not static template copy.
- Prices, office address, phone number, email address, service areas and social links: these require verified business information and were not fabricated.

The exact two phrases from the supplied screenshot were not present verbatim in this `tcare.zip`; the current booking copy in the archive was reviewed and refined instead.

## Files updated

- `src/landing/content.js`
- `src/landing/Pages.jsx`
- `src/landing/Sections.jsx`
- `src/main.jsx`
- `src/phase5.jsx`

## Validation

- Frontend tests: **12/12 passed**.
- Backend test files that do not require the omitted `bcrypt` package: **87/87 passed**.
- Frontend JS/JSX parse check: **18 files, zero syntax diagnostics**.
- Backend JavaScript syntax checks: passed for source, scripts, and tests.
- The full backend suite could not load `backend/tests/account-management.test.js` because `bcrypt` is not installed in this clean worktree; the package dependency remains declared in the backend manifest and lockfile.
- A production Vite build was attempted but could not start because Vite is not installed in this clean worktree (`vite: not found`). The available Node runtime is `22.16.0`, while the project requires Node `>=22.22.0 <23`; run `npm ci` on Node 22.22.x and then `npm run build` before deployment.
- No live browser acceptance test was performed in this environment.

## Packaging and data safety

The deliverable excludes `.git`, `node_modules`, generated `dist` output, local `.env` files and `backend/.env.test`. The frontend and backend `.env.example` templates are retained. No customer records, service catalogues, prices, policy bodies or database migrations were modified as part of this copy refinement.

## Release note

The copy changes are source-reviewed and the available tests/parse checks pass. Run the production build on Node 22.22.x and complete a live page-by-page browser review before deploying. Verify database-driven catalogue text separately because that copy is managed by Admin and stored outside the static frontend source.
