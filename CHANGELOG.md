# Changelog

## v1.0.10 — Kindle Finalization + Preview Studio UX

- Rebuilds Kindle Preview Studio as a fixed three-pane workbench: **Reading Order | Live Book Preview | Format Inspector**, with independent scrolling and a sticky top control bar.
- Adds a one-click **Open Preview Studio** action from the Kindle release card so setup and proofing no longer require hunting down the page.
- Defaults the Kindle working preview to **color**. E-ink grayscale is now an explicit simulator toggle, never a production EPUB change.
- Removes the black device-header bar from the working simulator so no chrome covers the book.
- Keeps **Read Mode** as the default; block selection hooks exist only in explicit **Adjust Layout** mode.
- Makes inspector values update the selected block live in the preview, then persist as edition-scoped presentation metadata. No manuscript text editor is introduced.
- Adds Kindle formatting **Undo / Redo**, per-block reset, reset-all, and safe promotion to body/chapter defaults.
- Hardens front-matter sectioning: generic Word heading styles no longer create arbitrary ebook sections. `copyright law.` stays with the copyright section instead of becoming its own reading item.
- Adds clean ebook front-matter reflow that joins print-layout line wraps into readable legal paragraphs while preserving every source block ID, source text, and Story Lock order.
- Detects likely source placeholders such as `CHAPTERS PAGE` and **blocks final EPUB release instead of silently deleting them**.
- Adds a finished-package EPUB audit before release: metadata, single-cover packaging, chapter file/link counts, visible Contents in the spine, Begin Reading landmark, and Preview Studio leakage are verified against the generated package.
- Removes Preview Studio-only CSS/classes/hooks from production EPUB output.
- Project schema **20** / app **1.0.10**; migration invalidates stale ebook preflight state but leaves manuscript blocks unchanged.
- Automated release gate: **119/119 tests passing**, static verification PASS, Superman audit PASS.

## v1.0.9 — Kindle Simulator + Read/Adjust UX Hardening

- Replaces the oversized generic cover/web preview with a device-framed Kindle working simulator.
- Adds E-reader, Phone, and Tablet preview classes; portrait/landscape; Reader Serif/Sans; five text sizes; White/Sepia/Mint/Black appearances.
- E-reader mode previews cover artwork in grayscale while Phone/Tablet remain color, matching Amazon's documented preview behavior categories.
- Cover now fits the simulated reader viewport instead of rendering as a giant webpage image.
- Splits Preview Studio into explicit **Read Mode** and **Adjust Layout**. Read Mode contains no inspection hooks or hover outlines.
- Adjust Layout adds selection hooks only while active; clicking a block updates the inspector slot without rebuilding the entire preview surface.
- Keeps visible Contents navigation working in both Read and Adjust modes.
- Adds reset-all Kindle presentation fixes while preserving Story Lock.
- Preview font/device/appearance settings affect only the simulator and never the final EPUB.
- Final EPUB continues to use the exact same production XHTML/CSS source model and contains no preview-only markers.
- Adds Kindle preview model regression tests and schema 19 / app 1.0.9 migration that leaves manuscript blocks unchanged.
- Automated gate: **111/111 tests passing**, static verification PASS, Superman audit PASS.

## v1.0.8 — Kindle Preview Studio + Private Device Proof

- Adds a live **Cover** item at the start of the Kindle preview when an ebook cover is attached, without adding a duplicate HTML cover page to the final EPUB.
- Turns the Kindle proof into **Preview Studio**: click a rendered source block to open a read-only Format Inspector instead of a text editor.
- Adds edition-scoped presentation overrides for spacing before/after, first-line indent, alignment, and indent suppression. Overrides store metadata only; source wording, source order, and Story Lock hashes remain untouched.
- Adds **Reset to theme**, **Use as all-body default**, and **Use for all chapter titles** controls for fast safe cleanup.
- Makes the visible Table of Contents interactive inside Preview Studio so chapter links jump to their actual preview sections.
- Preserves the reader scroll position while selecting or reformatting a block so inspection does not bounce back to the top of a chapter.
- Adds **Preview on iPhone / iPad** using a self-contained, read-only HTML device proof that can be sent through the Mac Share Sheet/AirDrop or downloaded for transfer. No manuscript is uploaded to a server in this release.
- The device proof includes cover, front matter, linked Contents, every chapter, next/previous navigation, reading-order navigation, font-size controls, and light/sepia/dark reader appearances.
- Keeps true expiring web-link/QR sharing out of the static build until a dedicated private backend exists; Superman still requires zero browser manuscript-network-egress primitives.
- Project schema 18 / app version 1.0.8. Existing projects migrate by creating empty presentation-override buckets only; manuscript blocks remain unchanged.
- Automated release gate: **107/107 tests passing**, static verification PASS, Superman audit PASS.

## v1.0.7 — Kindle First + Apple-Easy Ebook Studio

- Removes Apple Books, Kobo, Google Play Books, and NOOK readiness cards from the UI and preflight.
- Narrows the ebook release target to Amazon KDP / Kindle EPUB.
- Rebuilds the Ebook / Kindle top experience around a four-step setup strip: Metadata, Cover, Navigation, Story Lock.
- Moves the primary KDP EPUB download into one obvious release card.
- Hides nonessential typography controls inside an Advanced section.
- Keeps visible linked Contents + Kindle Go To navigation mandatory in the KDP profile.
- Restores reader-controlled body defaults: no forced body font size, line height, or alignment in the EPUB CSS.
- Adds KDP HTML-file count and approximate per-section size guards.
- Project schema 17 / app version 1.0.7; migration changes ebook presentation settings only and leaves manuscript blocks untouched.
- Adds Kindle-specific regression tests and UI clutter checks.

# YasReady Publish Changelog

## v1.0.6 — Ebook Focus + Universal EPUB Hardening

- Locks the immediate release workflow to **ebook first**: Paperback and Hardcover can be parked without deleting their saved edition settings.
- Fixes Book 2 front-matter reflow by separating chapter-body rhythm from front/back matter presentation. `Clean ebook layout` collapses print-only blank spacing while preserving every source word, run, block ID, order, and Story Lock hash input.
- Adds an actual visible, linked **Table of Contents** in the EPUB reading order immediately before Chapter 1.
- Retains EPUB 3 logical navigation (`nav.xhtml`) and legacy `toc.ncx`, and adds landmarks for **Table of Contents** and **Begin Reading**.
- Novel TOC defaults to **chapters only**, avoiding copyright/legal/dedication clutter; an all-matter option remains available.
- Adds internal JPEG/PNG ebook cover attachment, packages it as OPF `cover-image`, and deliberately avoids a duplicate HTML cover page. Cover artwork remains edition metadata outside Story Lock.
- Adds major-store readiness cards for Amazon Kindle, Apple Books, Kobo Writing Life, Google Play Books, and B&N NOOK.
- Adds cover dimension checks used by the universal release gate: Apple interior-image 5.6M-pixel ceiling, Google 640px short-side minimum, and a 1400px+ quality target.
- Captures bounded Word paragraph layout metadata on new DOCX imports for future source-aware front-matter rendering; existing projects use Clean mode without requiring re-import.
- Project schema 16 / app version 1.0.6. Migration changes ebook presentation settings and invalidates stale ebook preflight only; manuscript blocks remain byte-for-byte/text-for-text unchanged.
- Automated release gate: **96/96 tests passing**, static verification PASS, Superman audit PASS.

## v1.0.5 — Superman QA Hardening

- Hardening release focused on release-blocking bugs and stale-state safety rather than new publishing features.
- Adds signed/frozen proof ownership: every print proof is tied to its edition, Story Lock hash, title/author metadata, structure overrides, and exact design settings. A changed project can no longer export an old proof.
- Invalidates edition proof/preflight status whenever print design, ebook design, metadata, structure classification, or Story Lock state changes.
- Adds a controlled final intentional blank page when needed so physical print page counts end even instead of leaving KDP to add a page outside YasReady's pagination model.
- Strengthens KDP geometry checks for hardcover trim sizes, top/bottom margins, paperback custom-trim bounds, cream-paper page-limit review, and edition-specific page ranges.
- Fixes TOC alignment blanks not being included in intentional-blank statistics.
- Fixes Final Check error accounting for ebook-only / print-disabled projects and guarantees the UI returns to the print edition the author was working on even if another edition fails during Final Check.
- Adds `npm run superman`: syntax/import resolution, literal-button wiring, dynamic-control-family audit, version consistency, safety-marker checks, and a scan for browser network-egress primitives.
- Retains the 1.0.4 uniform whole-book Tres Amigos rhythm: print paragraphs use one consistent 0.12 in presentation gap and ebook paragraphs one consistent 0.7 em gap; inconsistent empty DOCX paragraphs no longer control chapter rhythm.
- Project schema 15 / app version 1.0.5. Old proof status is intentionally invalidated on migration; Story-Locked manuscript text is unchanged.
- Automated release gate: 88/88 tests passing plus static verification and Superman audit.

## v1.0.4 — Uniform Whole-Book Paragraph Rhythm

- Fixes the Chapter 5+ spacing regression by making Tres Amigos body rhythm uniform across the entire manuscript, independent of inconsistent DOCX blank-paragraph markup.
- Paperback/Hardcover: every story paragraph receives the same 0.12-inch presentation gap; source blank body paragraphs collapse visually but remain Story-Locked.
- Ebook/Kindle: every story paragraph receives the same 0.7em presentation gap; source blank body paragraphs remain in XHTML for coverage but collapse visually.
- Scene breaks and headings keep their own dedicated spacing and no longer inherit generic paragraph gap.
- Existing projects migrate automatically; manuscript text/hashes are unchanged.
- Edition Manager remains fully intact.

## v1.0.3 — Edition Manager + Spacing Normalization

- Replaces the over-aggressive 1.0.2 all-blank collapse with a three-mode presentation policy: Normalize, Preserve, or Collapse.
- Tres Amigos defaults to Normalize: one run of source blank paragraphs renders as one standard spacer; extra consecutive blanks collapse visually.
- Applies the same safe normalization to EPUB/Kindle while retaining every source blank block in Story Lock and source coverage.
- Adds independent Paperback, Hardcover, and Ebook editions under one locked master manuscript.
- Paperback and Hardcover now maintain separate geometry and pagination so page numbers and generated Contents are never shared accidentally.
- Adds Create / Reset Hardcover from Paperback to copy design only, not pagination.
- Final Check now evaluates every enabled edition instead of assuming paperback + ebook are always required.
- Project schema 13; existing v1.0.2 projects migrate without changing manuscript text.
- 69/69 automated tests pass.

## v1.0.2 — Body Spacing Consistency Hotfix

- Collapses truly empty DOCX paragraphs inside chapter bodies by default for print and EPUB.
- Preserves every empty source block in Story Lock and exact-source coverage; only presentation height is suppressed.
- Front matter blank spacing remains untouched.
- Adds print and ebook toggles for authors who intentionally want blank body lines rendered.
- Fixes zero-height blank rendering in the browser proof so collapsed blanks do not reappear as 6px gaps.
- Migrates existing 1.0/1.0.1 projects without changing manuscript text.

## v1.0.1 — Book 2 Proof Hotfix

- Corrected the Tres Amigos body paragraph gap from 0.333 in to 0 in. Paragraphs now use first-line indentation without the accidental oversized vertical gaps seen in the first full Book 2 proof.
- Generated print Table of Contents now begins on a left-hand page so a two-page Contents appears as one facing spread.
- Right-hand chapter-start logic then reserves the left page after the Contents spread when needed, keeping Chapter 1 on the following right-hand page.
- Existing 1.0 saved Tres Amigos projects migrate automatically when they still contain the old 0.333 in default; deliberate custom paragraph gaps are preserved.
- Story Lock source text remains untouched by the migration and pagination changes.

# Changelog

## v1.0.0 — Stable Private Publishing Studio

- Promoted YasReady Publish from private alpha to private stable 1.0.
- Added a guided, Apple-simple **Project Home** with a six-step publishing path: Manuscript → Structure → Design → Proof → Paperback → Ebook.
- Added **Superman Ready Final Check** that verifies Story Lock, KDP paperback preflight, and EPUB preflight in one run.
- Added private **Project Backup / Restore** with Story Lock verification before restored data is accepted.
- Added **Create Paperback PDF** workflow: opens the fixed-page master, performs the final overflow check, then invokes the system print dialog for Save as PDF.
- Added recovery-focused UI and clear readiness status instead of exposing every advanced control as the primary workflow.
- Reorganized sidebar navigation into Book, Paperback, Digital, and Inspect groups.
- Fixed stale sidebar state after import: navigation is now re-rendered whenever project state changes, so newly available workspace buttons are immediately live.
- Added literal-button wiring audit and core UI contract tests.
- Updated project schema to 10 / app version 1.0.0 without changing canonical manuscript hashes.
- Hardened import recognition to accept a valid DOCX MIME type even when a platform obscures the filename extension.
- Updated production/preflight language from v0.9 to v1.0.

### QA gate

- **57/57** unit/integration tests pass.
- Static JavaScript syntax verification passes.
- Every literal button ID in the application has a registered handler.
- Dynamic control families (navigation, projects, structure repair, themes, ebook sections, print navigation) are explicitly audited.
- Browser interaction smoke testing covered real import, Design, Print Preview, KDP-ready preflight, Ebook, and Superman Final Check with no page/console errors in the exercised flow.
- The available Book 2 draft DOCX was parser-tested separately: source extraction completed with Story Lock-compatible paragraph mapping and no images, tables, fields, manual page breaks, footnotes, or endnotes detected in that draft.

## v0.9.0 — Automatic Print TOC + Structure Repair

- Automatic print Table of Contents with final printed page numbers.
- Metadata-only Structure Repair.
- Edge-case preflight hardening.

## v0.8.0 — EPUB / Kindle Engine

- Reflowable EPUB 3 packaging and clickable navigation.

## v0.7.0 — KDP Production Gate

- KDP preflight and fixed-page print master.

## v0.6.0 — Reusable Themes

- Built-in and private themes plus Book 1 calibration.

## v0.5.0 — Long-book Navigator

- Chapter/page navigator and spread workbench.

## v0.4.0 — Whole-book Structure

- Front/back matter and running headers.

## v0.3.0 — Tres Amigos Calibration

- Book 1 series profile and source inline formatting.

## v0.2.0 — Print Structure

- 6×9 fixed-page model, mirrored margins, odd-page chapter starts.

## v0.1.0 — Story Lock Foundation

- DOCX import, structure mapping, local projects, immutable source fingerprinting.
