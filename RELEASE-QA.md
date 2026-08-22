# YasReady Publish v1.0.9 — Kindle Superman QA

## Automated gate

- 111 / 111 Node tests PASS
- Static verification PASS
- Superman audit PASS
- 24 application JavaScript modules syntax/import checked
- 42 literal button IDs audited
- 12 dynamic control families audited
- No `fetch`, XHR, WebSocket, or `sendBeacon` manuscript-egress paths detected

## 1.0.9 regressions covered

- Unsupported preview preference values normalize safely.
- Phone landscape dimensions swap correctly.
- Kindle E-reader preview is flagged grayscale while phone/tablet remain color.
- Read Mode contains no `data-yrp-block-id` inspection hooks.
- Adjust Layout adds inspection hooks only while active.
- Cover appears as simulator item 0 while final EPUB still has no duplicate cover XHTML.
- Final EPUB packaging still contains the internal cover image and normal navigation structure.
- Project migration to schema 19 / app 1.0.9 preserves manuscript block JSON exactly.
- Existing Story Lock, chapter navigation, TOC, front-matter cleanup, uniform chapter rhythm, device proof, and edition-safety tests remain green.

## Manual/static smoke

The static runtime files were served locally and retrieved successfully. Browser automation inside this execution environment is blocked by administrator navigation policy, so the user's live GitHub Pages Book 2 walkthrough remains the black-box UI acceptance test.

## Release principle

The YasReady simulator is a production workbench, not a replacement for Amazon's proprietary Enhanced Typesetting renderer. The exact exported EPUB must still pass Amazon Kindle Previewer before Kindle is marked DONE.
