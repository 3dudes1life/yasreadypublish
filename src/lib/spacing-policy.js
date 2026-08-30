/**
 * Presentation-only blank-paragraph policy.
 * Source blank paragraphs remain in Story Lock and source coverage. This module
 * only decides their visual height. In Normalize mode one run of one-or-more
 * empty body paragraphs becomes one standard spacer; extra blanks collapse.
 */
const BODY_CONTENT_KINDS = new Set(['body', 'chapter-opening', 'text-message']);

export function normalizeBlankPolicy(value, legacyCollapse = null) {
  if (['normalize', 'preserve', 'collapse'].includes(value)) return value;
  if (legacyCollapse === true) return 'normalize';
  if (legacyCollapse === false) return 'preserve';
  return 'normalize';
}

export function blankRenderMode({ blocks = [], index = -1, sectionType, policy = 'normalize' } = {}) {
  const block = blocks[index];
  if (!block || block.kind !== 'blank') return 'not-blank';
  if (sectionType !== 'body' && sectionType !== 'chapter') return 'preserve';
  const mode = normalizeBlankPolicy(policy);
  if (mode === 'preserve') return 'preserve';

  // Only the first blank in a consecutive run may render a spacer.
  // Extra source blanks still collapse so a message transcript cannot balloon.
  if (blocks[index - 1]?.kind === 'blank') return 'collapse';

  let nextIndex = index + 1;
  while (blocks[nextIndex]?.kind === 'blank') nextIndex += 1;
  const previous = blocks[index - 1];
  const next = blocks[nextIndex];

  // v1.0.46 SOURCE FIDELITY:
  // A real blank paragraph touching a text-message block is structural evidence,
  // not generic manuscript whitespace. Preserve one visual spacer even when the
  // house fiction theme normally collapses body blanks.
  const structuredMessageBoundary = previous?.kind === 'text-message' || next?.kind === 'text-message';
  if (structuredMessageBoundary && BODY_CONTENT_KINDS.has(previous?.kind) && BODY_CONTENT_KINDS.has(next?.kind)) {
    return 'normalize';
  }

  if (mode === 'collapse') return 'collapse';

  // Normalize only between real body-content paragraphs. Chapter-title/scene-break
  // spacing already has dedicated design controls and should not be doubled.
  if (BODY_CONTENT_KINDS.has(previous?.kind) && BODY_CONTENT_KINDS.has(next?.kind)) return 'normalize';
  return 'collapse';
}

export function shouldCollapseSourceBlank(args = {}) {
  return blankRenderMode({ ...args, policy: args.policy || (args.enabled === false ? 'preserve' : 'normalize') }) === 'collapse';
}
