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

When preflight has no blocking errors, **Build Paperback PDF** or **Build Hardcover PDF** runs **Print PDF Hard Mode**. YasReady renders the already-frozen physical pages at 300 DPI, builds the PDF directly in the browser, audits the finished PDF bytes, hashes the file, and downloads it only when the finished-file audit passes. The system browser Print → Save as PDF dialog is no longer part of the primary production path. The HTML Print Master remains available only as an advanced visual/debug fallback.

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

## v1.0.14 Kindle Final Check alignment

The physical-edition rules above remain unchanged while Kindle work is being finalized. Version 1.0.14 fixes Final Check so the ebook branch uses the same three internal gates shown in the Kindle workspace: EPUB preflight, Kindle Pro quality, and Kindle Intelligence. Intentional non-blocking review acknowledgements are production-workflow metadata only; they cannot dismiss Story Lock, package, navigation, or other blocking errors.


## v1.0.15 Theme Studio alignment

Theme Studio does not relax any KDP release gate. Theme CSS, semantic wrappers, chapter-heading treatments, conversation layouts, and optional theme artwork are generated presentation assets. Story Lock, source coverage, navigation, spine, cover, package, placeholder, finished-EPUB audit, Kindle Pro quality, and Kindle Intelligence checks remain authoritative.


## 1.0.31 Amazon Print Gate

The print gate binds the final interior and cover PDF hashes to the exact print configuration and KDP metadata. KDP Print Previewer confirmation is external/manual and only counts for the current release token. As of v1.0.35, physical proof ordering/inspection is author-owned and is not a YasReady release-gate requirement.

## Barcode Brain (v1.0.34)

- Own-ISBN mode must contain a mathematically valid ISBN-13 (legacy ISBN-10 may be converted).
- YasReady-generated EAN-13 must decode back to the exact expected ISBN before certification.
- When the interior ISBN page is enabled, final pagination must place it on the true last left/even physical page; its folio remains part of normal book numbering.
- Final page count including Barcode Brain pages drives gutter/spine/full-wrap geometry. Any pagination change invalidates the cover and Print Gate token.
- YasReady cover placement uses a 2 × 1.2 inch black-on-white barcode zone; Amazon-placement mode reserves the zone instead.
- Uploaded full-wrap covers are geometry-checked before stamping and re-hashed after the vector barcode is applied.


## Amazon Paperback Hard Mode (v1.0.35)

YasReady re-checks the finished Amazon paperback package rather than treating a successful PDF export as release-ready.

### Interior

- single physical pages, never two-up/spreads
- physical odd/right and even/left parity plus printed-folio parity
- trim/ink/paper-specific KDP page-count eligibility
- page-count-aware inside margin and bleed-aware outside/top/bottom margins
- minimum active print text size of 7 pt
- exact finished MediaBox/page count and 300-DPI rendered-page geometry
- no encryption, annotations/comments, forms, scripts, open actions, or bookmark outlines
- crop/trim/page-box findings surfaced for review and suspicious 3+ blank-page runs warned

### Cover

- one continuous PDF containing back + spine + front
- final canvas bound to the exact interior page count, trim, paper, ink, and cover bleed
- spine text eligibility/safe-edge model checked before certification
- uploaded PDF security/interactive structures, fonts/outlined text, image signals, page boxes, and file size audited
- transparency signatures are warnings for external preview, not automatic rejection, because valid production PDFs can contain such structures

### Barcode replacement

When YasReady owns barcode placement, the final ISBN must validate and scanner-round-trip. The cover receives a 2.05 × 1.65 inch solid-white knockout first, then the 2 × 1.2 inch black-on-white vector EAN-13 is centered inside it. This allows an old placeholder barcode block to be replaced cleanly without redesigning the full wrap.

### External Amazon confirmation

YasReady's only external print release confirmation is **KDP Print Previewer passed** for the exact frozen release token. Any production change invalidates that confirmation. Physical proof ordering and inspection are intentionally outside the software gate and remain the author's decision/responsibility.


## Full-Wrap Artwork Adapter (v1.0.36)

YasReady now distinguishes **finished visual artwork** from a **final KDP production PDF**.

- JPG/PNG full-wrap artwork may be imported as a design source. YasReady infers the old physical wrap/spine geometry from the image proportions at the selected trim height and reports effective PPI.
- A stale narrower paperback spine may be expanded after final pagination while preserving back/front panel geometry and the original spine-art width. YasReady will not automatically crop a source spine that is wider than the target because that could destroy text/logos.
- Finished artwork must meet the production-resolution target before YasReady manufactures the final cover PDF. A lower-resolution reference is diagnostic only.
- The manufactured cover is built only after final page count is frozen and uses the exact target full-wrap canvas before Barcode Brain replacement and Amazon Paperback Hard Mode auditing.
- A PDF supplied through the **final KDP PDF** path remains strict and must already have the exact one-page production geometry. An image printed into a generic 8.5×11 PDF wrapper is not accepted as a full-wrap production cover.
- Cover/artwork changes invalidate the frozen print package and KDP Print Previewer confirmation for that package; they do not alter Story Lock or an already-earned Kindle release proof.
