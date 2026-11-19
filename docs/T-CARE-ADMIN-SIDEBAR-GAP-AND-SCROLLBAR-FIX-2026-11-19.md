# T-CARE Admin Sidebar Gap and Scrollbar Fix

**Date:** 19 November 2026  
**Baseline:** `T-CARE-Customer-Dashboard-Sidebar-Fix-2026-11-19.zip`  
**Scope:** Workspace sidebar layout and scrollbar presentation only.

## Findings

The desktop `.workspace-sidebar` was fixed at `top: 74px`, so its panel background did not cover the upper 74 pixels of the viewport. The navigation scroll container used only `scrollbar-width: thin`; Chromium/WebKit therefore retained a plain platform scrollbar appearance.

## Changes

- The desktop sidebar panel now begins at `top: 0` and extends to the viewport bottom.
- The sticky workspace header is layered above the sidebar panel (`z-index: 30` vs. `24`).
- The sidebar's internal top padding is set to `90px`, preserving the previous Admin/Account heading position (`74px` top offset plus the former `16px` padding). The top gap is filled without moving or overlapping the sidebar content.
- Mobile drawer behavior is retained: it remains full-height, off-canvas until opened, and uses its existing compact `18px` content padding.
- The navigation list is an explicit flexing scroll region with `min-height: 0`, contained overscroll and a stable scrollbar gutter.
- Firefox uses a thin theme-coloured scrollbar. Chromium/WebKit use an 8px scrollbar with a rounded, muted-green thumb, transparent track and a stronger hover state.

## Files changed

- `src/styles.css`
- `tests/workspace-sidebar-styles.test.js` (new regression checks)
- This report

No React routing, account permissions, API, backend, database, migrations, environment variables or business rules were changed.

## Validation

- Frontend Node test suite: **19/19 passed**.
- Stylesheet parsed with `tinycss2`: **0 parse errors**; braces and parentheses are balanced.
- Chromium layout fixture at 1200×944 confirmed the sidebar spans from y=0 to the viewport bottom, the top bar overlays it, the Admin heading remains at y=90, and the nav scroll container accepts scroll input. The WebKit thumb resolves to a green theme colour and 8px width.
- Chromium mobile fixture at 700×944 confirmed the drawer retains its top-aligned, full-height layout and 18px content padding.
- A production Vite build was **not run**: dependencies are not installed in this extracted worktree, and the available runtime is Node 22.16.0 while the project specifies Node `>=22.22.0 <23`. Run `npm ci` and `npm run build` on Node 22.22.x before deployment.

## Deployment status

Source-only patch. No GitHub push, Hostinger deployment, backend deployment or production data change was performed.
