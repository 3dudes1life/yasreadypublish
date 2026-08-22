import { sha256Hex } from './hash.js';
import { DEFAULT_PRINT_DESIGN, ensurePrintDesign } from './print-model.js';
import { DEFAULT_EBOOK_DESIGN, ensureEbookDesign } from './ebook-model.js';
import { ensureStructureOverrides } from './structure-overrides.js';
import { ensureEditions } from './editions.js';

export async function createProjectFromImport({ file, arrayBuffer, parsed }) {
  const [sourceFileHash, manuscriptHash] = await Promise.all([
    sha256Hex(arrayBuffer),
    sha256Hex(parsed.canonicalText),
  ]);

  const now = new Date().toISOString();
  const baseName = file.name.replace(/\.docx$/i, '');

  const project = {
    id: crypto.randomUUID(),
    version: 14,
    appVersion: '1.0.4',
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
      canonicalVersion: 1,
      verifiedAt: now,
      status: 'verified',
    },
    structureOverrides: {},
    manuscript: {
      blocks: parsed.blocks,
      chapters: parsed.chapters,
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
  return project;
}

export function migrateProject(project) {
  if (!project) return project;
  const oldVersion = Number(project.version) || 1;
  const preNormalizePrintCollapse = project.design?.print?.collapseBodyBlankParagraphs;
  const preNormalizeEbookCollapse = project.design?.ebook?.collapseBodyBlankParagraphs;
  ensurePrintDesign(project);
  ensureEbookDesign(project);
  ensureStructureOverrides(project);

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

  ensurePrintDesign(project);
  ensureEbookDesign(project);
  ensureEditions(project);

  project.version = Math.max(oldVersion, 14);
  project.appVersion = '1.0.4';
  return project;
}

export async function verifyProjectStoryLock(project) {
  const canonicalText = project.manuscript.blocks.map((block) => block.text).join('\u2029');
  const currentHash = await sha256Hex(canonicalText);
  return {
    ok: currentHash === project.source.manuscriptHash,
    expected: project.source.manuscriptHash,
    actual: currentHash,
  };
}
