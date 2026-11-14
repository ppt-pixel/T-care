# T-CARE UI / runtime fixes — 2026-11-13

Verified in headless Chromium (desktop 1440px + mobile 390px, light + dark) with a mock API; build passes, ESLint 0 errors, backend 49/49 tests pass.

1. phase5.css: legacy variable names (--panel/--muted/--text/--accent) mapped to the real theme; hard-coded dark colours made theme-aware (cards, inputs, notices, pills, buttons).
2. styles.css: role pill in the header (.seg span.on) was invisible; dock scrolls, dark-mode active highlight fixed.
3. main.jsx: header bell now shows live notifications (was hard-coded fake data with a permanent unread dot); closes on outside click / Escape.
4. main.jsx: new /crew/inbox route + Inbox nav item for gardeners.
5. phase5.jsx useLoad: no more dropped requests or stale responses when the path changes mid-flight.
6. main.jsx: command palette limited to the signed-in role, fake seed plants removed.
7. main.jsx: MotionConfig reducedMotion="user"; route bloom skipped under reduced motion.
8. main.jsx: dock scrolls active item into view; breadcrumbs safe against malformed URLs.
9. phase5.css: metric rows auto-fit (no orphan card); hover/focus/press transitions.

Not changed: single ~660 KB JS chunk (candidate for code-splitting); unused legacy mock screens in main.jsx (tree-shaken).
