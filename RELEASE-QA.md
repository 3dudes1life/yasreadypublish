# v1.0.4 Release QA

- Automated suite: **72 / 72 passing**
- Static verification: **PASS**
- Whole-book uniform paragraph rhythm regression tests: **PASS**
- Paperback/Hardcover/Ebook edition independence retained: **PASS**
- Story Lock manuscript mutation check during migration: **PASS**

## 1.0.4 edition + spacing acceptance

- [x] One body blank between prose paragraphs renders one normalized spacer.
- [x] Consecutive blank paragraphs render only one spacer in Normalize mode.
- [x] Chapter-title and scene-break spacing are not doubled by blank normalization.
- [x] EPUB retains all blank source blocks while visually normalizing duplicate blank runs.
- [x] Paperback and Hardcover edition designs remain independent.
- [x] Ebook-only projects are supported with both print editions disabled.
- [x] Story Lock manuscript content remains byte-for-byte unchanged through migration and edition changes.
- [x] 69/69 automated tests + static verification pass.

# YasReady Publish 1.0 — Release QA

## Automated gate

Run:

```bash
npm run verify
```

The 1.0 release currently passes **57/57 automated tests** plus static verification. The verification gate checks:

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
