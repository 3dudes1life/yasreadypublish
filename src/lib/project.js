import { sha256Hex } from './hash.js';
import { DEFAULT_PRINT_DESIGN, ensurePrintDesign } from './print-model.js';
import { DEFAULT_EBOOK_DESIGN, ensureEbookDesign } from './ebook-model.js';
import { ensureStructureOverrides } from './structure-overrides.js';
import { ensureEditions, invalidateAllEditionProofs } from './editions.js';
import { ensurePresentationOverrides } from './presentation-overrides.js';
import { canonicalizeManuscriptV2 } from './manuscript-rules.js';

export async function createProjectFromImport({ file, arrayBuffer, parsed }) {
  const [sourceFileHash, manuscriptHash] = await Promise.all([
    sha256Hex(arrayBuffer),
    sha256Hex(parsed.canonicalText),
  ]);

  const now = new Date().toISOString();
  const baseName = file.name.replace(/\.docx$/i, '');

  const project = {
    id: crypto.randomUUID(),
    version: 25,
    appVersion: '1.0.18',
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
  };
  ensureEditions(project);
  ensurePresentationOverrides(project);
  return project;
}

export function migrateProject(project) {
  if (!project) return project;
  const oldVersion = Number(project.version) || 1;
  const priorAppVersion = String(project.appVersion || '');
  const preNormalizePrintCollapse = project.design?.print?.collapseBodyBlankParagraphs;
  const preNormalizeEbookCollapse = project.design?.ebook?.collapseBodyBlankParagraphs;
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
  if (oldVersion < 19) {
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
  if (oldVersion < 21) {
    if (!Array.isArray(project.manuscript?.notes)) project.manuscript.notes = [];
    if (!Array.isArray(project.manuscript?.media)) project.manuscript.media = [];
    if (project.editions?.ebook) project.editions.ebook.lastPreflight = null;
  }


  // 1.0.13 adds Kindle Intelligence: whole-book presentation fingerprints,
  // chapter comparison, anomaly mapping, and safe presentation-only fixes.
  // Migration changes no manuscript blocks, wording, notes, or embedded assets.
  if (oldVersion < 22) {
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
  if (priorAppVersion !== '1.0.18' && !pre118HadChapterLayout) {
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
  // The renderer may visually separate "Chapter 10:" from its title, but the
  // stored source block, canonical text, ordering, and Story Lock hash remain exact.
  project.version = Math.max(oldVersion, 25);
  project.appVersion = '1.0.18';
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
