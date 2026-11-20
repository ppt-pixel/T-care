# T-CARE Brand and Customer-Care Contact Update

**Date:** 20 November 2026  
**Source baseline:** `T-CARE-Admin-Sidebar-Gap-Scrollbar-Fix-2026-11-19.zip`  
**Scope:** Apply the owner-supplied T-CARE logo, publish the customer-care email, and make footer navigation/contact content consistent.

## Implemented

- Added the supplied original logo at `public/brand/t-care-logo.jpg`.
- Derived a compact emblem asset and a transparent T-CARE wordmark asset from the supplied original for smaller brand placements.
- Applied the compact emblem to the public desktop/mobile navigation, shared workspace header, Admin/Gardener sidebar mark, and browser favicon.
- Applied the complete supplied logo to the authentication entry panel.
- Applied the supplied T-CARE wordmark and tagline to the global public footer.
- Set `support@t-care.in` as the canonical Customer-care email in `src/landing/content.js`.
- Wired the Contact page and global footer to the same email constant, using `mailto:` links.
- Updated the Company footer link from the Customer registration route to **Gardener enquiries** at `/contact`; public registration is for Customer accounts.
- Updated the browser title, description and theme color to match the supplied brand positioning.
- Removed the now-unused public contact email placeholder from `.env.example` and documented the fixed official email in `README.md`; optional office address, service location, phone and social details remain environment-configured and are not fabricated.
- Fixed missing separators between `STORY_VALUES` entries in `src/landing/content.js`, which otherwise prevented that module from parsing.

## Files changed

- `public/brand/t-care-logo.jpg`
- `public/brand/t-care-mark.png`
- `public/brand/t-care-wordmark.png`
- `index.html`
- `.env.example`
- `src/landing/content.js`
- `src/landing/Pages.jsx`
- `src/landing/Sections.jsx`
- `src/landing/landing.css`
- `src/main.jsx`
- `src/styles.css`
- `tests/brand-contact.test.js`

## Contact details

- Published customer-care email: `support@t-care.in`
- No phone number, office address, or service location was supplied in this change; those remain hidden unless explicitly configured.
- Social links remain hidden unless valid HTTPS profiles are configured.

## Validation

- Frontend automated tests: **22/22 passed**.
- TypeScript JSX parser: **7 JSX/TSX files, zero syntax diagnostics**.
- Plain JavaScript syntax checks: passed for the edited data module and public-data module.
- Production Vite build: **not run**. The available runtime is Node `22.16.0`, below the project requirement `>=22.22.0 <23`, and dependencies are not installed in this clean worktree. Run `npm ci` and `npm run build` on Node 22.22.x before deployment.
