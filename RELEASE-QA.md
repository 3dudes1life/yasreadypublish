# YasReady Publish v1.0.12 — Superman QA

## Automated gate

- 138 tests currently defined
- 138 pass
- 0 fail
- Static verification: PASS
- Superman audit: PASS

## v1.0.12 regressions covered

- semantic-role auto detection from source kinds / Word styles
- explicit semantic override changes presentation without changing source text
- scene-break ornaments preserve locked source marks
- inline manuscript image package + manifest audit
- missing image assets block preflight instead of being dropped
- linked footnote/endnote output + target audit
- canonical Story Lock v2 detects note changes
- canonical Story Lock v2 detects media fingerprint and media-byte tampering
- legacy canonical v1 migration preserves source hash and blocks exactly
- Kindle Pro reports semantic, note, and inline-image coverage
- Semantic Style Palette and Content style inspector are present

## Story Lock / privacy audit

Final Superman verification must confirm:

- schema 21 / app 1.0.12 consistency
- all application JS syntax/imports
- literal/dynamic control bindings
- zero fetch / XMLHttpRequest / WebSocket / sendBeacon manuscript-egress paths
- safe note/media import markers
- semantic style engine markers
- existing proof ownership / edition invalidation / Kindle finished-package guards

## Synthetic finished-EPUB smoke test

A generated v1.0.12 EPUB containing a semantic subhead, block quote, linked footnote, and inline manuscript image was built and unpacked successfully.

- ZIP container integrity: PASS
- XML/XHTML parse: 6/6 files PASS
- semantic subhead markup present
- semantic block-quote markup present
- linked `noteref` / `footnote` markup present
- inline image packaged in manifest/files

## Manual acceptance still required

Automated QA cannot substitute for the real-book walkthrough. Before calling Kindle done:

- cover
- title/front matter
- copyright
- dedication
- visible Contents
- Chapter 1
- Chapter 5
- one middle chapter
- one late chapter
- Chapter 55
- representative semantic blocks if present
- 3-View Torture Test
- exact exported EPUB in Amazon Kindle Previewer
