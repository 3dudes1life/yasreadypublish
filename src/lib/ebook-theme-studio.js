import { semanticRoleForBlock } from './semantic-styles.js';

export const EBOOK_THEME_STUDIO_VERSION = 2;
export const EBOOK_THEME_STUDIO_ROLES = Object.freeze([
  'chapter-heading',
  'first-paragraph',
  'body',
  'after-break',
  'subhead',
  'scene-break',
  'text-message',
  'written-note',
  'block-quote',
  'verse',
  'contents',
]);

export const EBOOK_THEME_STUDIO_LABELS = Object.freeze({
  'chapter-heading': 'Chapter Heading',
  'first-paragraph': 'First Paragraph',
  body: 'Body',
  'after-break': 'Paragraph After Break',
  subhead: 'Subhead',
  'scene-break': 'Scene Break',
  'text-message': 'Text Conversation',
  'written-note': 'Written Note',
  'block-quote': 'Block Quote',
  verse: 'Verse',
  contents: 'Contents',
});

const makeTheme = (id, name, description, design, studio = {}, isPrivate = false) => Object.freeze({
  id, name, description, design: Object.freeze({ ...design }), studio: Object.freeze({ ...studio }), private: isPrivate,
});

export const EBOOK_THEME_FAMILIES = Object.freeze([
  makeTheme('classic-literary', 'Classic Literary', 'Restrained serif hierarchy, elegant openings, traditional fiction rhythm.', {
    fontFamily:'serif', lineHeight:1.48, firstLineIndentEm:1.35, paragraphGapEm:0.55,
    chapterTitleAlignment:'center', chapterTopEm:4.4, chapterAfterEm:2.5,
    subheadAlignment:'left', subheadSizeEm:1.1, blockQuoteStyle:'italic', writtenNoteStyle:'plain',
    textMessageStyle:'transcript', sceneBreakTreatment:'flourish',
  }, { chapterHeadingLayout:'combined', chapterLabelSizeEm:1.35, chapterNameSizeEm:1.05, chapterNameGapEm:1.0, chapterNameItalic:false, firstParagraphTreatment:'drop-cap', chapterTitleSizeEm:1.62, chapterTitleWeight:700, chapterTitleLetterSpacingEm:0.01, chapterTitleTransform:'none', chapterDivider:'none', contentsStyle:'classic', contentsAlignment:'left' }),
  makeTheme('contemporary-romance', 'Contemporary Romance', 'Warm modern hierarchy with soft openings and clean text conversations.', {
    fontFamily:'serif', lineHeight:1.48, firstLineIndentEm:1.2, paragraphGapEm:0.62,
    chapterTitleAlignment:'center', chapterTopEm:4.0, chapterAfterEm:2.35,
    subheadAlignment:'center', subheadSizeEm:1.08, blockQuoteStyle:'plain', writtenNoteStyle:'inset',
    textMessageStyle:'bubbles', sceneBreakTreatment:'flourish',
  }, { chapterHeadingLayout:'number-title', chapterLabelSizeEm:1.38, chapterNameSizeEm:.98, chapterNameGapEm:1.1, chapterNameItalic:true, firstParagraphTreatment:'small-caps', chapterTitleSizeEm:1.65, chapterTitleWeight:700, chapterTitleLetterSpacingEm:0.055, chapterTitleTransform:'uppercase', chapterDivider:'flourish', contentsStyle:'clean', contentsAlignment:'left' }),
  makeTheme('minimal-modern', 'Minimal Modern', 'Low-decoration, high-clarity layout for fast contemporary reading.', {
    fontFamily:'sans', lineHeight:1.5, firstLineIndentEm:1.0, paragraphGapEm:0.62,
    chapterTitleAlignment:'left', chapterTopEm:3.5, chapterAfterEm:2.0,
    subheadAlignment:'left', subheadSizeEm:1.05, blockQuoteStyle:'plain', writtenNoteStyle:'plain',
    textMessageStyle:'compact', sceneBreakTreatment:'whitespace',
  }, { chapterHeadingLayout:'combined', chapterLabelSizeEm:1.25, chapterNameSizeEm:1.0, chapterNameGapEm:.9, chapterNameItalic:false, firstParagraphTreatment:'flush', chapterTitleSizeEm:1.5, chapterTitleWeight:650, chapterTitleLetterSpacingEm:0, chapterTitleTransform:'none', chapterDivider:'none', contentsStyle:'clean', contentsAlignment:'left' }),
  makeTheme('dramatic', 'Dramatic', 'Large chapter moments, stronger contrast, and bold ornamental punctuation.', {
    fontFamily:'serif', lineHeight:1.45, firstLineIndentEm:1.3, paragraphGapEm:0.58,
    chapterTitleAlignment:'center', chapterTopEm:4.8, chapterAfterEm:2.6,
    subheadAlignment:'left', subheadSizeEm:1.16, blockQuoteStyle:'italic', writtenNoteStyle:'inset',
    textMessageStyle:'left-right', sceneBreakTreatment:'diamond',
  }, { chapterHeadingLayout:'number-title', chapterLabelSizeEm:1.55, chapterNameSizeEm:1.02, chapterNameGapEm:1.15, chapterNameItalic:true, firstParagraphTreatment:'drop-cap', chapterTitleSizeEm:1.82, chapterTitleWeight:800, chapterTitleLetterSpacingEm:0.065, chapterTitleTransform:'uppercase', chapterDivider:'diamond', contentsStyle:'dramatic', contentsAlignment:'center' }),
  makeTheme('soft-romance', 'Soft Romance', 'Airy chapter openings, gentle flourishes, intimate reading rhythm.', {
    fontFamily:'serif', lineHeight:1.53, firstLineIndentEm:1.15, paragraphGapEm:0.68,
    chapterTitleAlignment:'center', chapterTopEm:4.3, chapterAfterEm:2.5,
    subheadAlignment:'center', subheadSizeEm:1.07, blockQuoteStyle:'italic', writtenNoteStyle:'inset',
    textMessageStyle:'bubbles', sceneBreakTreatment:'flourish',
  }, { chapterHeadingLayout:'number-title', chapterLabelSizeEm:1.32, chapterNameSizeEm:.96, chapterNameGapEm:1.2, chapterNameItalic:true, firstParagraphTreatment:'small-caps', chapterTitleSizeEm:1.58, chapterTitleWeight:600, chapterTitleLetterSpacingEm:0.025, chapterTitleTransform:'none', chapterDivider:'flourish', contentsStyle:'classic', contentsAlignment:'center' }),
  makeTheme('dark-romance', 'Dark Romance', 'Sharper chapter hierarchy and restrained dark-romance drama without hurting readability.', {
    fontFamily:'serif', lineHeight:1.45, firstLineIndentEm:1.25, paragraphGapEm:0.58,
    chapterTitleAlignment:'center', chapterTopEm:4.4, chapterAfterEm:2.3,
    subheadAlignment:'center', subheadSizeEm:1.12, blockQuoteStyle:'italic', writtenNoteStyle:'inset',
    textMessageStyle:'left-right', sceneBreakTreatment:'diamond',
  }, { chapterHeadingLayout:'number-title', chapterLabelSizeEm:1.48, chapterNameSizeEm:.98, chapterNameGapEm:1.1, chapterNameItalic:true, firstParagraphTreatment:'drop-cap', chapterTitleSizeEm:1.75, chapterTitleWeight:800, chapterTitleLetterSpacingEm:0.05, chapterTitleTransform:'uppercase', chapterDivider:'diamond', contentsStyle:'dramatic', contentsAlignment:'center' }),
  makeTheme('clean-commercial', 'Clean Commercial', 'Genre-fiction clarity with sturdy Kindle behavior and almost invisible ornament.', {
    fontFamily:'reader', lineHeight:1.42, firstLineIndentEm:1.2, paragraphGapEm:0.6,
    chapterTitleAlignment:'left', chapterTopEm:3.6, chapterAfterEm:2.0,
    subheadAlignment:'left', subheadSizeEm:1.08, blockQuoteStyle:'plain', writtenNoteStyle:'plain',
    textMessageStyle:'transcript', sceneBreakTreatment:'asterisks',
  }, { chapterHeadingLayout:'combined', chapterLabelSizeEm:1.3, chapterNameSizeEm:1.0, chapterNameGapEm:.9, chapterNameItalic:false, firstParagraphTreatment:'flush', chapterTitleSizeEm:1.52, chapterTitleWeight:700, chapterTitleLetterSpacingEm:0.035, chapterTitleTransform:'uppercase', chapterDivider:'none', contentsStyle:'clean', contentsAlignment:'left' }),
  makeTheme('tres-amigos-private', 'Tres Amigos — Private', 'The house style: warm contemporary fiction, restrained chapter drama, clean message hierarchy.', {
    fontFamily:'reader', lineHeight:1.42, firstLineIndentEm:1.35, paragraphGapEm:0.7,
    chapterTitleAlignment:'center', chapterTopEm:6.2, chapterAfterEm:5.4,
    subheadAlignment:'left', subheadSizeEm:1.12, blockQuoteStyle:'plain', writtenNoteStyle:'inset',
    textMessageStyle:'transcript', sceneBreakTreatment:'flourish',
  }, { chapterHeadingLayout:'number-title', chapterLabelSizeEm:1.42, chapterNameSizeEm:.94, chapterNameGapEm:1.3, chapterNameItalic:true, firstParagraphTreatment:'flush', chapterTitleSizeEm:1.58, chapterTitleWeight:700, chapterTitleLetterSpacingEm:0.018, chapterTitleTransform:'none', chapterDivider:'none', contentsStyle:'clean', contentsAlignment:'left' }, true),
]);

export const DEFAULT_EBOOK_THEME_ID = 'tres-amigos-private';
const THEME_BY_ID = new Map(EBOOK_THEME_FAMILIES.map((theme) => [theme.id, theme]));
const clamp = (value, fallback, min, max) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

export function ebookThemeFamily(themeId = DEFAULT_EBOOK_THEME_ID) {
  return THEME_BY_ID.get(String(themeId || '')) || THEME_BY_ID.get(DEFAULT_EBOOK_THEME_ID);
}

export function defaultEbookThemeStudio() {
  const theme = ebookThemeFamily(DEFAULT_EBOOK_THEME_ID);
  return {
    version:EBOOK_THEME_STUDIO_VERSION,
    themeId:theme.id,
    themeName:theme.name,
    chapterHeadingLayout:theme.studio.chapterHeadingLayout || 'number-title',
    chapterLabelSizeEm:theme.studio.chapterLabelSizeEm || 1.42,
    chapterNameSizeEm:theme.studio.chapterNameSizeEm || 0.94,
    chapterNameGapEm:theme.studio.chapterNameGapEm || 1.3,
    chapterNameItalic:theme.studio.chapterNameItalic !== false,
    firstParagraphTreatment:theme.studio.firstParagraphTreatment,
    chapterTitleSizeEm:theme.studio.chapterTitleSizeEm,
    chapterTitleWeight:theme.studio.chapterTitleWeight,
    chapterTitleLetterSpacingEm:theme.studio.chapterTitleLetterSpacingEm,
    chapterTitleTransform:theme.studio.chapterTitleTransform,
    chapterDivider:theme.studio.chapterDivider,
    chapterArtwork:null,
    chapterArtworkPosition:'above',
    sceneBreakCustomText:'✦',
    sceneBreakArtwork:null,
    sceneBreakArtworkWidthEm:3.2,
    contentsStyle:theme.studio.contentsStyle,
    contentsAlignment:theme.studio.contentsAlignment,
    sourceStyleMap:{},
    chapterOverrides:{},
  };
}

export function normalizeEbookThemeStudio(input = {}) {
  const base = defaultEbookThemeStudio();
  const studio = { ...base, ...(input || {}) };
  const family = ebookThemeFamily(studio.themeId);
  studio.version = EBOOK_THEME_STUDIO_VERSION;
  studio.themeId = family.id;
  studio.themeName = String(studio.themeName || family.name).trim().slice(0, 80) || family.name;
  const familyStudio = family.studio || {};
  studio.chapterHeadingLayout = ['number-title','combined','number-only','title-only'].includes(studio.chapterHeadingLayout) ? studio.chapterHeadingLayout : (familyStudio.chapterHeadingLayout || base.chapterHeadingLayout);
  studio.chapterLabelSizeEm = clamp(studio.chapterLabelSizeEm, familyStudio.chapterLabelSizeEm || base.chapterLabelSizeEm, 0.8, 2.4);
  studio.chapterNameSizeEm = clamp(studio.chapterNameSizeEm, familyStudio.chapterNameSizeEm || base.chapterNameSizeEm, 0.7, 2.2);
  studio.chapterNameGapEm = clamp(studio.chapterNameGapEm, familyStudio.chapterNameGapEm || base.chapterNameGapEm, 0, 4);
  studio.chapterNameItalic = studio.chapterNameItalic !== false;
  studio.firstParagraphTreatment = ['flush','small-caps','drop-cap'].includes(studio.firstParagraphTreatment) ? studio.firstParagraphTreatment : base.firstParagraphTreatment;
  studio.chapterTitleSizeEm = clamp(studio.chapterTitleSizeEm, base.chapterTitleSizeEm, 1.1, 2.8);
  studio.chapterTitleWeight = clamp(studio.chapterTitleWeight, base.chapterTitleWeight, 400, 900);
  studio.chapterTitleLetterSpacingEm = clamp(studio.chapterTitleLetterSpacingEm, base.chapterTitleLetterSpacingEm, 0, 0.16);
  studio.chapterTitleTransform = ['none','uppercase','lowercase'].includes(studio.chapterTitleTransform) ? studio.chapterTitleTransform : 'none';
  studio.chapterDivider = ['none','line','dots','diamond','flourish'].includes(studio.chapterDivider) ? studio.chapterDivider : 'none';
  studio.chapterArtworkPosition = ['above','below'].includes(studio.chapterArtworkPosition) ? studio.chapterArtworkPosition : 'above';
  studio.sceneBreakCustomText = String(studio.sceneBreakCustomText ?? '✦').slice(0, 24);
  studio.sceneBreakArtworkWidthEm = clamp(studio.sceneBreakArtworkWidthEm, 3.2, 1, 10);
  studio.contentsStyle = ['clean','classic','dramatic'].includes(studio.contentsStyle) ? studio.contentsStyle : 'clean';
  studio.contentsAlignment = ['left','center'].includes(studio.contentsAlignment) ? studio.contentsAlignment : 'left';
  studio.sourceStyleMap = studio.sourceStyleMap && typeof studio.sourceStyleMap === 'object' && !Array.isArray(studio.sourceStyleMap) ? { ...studio.sourceStyleMap } : {};
  studio.chapterOverrides = studio.chapterOverrides && typeof studio.chapterOverrides === 'object' && !Array.isArray(studio.chapterOverrides) ? { ...studio.chapterOverrides } : {};
  studio.chapterArtwork = normalizeArtwork(studio.chapterArtwork);
  studio.sceneBreakArtwork = normalizeArtwork(studio.sceneBreakArtwork);
  return studio;
}

function normalizeArtwork(asset) {
  if (!asset || typeof asset !== 'object' || !asset.dataUrl) return null;
  const mimeType = ['image/jpeg','image/png','image/gif','image/svg+xml','image/webp'].includes(asset.mimeType) ? asset.mimeType : '';
  if (!mimeType) return null;
  return {
    fileName:String(asset.fileName || 'artwork').slice(0, 160),
    mimeType,
    fileSize:Number(asset.fileSize) || 0,
    width:Number(asset.width) || 0,
    height:Number(asset.height) || 0,
    dataUrl:String(asset.dataUrl),
    altText:String(asset.altText || '').slice(0, 240),
  };
}

export function applyEbookThemeFamily(designInput = {}, themeId = DEFAULT_EBOOK_THEME_ID) {
  const theme = ebookThemeFamily(themeId);
  const currentStudio = normalizeEbookThemeStudio(designInput.themeStudio || {});
  const nextStudio = normalizeEbookThemeStudio({
    ...currentStudio,
    ...theme.studio,
    themeId:theme.id,
    themeName:theme.name,
    // Artwork, style mappings, and intentional chapter overrides belong to the book,
    // not to a gallery preset. Keep them when the author changes families.
    chapterArtwork:currentStudio.chapterArtwork,
    sceneBreakArtwork:currentStudio.sceneBreakArtwork,
    sceneBreakCustomText:currentStudio.sceneBreakCustomText,
    sourceStyleMap:currentStudio.sourceStyleMap,
    chapterOverrides:currentStudio.chapterOverrides,
  });
  return { ...designInput, ...theme.design, themeId:theme.id, name:theme.name, themeStudio:nextStudio };
}

export function splitChapterHeading(sourceText = '') {
  const source = String(sourceText ?? '');
  // Presentation-only interpretation. The two returned strings concatenate to
  // the exact original source text, so Story Lock wording is never rewritten.
  const match = source.match(/^(\s*(?:chapter|part|book)\s+(?:\d+|[ivxlcdm]+|[a-z]+)\s*(?::|[.\-–—])?\s+)(\S[\s\S]*?)$/i);
  if (!match) return { source, label:'', title:source, split:false };
  return { source, label:match[1], title:match[2], split:true };
}

export function inferSourceStyleRole(styleName = '', sampleText = '') {
  const style = String(styleName || '').trim().toLowerCase();
  const text = String(sampleText || '').trim();
  if (/heading\s*1|chapter title|chapter heading/.test(style)) return 'chapter-heading';
  if (/heading\s*[2-5]|subhead|subheading/.test(style)) return 'subhead';
  if (/block ?quote|quotation|quote/.test(style)) return 'block-quote';
  if (/written note|letter|correspondence|epigraph/.test(style)) return 'written-note';
  if (/verse|poem|poetry|stanza/.test(style)) return 'verse';
  if (/text message|sms|chat|message bubble|conversation/.test(style)) return 'text-message';
  if (/contents|table of contents|toc/.test(style)) return 'contents';
  if (/^\s*(\*\s*\*\s*\*|•\s*•\s*•|◆|✦|⁂|❦)\s*$/.test(text)) return 'scene-break';
  if (/normal|body|paragraph/.test(style)) return 'body';
  return 'review';
}

export function sourceStyleRecords(project) {
  const records = new Map();
  for (const block of project?.manuscript?.blocks || []) {
    const name = String(block?.style?.name || block?.styleName || '').trim();
    if (!name) continue;
    const existing = records.get(name) || { name, count:0, sample:'', inferred:'review' };
    existing.count += 1;
    if (!existing.sample && String(block?.text || '').trim()) existing.sample = String(block.text).trim().replace(/\s+/g,' ').slice(0, 100);
    existing.inferred = inferSourceStyleRole(name, existing.sample);
    records.set(name, existing);
  }
  return [...records.values()].sort((a,b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function sourceStyleMappedRole(project, block) {
  const design = project?.editions?.ebook?.design || project?.design?.ebook || {};
  const studio = normalizeEbookThemeStudio(design.themeStudio || {});
  const name = String(block?.style?.name || block?.styleName || '').trim();
  const mapped = String(studio.sourceStyleMap?.[name] || '').trim();
  return mapped || null;
}

export function setSourceStyleMapping(project, styleName, role) {
  if (!project) return null;
  const design = project.editions?.ebook?.design || project.design?.ebook || {};
  const studio = normalizeEbookThemeStudio(design.themeStudio || {});
  const name = String(styleName || '').trim();
  if (!name) return studio;
  if (!role || role === 'auto') delete studio.sourceStyleMap[name];
  else studio.sourceStyleMap[name] = role;
  return studio;
}

export function normalizeChapterHeadingOverride(value = {}) {
  const out = {};
  if (['left','center','right'].includes(value.alignment)) out.alignment = value.alignment;
  if (value.spaceBefore != null && value.spaceBefore !== '') out.spaceBefore = clamp(value.spaceBefore, 0, 0, 8);
  if (value.spaceAfter != null && value.spaceAfter !== '') out.spaceAfter = clamp(value.spaceAfter, 0, 0, 6);
  if (value.sizeEm != null && value.sizeEm !== '') out.sizeEm = clamp(value.sizeEm, 1.5, 1.1, 2.8);
  return out;
}

export function setChapterHeadingOverride(project, blockId, value = null) {
  if (!project || !blockId) return null;
  const design = project.editions?.ebook?.design || project.design?.ebook || {};
  const studio = normalizeEbookThemeStudio(design.themeStudio || {});
  if (!value) delete studio.chapterOverrides[blockId];
  else studio.chapterOverrides[blockId] = normalizeChapterHeadingOverride(value);
  return studio;
}

export function chapterHeadingOverride(project, blockId) {
  const design = project?.editions?.ebook?.design || project?.design?.ebook || {};
  const studio = normalizeEbookThemeStudio(design.themeStudio || {});
  return studio.chapterOverrides?.[blockId] || null;
}

export function ebookStyleUsage(project, role = 'body') {
  const wanted = String(role || 'body');
  const out = [];
  let chapter = 0;
  for (const block of project?.manuscript?.blocks || []) {
    if (block.kind === 'chapter-title') chapter += 1;
    let blockRole = 'body';
    if (block.kind === 'chapter-title') blockRole = 'chapter-heading';
    else if (block.kind === 'chapter-opening') blockRole = 'first-paragraph';
    else if (block.kind === 'blank') continue;
    else {
      const semantic = semanticRoleForBlock(project, block, 'chapter');
      blockRole = semantic === 'text-message' ? 'text-message' : semantic;
    }
    if (wanted === 'after-break') continue; // computed visually by the renderer; not source mutation metadata.
    if (wanted === 'contents') continue;
    if (blockRole !== wanted) continue;
    out.push({ blockId:block.id, blockIndex:block.index, chapter, kind:block.kind, role:blockRole, snippet:String(block.text || '').trim().replace(/\s+/g,' ').slice(0, 150) });
  }
  return out;
}

export function calculateBookDNA(project, intelligence = null) {
  const manuscriptBlocks = (project?.manuscript?.blocks || []).filter((block) => block.kind !== 'blank');
  const presentationOverrides = Object.keys(project?.presentationOverrides?.ebook || {}).length;
  const studio = normalizeEbookThemeStudio(project?.editions?.ebook?.design?.themeStudio || project?.design?.ebook?.themeStudio || {});
  const chapterOverrides = Object.keys(studio.chapterOverrides || {}).length;
  const semanticFeatures = manuscriptBlocks.filter((block) => {
    if (block.kind === 'chapter-title' || block.kind === 'chapter-opening') return true;
    return semanticRoleForBlock(project, block, 'chapter') !== 'body';
  }).length;
  const anomalyCount = (intelligence?.anomalies || []).filter((item) => ['error','review'].includes(item.severity)).length;
  const total = Math.max(1, manuscriptBlocks.length);
  const drift = Math.min(total, presentationOverrides + chapterOverrides + anomalyCount);
  const adherence = Math.max(0, Math.min(100, ((total - drift) / total) * 100));
  return {
    adherence:Number(adherence.toFixed(1)),
    semanticFeatures,
    localOverrides:presentationOverrides,
    chapterOverrides,
    outliers:anomalyCount,
    totalStyled:manuscriptBlocks.length,
    themeId:studio.themeId,
    themeName:studio.themeName,
  };
}

export function themeArtworkAssets(designInput = {}) {
  const studio = normalizeEbookThemeStudio(designInput.themeStudio || {});
  const assets = [];
  if (studio.chapterArtwork) assets.push({ kind:'chapter', id:'theme-chapter-artwork', href:`images/theme-chapter-artwork.${assetExtension(studio.chapterArtwork)}`, ...studio.chapterArtwork });
  if (studio.sceneBreakArtwork) assets.push({ kind:'scene-break', id:'theme-scene-break-artwork', href:`images/theme-scene-break-artwork.${assetExtension(studio.sceneBreakArtwork)}`, ...studio.sceneBreakArtwork });
  return assets;
}

function assetExtension(asset = {}) {
  const mime = String(asset.mimeType || '').toLowerCase();
  if (mime === 'image/png') return 'png';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/svg+xml') return 'svg';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}
