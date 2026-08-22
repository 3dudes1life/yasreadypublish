/**
 * Presentation-only spacing policy.
 * Empty source paragraphs remain in Story Lock and source coverage. This helper
 * only decides whether their rendered height should be collapsed inside story chapters.
 */
export function shouldCollapseSourceBlank({ block, sectionType, enabled = true } = {}) {
  if (!enabled || block?.kind !== 'blank') return false;
  return sectionType === 'body' || sectionType === 'chapter';
}
