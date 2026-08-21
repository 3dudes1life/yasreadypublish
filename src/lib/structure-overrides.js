import { countWords, detectChapters } from './manuscript-rules.js';

export const STRUCTURE_OVERRIDE_KINDS = Object.freeze([
  'chapter-title',
  'body',
  'scene-break',
  'text-message',
  'front-back-heading',
  'heading',
  'blank',
]);

export function normalizeStructureOverrides(input = {}) {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [blockId, rawKind] of Object.entries(input)) {
    const kind = String(rawKind || '').trim();
    if (blockId && STRUCTURE_OVERRIDE_KINDS.includes(kind)) out[blockId] = kind;
  }
  return out;
}

export function ensureStructureOverrides(project) {
  if (!project) return project;
  project.structureOverrides = normalizeStructureOverrides(project.structureOverrides);
  return project;
}

export function effectiveBlocks(project) {
  const source = project?.manuscript?.blocks || [];
  const overrides = normalizeStructureOverrides(project?.structureOverrides);
  let previousNonEmpty = null;
  return source.map((block) => {
    const overrideKind = overrides[block.id] || null;
    let kind = overrideKind || block.kind;
    // A manually identified chapter title still gets a non-indented opening paragraph.
    // This is derived presentation structure only; source text is untouched.
    if (!overrideKind && kind === 'body' && previousNonEmpty?.kind === 'chapter-title') kind = 'chapter-opening';
    const copy = {
      ...block,
      kind,
      sourceKind: block.kind,
      structureOverride: overrideKind,
    };
    if (kind !== 'blank') previousNonEmpty = copy;
    return copy;
  });
}

export function effectiveChapters(project) {
  return detectChapters(effectiveBlocks(project));
}

export function effectiveStats(project) {
  const blocks = effectiveBlocks(project);
  const chapters = detectChapters(blocks);
  return {
    paragraphs: blocks.length,
    nonEmptyParagraphs: blocks.filter((block) => block.kind !== 'blank').length,
    words: blocks.reduce((sum, block) => sum + countWords(block.text), 0),
    characters: blocks.reduce((sum, block) => sum + block.text.length, 0),
    chapters: chapters.length,
    textMessages: blocks.filter((block) => block.kind === 'text-message').length,
    sceneBreaks: blocks.filter((block) => block.kind === 'scene-break').length,
    structureOverrides: Object.keys(normalizeStructureOverrides(project?.structureOverrides)).length,
  };
}

export function setStructureOverride(project, blockId, kind = null) {
  ensureStructureOverrides(project);
  if (!project?.manuscript?.blocks?.some((block) => block.id === blockId)) throw new Error('Unknown manuscript paragraph.');
  if (kind == null || kind === '' || kind === 'source') {
    delete project.structureOverrides[blockId];
    return project;
  }
  if (!STRUCTURE_OVERRIDE_KINDS.includes(kind)) throw new Error(`Unsupported structure kind: ${kind}`);
  project.structureOverrides[blockId] = kind;
  return project;
}

export function structureOverrideSummary(project) {
  const overrides = normalizeStructureOverrides(project?.structureOverrides);
  const blocksById = new Map((project?.manuscript?.blocks || []).map((block) => [block.id, block]));
  return Object.entries(overrides).map(([blockId, kind]) => ({
    blockId,
    kind,
    sourceKind: blocksById.get(blockId)?.kind || null,
    text: blocksById.get(blockId)?.text || '',
  }));
}
