import { normalizePrintDesign } from './print-model.js';
import { normalizeEbookDesign } from './ebook-model.js';

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
  };
  project.editions.hardcover = {
    enabled: Boolean(project.editions.hardcover?.enabled),
    type: 'hardcover',
    design: normalizePrintDesign(project.editions.hardcover?.design || hardcoverDesignFrom(legacyPrint)),
    lastPageCount: Number(project.editions.hardcover?.lastPageCount) || null,
  };
  project.editions.ebook = {
    enabled: project.editions.ebook?.enabled !== false,
    type: 'ebook',
    design: normalizeEbookDesign(project.editions.ebook?.design || legacyEbook),
  };
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
  return project.editions.hardcover.design;
}
