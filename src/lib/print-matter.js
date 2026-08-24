import { buildEbookSections } from './ebook-model.js';

export const SPECIAL_PRINT_MATTER_ROLES = Object.freeze(['title', 'copyright', 'dedication', 'about-authors', 'join-journey']);

export function normalizePrintMatterText(text = '') {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function buildPrintMatterIndex(project) {
  const { sections } = buildEbookSections(project);
  const out = new Map();
  for (const section of sections) {
    if (section.type === 'chapter') continue;
    const meaningful = section.blocks.filter((block) => block.kind !== 'blank' && normalizePrintMatterText(block.text));
    const meaningfulPosition = new Map(meaningful.map((block, index) => [block.id, index]));
    for (let index = 0; index < section.blocks.length; index += 1) {
      const block = section.blocks[index];
      out.set(block.id, {
        sectionId: section.id,
        sectionType: section.type,
        role: section.role || section.type,
        sectionOrdinal: section.ordinal,
        indexInSection: index,
        meaningfulIndex: meaningfulPosition.has(block.id) ? meaningfulPosition.get(block.id) : -1,
        meaningfulCount: meaningful.length,
        sectionStart: index === 0,
        sectionEnd: index === section.blocks.length - 1,
      });
    }
  }
  return out;
}

export function printMatterPagePolicy(info) {
  if (!info || info.sectionType === 'chapter' || !info.sectionStart) return { breakBefore:false, alignRight:false };
  return {
    breakBefore:true,
    alignRight:['dedication','about-authors','join-journey'].includes(info.role),
  };
}

export function printMatterFragmentKind(info, block) {
  if (!info || !SPECIAL_PRINT_MATTER_ROLES.includes(info.role) || block?.kind === 'blank') return block?.kind || 'body';
  const text = normalizePrintMatterText(block?.text || '');
  if (info.role === 'title') {
    if (info.meaningfulIndex === 0) return 'matter-title-primary';
    if (info.meaningfulIndex === 1) return 'matter-title-secondary';
    if (info.meaningfulIndex === 2) return 'matter-title-byline';
    return 'matter-title-line';
  }
  if (info.role === 'copyright') {
    if (info.meaningfulIndex === 0 && /^(copyright|©|\(c\))/i.test(text)) return 'matter-copyright-heading';
    return 'matter-copyright-body';
  }
  if (info.role === 'dedication') {
    if (/^dedication(?:\s+page)?\b/i.test(text)) return 'matter-dedication-heading';
    return info.meaningfulIndex === 0 ? 'matter-dedication-lead' : 'matter-dedication-body';
  }
  if (info.role === 'about-authors') {
    if (/^about the author(?:s)?\b/i.test(text)) return 'matter-back-heading';
    return 'matter-back-body';
  }
  if (info.role === 'join-journey') {
    if (/^join the journey\b/i.test(text)) return 'matter-back-heading';
    return 'matter-back-body';
  }
  return block?.kind || 'body';
}

export function printMatterStyleSpec(kind, design = {}) {
  const body = Number(design.bodyFontSize) || 11;
  const specs = {
    'matter-title-primary': { fontSizePt:Math.max(17, body * 1.45), lineHeight:1.12, alignment:'center', bold:true, italic:false, paddingTopIn:2.15, paddingBottomIn:0.06 },
    'matter-title-secondary': { fontSizePt:Math.max(15, body * 1.22), lineHeight:1.12, alignment:'center', bold:false, italic:true, paddingTopIn:0, paddingBottomIn:0.34 },
    'matter-title-byline': { fontSizePt:Math.max(14, body * 1.15), lineHeight:1.12, alignment:'center', bold:true, italic:false, paddingTopIn:0, paddingBottomIn:0.06 },
    'matter-title-line': { fontSizePt:Math.max(10, body * 0.92), lineHeight:1.18, alignment:'center', bold:false, italic:false, paddingTopIn:0.05, paddingBottomIn:0 },
    'matter-copyright-heading': { fontSizePt:Math.min(10.5, body), lineHeight:1.18, alignment:'left', bold:true, italic:false, paddingTopIn:0.42, paddingBottomIn:0.34 },
    'matter-copyright-body': { fontSizePt:Math.min(10.25, body), lineHeight:1.18, alignment:'left', bold:false, italic:false, paddingTopIn:0, paddingBottomIn:0 },
    'matter-dedication-heading': { fontSizePt:Math.max(15, body * 1.28), lineHeight:1.12, alignment:'center', bold:true, italic:false, paddingTopIn:2.15, paddingBottomIn:0.28 },
    'matter-dedication-lead': { fontSizePt:Math.max(11.5, body * 0.98), lineHeight:1.18, alignment:'center', bold:false, italic:true, paddingTopIn:2.25, paddingBottomIn:0 },
    'matter-dedication-body': { fontSizePt:Math.max(11.5, body * 0.98), lineHeight:1.18, alignment:'center', bold:false, italic:true, paddingTopIn:0, paddingBottomIn:0 },
    // Book 1 convention: the back-matter heading is centered, while the prose
    // remains normally readable inside the same centered page column beneath it.
    'matter-back-heading': { fontSizePt:Math.max(15, body * 1.28), lineHeight:1.14, alignment:'center', bold:true, italic:false, paddingTopIn:1.35, paddingBottomIn:0.30 },
    'matter-back-body': { fontSizePt:body, lineHeight:1.18, alignment:'left', bold:false, italic:false, paddingTopIn:0.05, paddingBottomIn:0.08 },
  };
  return specs[kind] || null;
}

export function printMatterBlankHeightIn(info, previousInfo = null) {
  if (!info || !SPECIAL_PRINT_MATTER_ROLES.includes(info.role)) return null;
  if (previousInfo?.sectionId === info.sectionId && previousInfo?.wasBlank) return 0;
  if (info.role === 'title') return 0;
  if (info.role === 'copyright') return 0.20;
  if (info.role === 'dedication') return 0.24;
  if (info.role === 'about-authors' || info.role === 'join-journey') return 0.12;
  return 0.12;
}
