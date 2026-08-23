# YasReady Publish v1.0.10 — Kindle Superman QA

## Automated gate

- 119 / 119 Node tests PASS
- Static verification PASS
- Superman audit PASS
- 25 application JavaScript modules syntax/import checked
- 44 literal button IDs audited
- 13 dynamic control families audited
- No `fetch`, XHR, WebSocket, or `sendBeacon` manuscript-egress paths detected

## 1.0.10 regressions covered

- Kindle working preview defaults to color; grayscale is opt-in e-ink simulation.
- Read Mode remains non-selectable; Adjust Layout is explicit.
- Three-pane Preview Studio, adjacent inspector, sticky controls, live inputs, Undo/Redo, and reset controls are present.
- `copyright law.` remains inside the copyright section instead of becoming a fake front-matter section.
- Print-layout copyright line wraps reflow into normal ebook paragraphs while preserving source block IDs.
- Production EPUB contains no Preview Studio CSS/classes/hooks.
- Finished-package audit validates cover, chapters, navigation, metadata, and reader landmarks.
- `CHAPTERS PAGE`-style source placeholders are reported as blocking; no source wording is silently removed.
- Schema 20 / app 1.0.10 migration preserves manuscript blocks exactly.
- Existing cover, visible TOC, logical TOC, uniform chapter rhythm, Story Lock, device proof, and edition-safety tests remain green.

## Black-box acceptance

The user's live GitHub Pages walkthrough with the real Book 2 project remains the UI acceptance test. The final exported EPUB must still be opened in Amazon Kindle Previewer before Kindle is marked DONE.
