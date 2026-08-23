/**
 * Story-Lock-safe semantic presentation roles for reflowable ebooks.
 *
 * A semantic role changes only how a source block is presented in one edition.
 * It never replaces, edits, or reorders the source wording.
 */
export const EBOOK_SEMANTIC_ROLES = Object.freeze([
  'auto',
  'body',
  'subhead',
  'block-quote',
  'written-note',
  'verse',
  'text-message',
  'scene-break',
]);

const ROLE_SET = new Set(EBOOK_SEMANTIC_ROLES);

export const EBOOK_SEMANTIC_LABELS = Object.freeze({
  auto: 'Auto / source',
  body: 'Body paragraph',
  subhead: 'Subhead',
  'block-quote': 'Block quote',
  'written-note': 'Written note / letter',
  verse: 'Verse / poetry',
  'text-message': 'Text conversation',
  'scene-break': 'Scene break',
});

export function normalizeSemanticRole(value = 'auto') {
  const role = String(value || 'auto').trim();
  return ROLE_SET.has(role) ? role : 'auto';
}

function sourceStyleName(block) {
  return String(block?.style?.name || block?.styleName || '').trim().toLowerCase();
}

function text(block) {
  return String(block?.text || '').trim();
}

export function autoSemanticRole(block, sectionType = 'chapter') {
  if (!block) return 'body';
  if (block.kind === 'text-message') return 'text-message';
  if (block.kind === 'scene-break') return 'scene-break';
  if (sectionType !== 'chapter') return 'body';

  const style = sourceStyleName(block);
  const value = text(block);

  if (/\b(text message|sms|chat|message bubble|conversation)\b/i.test(style)) return 'text-message';
  if (/\b(block ?quote|quotation|quote)\b/i.test(style)) return 'block-quote';
  if (/\b(written note|letter|note text|correspondence|epigraph)\b/i.test(style)) return 'written-note';
  if (/\b(verse|poetry|poem|stanza)\b/i.test(style)) return 'verse';
  if (/\b(subhead|subheading|heading\s*[23]|heading two|heading three)\b/i.test(style) && value.length < 220) return 'subhead';
  if (block.kind === 'heading' && value.length < 220) return 'subhead';
  return 'body';
}

export function semanticRoleForBlock(project, block, sectionType = 'chapter') {
  const raw = project?.presentationOverrides?.ebook?.[block?.id]?.semanticRole;
  const explicit = normalizeSemanticRole(raw || 'auto');
  if (explicit !== 'auto') return explicit;

  // 1.0.15 Theme Studio can transparently remap named Word styles without
  // touching the source block, wording, or Story Lock canonical text.
  const styleName = String(block?.style?.name || block?.styleName || '').trim();
  const styleMap = project?.editions?.ebook?.design?.themeStudio?.sourceStyleMap
    || project?.design?.ebook?.themeStudio?.sourceStyleMap
    || {};
  const mapped = normalizeSemanticRole(styleMap?.[styleName] || 'auto');
  if (mapped !== 'auto') return mapped;
  return autoSemanticRole(block, sectionType);
}

export function semanticRoleCounts(project, sections = []) {
  const counts = {
    subhead: 0,
    'block-quote': 0,
    'written-note': 0,
    verse: 0,
    'text-message': 0,
    'scene-break': 0,
  };
  for (const section of sections) {
    if (section.type !== 'chapter') continue;
    for (const block of section.blocks || []) {
      if (!block || block.kind === 'blank' || block.kind === 'chapter-title') continue;
      const role = semanticRoleForBlock(project, block, section.type);
      if (role in counts) counts[role] += 1;
    }
  }
  return counts;
}

export function semanticClass(role) {
  const normalized = normalizeSemanticRole(role);
  return normalized === 'auto' ? 'body' : normalized;
}
