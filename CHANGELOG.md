## 1.0.31 — Amazon Print Gate

- Added release-token binding across the final interior PDF, cover PDF, page count, print settings, and KDP handoff metadata.
- Added KDP Print Previewer confirmation that becomes stale automatically when the package changes.
- Added optional physical-proof approval for YasReady proof certification.
- Added edition-specific KDP language, subtitle, series, publisher/imprint, and free-KDP-vs-own-ISBN handoff fields.
- Fixed migration stability so moving beyond 1.0.30 does not rerun historical Kindle migrations or erase current Kindle confirmations.
- Print Brain configuration changes now invalidate both the interior and cover audits because cover geometry depends on the final interior.

# YasReady Publish 1.0.30 — Cover Brain + Kindle E21018 Fix

- Fixes the Kindle Previewer `E21018` conversion failure reported against `OEBPS/text/front-001.xhtml` by removing `display:none`, `visibility:hidden`, hidden attributes, and source-blank helper markup from the **publishable EPUB**. Preview-only helpers remain confined to YasReady Preview Studio.
- Adds a production EPUB hard gate (`audit-amazon-no-hidden-css`) so hidden-content CSS/markup cannot silently return in a Kindle export.
- Invalidates stale Kindle Previewer / Enhanced Typesetting confirmations when migrating into 1.0.30 because the production EPUB renderer changed; current 1.0.30 projects preserve confirmations on reload.
- Adds **Cover Brain v1** for Paperback and Hardcover. Paperback full-wrap geometry is driven by the finished interior page count, trim, ink, and paper profile; Amazon barcode clearance and spine-text eligibility are checked automatically.
- Adds 300-DPI cover PDF generation using the existing deterministic PDF engine, with Kindle-cover reuse, uploaded print-front art, back-cover copy, spine text, publisher/imprint, finish, and color controls.
- Paperback uses Amazon's published spine factors and 0.125-inch outer bleed. Hardcover uses Amazon's published 0.51-inch wrap, 0.4-inch hinge, and 0.635-inch safety geometry but **does not invent an exact spine formula Amazon does not publish**; final hardcover cover PDF remains locked until the exact Cover Calculator spine width is entered and confirmed.
- Cover audits are edition-scoped and invalidated whenever the print proof/design changes. Story Lock manuscript text and hashes remain untouched.

# YasReady Publish 1.0.29 — Print PDF Hard Mode

- Replaces the primary browser Print → Save as PDF workflow with YasReady's own client-side production PDF renderer.
- Renders every frozen physical page at 300 DPI and packages one raster page image per PDF page so KDP cannot substitute or drop fonts after export.
- Generates exact PDF MediaBox dimensions from the active Paperback/Hardcover trim profile, including the modeled interior bleed extension when bleed is enabled.
- Audits the actual finished PDF bytes before download: PDF signature, page count, exact page size, 300-DPI image geometry, encryption, annotations, additional page boxes/trim marks, file-size ceiling, and EOF/xref closure.
- Hashes the finished PDF with SHA-256 and stores the audit against the exact frozen print-proof signature. Any design/pagination change invalidates the remembered PDF audit.
- Keeps the HTML Print Master only as an advanced visual/debug fallback; it is no longer the production path.
- Print preflight now treats live-font embedding risk as eliminated in the generated KDP interior because the final PDF contains no font objects.
- Story Lock source wording, structure, notes, media fingerprints, and manuscript hashes remain unchanged by migration.

# YasReady Publish 1.0.28 — Print Brain + Actionable Kindle QA

- Fixed false Kindle chapter/navigation blockers caused by comparing Book Brain effective structure against frozen DOCX parser counts.
- Book Brain no longer promotes fuzzy Heading 1 candidates in known front/back matter into chapters. Existing projects are reanalyzed on migration without changing Story Lock source.
- Fixed Amazon list audit so front/back-matter numbering cannot create the impossible `0 nested items` blocker. Real list problems now point to a source block.
- Kindle quality issues can now route to Book Brain or Structure Repair instead of rendering dead red boxes.
- Added Print Brain v1: Paperback/Hardcover manufacturing setup for trim, ink, paper, bleed, KDP page-range eligibility, all five KDP hardcover trims, and automatic safe margin floors.

## 1.0.27 — Amazon Hard Mode

- Removes forced normal-body Kindle typography so reflowable prose remains reader-controlled for font face, base size, line-height, color/background, and alignment.
- Converts differentiated fiction side indents (block quotes, notes, verse, text messages) to reflow-safe percentage margins and audits production CSS for unsafe positioning/negative margins.
- Audits the **actual generated EPUB XHTML** for Amazon-oriented file-count and per-file byte ceilings rather than relying on manuscript-size approximations.
- Eliminates exported hidden source text from scene-break presentation and fails Amazon Hard Mode when non-empty hidden source content survives in production XHTML.
- Preserves source hyperlinks on new DOCX imports and exports safe HTTP/HTTPS/mailto/tel/fragment links. Older projects with source hyperlinks are told to re-import rather than silently losing targets.
- Exports consecutive simple Word lists as semantic `<ol>/<ul>/<li>` structures; complex/nested list cases remain reviewable instead of being guessed.
- Blocks Kindle export when source tables exist until a semantic table workflow can preserve them faithfully; YasReady no longer flattens a table and calls the EPUB ready.
- Adds stricter JPEG/PNG diagnostics for actual dimensions, 1-pixel conversion hazards, transparency warnings, and likely-CMYK JPEG warnings.
- Adds exact-release-token external Amazon checkpoints for Kindle Previewer opened, Enhanced Typesetting confirmed, and KDP Online Preview approved.
- Changes the internal success state to **Ready for Kindle Previewer**. YasReady does not claim Amazon acceptance until the author confirms the external Amazon gates for that exact build.
- Keeps 1.0.26 Kindle navigation/visible-Contents separation, OPF guide/cover compatibility, and private Story Lock metadata exclusion from the publishable OPF.
- Story-Locked manuscript wording, order, notes, media fingerprints, semantic interpretation, and canonical hashes remain unchanged by migration.

## 1.0.25 — Book Brain · Smart eBook Interpretation

- Added Book Brain v1, a Story-Lock-safe semantic interpretation layer for messy/underformatted DOCX manuscripts.
- Auto-detects high-confidence chapter starts, title/copyright/dedication/contents page boundaries, text conversations, scene breaks, subheads, written notes/letters, and verse.
- Uses a confidence policy: high confidence applies automatically; ambiguous interpretations go to a focused review queue; low confidence leaves source behavior untouched.
- Book Brain page-role metadata now drives the same semantic front-matter renderer used by Preview Studio and exported EPUBs, even when the source lacks explicit page labels.
- Existing projects gain Book Brain on migration without re-import and without changing Story Lock canonical source.
- DOCX paragraph metadata now preserves manual page-break evidence for safer page-role inference.
- Added Simple Mode Book Brain summary and one-click review decisions.
- PDF reconstruction remains a planned future input path; this release hardens the semantic engine on DOCX first.

## 1.0.24 — Front Matter Typography & Copyright Fit

- Pins the Tres Amigos title page to the Book 1 sans-serif display hierarchy across EPUB reading apps.
- Renders publisher/imprint metadata on the title page when the source title page does not already contain it.
- Compacts the copyright legal block and adds keep-together hints so ISBNs fit on one normal-size screen whenever the viewport permits.
- Invalidates stale ebook visual proof/freeze after the renderer change.

# v1.0.23 — Format-First Flow + Dedication Spacing

- New DOCX imports start with **no edition assumed**. Authors explicitly choose Kindle eBook, Paperback, Hardcover, or any combination.
- Step 1 now puts **What are you making?** before metadata and makes the format cards directly selectable.
- Tres Amigos dedication pages use larger semantic paragraph spacing so separate dedication thoughts no longer read like one continuous block.
- After a successful Kindle EPUB export, the Export step offers **Continue with Paperback** and **Continue with Hardcover** without re-importing the manuscript.
- Existing projects keep their saved edition selections exactly as-is.
- Story Lock source text, order, hashes, and semantic content remain unchanged.

# v1.0.22 — Book 1 Front Matter Match

- Added semantic Book 1-style auto-formatting for the private Tres Amigos Kindle title page, copyright page, and dedication page.
- Title pages now use the airy centered house hierarchy: spaced uppercase title, subtitle, author/byline, and lower imprint line when present.
- Copyright pages render as centered legal matter instead of turning the copyright line into an oversized heading.
- Dedication pages render as a centered, italic, restrained house-style page with Book 1-like vertical rhythm.
- Preview Studio and production EPUB share the exact same front-matter renderer.
- Other theme families keep their existing clean front-matter behavior.
- Existing ebook preflight, visual-proof, and freeze state is invalidated because rendered output changes; Story Lock manuscript text and hashes are untouched.

# v1.0.21 — Simple Metadata Restore

- Restores required Book Details to Step 1 of Simple Mode: title, author, language, and publisher/imprint.
- `Finish Metadata` now jumps directly to the visible Book Details card and focuses the missing field.
- Saving Book Details updates ebook metadata without touching Story-Locked manuscript text.
- Keeps the four-step Simple Mode workflow and leaves expert controls under Advanced Tools.

# v1.0.20 — Tres Amigos Divider Hotfix + Bug Log

- Removes stale legacy `✦` chapter divider metadata from the private Tres Amigos theme only.
- Leaves ornaments in other themes untouched.
- Adds a compact browser-local Bug Log under Advanced Tools with open/fixed states and notes.
- Story Lock manuscript text and hashes remain untouched.

# v1.0.19 — Tres Amigos Kindle Match

- Tunes the private Tres Amigos Kindle chapter opening against the real Book 1 Kindle reference.
- Moves the chapter number/title block lower with `8.0em` top breathing room while keeping the title-to-body gap essentially unchanged at `5.5em`.
- Keeps the 1.0.18 source-safe split heading renderer, italic chapter title, flush opening paragraph, and normal indents after the opening.
- Migrates only untouched 1.0.18 Tres Amigos spacing (`6.2em / 5.4em`); custom author spacing is preserved exactly.
- Presentation-only update: Story Lock manuscript text and hashes remain untouched.

# v1.0.18 — Kindle Chapter Styling

- Adds source-safe split chapter headings so `Chapter 10: Ocean Air and Questions` can render as a separate `CHAPTER 10:` label and italic title without changing Story Lock source text.
- Tres Amigos Kindle style now uses larger top breathing room, a separate chapter title, and a larger gap before the flush opening paragraph.
- Adds a simple Chapter Opening choice in Style plus deeper Theme Studio controls.
- Preview and exported EPUB share the same renderer.

# YasReady Publish Changelog

## 1.0.17 — Simple Mode

- Rebuilt the default author experience around four plain-language steps: **Book → Style → Preview → Export**.
- Replaced the technical 11-item default sidebar with a four-step workflow; existing expert destinations remain available under one collapsed **Advanced Tools** section.
- Simplified the Kindle workspace so the default view leads with visual theme selection, cover/details, the live book preview, and one human-language publish status.
- Added a compact visual theme gallery for the most useful fiction styles while preserving every Theme Studio control behind Advanced Tools.
- Replaced the always-visible Production Console / Release Gate / Book Health stack with a single ready/not-ready author-facing status and safe-fix action.
- Kept Kindle Intelligence, Book DNA, accessibility diagnostics, Release Gate tokens/freezing, source inspection, structure repair, semantic mapping, and deep typography available without forcing normal authors to understand them.
- Reduced repeated Story Lock explanations to a quiet **Story protected** status while keeping all Story Lock enforcement and release validation intact.
- Theme Studio is collapsed by default instead of opening an expert control surface automatically.
- No project schema change: schema 25 and all 1.0.16 persisted data remain intact. This is a UX-only release and does not rewrite manuscript blocks, notes, media, Story Lock hashes, edition design state, review decisions, or release proof state.
- QA: 173/173 automated tests passing; static verification PASS; Superman audit PASS.

## 1.0.16 — Kindle Release Gate

- Added a final Kindle Release Gate that combines technical preflight, whole-book quality/intelligence, accessibility, visual proof, and release freeze state.
- Added Batch Safe Fix for presentation-only Kindle Intelligence fixes with a Story Lock manuscript mutation guard.
- Added batch intentional-review handling using the existing exact-finding token model so changed findings automatically return.
- Added a finished-EPUB accessibility audit covering language, semantic TOC/landmarks, chapter heading hierarchy, image alt/presentation semantics, note navigation, and OPF accessibility metadata.
- Added a manual visual-proof stamp tied to the exact manuscript/design/cover/override/review release token. Any later change invalidates the stamp.
- Added Kindle Freeze: a release token can only be frozen after every production gate passes, and any later source/design/cover/review change invalidates the freeze automatically.
- Added downloadable Kindle release report JSON for an auditable final production snapshot.
- Story Lock remains authoritative; 1.0.16 adds no manuscript rewriting path.

# Changelog

## v1.0.15 — Theme Studio

- Built directly on the v1.0.14 Kindle Production UX; Production Console, Polish Queue, Preview Studio, Focus Preview, Kindle Intelligence, Final Check, and export gates remain intact.
- Added eight coordinated fiction theme families: Classic Literary, Contemporary Romance, Minimal Modern, Dramatic, Soft Romance, Dark Romance, Clean Commercial, and private Tres Amigos.
- Added one-screen Book Theme Builder for chapter heading, first paragraph, body, after-break paragraph, subhead, scene break, text conversation, written note, block quote, verse, and Contents presentation.
- Added visible Theme → Chapter override → Paragraph override hierarchy and chapter-specific heading overrides.
- Added Chapter Heading Designer with alignment, spacing, size, weight, tracking, capitalization, divider/ornament, and optional EPUB-packaged artwork.
- Added Scene Break Studio with source marks, whitespace, stars/dots/diamond/flourish, custom glyph text, or custom artwork while preserving locked source scene-break text in EPUB markup.
- Added Text Conversation Designer with transcript, subtle bubbles, left/right, compact, and inset treatments; source `[Name]:` wording is never rewritten.
- Added transparent Smart Word Style Mapper with inferred semantic role plus explicit remapping.
- Added whole-book “Show me every place using this style” review navigation.
- Added Book DNA metrics for theme adherence, semantic feature count, local overrides, and formatting outliers.
- EPUB renderer now carries Theme Studio chapter treatments, first-paragraph styling, semantic content styling, conversation layouts, scene ornaments/artwork, and contents alignment into the finished package.
- Project schema 24 / app 1.0.15. Migration initializes Theme Studio presentation metadata and invalidates stale ebook preflight only; manuscript blocks, notes, media, canonical algorithm, and Story Lock hashes are untouched.

## v1.0.14 — Kindle Production UX

- Adds the **Kindle Production Console**, combining metadata, cover, navigation, Story Lock, quality, and intelligence into one guided release surface.
- Adds **NEXT BEST ACTION** so the workspace directs the author to the most important unfinished setup item, blocker, review finding, visual proof, or preflight step.
- Adds a merged **Polish Queue** for Kindle Pro and Kindle Intelligence findings with direct navigation and safe-fix actions.
- Adds exact-finding **Intentional** review decisions for non-blocking items. Errors cannot be dismissed, and a changed finding automatically resurfaces because acknowledgements are tokened to the exact issue fingerprint/message/location.
- Adds Reading Order search with **⌘K / Ctrl+K**, **E** Read/Edit toggle, **Option+Arrow** navigation, and **N** next-issue navigation. Keyboard commands are disabled while typing in form controls.
- Adds **Focus Preview** to hide side panes temporarily while preserving the production workbench state.
- Adds sticky production commands above Preview Studio: Previous/Next, Next Issue, Undo/Redo, Focus Preview, plus grouped reader-simulation controls.
- Adds inspector **Theme baseline** visibility and Story-Lock-safe **Tighter / Theme / Airier** quick-polish presets with live visual feedback.
- Moves detailed Kindle Quality + Intelligence into a collapsible **Book Health & Intelligence** area so routine production is guided without burying advanced diagnostics.
- Fixes an edition-normalization bug that could drop persisted Kindle review decisions when `ensureEditions()` rebuilt ebook edition state.
- Fixes a release-gate bug where **Run Final Check** included EPUB preflight + Kindle Quality but omitted Kindle Intelligence despite the Kindle workspace requiring it.
- Hardens button auditing so `data-*-id` attributes are no longer falsely parsed as literal button `id` attributes.
- Fixes Polish Queue deduplication so an acknowledged duplicate can never hide a still-unresolved finding from another QA source.
- Tightens Intentional review UX so informational notices cannot be acknowledged as if they were review findings; only warning/review findings are eligible.
- Focus Preview now carries the author directly into Preview Studio instead of changing layout below the fold with no visible feedback.
- Project schema 23 / app 1.0.14. Migration initializes review-decision metadata and invalidates stale ebook preflight only; manuscript blocks, notes, media, canonical algorithm, and Story Lock hashes are untouched.
- QA: 155/155 automated tests passing; static verification PASS; Superman audit PASS.

## v1.0.13 — Kindle Intelligence

- Adds a whole-book **chapter consistency map** that fingerprints every chapter's heading, opening paragraph, local overrides, semantic usage, and source-style patterns.
- Adds isolated-formatting drift detection for chapter headings, chapter openings, extreme local spacing/indent changes, unusual body alignment, suppressed body indents, orphan overrides, and rare source-style fingerprints.
- Adds direct **Go there** navigation from an anomaly to the exact chapter/block in Preview Studio.
- Adds Story-Lock-safe **one-click fixes** for presentation anomalies. Safe layout fixes remove suspicious layout properties while preserving an intentional semantic Content style; orphan fixes remove presentation metadata only.
- Adds **Compare Chapters**, a presentation-only fingerprint comparison that scores chapter formatting without comparing or exposing story prose.
- Adds chapter-level consistency scores so a 55-chapter novel can be visually scanned for drift instead of manually hunting the entire manuscript.
- Kindle release gating now includes the new intelligence structure gate in addition to KDP preflight and Kindle Pro quality.
- EPUB preflight JSON now includes the Kindle Intelligence report for archival QA.
- Project schema 22 / app 1.0.13. Migration invalidates stale ebook preflight state only; manuscript blocks, notes, media, Story Lock algorithm, and hashes are not rewritten.
- QA: 146/146 automated tests passing; static verification PASS; Superman audit PASS.

## v1.0.12 — Kindle Semantic Feature Parity

- Adds Story-Lock-safe semantic presentation roles for Subheads, Block Quotes, Written Notes/Letters, Verse/Poetry, Text Conversations, and Scene Breaks.
- Adds a compact Semantic Style Palette with book-wide controls for subhead sizing/alignment, quote treatment/indent, written-note treatment, text-message treatment/indent, verse indent, and scene-break ornaments.
- Adds a Content style control to Preview Studio Adjust Layout. Semantic choices are edition-scoped presentation metadata and cannot edit source wording.
- Auto-detects common fiction semantics from source kind and Word paragraph style names while allowing explicit per-block overrides.
- Adds DOCX footnote/endnote import for new projects. Note wording is preserved, linked in EPUB XHTML, and protected by Story Lock v2.
- Adds embedded DOCX image extraction for new projects, including image fingerprints, placement references, alt text, EPUB manifest packaging, and package-audit coverage.
- Adds canonical Story Lock v2 for new imports: exact body text + note text + embedded-media fingerprints. Existing projects stay on their original canonical version/hash during migration.
- Strengthens Story Lock v2 verification by recomputing embedded-media bytes against stored SHA-256 fingerprints, preventing a changed image payload from passing with a stale hash.
- Adds preflight errors for unresolved/unsupported inline images and unresolved note references; missing image alt text is a review warning.
- Extends Kindle Pro quality reporting with semantic-style, note, image, and accessibility coverage.
- Project schema 21 / app 1.0.12. Migration initializes empty note/media arrays only where absent and invalidates stale ebook preflight state; manuscript blocks are untouched.
- QA: 138/138 automated tests passing; static verification PASS; Superman audit PASS.

## v1.0.11 — Kindle Pro Production Studio

- Calibrates Kindle Preview Studio to an 11pt-equivalent visual baseline by default while leaving production EPUB body sizing reader-controlled.
- Adds 10.5 / 11 / 12pt preview reference controls.
- Adds a whole-book Kindle Pro consistency scan with score, grade, errors, review items, and direct issue navigation when possible.
- Adds a 3-view responsive torture test: small phone, normal Kindle, and large tablet.
- Adds Enhanced Typesetting-oriented CSS checks for fixed body sizing, reflow metadata, fixed positioning, negative margins, relative heading sizing, and chapter breaks.
- Strengthens finished EPUB autopsy with Story Lock metadata verification plus nav-target and spine-target resolution.
- Kindle release status now requires both KDP preflight and Kindle Pro quality gates.
- Keeps schema 20; app version advances to 1.0.11 because no new persisted manuscript schema fields are required.
- Story Lock manuscript blocks remain unchanged by migration.
- QA: 127/127 tests passing; static verification and Superman audit passing.

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
