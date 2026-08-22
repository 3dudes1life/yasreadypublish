# v1.0.5 Superman Release QA

- Automated suite: **88 / 88 passing**
- Static verification: **PASS**
- Superman audit: **PASS**
- JavaScript application modules syntax/import checked: **22**
- Literal button IDs audited: **33**
- Dynamic control families audited: **11**
- Browser network-egress primitive scan: **PASS** (no fetch/XHR/WebSocket/sendBeacon paths in app source)
- Proof ownership / stale-proof rejection: **PASS**
- Edition proof invalidation: **PASS**
- Controlled even physical page count: **PASS**
- Whole-book print/ebook rhythm regression tests: **PASS**
- Story Lock preservation through migration: **PASS**

## Bugs caught in the 1.0.5 sweep

- A previously generated print preview could theoretically remain visible after a settings/metadata/structure change. Proof signatures now make stale export fail closed.
- Old edition readiness could survive design changes. Edition proof/preflight state now invalidates automatically.
- Odd final physical page counts could leave KDP to append a page outside YasReady's page map. Pagination now owns the terminal blank and preflight blocks odd counts.
- TOC parity alignment blanks were not counted consistently in intentional-blank statistics. Fixed.
- Final Check could report a print blocker for an ebook-only project, and an exception while checking another physical edition could leave the UI focused on the wrong edition. Fixed.
- Hardcover/custom-trim geometry validation was too permissive for a release gate. Hardened.
- Preflight now validates the frozen preview geometry and separately proves that preview still belongs to the current project state.

## What this audit does not claim

No automated suite can prove that a browser application has zero bugs. The remaining acceptance gate is a manual black-box pass with the real manuscript: early/middle/late chapters, Contents parity, page furniture, both print/ebook spacing, Final Check, and the actual exported PDF/EPUB. The release is designed to fail closed when integrity or production assumptions cannot be verified.

# YasReady Publish 1.0 — Release QA

## Automated gate

Run:

```bash
npm run verify
```

The 1.0.5 release currently passes **88/88 automated tests** plus static verification and the Superman audit. The verification gate checks:

- every required runtime file exists
- JavaScript syntax for every application module
- Story Lock behavior
- chapter/text-message recognition
- print page geometry and right-hand chapter starts
- long-book KDP margin bands
- generated print TOC integrity
- fixed-page print-master output
- EPUB section coverage and package structure
- EPUB Story Lock metadata
- metadata-only structure repair
- reusable theme safety
- project backup round-trip and tamper rejection
- 1.0 guided-readiness model
- literal button binding coverage
- dynamic UI control-family bindings

## Release acceptance checklist

Before using a manuscript for a commercial release:

1. Import the **final** DOCX with tracked changes accepted/rejected.
2. Confirm the detected chapter count.
3. Review Book Matter and Structure Repair for any classification warnings.
4. Apply the intended series/theme design.
5. Build Print Preview.
6. Spot-check early, middle, and final chapters plus generated Contents.
7. Confirm chapter starts are on right-hand odd pages when that rule is enabled.
8. Run KDP Export and clear every blocking error.
9. Create the paperback PDF and keep print scale at 100% with browser headers/footers disabled.
10. Inspect the resulting PDF for embedded fonts and final visual appearance before KDP upload.
11. Review Ebook / Kindle preflight and preview multiple sections.
12. Download the EPUB and test it in a real Kindle/EPUB reader before release.
13. Return to Project Home and run **Final Check**. `Superman Ready` means both production gates and Story Lock passed in the same run.
14. Download a Project Backup before final submission.

## Button audit

`npm run verify` scans every literal `<button id="…">` in `src/main.js` and fails if that ID has no registered interaction handler. It also verifies the shared handlers for dynamic controls such as sidebar navigation, chapter/page navigation, structure overrides, themes, projects, and ebook sections.

This does not prove that no future browser/runtime bug can ever exist; it is designed to make disconnected controls and common regressions release-blocking instead of discoverable by the author during deadline week.


## 1.0.1 Book 2 proof hotfix

- Tres Amigos paragraph gap regression: fixed to 0 in and migration tested.
- Generated Contents parity: left-page start helper tested.
- Existing 1.0 project migration preserves exact manuscript block text.


## 1.0.2 chapter-spacing hotfix

- Regression target: a manuscript can contain empty DOCX paragraphs beginning partway through the book without changing prose.
- Print pagination retains those source blocks for Story Lock but collapses their rendered height inside chapter body only.
- EPUB retains the corresponding empty XHTML element/id but marks it collapsed so Kindle does not create visible spacer lines.
- Front/back matter blank paragraphs remain renderable.
- Both print and ebook expose an opt-out toggle for intentional blank-line layouts.
