/**
 * YasReady Publish v1.0.45 — Source Fidelity spacing guard.
 * Preserves meaningful source spacing for structured one-line content without
 * altering wording, ordering, or Story Lock canonical text.
 */
export const SOURCE_SPACING_VERSION = 2;

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

export function sourceStructuredLineHeight(block, fallback = 1.2, role = '') {
  const base = Math.max(1, Number(fallback) || 1.2);
  const kind = String(block?.kind || '');
  const semantic = String(role || '');
  if (!(kind === 'text-message' || semantic === 'text-message')) return base;
  if (!String(block?.text || '').includes('\n')) return base;
  const line = finite(block?.layout?.lineTwips);
  const rule = String(block?.layout?.lineRule || '').toLowerCase();
  if (line == null || line <= 0) return base;
  // Word lineRule=auto uses 240ths of single line: 240=1x, 480=2x.
  // Only preserve source spacing that is meaningfully larger than the theme.
  const multiple = rule === 'auto' || !rule ? line / 240 : base;
  return Math.max(base, Math.min(3, multiple));
}
