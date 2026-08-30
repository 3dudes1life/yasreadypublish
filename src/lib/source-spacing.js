/**
 * YasReady Publish v1.0.45 — Source Fidelity spacing guard.
 * Preserves meaningful source spacing for structured one-line content without
 * altering wording, ordering, or Story Lock canonical text.
 */
export const SOURCE_SPACING_VERSION = 1;

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function sourceAfterTwips(block) {
  return finite(block?.layout?.spaceAfterTwips);
}

export function shouldPreserveStructuredSourceSpacing(block, role = '') {
  const kind = String(block?.kind || '');
  const semantic = String(role || '');
  if (!(kind === 'text-message' || semantic === 'text-message')) return false;
  const after = sourceAfterTwips(block);
  return after != null && after >= 120;
}

export function sourceStructuredGapIn(block, fallbackIn = 0, role = '') {
  const fallback = Math.max(0, Number(fallbackIn) || 0);
  if (!shouldPreserveStructuredSourceSpacing(block, role)) return fallback;
  const inches = Math.max(0, Math.min(0.5, sourceAfterTwips(block) / 1440));
  return Math.max(fallback, inches);
}

export function sourceStructuredExtraGapIn(block, fallbackIn = 0, role = '') {
  return Math.max(0, sourceStructuredGapIn(block, fallbackIn, role) - Math.max(0, Number(fallbackIn) || 0));
}

export function sourceStructuredGapEm(block, fallbackEm = 0, role = '') {
  const fallback = Math.max(0, Number(fallbackEm) || 0);
  if (!shouldPreserveStructuredSourceSpacing(block, role)) return fallback;
  const em = Math.max(0, Math.min(3, sourceAfterTwips(block) / 240));
  return Math.max(fallback, em);
}
