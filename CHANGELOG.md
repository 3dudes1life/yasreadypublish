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
