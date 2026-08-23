# YasReady Publish v1.0.11

Private publishing studio for Story-Locked manuscripts.

Version 1.0.11 is the **Kindle Pro production pass**. It keeps the stable reflowable EPUB engine from 1.0.10 and adds calibrated preview sizing, whole-book consistency analysis, responsive torture testing, Enhanced Typesetting safety checks, and a stronger finished-package autopsy.

## Story Lock remains the first rule

YasReady may change presentation metadata. It may not rewrite manuscript language.

- Source paragraphs remain immutable.
- Kindle layout overrides are stored by source block ID.
- Preview calibration never changes the EPUB.
- Final export re-verifies Story Lock before packaging.

## Kindle Pro 1.0.11

### Calibrated reader preview

The browser preview previously inherited a 16px browser baseline, which can visually feel larger than an 11pt manuscript. 1.0.11 adds a **preview-only reference point size**. Normal defaults to **11pt equivalent** while the production EPUB continues to leave body text size to the Kindle reader.

Preview controls include:

- Kindle / Phone / Tablet
- Portrait / Landscape
- Small / Normal / Large reader text
- 10.5 / 11 / 12pt visual reference
- Light / Sepia / Dark
- Read / Adjust modes

The reference point size is a simulator calibration only. It is never written as a fixed body font size into the production EPUB.

### Whole-book consistency scan

Kindle Pro scans the entire book, not only the section currently visible. It checks:

- exact source coverage
- chapter-section count
- chapter-title structure
- Kindle navigation count
- Story Lock metadata in the finished package
- nav and spine targets
- source placeholders
- unusually large local formatting overrides
- rare Word paragraph styles in chapter prose
- Enhanced Typesetting-friendly CSS

Warnings can jump back to an affected chapter or source block when a direct target exists.

### 3-view torture test

One button renders the current section in three read-only stress views:

1. Small reader text on a narrow phone
2. Normal reader text on a Kindle-sized viewport
3. Extra-large reader text on a tablet viewport

This helps find wrapping, heading, spacing, and alignment problems before Kindle Previewer.

### Stronger finished EPUB autopsy

Before release, YasReady verifies the generated package itself, including:

- project title and author metadata
- current Story Lock SHA-256
- exactly one internal cover image
- no duplicate cover XHTML
- chapter file count and chapter navigation count
- visible Contents in the reading spine
- Begin Reading landmark
- every navigation target exists
- every spine target exists
- no Preview Studio hooks leak into production

## Final validation

YasReady is not Amazon's rendering engine. The release workflow remains:

1. Story Lock passes
2. Kindle Pro consistency scan passes
3. KDP EPUB preflight passes
4. Download the EPUB
5. Open that exact EPUB in Amazon Kindle Previewer

## Local use

```bash
npm run verify
npm run dev
```

Then open `http://localhost:4173`.

`npm run verify` runs the full automated suite, static verification, and Superman audit.

## Current release QA

- **127/127 automated tests passing**
- Static verification passing
- Superman audit passing
- 26 application JavaScript modules syntax/import checked
- 46 literal button IDs audited
- 14 dynamic control families audited
- no fetch/XHR/WebSocket/sendBeacon manuscript-egress primitives in application source
