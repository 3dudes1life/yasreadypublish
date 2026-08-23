/**
 * Presentation-only overrides. These values may alter layout in one edition,
 * but they never contain or replace manuscript wording.
 */
export const PRESENTATION_EDITIONS = Object.freeze(['ebook', 'paperback', 'hardcover']);

const ALIGNMENTS = new Set(['inherit', 'left', 'center', 'right', 'justify']);
const SEMANTIC_ROLES = new Set(['auto','body','subhead','block-quote','written-note','verse','text-message','scene-break']);

function clamp(value, min, max, fallback = null) {
  if (value === '' || value == null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function ensurePresentationOverrides(project) {
  if (!project) return project;
  project.presentationOverrides = project.presentationOverrides || {};
  for (const edition of PRESENTATION_EDITIONS) {
    if (!project.presentationOverrides[edition] || typeof project.presentationOverrides[edition] !== 'object') {
      project.presentationOverrides[edition] = {};
    }
  }
  return project;
}

export function getBlockPresentationOverride(project, edition, blockId) {
  ensurePresentationOverrides(project);
  if (!PRESENTATION_EDITIONS.includes(edition) || !blockId) return null;
  return project.presentationOverrides[edition]?.[blockId] || null;
}

export function sanitizePresentationOverride(input = {}) {
  const out = {};
  const before = clamp(input.spaceBefore, 0, 6, null);
  const after = clamp(input.spaceAfter, 0, 6, null);
  const indent = clamp(input.firstLineIndent, 0, 4, null);
  if (before != null) out.spaceBefore = before;
  if (after != null) out.spaceAfter = after;
  if (indent != null) out.firstLineIndent = indent;
  const alignment = String(input.alignment || 'inherit');
  if (ALIGNMENTS.has(alignment) && alignment !== 'inherit') out.alignment = alignment;
  if (input.suppressIndent === true) out.suppressIndent = true;
  if (input.suppressIndent === false) out.suppressIndent = false;
  const semanticRole = String(input.semanticRole || 'auto').trim();
  if (SEMANTIC_ROLES.has(semanticRole) && semanticRole !== 'auto') out.semanticRole = semanticRole;
  return out;
}

export function setBlockPresentationOverride(project, edition, blockId, patch = {}) {
  ensurePresentationOverrides(project);
  if (!PRESENTATION_EDITIONS.includes(edition)) throw new Error('Unknown presentation edition.');
  if (!blockId) throw new Error('A source block id is required.');
  const next = sanitizePresentationOverride(patch);
  if (!Object.keys(next).length) delete project.presentationOverrides[edition][blockId];
  else project.presentationOverrides[edition][blockId] = next;
  return project.presentationOverrides[edition][blockId] || null;
}

export function clearBlockPresentationOverride(project, edition, blockId) {
  ensurePresentationOverrides(project);
  if (!PRESENTATION_EDITIONS.includes(edition) || !blockId) return project;
  delete project.presentationOverrides[edition][blockId];
  return project;
}

export function countPresentationOverrides(project, edition) {
  ensurePresentationOverrides(project);
  if (!PRESENTATION_EDITIONS.includes(edition)) return 0;
  return Object.keys(project.presentationOverrides[edition] || {}).length;
}
