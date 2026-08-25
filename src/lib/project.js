import { sha256Hex } from './hash.js';
import { DEFAULT_PRINT_DESIGN, ensurePrintDesign } from './print-model.js';
import { DEFAULT_EBOOK_DESIGN, ensureEbookDesign } from './ebook-model.js';
import { ensureStructureOverrides } from './structure-overrides.js';
import { ensureEditions, invalidateAllEditionProofs } from './editions.js';
import { ensurePresentationOverrides } from './presentation-overrides.js';
import { canonicalizeManuscriptV2 } from './manuscript-rules.js';
import { applyBookBrain, reanalyzeBookBrain } from './book-brain.js';
import { detectLabeledPrintIsbn, normalizeBarcodeBrain } from './barcode-brain.js';

function primeDetectedPhysicalIsbn(project, type='paperback') {
  // Callers normalize editions before entering this helper. Do not call
  // ensureEditions() again here: it can replace the edition object while the
  // migration still holds a reference to the previous object, causing stale
  // lastPageCount/PDF/cover proof state to survive.
  const edition=project?.editions?.[type];
  if (!edition) return null;
  const detected=detectLabeledPrintIsbn(project,type);
  if (!detected) return null;

  const meta=edition.kdpMetadata || {};
  if (meta.isbnMode !== 'own' || !String(meta.isbn || '').trim()) {
    edition.kdpMetadata={ ...meta, isbnMode:'own', isbn:detected.isbn };
  }

  edition.barcodeBrain=normalizeBarcodeBrain({
    ...(edition.barcodeBrain || {}),
    enabled:true,
    includeInterior:true,
    coverPlacement:'yasready',
    detectedIsbn:detected.isbn,
    detectedIsbnBlockId:detected.blockId || null,
  });
  return detected;
}

export function isAppVersionBefore(version='',target='') {
  const parse=(value)=>{
    const match=String(value||'').match(/^(\d+)\.(\d+)\.(\d+)/);
    return match ? [Number(match[1]),Number(match[2]),Number(match[3])] : [0,0,0];
  };
  const a=parse(version),b=parse(target);
  for(let i=0;i<3;i+=1){
    if(a[i]<b[i]) return true;
    if(a[i]>b[i]) return false;
  }
  return false;
}

export async function createProjectFromImport({ file, arrayBuffer, parsed }) {
  const [sourceFileHash, manuscriptHash] = await Promise.all([
    sha256Hex(arrayBuffer),
    sha256Hex(parsed.canonicalText),
  ]);

  const now = new Date().toISOString();
  const baseName = file.name.replace(/\.docx$/i, '');

  const project = {
    id: crypto.randomUUID(),
    version: 37,
    appVersion: '1.0.41',
    title: baseName,
    author: '',
    createdAt: now,
    updatedAt: now,
    source: {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      lastModified: file.lastModified,
      sourceFileHash,
      manuscriptHash,
    },
    storyLock: {
      enabled: true,
      canonicalAlgorithm: 'SHA-256',
      canonicalVersion: parsed.metadata?.canonicalVersion || 2,
      verifiedAt: now,
      status: 'verified',
    },
    structureOverrides: {},
    presentationOverrides: { ebook: {}, paperback: {}, hardcover: {} },
    manuscript: {
      blocks: parsed.blocks,
      chapters: parsed.chapters,
      notes: parsed.notes || [],
      media: parsed.media || [],
      stats: parsed.stats,
      metadata: parsed.metadata,
    },
    design: {
      template: 'Tres Amigos Series · Book 1',
      print: { ...DEFAULT_PRINT_DESIGN },
      ebook: { ...DEFAULT_EBOOK_DESIGN },
    },
    // New projects start with no assumed output. The author chooses Kindle,
    // paperback, hardcover, or any combination immediately after import.
    editions: {
      paperback: { enabled: false },
      hardcover: { enabled: false },
      ebook: { enabled: false },
      activePrint: 'paperback',
    },
  };
  ensureEditions(project);
  ensurePresentationOverrides(project);
  // 1.0.25 Book Brain interprets high-confidence structure/presentation after
  // import. It never changes manuscript wording or canonical Story Lock data.
  applyBookBrain(project);
  primeDetectedPhysicalIsbn(project,'paperback');
  primeDetectedPhysicalIsbn(project,'hardcover');
  return project;
}

export function migrateProject(project) {
  if (!project) return project;
  const oldVersion = Number(project.version) || 1;
  const priorAppVersion = String(project.appVersion || '');
  const alreadyCurrent = oldVersion >= 37 && priorAppVersion === '1.0.41';
  // 1.0.34 is a print-only renderer/pagination upgrade. Preserve the exact
  // Kindle release proof when upgrading a real 1.0.33 project so a paperback
  // barcode change cannot erase already-confirmed Kindle Previewer work.
  const priorEbookReleaseGateFor134 = oldVersion >= 33 && project.editions?.ebook?.releaseGate
    ? JSON.parse(JSON.stringify(project.editions.ebook.releaseGate))
    : null;
  const preNormalizePrintCollapse = project.design?.print?.collapseBodyBlankParagraphs;
  const preNormalizeEbookCollapse = project.design?.ebook?.collapseBodyBlankParagraphs;
  const priorPrintCoverChoice = Object.fromEntries(['paperback','hardcover'].map((type) => [type, {
    explicit: ['upload-pdf','upload-art','build'].includes(project.editions?.[type]?.coverMode),
    mode: project.editions?.[type]?.coverMode || '',
    hasUpload: Boolean(project.editions?.[type]?.uploadedCoverPdf || project.editions?.[type]?.uploadedCoverArt),
  }]));
  const pre118EbookDesign = project.editions?.ebook?.design || project.design?.ebook || {};
  const pre118ThemeStudio = pre118EbookDesign?.themeStudio || {};
  const pre118HadChapterLayout = Object.prototype.hasOwnProperty.call(pre118ThemeStudio, 'chapterHeadingLayout');
  const pre118ChapterTop = Number(pre118EbookDesign?.chapterTopEm);
  const pre118ChapterAfter = Number(pre118EbookDesign?.chapterAfterEm);
  ensurePrintDesign(project);
  ensureEbookDesign(project);
  ensureStructureOverrides(project);
  ensurePresentationOverrides(project);

  if (oldVersion < 2 && !project.design?.print?.templateId) project.design.print = { ...DEFAULT_PRINT_DESIGN };

  if (oldVersion < 11 && project.design?.print?.templateId === 'tres-amigos-book1') {
    if (Math.abs(Number(project.design.print.paragraphGap) - 0.333) < 0.0001) project.design.print.paragraphGap = 0;
    if (!project.design.print.tocStartSide) project.design.print.tocStartSide = 'left';
  }

  // 1.0.4 corrects the over-aggressive 1.0.2 blank-line hotfix. Instead of
  // deleting all visual blank lines, body blank runs are normalized to one
  // standard spacer while extra consecutive blanks collapse. Source blocks stay intact.
  if (oldVersion < 13) {
    const legacyPrintCollapse = preNormalizePrintCollapse;
    const legacyEbookCollapse = preNormalizeEbookCollapse;
    if (!project.design.print.bodyBlankPolicy) project.design.print.bodyBlankPolicy = legacyPrintCollapse === false ? 'preserve' : 'normalize';
    if (project.design.print.bodyBlankSpace == null) project.design.print.bodyBlankSpace = 0.12;
    if (!project.design.ebook.bodyBlankPolicy) project.design.ebook.bodyBlankPolicy = legacyEbookCollapse === false ? 'preserve' : 'normalize';
    if (project.design.ebook.bodyBlankSpaceEm == null) project.design.ebook.bodyBlankSpaceEm = 0.7;
    delete project.design.print.collapseBodyBlankParagraphs;
    delete project.design.ebook.collapseBodyBlankParagraphs;
  }

  ensurePrintDesign(project);
  ensureEbookDesign(project);
  ensureEditions(project);

  // 1.0.4: the book's visible paragraph rhythm must not depend on inconsistent
  // blank paragraph markup in the source DOCX. Tres Amigos editions get one
  // uniform presentation gap after every story paragraph while body blank
  // paragraphs collapse visually. Story Lock source blocks remain unchanged.
  if (oldVersion < 14) {
    const applyPrintRhythm = (edition) => {
      if (!edition?.design) return;
      const id = edition.design.templateId || project.design?.print?.templateId;
      if (id === 'tres-amigos-book1' || id === 'tres-amigos-hardcover') {
        const gap = Number(edition.design.paragraphGap);
        const policy = edition.design.bodyBlankPolicy;
        const legacyGap = !Number.isFinite(gap) || Math.abs(gap) < 0.0001 || Math.abs(gap - 0.333) < 0.0001;
        const legacyPolicy = !policy || policy === 'normalize' || policy === 'collapse';
        if (legacyGap && legacyPolicy) {
          edition.design.paragraphGap = 0.12;
          edition.design.bodyBlankPolicy = 'collapse';
          edition.design.bodyBlankSpace = 0.12;
        }
      }
    };
    applyPrintRhythm(project.editions?.paperback);
    applyPrintRhythm(project.editions?.hardcover);
    if (project.editions?.ebook?.design) {
      const ebook = project.editions.ebook.design;
      const gap = Number(ebook.paragraphGapEm);
      const legacyGap = !Number.isFinite(gap) || Math.abs(gap) < 0.0001;
      const legacyPolicy = !ebook.bodyBlankPolicy || ebook.bodyBlankPolicy === 'normalize' || ebook.bodyBlankPolicy === 'collapse';
      if (legacyGap && legacyPolicy) {
        ebook.paragraphGapEm = 0.7;
        ebook.bodyBlankPolicy = 'collapse';
        ebook.bodyBlankSpaceEm = 0.7;
      }
    }
    if (project.editions?.activePrint && project.editions[project.editions.activePrint]?.design) {
      project.design.print = { ...project.editions[project.editions.activePrint].design };
    }
    if (project.editions?.ebook?.design) project.design.ebook = { ...project.editions.ebook.design };
  }

  // 1.0.5 invalidates pre-release proof state because proofs now carry an
  // edition/design/source signature. Old page counts could otherwise look current
  // after a migration even though they were built by an older renderer.
  if (oldVersion < 15) {
    invalidateAllEditionProofs(project);
  }

  // 1.0.6 focuses the ebook pipeline: visible in-book TOC, multi-store
  // navigation defaults, and clean front-matter reflow. No manuscript block is changed.
  if (oldVersion < 16) {
    ensureEditions(project);
    const ebook = project.editions?.ebook?.design;
    if (ebook) {
      if (ebook.visibleToc == null) ebook.visibleToc = true;
      if (!ebook.tocScope) ebook.tocScope = 'chapters';
      if (!ebook.frontMatterMode) ebook.frontMatterMode = 'clean';
      project.design.ebook = { ...ebook };
    }
    if (project.editions?.ebook) project.editions.ebook.lastPreflight = null;
  }

  ensurePrintDesign(project);
  ensureEbookDesign(project);
  ensureEditions(project);

  // 1.0.7 narrows the ebook workspace to Amazon KDP/Kindle. It keeps the
  // same EPUB source model, but restores reader-controlled body defaults and
  // removes multi-store-specific presentation state. Manuscript blocks stay untouched.
  if (oldVersion < 17) {
    ensureEditions(project);
    const ebook = project.editions?.ebook?.design;
    if (ebook) {
      ebook.fontFamily = 'reader';
      ebook.bodyAlignment = 'reader';
      ebook.visibleToc = true;
      ebook.tocScope = 'chapters';
      ebook.frontMatterMode = 'clean';
      project.design.ebook = { ...ebook };
    }
    if (project.editions?.ebook) project.editions.ebook.lastPreflight = null;
  }

  // 1.0.8 adds Preview Studio presentation overrides. These are edition-scoped
  // layout metadata only; they never contain or replace manuscript wording.
  if (oldVersion < 18) {
    ensurePresentationOverrides(project);
    if (project.editions?.ebook) project.editions.ebook.lastPreflight = null;
  }

  // 1.0.9 rebuilds the Kindle preview interaction layer around explicit Read
  // and Adjust modes. The simulator is UI-only; migration touches no source
  // blocks or wording. We invalidate only stale ebook preflight status so the
  // next acceptance run is always fresh.
  if (oldVersion < 30 && !alreadyCurrent && priorAppVersion !== '1.0.28' && priorAppVersion !== '1.0.19') {
    ensurePresentationOverrides(project);
    if (project.editions?.ebook) project.editions.ebook.lastPreflight = null;
  }

  // 1.0.10 hardens the Kindle-first workflow: front matter is reflowed using
  // ebook-specific presentation rules, finished EPUB output is audited, and
  // Preview Studio gains live layout history. Migration never rewrites source
  // blocks; it only invalidates stale ebook readiness so the new exporter is
  // checked against the real manuscript on the next pass.
  if (oldVersion < 20) {
    ensurePresentationOverrides(project);
    if (project.editions?.ebook) project.editions.ebook.lastPreflight = null;
  }

  ensureEbookDesign(project);
  ensureEditions(project);
  ensurePresentationOverrides(project);

  // 1.0.12 adds Kindle semantic styles plus safe note/media import for new
  // DOCX projects. Existing projects remain on their original canonical
  // algorithm and hashes; migration never rewrites source blocks or assets.
  if (oldVersion < 30 && !alreadyCurrent && priorAppVersion !== '1.0.28' && priorAppVersion !== '1.0.21') {
    if (!Array.isArray(project.manuscript?.notes)) project.manuscript.notes = [];
    if (!Array.isArray(project.manuscript?.media)) project.manuscript.media = [];
    if (project.editions?.ebook) project.editions.ebook.lastPreflight = null;
  }


  // 1.0.13 adds Kindle Intelligence: whole-book presentation fingerprints,
  // chapter comparison, anomaly mapping, and safe presentation-only fixes.
  // Migration changes no manuscript blocks, wording, notes, or embedded assets.
  if (oldVersion < 30 && !alreadyCurrent && priorAppVersion !== '1.0.28' && priorAppVersion !== '1.0.22') {
    ensurePresentationOverrides(project);
    if (project.editions?.ebook) project.editions.ebook.lastPreflight = null;
  }

  // 1.0.14 adds the Kindle Production Console, polish queue, intentional-review
  // acknowledgements, and productivity shortcuts. Review decisions are edition
  // presentation metadata only; migration never changes manuscript source data.
  if (oldVersion < 23) {
    ensureEditions(project);
    if (project.editions?.ebook) {
      if (!project.editions.ebook.reviewDecisions || typeof project.editions.ebook.reviewDecisions !== 'object') project.editions.ebook.reviewDecisions = {};
      project.editions.ebook.lastPreflight = null;
    }
  }

  // 1.0.15 adds Theme Studio on top of the 1.0.14 production workflow. The
  // new theme, source-style mapping, artwork, and chapter-override state live
  // entirely inside ebook presentation metadata. Story-Locked manuscript
  // blocks, notes, media, canonical hashes, and source order are untouched.
  if (oldVersion < 24) {
    ensureEbookDesign(project);
    ensureEditions(project);
    if (project.editions?.ebook) project.editions.ebook.lastPreflight = null;
  }

  // 1.0.16 adds the Kindle Release Gate: batch-safe presentation cleanup,
  // accessibility audit, manual visual-proof stamps, release reports, and an
  // invalidating Kindle freeze token. All state remains edition metadata; the
  // Story-Locked manuscript and canonical source hashes are never rewritten.
  if (oldVersion < 25) {
    ensureEditions(project);
    if (project.editions?.ebook) {
      if (!project.editions.ebook.releaseGate || typeof project.editions.ebook.releaseGate !== 'object') {
        project.editions.ebook.releaseGate = { version: 1, visualProof: null, freeze: null, safeFixRuns: [], reviewRuns: [] };
      }
      project.editions.ebook.lastPreflight = null;
    }
  }

  // 1.0.17 is a simplification-only UX release. It deliberately adds no new
  // project schema and does not alter manuscript or edition metadata.
  // 1.0.18 adds source-safe chapter-heading interpretation in Theme Studio.
  // Upgrade only untouched legacy Tres Amigos spacing. If an author had already
  // customized chapter spacing, keep it exactly as-is. Manuscript blocks are never touched.
  if (oldVersion < 30 && !alreadyCurrent && priorAppVersion !== '1.0.28' && priorAppVersion !== '1.0.18' && !pre118HadChapterLayout) {
    ensureEditions(project);
    const ebook = project.editions?.ebook?.design;
    if (ebook) {
      const studio = ebook.themeStudio || {};
      if (studio.themeId === 'tres-amigos-private') {
        studio.chapterHeadingLayout = 'number-title';
        if (!Number.isFinite(pre118ChapterTop) || Math.abs(pre118ChapterTop - 4.2) < 0.001) ebook.chapterTopEm = 6.2;
        if (!Number.isFinite(pre118ChapterAfter) || Math.abs(pre118ChapterAfter - 2.4) < 0.001) ebook.chapterAfterEm = 5.4;
        ebook.themeStudio = studio;
        project.design.ebook = { ...ebook };
        project.editions.ebook.lastPreflight = null;
      }
    }
  }
  // 1.0.19 tunes the private Tres Amigos Kindle opening against the real Book 1
  // Kindle rhythm. Only the untouched 1.0.18 Tres Amigos spacing pair migrates;
  // any author-customized spacing remains exactly as saved. This is presentation
  // metadata only and never changes the Story-Locked chapter heading or prose.
  if (oldVersion < 30 && !alreadyCurrent && priorAppVersion !== '1.0.28' && priorAppVersion !== '1.0.19') {
    ensureEditions(project);
    const ebook = project.editions?.ebook?.design;
    if (ebook) {
      const studio = ebook.themeStudio || {};
      const top = Number(ebook.chapterTopEm);
      const after = Number(ebook.chapterAfterEm);
      const untouched118TresAmigos = studio.themeId === 'tres-amigos-private'
        && studio.chapterHeadingLayout === 'number-title'
        && Math.abs(top - 6.2) < 0.001
        && Math.abs(after - 5.4) < 0.001;
      if (untouched118TresAmigos) {
        ebook.chapterTopEm = 8.0;
        ebook.chapterAfterEm = 5.5;
        project.design.ebook = { ...ebook };
        project.editions.ebook.lastPreflight = null;
      }
    }
  }


  // 1.0.21 removes the stale legacy chapter flourish from the private Tres Amigos
  // house style. Other themes keep their ornaments. This changes presentation
  // metadata only; Story Lock manuscript text and hashes are untouched.
  if (oldVersion < 30 && !alreadyCurrent && priorAppVersion !== '1.0.28' && priorAppVersion !== '1.0.21') {
    ensureEditions(project);
    const ebook = project.editions?.ebook?.design;
    if (ebook) {
      const studio = ebook.themeStudio || {};
      if (studio.themeId === 'tres-amigos-private' && studio.chapterDivider === 'flourish') {
        studio.chapterDivider = 'none';
        ebook.themeStudio = studio;
        project.design.ebook = { ...ebook };
        project.editions.ebook.lastPreflight = null;
      }
    }
  }

  // 1.0.22 gives the private Tres Amigos Kindle theme semantic Book 1-style
  // front-matter presentation for title, copyright, and dedication pages.
  // Because the EPUB renderer changes, prior ebook preflight/proof/freeze state
  // must be rechecked. Canonical manuscript blocks, words, runs, and hashes are untouched.
  if (oldVersion < 30 && !alreadyCurrent && priorAppVersion !== '1.0.28' && priorAppVersion !== '1.0.22') {
    ensureEditions(project);
    if (project.editions?.ebook) {
      project.editions.ebook.lastPreflight = null;
      if (project.editions.ebook.releaseGate && typeof project.editions.ebook.releaseGate === 'object') {
        project.editions.ebook.releaseGate.visualProof = null;
        project.editions.ebook.releaseGate.freeze = null;
      }
    }
  }

  // 1.0.23 introduced the format-first workflow. Existing projects keep their
  // edition selections exactly as saved; newly imported projects begin with no
  // assumed output so the author explicitly chooses Kindle/print after upload.
  // 1.0.24 hardens Book 1-style title/copyright rendering across reading apps.
  // Publisher metadata may be displayed when the source title page omits it, and
  // copyright spacing is compacted. Stored source text/order/hash remain exact.

  // 1.0.25 adds Book Brain: a Story-Lock-safe semantic interpretation layer.
  // Existing projects are analyzed once on migration so a previously imported
  // manuscript gains automatic page/block understanding without a re-import.
  if (oldVersion < 26 || !project.bookBrain) {
    applyBookBrain(project);
    if (project.editions?.ebook) {
      project.editions.ebook.lastPreflight = null;
      if (project.editions.ebook.releaseGate && typeof project.editions.ebook.releaseGate === 'object') {
        project.editions.ebook.releaseGate.visualProof = null;
        project.editions.ebook.releaseGate.freeze = null;
      }
    }
  }
  // 1.0.27 Amazon Hard Mode invalidates prior Kindle proof/freeze state because
  // production CSS/package validation is stricter and external Previewer/KDP gates
  // are now tracked separately. Manuscript source, wording, media and hashes remain untouched.
  if (oldVersion < 30 && !alreadyCurrent && priorAppVersion !== '1.0.28' && (oldVersion < 27 || priorAppVersion !== '1.0.27')) {
    ensureEditions(project);
    if (project.editions?.ebook) {
      project.editions.ebook.lastPreflight = null;
      const gate = project.editions.ebook.releaseGate;
      if (gate && typeof gate === 'object') {
        gate.visualProof = null;
        gate.freeze = null;
        gate.external = gate.external && typeof gate.external === 'object' ? gate.external : {};
        gate.external.kindlePreviewerOpened = false;
        gate.external.enhancedTypesetting = false;
        gate.external.kdpOnlinePreviewApproved = false;
      }
    }
  }


  // 1.0.28 repairs Book Brain's chapter boundary logic so fuzzy Heading 1
  // candidates cannot become chapters in known front/back matter. Reanalyze
  // existing projects to clear stale inferredKinds while preserving explicit
  // review decisions and every Story-Locked source byte.
  if (oldVersion < 30 && !alreadyCurrent && (oldVersion < 28 || priorAppVersion !== '1.0.28')) {
    if (project.bookBrain) reanalyzeBookBrain(project);
    ensureEditions(project);
    if (project.editions?.ebook) project.editions.ebook.lastPreflight = null;
  }

  // 1.0.29 replaces browser Print → Save as PDF with YasReady's own
  // 300-DPI production renderer. Old remembered print-PDF audits are stale
  // because they were not generated by Print PDF Hard Mode.
  if (oldVersion < 30 && !alreadyCurrent && (oldVersion < 29 || priorAppVersion !== '1.0.29')) {
    ensureEditions(project);
    if (project.editions?.paperback) project.editions.paperback.lastPdfAudit = null;
    if (project.editions?.hardcover) project.editions.hardcover.lastPdfAudit = null;
  }



  // 1.0.30 removes all display:none content/CSS from the publishable Kindle
  // package after a real Kindle Previewer E21018 conversion log traced the
  // failure into front-001.xhtml. It also adds Cover Brain state for print
  // editions. No manuscript text or Story Lock canonical data changes.
  if (oldVersion < 30) {
    ensureEditions(project);
    if (project.editions?.ebook) {
      project.editions.ebook.lastPreflight = null;
      const gate = project.editions.ebook.releaseGate;
      if (gate?.external) {
        gate.external.kindlePreviewerOpened = false;
        gate.external.enhancedTypesetting = false;
        gate.external.kdpOnlinePreviewApproved = false;
      }
      if (gate) { gate.visualProof = null; gate.freeze = null; }
    }
    if (project.editions?.paperback) project.editions.paperback.lastCoverAudit = null;
    if (project.editions?.hardcover) project.editions.hardcover.lastCoverAudit = null;
  }

  // 1.0.31 adds Amazon Print Gate state for paperback/hardcover. Existing
  // production PDFs/covers remain available, but external Amazon confirmations
  // are always token-bound to the exact current package. Story Lock is unchanged.
  if (oldVersion < 31 || priorAppVersion !== '1.0.31') {
    ensureEditions(project);
  }

  // 1.0.32 makes trailing back matter content-aware, removes stale inferred
  // chapter starts such as BOOK TWO on an author-bio page, and hardens the
  // Kindle package sanitizer. Reanalyze semantics only; source bytes stay exact.
  if (oldVersion < 32) {
    reanalyzeBookBrain(project);
    ensureEditions(project);
    if (project.editions?.ebook) {
      project.editions.ebook.lastPreflight = null;
      const gate = project.editions.ebook.releaseGate;
      if (gate && typeof gate === 'object') {
        gate.visualProof = null;
        gate.freeze = null;
        gate.external = gate.external && typeof gate.external === 'object' ? gate.external : {};
        gate.external.kindlePreviewerOpened = false;
        gate.external.enhancedTypesetting = false;
        gate.external.kdpOnlinePreviewApproved = false;
      }
    }
  }

  // 1.0.33 makes print front matter semantic instead of letting title, legal,
  // and dedication copy flow as one continuous paragraph stream. It also moves
  // the print-cover decision into Print Brain and supports an attached full-wrap
  // KDP cover PDF whose canvas is re-certified against the final page count.
  // The renderer changed, so every prior print proof/PDF/cover token is stale.
  if (oldVersion < 33) {
    ensureEditions(project);
    for (const type of ['paperback','hardcover']) {
      const edition = project.editions?.[type];
      if (!edition) continue;
      edition.lastPageCount = null;
      edition.lastBuiltAt = null;
      edition.lastPreflight = null;
      edition.lastPdfAudit = null;
      edition.lastCoverAudit = null;
      const priorCover = priorPrintCoverChoice[type] || {};
      if (!priorCover.explicit) edition.coverMode = priorCover.hasUpload ? 'upload-pdf' : 'choose';
      if (edition.printGate && typeof edition.printGate === 'object') {
        edition.printGate.visualProof = null;
        edition.printGate.freeze = null;
        edition.printGate.external = {};
      }
    }
  }


  // 1.0.34 adds Barcode Brain at the only safe point in a print workflow:
  // after story pagination rules are known but before final interior/cover files
  // are certified. The optional interior ISBN page becomes part of physical
  // pagination, so it can change final page count/spine geometry. Existing print
  // proofs are invalidated; Kindle proof/release state is deliberately untouched.
  if (oldVersion < 34) {
    ensureEditions(project);
    for (const type of ['paperback','hardcover']) {
      const edition = project.editions?.[type];
      if (!edition) continue;
      const hadBarcodeBrain = Boolean(edition.barcodeBrain && typeof edition.barcodeBrain === 'object');
      const ownKnownIsbn = edition.kdpMetadata?.isbnMode === 'own' && Boolean(edition.kdpMetadata?.isbn);
      edition.barcodeBrain = normalizeBarcodeBrain(hadBarcodeBrain ? edition.barcodeBrain : {
        enabled:ownKnownIsbn,
        includeInterior:ownKnownIsbn,
        coverPlacement:ownKnownIsbn ? 'yasready' : 'amazon',
      });
      const detected = detectLabeledPrintIsbn(project, type);
      if (detected && !edition.kdpMetadata?.isbn) {
        edition.barcodeBrain.detectedIsbn = detected.isbn;
        edition.barcodeBrain.detectedIsbnBlockId = detected.blockId || null;
        // A labeled physical-edition ISBN in the Story-Locked copyright matter is
        // enough to prime the one-click Book 1 workflow, but it remains visible
        // for author confirmation in Print Brain before export.
        edition.barcodeBrain.enabled = true;
        edition.barcodeBrain.includeInterior = true;
        edition.barcodeBrain.coverPlacement = 'yasready';
      }
      edition.lastPageCount = null;
      edition.lastBuiltAt = null;
      edition.lastPreflight = null;
      edition.lastPdfAudit = null;
      edition.lastCoverAudit = null;
      if (edition.printGate && typeof edition.printGate === 'object') {
        edition.printGate.visualProof = null;
        edition.printGate.freeze = null;
        edition.printGate.external = {};
      }
    }
  }

  // 1.0.35 hardens the finished paperback package against Amazon's current
  // print requirements. Cover-barcode knockout geometry and the external gate
  // changed, so print PDF/cover/Previewer proof is stale. Kindle release proof
  // remains completely independent and is restored below.
  if (oldVersion < 35) {
    ensureEditions(project);
    for (const type of ['paperback','hardcover']) {
      const edition = project.editions?.[type];
      if (!edition) continue;
      edition.lastPageCount = null;
      edition.lastBuiltAt = null;
      edition.lastPreflight = null;
      edition.lastPdfAudit = null;
      edition.lastCoverAudit = null;
      if (edition.printGate && typeof edition.printGate === 'object') {
        edition.printGate.visualProof = null;
        edition.printGate.freeze = null;
        // KDP Print Previewer must be reconfirmed against the newly hardened
        // package. Physical proof is intentionally not a YasReady gate.
        edition.printGate.external = { kdpPrintPreviewApproved:false };
      }
    }
  }


  // 1.0.36 separates a finished visual wrap (JPG/PNG) from a production-ready
  // KDP PDF, fixes print back-matter page typography, and adds persistent
  // four-step workflow navigation. The print renderer/cover manufacture path
  // changed, so prior print proof/PDF/cover tokens are stale. Kindle proof is
  // preserved because the ebook renderer and package are unchanged.
  if (oldVersion < 36) {
    ensureEditions(project);
    for (const type of ['paperback','hardcover']) {
      const edition = project.editions?.[type];
      if (!edition) continue;
      edition.lastPageCount = null;
      edition.lastBuiltAt = null;
      edition.lastPreflight = null;
      edition.lastPdfAudit = null;
      edition.lastCoverAudit = null;
      if (edition.printGate && typeof edition.printGate === 'object') {
        edition.printGate.visualProof = null;
        edition.printGate.freeze = null;
        edition.printGate.external = { kdpPrintPreviewApproved:false };
      }
    }
  }


  // 1.0.37 removes visible internal seams from stale-spine artwork adaptation
  // and preserves hard source line breaks in print back-matter preview. Because
  // the cover manufacture algorithm changed, all remembered print package proof
  // is stale. Kindle release proof and Story-Locked manuscript data are untouched.
  if (oldVersion < 37) {
    ensureEditions(project);
    for (const type of ['paperback','hardcover']) {
      const edition = project.editions?.[type];
      if (!edition) continue;
      edition.lastPageCount = null;
      edition.lastBuiltAt = null;
      edition.lastPreflight = null;
      edition.lastPdfAudit = null;
      edition.lastCoverAudit = null;
      if (edition.printGate && typeof edition.printGate === 'object') {
        edition.printGate.visualProof = null;
        edition.printGate.freeze = null;
        edition.printGate.external = { kdpPrintPreviewApproved:false };
      }
    }
  }


  // 1.0.38 Print Fidelity Recovery.
  //
  // v1.0.37 proved PDF container geometry but did not prove that semantic
  // front-matter content actually painted into the raster pages. It also used a
  // false Story-Lock preflight value while deciding whether the final cover
  // could be manufactured. Preserve manuscript, styles, page-count knowledge,
  // cover artwork, ISBN metadata and Kindle release state; invalidate only the
  // physical production files/proof that must be regenerated by the corrected
  // renderer.
  if (isAppVersionBefore(priorAppVersion, '1.0.38')) {
    ensureEditions(project);
    for (const type of ['paperback','hardcover']) {
      const edition = project.editions?.[type];
      if (!edition) continue;

      edition.lastPreflight = null;
      edition.lastPdfAudit = null;
      edition.lastCoverAudit = null;

      if (edition.printGate && typeof edition.printGate === 'object') {
        edition.printGate.visualProof = null;
        edition.printGate.freeze = null;
        edition.printGate.external = { kdpPrintPreviewApproved:false };
      }
    }
  }


  // 1.0.39 Print Polish + Barcode Recovery.
  if (isAppVersionBefore(priorAppVersion, '1.0.39')) {
    ensureEditions(project);
    for (const type of ['paperback','hardcover']) {
      const edition=project.editions?.[type];
      if (!edition) continue;

      primeDetectedPhysicalIsbn(project,type);

      edition.lastPageCount=null;
      edition.lastBuiltAt=null;
      edition.lastPreflight=null;
      edition.lastPdfAudit=null;
      edition.lastCoverAudit=null;

      if (edition.printGate && typeof edition.printGate === 'object') {
        edition.printGate.visualProof=null;
        edition.printGate.freeze=null;
        edition.printGate.external={ kdpPrintPreviewApproved:false };
      }
    }
  }

  // 1.0.40 Production Print Unblock.
  // The renderer changed, not pagination. Preserve page count/spine, ISBN,
  // barcode state, cover art and Kindle; reset physical renderer proof ONCE.
  if (isAppVersionBefore(priorAppVersion, '1.0.40')) {
    ensureEditions(project);
    for (const type of ['paperback','hardcover']) {
      const edition=project.editions?.[type];
      if (!edition) continue;
      edition.lastPreflight=null;
      edition.lastPdfAudit=null;
      edition.lastCoverAudit=null;
      if (edition.printGate && typeof edition.printGate === 'object') {
        edition.printGate.visualProof=null;
        edition.printGate.freeze=null;
        edition.printGate.external={ kdpPrintPreviewApproved:false };
      }
    }
  }

  // 1.0.41 Artwork Lock Cover Engine v10 — COVER ONLY.
  if (isAppVersionBefore(priorAppVersion, '1.0.41')) {
    ensureEditions(project);
    for (const type of ['paperback','hardcover']) {
      const edition=project.editions?.[type]; if(!edition) continue;
      edition.lastCoverAudit=null;
      if(edition.printGate&&typeof edition.printGate==='object'){edition.printGate.visualProof=null;edition.printGate.freeze=null;edition.printGate.external={kdpPrintPreviewApproved:false};}
    }
  }

  if (priorEbookReleaseGateFor134 && project.editions?.ebook) {
    project.editions.ebook.releaseGate = priorEbookReleaseGateFor134;
  }
  project.version = Math.max(oldVersion, 37);
  project.appVersion = '1.0.41';
  return project;
}

function storyLockDataUrlBytes(dataUrl = '') {
  const match = String(dataUrl).match(/^data:[^;,]+;base64,(.+)$/s);
  if (!match) return null;
  try {
    const binary = globalThis.atob ? globalThis.atob(match[1]) : Buffer.from(match[1], 'base64').toString('binary');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export async function verifyProjectStoryLock(project) {
  const canonicalVersion = Number(project?.storyLock?.canonicalVersion || 1);
  const mediaMismatches = [];
  if (canonicalVersion >= 2) {
    for (const asset of project?.manuscript?.media || []) {
      const bytes = storyLockDataUrlBytes(asset?.dataUrl || '');
      if (!bytes) {
        mediaMismatches.push({ id: asset?.id || null, reason: 'unreadable-data' });
        continue;
      }
      const actualMediaHash = await sha256Hex(bytes);
      if (actualMediaHash !== String(asset?.sha256 || '')) {
        mediaMismatches.push({ id: asset?.id || null, expected: asset?.sha256 || '', actual: actualMediaHash, reason: 'hash-mismatch' });
      }
    }
  }
  const canonicalText = canonicalVersion >= 2
    ? canonicalizeManuscriptV2(project?.manuscript?.blocks || [], project?.manuscript?.notes || [], project?.manuscript?.media || [])
    : (project?.manuscript?.blocks || []).map((block) => block.text).join('\u2029');
  const currentHash = await sha256Hex(canonicalText);
  return {
    ok: currentHash === project.source.manuscriptHash && mediaMismatches.length === 0,
    expected: project.source.manuscriptHash,
    actual: currentHash,
    mediaMismatches,
  };
}
