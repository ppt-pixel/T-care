# T-CARE Customer Dashboard Sidebar Update

**Date:** 19 November 2026  
**Source:** `T-CARE-Admin-Gardener-Login-Fix-2026-11-19.zip`

## Change summary

The Customer workspace now uses the same responsive, expandable sidebar navigation component as the Admin and Gardener workspaces. The previous Customer bottom navigation dock is no longer rendered.

### Customer navigation

- Today
- Book a service
- Visits
- Plants
- Addresses
- Services
- Subscriptions
- Billing
- Inbox
- Profile

### Behaviour

- Desktop: expandable/collapsible sidebar with remembered preference for the Customer workspace.
- Mobile/tablet: off-canvas sidebar opened by the header menu button, closed by selecting a destination, the close control, the backdrop, or Escape.
- Mobile drawer locks background-page scrolling while open and restores the previous scroll setting when closed.
- Active route is highlighted and navigation links expose accessible names/current-page state.
- Customer routes and existing role guards are unchanged.
- The legacy bottom dock component and its obsolete CSS have been removed.

## Additional correction

`WorkspaceSidebar` now derives its workspace key from the current route before selecting the role-specific footer description. This removes an undefined `role` reference in the sidebar component.

## Validation

- Frontend test suite: **16/16 passed**.
- Customer sidebar route and Book a service destination tests added.
- Test confirms all three authenticated workspaces use the sidebar.
- Test confirms the legacy dock is not rendered.
- Obsolete `.dock` CSS references removed.
- `npm run build` could not run in this environment because Vite is not installed in the extracted package (`vite: not found`). Run `npm ci` and `npm run build` using the project's required Node.js `22.22.x` before deploying.

## Deployment

Deploy this package through the existing Hostinger GitHub-connected Vite deployment. Keep `VITE_API_BASE_URL` pointed at the existing Render backend. No backend, database, account, payment, or environment-variable changes are required for this UI update.
