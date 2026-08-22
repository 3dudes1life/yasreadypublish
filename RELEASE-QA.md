# YasReady Publish v1.0.8 — Preview Studio Release QA

## Automated gate

- 107 / 107 Node tests PASS
- Static verification PASS
- Superman audit PASS
- 23 application JavaScript modules checked for syntax/import resolution
- 41 literal button IDs audited
- 11 dynamic control families audited
- No `fetch`, XHR, WebSocket, or `sendBeacon` manuscript-egress paths detected

## Preview Studio regressions covered

- Live cover appears as preview item 0 but is not duplicated as an EPUB XHTML cover page.
- Preview-only inspectable block markers do not leak into final EPUB XHTML.
- Clicking visible TOC entries navigates to the intended chapter preview.
- Per-block formatting overrides change presentation metadata only.
- Reset-to-theme removes per-block overrides.
- Body/chapter-title default promotion updates edition presentation without changing source text.
- Preview selection preserves the reader scroll position across re-render.
- Device proof contains cover, visible Contents, all reading-order sections, and read-only reader controls.
- Device proof TOC links navigate to chapter anchors.
- Device proof contains no contenteditable manuscript editor.
- Project migration to schema 18 preserves manuscript block IDs, text, and ordering.

## Manual/static smoke performed

The final static site was served through `python3 -m http.server` and `index.html` loaded successfully over HTTP. Full Playwright/browser automation was not available in this environment, so the user's real Book 2 walkthrough remains the black-box acceptance test.

## Release principle

No green automated gate substitutes for inspecting the actual 119k-word Book 2 proof. If the live manuscript exposes a rendering issue, export remains paused until the exact issue is corrected.
