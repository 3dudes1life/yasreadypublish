import { sha256Hex } from './hash.js';
import { DEFAULT_PRINT_DESIGN, ensurePrintDesign } from './print-model.js';
import { DEFAULT_EBOOK_DESIGN, ensureEbookDesign } from './ebook-model.js';
import { ensureStructureOverrides } from './structure-overrides.js';

export async function createProjectFromImport({ file, arrayBuffer, parsed }) {
  const [sourceFileHash, manuscriptHash] = await Promise.all([
    sha256Hex(arrayBuffer),
    sha256Hex(parsed.canonicalText),
  ]);

  const now = new Date().toISOString();
  const baseName = file.name.replace(/\.docx$/i, '');

  return {
    id: crypto.randomUUID(),
    version: 12,
    appVersion: '1.0.2',
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
}

export function migrateProject(project) {
  if (!project) return project;
  const oldVersion = Number(project.version) || 1;
  ensurePrintDesign(project);
  ensureEbookDesign(project);
  ensureStructureOverrides(project);
  // Existing projects retain user-set geometry. New projects receive the calibrated template.
  if (oldVersion < 2 && !project.design?.print?.templateId) project.design.print = { ...DEFAULT_PRINT_DESIGN };
  // 1.0.1 fixes two Book 1 calibration mistakes without changing manuscript content:
  // the old 0.333in paragraph gap was far too large, and generated Contents must begin on a left page.
  if (oldVersion < 11 && project.design?.print?.templateId === 'tres-amigos-book1') {
    if (Math.abs(Number(project.design.print.paragraphGap) - 0.333) < 0.0001) project.design.print.paragraphGap = 0;
    if (!project.design.print.tocStartSide) project.design.print.tocStartSide = 'left';
  }
  // 1.0.2 adds a presentation-only rule that collapses accidental empty DOCX paragraphs inside chapter bodies.
  // Empty source blocks remain in the locked manuscript and coverage checks; only their rendered height becomes zero.
  if (oldVersion < 12) {
    if (project.design?.print?.collapseBodyBlankParagraphs == null) project.design.print.collapseBodyBlankParagraphs = true;
    if (project.design?.ebook?.collapseBodyBlankParagraphs == null) project.design.ebook.collapseBodyBlankParagraphs = true;
  }
  project.version = Math.max(oldVersion, 12);
  project.appVersion = '1.0.2';
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
