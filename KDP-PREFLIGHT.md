# YasReady Publish 1.0.5 — KDP Physical-Edition Preflight

This file documents the paperback/hardcover production gate used by YasReady Publish 1.0.5 Stable.

## Blocking checks

- Story Lock must verify against the imported manuscript hash immediately before production.
- A paginated single-page interior model must exist and its proof signature must match the current edition, Story Lock hash, metadata, structure overrides, and design.
- Total physical page count must be even; YasReady inserts a controlled terminal blank when needed.
- Physical page count must be in the 24–828 working range used by this build.
- Inside margin must meet the page-count band:
  - 24–150 pages: 0.375 in
  - 151–300 pages: 0.500 in
  - 301–500 pages: 0.625 in
  - 501–700 pages: 0.750 in
  - 701–828 pages: 0.875 in
- No-bleed outside margin must be at least 0.250 in.
- Top and bottom no-bleed margins must each be at least 0.250 in.
- Active text styles must not be below 7 pt.
- If the theme requires right-hand chapter starts, every detected chapter opener must land on an odd/right physical page.
- Intentional blank versos must not carry running headers or folios.
- Generated print TOC entries must agree with the final printed page map after pagination converges.
- Unexpected non-intentional empty physical pages are blocking errors.
- DOCX image assets block the current text-first/no-bleed path because image/bleed production is intentionally not silently approximated.

## Review checks

- Non-6×9 trim sizes require the matching trim selection and final verification in KDP.
- Word tables, Word fields, and manual Word page breaks are surfaced for review rather than silently treated as fully supported geometry.
- Font embedding is a property of the final PDF and must be confirmed on the produced PDF before commercial upload.

## Generated Table of Contents

When automatic print TOC is enabled, Publish first paginates the Story-Locked source, creates generated TOC entries from the detected chapter/back-matter map, inserts those generated entries, and paginates again until the TOC target numbers agree with the final page map.

A manual/source TOC in the DOCX is never silently deleted or replaced.

## PDF production gate

When preflight has no blocking errors, **Create Paperback PDF** or **Create Hardcover PDF** opens the fixed single-page Print Master. The Print Master performs a second DOM overflow inspection against every physical page before triggering the system print/PDF dialog. If any page overflows its fixed trim box, PDF creation remains blocked.

Page numbers, running headers, chapter openings, generated TOC entries, and intentional blank versos are baked into the fixed-page production master; they are not manuscript edits.

The KDP Previewer and a human review of the exported PDF remain the final manufacturing acceptance checks.

## 1.0 Final Check

Project Home exposes **Run Final Check**, which re-verifies Story Lock, builds the current paperback preview, evaluates paperback preflight, evaluates EPUB preflight, and reports a single guided readiness state. “Superman Ready” means both software production gates passed; it does not replace visual proofing of the final commercial files.

## v1.0.3 edition-specific page-count gate

YasReady now evaluates the active physical edition independently.

- Paperback: current working KDP page-count gate remains 24–828 pages where supported by the chosen trim/ink/paper combination.
- Hardcover: KDP case-laminate hardcover currently supports 75–550 pages for the supported trim sizes used by this formatter. A hardcover proof above 550 pages is blocked even if the paperback edition is valid.
- Paperback and hardcover never share generated Contents page numbers; each edition is repaginated from the same Story-Locked manuscript.


## v1.0.5 proof ownership and page parity

A print preview is now treated as a frozen production proof, not a generic cache. If the manuscript hash, title/author metadata, structure overrides, edition type, or print design differs from the state that produced the preview, preflight blocks export and requires a rebuild.

YasReady also owns final sheet parity. If pagination would otherwise end on an odd physical page, one intentional terminal blank is appended inside the YasReady page map. This keeps final page count, page-number mapping, and cover/spine calculations under the same production model instead of relying on KDP to append an untracked page.
