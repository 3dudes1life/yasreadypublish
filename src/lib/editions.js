import { normalizePrintDesign } from './print-model.js';
import { normalizeEbookDesign } from './ebook-model.js';
import { normalizePrintProduction } from './print-brain.js';
import { normalizeCoverBrain } from './cover-brain.js';
import { normalizeUploadedPrintCoverPdf } from './print-cover-upload.js';
import { ensurePrintReleaseState, normalizePrintKdpMetadata } from './print-release-gate.js';
import { normalizeBarcodeBrain } from './barcode-brain.js';

export const EDITION_TYPES = Object.freeze(['paperback', 'hardcover', 'ebook']);
export const PRINT_EDITION_TYPES = Object.freeze(['paperback', 'hardcover']);

export function editionLabel(type) {
  if (type === 'hardcover') return 'Hardcover';
  if (type === 'ebook') return 'Ebook / Kindle';
  return 'Paperback';
}

function hardcoverDesignFrom(printDesign = {}) {
  return normalizePrintDesign({
    ...printDesign,
    templateId: 'tres-amigos-hardcover',
    name: 'Tres Amigos Series · Hardcover',
  });
}

export function ensureEditions(project) {
  if (!project) return project;
  project.design = project.design || {};
  const legacyPrint = normalizePrintDesign(project.design.print || {});
  const legacyEbook = normalizeEbookDesign(project.design.ebook || {});
  project.editions = project.editions || {};

  project.editions.paperback = {
    enabled: project.editions.paperback?.enabled !== false,
    type: 'paperback',
    design: normalizePrintDesign(project.editions.paperback?.design || legacyPrint),
    lastPageCount: Number(project.editions.paperback?.lastPageCount) || null,
    lastBuiltAt: project.editions.paperback?.lastBuiltAt || null,
    lastPreflight: project.editions.paperback?.lastPreflight || null,
    lastPdfAudit: project.editions.paperback?.lastPdfAudit || null,
    production: normalizePrintProduction(project.editions.paperback?.production || {}, 'paperback'),
    coverBrain: normalizeCoverBrain(project.editions.paperback?.coverBrain || {}, 'paperback'),
    coverMode: ['choose','upload-pdf','build'].includes(project.editions.paperback?.coverMode) ? project.editions.paperback.coverMode : (project.editions.paperback?.uploadedCoverPdf ? 'upload-pdf' : project.editions.paperback?.coverBrain?.configured ? 'build' : 'choose'),
    uploadedCoverPdf: normalizeUploadedPrintCoverPdf(project.editions.paperback?.uploadedCoverPdf || null),
    lastCoverAudit: project.editions.paperback?.lastCoverAudit || null,
    kdpMetadata: normalizePrintKdpMetadata(project.editions.paperback?.kdpMetadata || {}, { language:legacyEbook.language || 'en', publisher:legacyEbook.publisher || '' }),
    barcodeBrain: normalizeBarcodeBrain(project.editions.paperback?.barcodeBrain || {}),
    printGate: project.editions.paperback?.printGate && typeof project.editions.paperback.printGate === 'object' ? project.editions.paperback.printGate : null,
  };
  project.editions.hardcover = {
    enabled: Boolean(project.editions.hardcover?.enabled),
    type: 'hardcover',
    design: normalizePrintDesign(project.editions.hardcover?.design || hardcoverDesignFrom(legacyPrint)),
    lastPageCount: Number(project.editions.hardcover?.lastPageCount) || null,
    lastBuiltAt: project.editions.hardcover?.lastBuiltAt || null,
    lastPreflight: project.editions.hardcover?.lastPreflight || null,
    lastPdfAudit: project.editions.hardcover?.lastPdfAudit || null,
    production: normalizePrintProduction(project.editions.hardcover?.production || {}, 'hardcover'),
    coverBrain: normalizeCoverBrain(project.editions.hardcover?.coverBrain || {}, 'hardcover'),
    coverMode: ['choose','upload-pdf','build'].includes(project.editions.hardcover?.coverMode) ? project.editions.hardcover.coverMode : (project.editions.hardcover?.uploadedCoverPdf ? 'upload-pdf' : project.editions.hardcover?.coverBrain?.configured ? 'build' : 'choose'),
    uploadedCoverPdf: normalizeUploadedPrintCoverPdf(project.editions.hardcover?.uploadedCoverPdf || null),
    lastCoverAudit: project.editions.hardcover?.lastCoverAudit || null,
    kdpMetadata: normalizePrintKdpMetadata(project.editions.hardcover?.kdpMetadata || {}, { language:legacyEbook.language || 'en', publisher:legacyEbook.publisher || '' }),
    barcodeBrain: normalizeBarcodeBrain(project.editions.hardcover?.barcodeBrain || {}),
    printGate: project.editions.hardcover?.printGate && typeof project.editions.hardcover.printGate === 'object' ? project.editions.hardcover.printGate : null,
  };
  project.editions.ebook = {
    enabled: project.editions.ebook?.enabled !== false,
    type: 'ebook',
    design: normalizeEbookDesign(project.editions.ebook?.design || legacyEbook),
    cover: project.editions.ebook?.cover || null,
    reviewDecisions: project.editions.ebook?.reviewDecisions && typeof project.editions.ebook.reviewDecisions === 'object' ? project.editions.ebook.reviewDecisions : {},
    releaseGate: project.editions.ebook?.releaseGate && typeof project.editions.ebook.releaseGate === 'object' ? project.editions.ebook.releaseGate : null,
    lastPreflight: project.editions.ebook?.lastPreflight || null,
  };
  ensurePrintReleaseState(project, 'paperback');
  ensurePrintReleaseState(project, 'hardcover');
    project.editions.activePrint = PRINT_EDITION_TYPES.includes(project.editions.activePrint) ? project.editions.activePrint : 'paperback';
  if (!project.editions[project.editions.activePrint]?.enabled) {
    project.editions.activePrint = project.editions.paperback.enabled ? 'paperback' : project.editions.hardcover.enabled ? 'hardcover' : 'paperback';
  }

  // Legacy mirrors keep older helpers/backups compatible while edition-specific settings remain authoritative.
  project.design.print = normalizePrintDesign(project.editions[project.editions.activePrint]?.design || legacyPrint);
  project.design.ebook = normalizeEbookDesign(project.editions.ebook.design);
  return project;
}

export function enabledEditionTypes(project) {
  ensureEditions(project);
  return EDITION_TYPES.filter((type) => project.editions[type]?.enabled);
}

export function activePrintEdition(project) {
  ensureEditions(project);
  return project.editions.activePrint;
}

export function setActivePrintEdition(project, type) {
  ensureEditions(project);
  if (!PRINT_EDITION_TYPES.includes(type)) throw new Error('Unknown print edition.');
  if (!project.editions[type].enabled) throw new Error(`${editionLabel(type)} edition is not enabled.`);
  project.editions.activePrint = type;
  project.design.print = normalizePrintDesign(project.editions[type].design);
  return project;
}

export function getPrintEditionDesign(project, type = null) {
  ensureEditions(project);
  const resolved = type || project.editions.activePrint;
  return normalizePrintDesign(project.editions[resolved]?.design || project.design.print || {});
}

export function setPrintEditionDesign(project, type, design) {
  ensureEditions(project);
  const resolved = type || project.editions.activePrint;
  if (!PRINT_EDITION_TYPES.includes(resolved)) throw new Error('Unknown print edition.');
  project.editions[resolved].design = normalizePrintDesign(design);
  invalidateEditionProof(project, resolved);
  if (project.editions.activePrint === resolved) project.design.print = normalizePrintDesign(project.editions[resolved].design);
  return project.editions[resolved].design;
}

export function getEbookEditionDesign(project) {
  ensureEditions(project);
  return normalizeEbookDesign(project.editions.ebook.design);
}

export function setEbookEditionDesign(project, design) {
  ensureEditions(project);
  project.editions.ebook.design = normalizeEbookDesign(design);
  invalidateEditionProof(project, 'ebook', { clearPageCount: false });
  project.design.ebook = normalizeEbookDesign(project.editions.ebook.design);
  return project.editions.ebook.design;
}

export function setEditionEnabled(project, type, enabled) {
  ensureEditions(project);
  if (!EDITION_TYPES.includes(type)) throw new Error('Unknown edition type.');
  project.editions[type].enabled = Boolean(enabled);
  if (!enabled && type === project.editions.activePrint) {
    const fallback = PRINT_EDITION_TYPES.find((candidate) => candidate !== type && project.editions[candidate]?.enabled);
    if (fallback) setActivePrintEdition(project, fallback);
  }
  return project;
}

export function copyPaperbackDesignToHardcover(project) {
  ensureEditions(project);
  project.editions.hardcover.enabled = true;
  project.editions.hardcover.design = hardcoverDesignFrom(project.editions.paperback.design);
  invalidateEditionProof(project, 'hardcover');
  return project.editions.hardcover.design;
}


export function invalidateEditionProof(project, type, { clearPageCount = true } = {}) {
  ensureEditions(project);
  const edition = project.editions?.[type];
  if (!edition) return project;
  edition.lastPreflight = null;
  if (type !== 'ebook') { edition.lastPdfAudit = null; edition.lastCoverAudit = null; }
  if (clearPageCount && type !== 'ebook') {
    edition.lastPageCount = null;
    edition.lastBuiltAt = null;
  }
  return project;
}

export function invalidateAllEditionProofs(project, { clearPageCounts = true } = {}) {
  ensureEditions(project);
  for (const type of EDITION_TYPES) invalidateEditionProof(project, type, { clearPageCount: clearPageCounts });
  return project;
}


export function setEbookCover(project, cover) {
  ensureEditions(project);
  project.editions.ebook.cover = cover || null;
  invalidateEditionProof(project, 'ebook', { clearPageCount: false });
  return project.editions.ebook.cover;
}

export function clearEbookCover(project) {
  return setEbookCover(project, null);
}

export function getEbookCover(project) {
  ensureEditions(project);
  return project.editions.ebook.cover || null;
}
