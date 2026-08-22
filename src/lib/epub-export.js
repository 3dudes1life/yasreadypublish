import { buildEbookSections, ebookFontStack, ebookTocEntries, normalizeEbookDesign, verifyEbookSourceCoverage } from './ebook-model.js';
import { blankRenderMode } from './spacing-policy.js';
import { getBlockPresentationOverride } from './presentation-overrides.js';

function escapeXml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function safeIdentifier(project) {
  const raw = String(project?.id || '').trim();
  return `urn:uuid:${raw || 'yasready-publish'}`;
}

function inlineRuns(block) {
  if (!block?.runs?.length || block.runs.map((run) => run.text).join('') !== block.text) return escapeXml(block?.text || '').replaceAll('\n', '<br/>');
  return block.runs.map((run) => {
    let value = escapeXml(run.text).replaceAll('\n', '<br/>');
    if (!value) return '';
    if (run.smallCaps) value = `<span class="small-caps">${value}</span>`;
    if (run.strike) value = `<s>${value}</s>`;
    if (run.underline) value = `<span class="underline">${value}</span>`;
    if (run.italic) value = `<em>${value}</em>`;
    if (run.bold) value = `<strong>${value}</strong>`;
    return value;
  }).join('');
}

function normalizedAlignment(value = '') {
  const raw = String(value || '').toLowerCase();
  if (raw === 'center') return 'center';
  if (['right', 'end'].includes(raw)) return 'right';
  if (['both', 'distribute', 'thaiDistribute'].includes(raw)) return 'justify';
  return 'left';
}

function twipsToEm(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  // 240 twips is roughly one 12pt em. Cap imported spacing so Word page-layout
  // choices cannot create absurd gaps in a reflowable ebook.
  return Math.max(0, Math.min(3, n / 240));
}

function matterParagraphStyle(block, design) {
  const layout = block?.layout || {};
  const align = layout.alignment ? normalizedAlignment(layout.alignment) : 'left';
  if (design.frontMatterMode === 'source') {
    const before = twipsToEm(layout.spaceBeforeTwips, 0);
    const after = twipsToEm(layout.spaceAfterTwips, 0.18);
    return `text-align:${align};text-indent:0;margin:${before}em 0 ${after}em 0;`;
  }
  // Clean mode deliberately ignores fixed-page Word spacing while preserving
  // source alignment. It is the safe default for title/copyright/dedication
  // pages that need to reflow on Kindle readers.
  return `text-align:${align};text-indent:0;margin:0 0 .18em 0;`;
}


function presentationStyle(project, block, sectionType = 'chapter') {
  const override = getBlockPresentationOverride(project, 'ebook', block?.id);
  if (!override) return '';
  const styles = [];
  if (override.spaceBefore != null) styles.push(`margin-top:${override.spaceBefore}em`);
  if (override.spaceAfter != null) styles.push(`margin-bottom:${override.spaceAfter}em`);
  if (override.alignment) styles.push(`text-align:${override.alignment}`);
  if (override.suppressIndent === true) styles.push('text-indent:0');
  else if (override.firstLineIndent != null && sectionType === 'chapter') styles.push(`text-indent:${override.firstLineIndent}em`);
  return styles.join(';');
}

function mergeInlineStyles(...styles) {
  return styles.filter(Boolean).join(';');
}

function previewAttrs(block, previewMode = false) {
  if (!previewMode || !block?.id) return '';
  return ` data-yrp-block-id="${escapeXml(block.id)}" tabindex="0"`;
}

function renderBlock(block, { blankMode = 'preserve', sectionType = 'chapter', design, project = null, previewMode = false } = {}) {
  const id = escapeXml(block.id || '');
  const attrs = previewAttrs(block, previewMode);
  const inspectClass = previewMode ? ' yrp-inspectable' : '';
  const content = inlineRuns(block);
  const overrideStyle = presentationStyle(project, block, sectionType);
  if (block.kind === 'blank') return `<p id="${id}" class="blank ${blankMode === 'collapse' ? 'collapsed' : blankMode === 'normalize' ? 'normalized' : 'preserved'}"${attrs}></p>`;
  if (block.kind === 'chapter-title') return `<h1 id="${id}" class="chapter-title${inspectClass}"${attrs}${overrideStyle ? ` style="${overrideStyle}"` : ''}>${content}</h1>`;
  if (block.kind === 'front-back-heading' || block.kind === 'heading') {
    const baseStyle = sectionType === 'chapter' ? '' : matterParagraphStyle(block, design);
    const style = mergeInlineStyles(baseStyle, overrideStyle);
    return `<h2 id="${id}" class="matter-heading${inspectClass}"${attrs}${style ? ` style="${style}"` : ''}>${content}</h2>`;
  }
  if (block.kind === 'scene-break') return `<p id="${id}" class="scene-break${inspectClass}"${attrs}${overrideStyle ? ` style="${overrideStyle}"` : ''}>${content}</p>`;
  if (block.kind === 'text-message') return `<p id="${id}" class="text-message${inspectClass}"${attrs}${overrideStyle ? ` style="${overrideStyle}"` : ''}>${content}</p>`;
  if (sectionType !== 'chapter') {
    const style = mergeInlineStyles(matterParagraphStyle(block, design), overrideStyle);
    return `<p id="${id}" class="matter-body${inspectClass}"${attrs} style="${style}">${content}</p>`;
  }
  if (block.kind === 'chapter-opening') return `<p id="${id}" class="body chapter-opening${inspectClass}"${attrs}${overrideStyle ? ` style="${overrideStyle}"` : ''}>${content}</p>`;
  return `<p id="${id}" class="body${inspectClass}"${attrs}${overrideStyle ? ` style="${overrideStyle}"` : ''}>${content}</p>`;
}

function stylesheet(designInput) {
  const design = normalizeEbookDesign(designInput);
  const bodyAlignment = design.bodyAlignment === 'reader' ? '' : ` text-align:${design.bodyAlignment};`;
  return `@charset "UTF-8";
html { -webkit-text-size-adjust: 100%; }
body { margin:0; padding:0; font-family:${ebookFontStack(design.fontFamily)};${bodyAlignment} }
p { margin:0; }
p.body { margin:0 0 ${design.paragraphGapEm}em 0; text-indent: ${design.firstLineIndentEm}em; }
p.chapter-opening { text-indent: 0; }
h1.chapter-title { margin: ${design.chapterTopEm}em 0 ${design.chapterAfterEm}em; text-align: ${design.chapterTitleAlignment}; font-size: 1.55em; line-height: 1.2; font-weight: 700; page-break-before: always; break-before: page; }
h2.matter-heading { margin: 1.8em 0 1em; font-size: 1.3em; line-height: 1.2; font-weight:700; }
p.matter-body { text-indent:0; }
body.front p.blank, body.back p.blank { display:none; min-height:0; height:0; margin:0; padding:0; }
p.scene-break { margin: ${design.sceneBreakSpaceEm}em 0; text-indent: 0; text-align: center; }
p.text-message { margin:0 ${design.textMessageIndentEm}em ${design.paragraphGapEm}em; text-indent: 0; }
p.blank { min-height: .7em; }
p.blank.normalized { display:block; min-height:${design.bodyBlankSpaceEm}em; height:${design.bodyBlankSpaceEm}em; margin:0; padding:0; }
p.blank.collapsed { display:none; min-height:0; height:0; margin:0; padding:0; }
p.blank.preserved { min-height:.7em; }
.small-caps { font-variant: small-caps; }
.underline { text-decoration: underline; }
nav[epub\\:type="toc"] h1 { margin:1.2em 0 1.2em; text-align:center; font-size:1.45em; }
nav[epub\\:type="toc"] ol { padding-left:1.2em; }
nav[epub\\:type="toc"] li { margin:.5em 0; }
nav a { color: inherit; text-decoration: none; }
.yrp-inspectable { cursor:default; }
.yrp-selected { outline:2px solid #7565ff; outline-offset:3px; border-radius:2px; }
.yrp-cover-preview { min-height:72vh; display:grid; place-items:center; padding:1em; }
.yrp-cover-preview img { display:block; max-width:100%; max-height:78vh; object-fit:contain; box-shadow:0 10px 30px rgba(0,0,0,.18); }
.hidden-nav { display:none; }
@media amzn-kf8 { h1.chapter-title { page-break-before: always; } }
`;
}

function sectionXhtml(section, project, design) {
  const title = escapeXml(section.title || project.title || 'Book');
  const sectionType = section.type || 'chapter';
  const body = section.blocks.map((block, index) => {
    const blankMode = sectionType === 'chapter'
      ? blankRenderMode({ blocks: section.blocks, index, sectionType, policy: design.bodyBlankPolicy })
      : 'collapse';
    return renderBlock(block, { blankMode, sectionType, design, project, previewMode: false });
  }).join('\n');
  const epubType = sectionType === 'chapter' ? 'bodymatter' : sectionType === 'front' ? 'frontmatter' : 'backmatter';
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(design.language)}" lang="${escapeXml(design.language)}">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <link rel="stylesheet" type="text/css" href="../styles.css" />
</head>
<body class="${escapeXml(sectionType)}" epub:type="${epubType}">
${body}
</body>
</html>`;
}

function tocListHtml(toc) {
  return toc.map((entry) => `<li><a href="${escapeXml(entry.href)}">${escapeXml(entry.label)}</a></li>`).join('\n      ');
}

function navXhtml(project, design, toc, sections) {
  const items = tocListHtml(toc);
  const firstChapter = sections.find((section) => section.type === 'chapter');
  const bodymatter = firstChapter
    ? `<li><a epub:type="bodymatter" href="${escapeXml(firstChapter.href)}">Begin Reading</a></li>`
    : '';
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(design.language)}" lang="${escapeXml(design.language)}">
<head><meta charset="utf-8" /><title>Table of Contents</title><link rel="stylesheet" type="text/css" href="styles.css" /></head>
<body>
<nav epub:type="toc" id="toc" role="doc-toc" aria-label="Table of Contents">
  <h1>Table of Contents</h1>
  <ol>
      ${items}
  </ol>
</nav>
<nav epub:type="landmarks" class="hidden-nav" hidden="hidden" aria-label="Landmarks">
  <ol>
    <li><a epub:type="toc" href="nav.xhtml#toc">Table of Contents</a></li>
    ${bodymatter}
  </ol>
</nav>
</body>
</html>`;
}

function ncx(project, toc) {
  const uid = escapeXml(safeIdentifier(project));
  const points = toc.map((entry, index) => `    <navPoint id="navPoint-${index + 1}" playOrder="${index + 1}"><navLabel><text>${escapeXml(entry.label)}</text></navLabel><content src="${escapeXml(entry.href)}"/></navPoint>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="${uid}"/></head>
  <docTitle><text>${escapeXml(project.title || 'Book')}</text></docTitle>
  <navMap>
${points}
  </navMap>
</ncx>`;
}

function coverInfo(project) {
  const cover = project?.editions?.ebook?.cover || null;
  if (!cover?.dataUrl || !cover?.mimeType) return null;
  const ext = cover.mimeType === 'image/png' ? 'png' : 'jpg';
  return { ...cover, ext, href: `images/cover.${ext}` };
}

function packageOpf(project, design, sections, generatedAt, cover = null) {
  const title = escapeXml(project.title || 'Book');
  const author = escapeXml(project.author || '');
  const publisher = escapeXml(design.publisher || '');
  const identifier = escapeXml(safeIdentifier(project));
  const modified = generatedAt.replace(/\.\d{3}Z$/, 'Z');
  const manifestSections = sections.map((section, index) => `    <item id="s${index + 1}" href="${escapeXml(section.href)}" media-type="application/xhtml+xml"/>`).join('\n');
  const creator = author ? `\n    <dc:creator>${author}</dc:creator>` : '';
  const publisherMeta = publisher ? `\n    <dc:publisher>${publisher}</dc:publisher>` : '';
  const coverManifest = cover ? `\n    <item id="cover-image" href="${escapeXml(cover.href)}" media-type="${escapeXml(cover.mimeType)}" properties="cover-image"/>` : '';
  const firstChapterIndex = sections.findIndex((section) => section.type === 'chapter');
  const spineRows = [];
  sections.forEach((section, index) => {
    if (design.visibleToc && index === firstChapterIndex) spineRows.push('    <itemref idref="nav"/>');
    spineRows.push(`    <itemref idref="s${index + 1}"/>`);
  });
  if (design.visibleToc && firstChapterIndex < 0) spineRows.push('    <itemref idref="nav"/>');

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${escapeXml(design.language)}" prefix="yasready: https://yasready.com/vocab/# schema: https://schema.org/ rendition: http://www.idpf.org/vocab/rendition/#">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${identifier}</dc:identifier>
    <dc:title>${title}</dc:title>${creator}
    <dc:language>${escapeXml(design.language)}</dc:language>${publisherMeta}
    <meta property="dcterms:modified">${modified}</meta>
    <meta property="rendition:layout">reflowable</meta>
    <meta property="schema:accessMode">textual</meta>
    <meta property="schema:accessibilityFeature">tableOfContents</meta>
    <meta property="schema:accessibilityFeature">readingOrder</meta>
    <meta property="yasready:storyLockSha256">${escapeXml(project.source?.manuscriptHash || '')}</meta>
    <meta property="yasready:sourceFile">${escapeXml(project.source?.fileName || '')}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="styles.css" media-type="text/css"/>${coverManifest}
${manifestSections}
  </manifest>
  <spine toc="ncx">
${spineRows.join('\n')}
  </spine>
</package>`;
}

function dataUrlBytes(dataUrl = '') {
  const match = String(dataUrl).match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) throw new Error('The ebook cover asset is not stored as a readable base64 image.');
  const binary = globalThis.atob ? globalThis.atob(match[2]) : Buffer.from(match[2], 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function buildEpubPackageData({ project } = {}) {
  if (!project) throw new Error('A publishing project is required.');
  const design = normalizeEbookDesign(project.editions?.ebook?.design || project.design?.ebook || {});
  const { sections } = buildEbookSections(project);
  const coverage = verifyEbookSourceCoverage(project, sections);
  if (!coverage.ok) throw new Error('Story Lock ebook coverage failed. EPUB packaging was blocked.');
  const toc = ebookTocEntries(project, design);
  const generatedAt = new Date().toISOString();
  const cover = coverInfo(project);
  const files = new Map();
  files.set('mimetype', 'application/epub+zip');
  files.set('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  files.set('OEBPS/styles.css', stylesheet(design));
  files.set('OEBPS/nav.xhtml', navXhtml(project, design, toc, sections));
  files.set('OEBPS/toc.ncx', ncx(project, toc));
  for (const section of sections) files.set(`OEBPS/${section.href}`, sectionXhtml(section, project, design));
  if (cover) files.set(`OEBPS/${cover.href}`, dataUrlBytes(cover.dataUrl));
  files.set('OEBPS/package.opf', packageOpf(project, design, sections, generatedAt, cover));
  return { files, sections, toc, design, generatedAt, coverage, cover, visibleTocInSpine: Boolean(design.visibleToc) };
}

export async function buildEpubBlob({ project } = {}) {
  const JSZip = globalThis.JSZip;
  if (!JSZip) throw new Error('EPUB packaging runtime is unavailable.');
  const data = buildEpubPackageData({ project });
  const zip = new JSZip();
  zip.file('mimetype', data.files.get('mimetype'), { compression: 'STORE' });
  for (const [path, content] of data.files.entries()) {
    if (path === 'mimetype') continue;
    zip.file(path, content);
  }
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return { blob, ...data };
}

function previewTocHtml(toc) {
  return `<nav epub:type="toc" id="toc" role="doc-toc"><h1>Table of Contents</h1><ol>${toc.map((entry) => `<li><a href="#" data-yrp-toc-href="${escapeXml(entry.href)}">${escapeXml(entry.label)}</a></li>`).join('')}</ol></nav>`;
}

export function buildEbookPreviewHtml({ project, sectionIndex = 0 } = {}) {
  if (!project) throw new Error('A publishing project is required.');
  const design = normalizeEbookDesign(project.editions?.ebook?.design || project.design?.ebook || {});
  const { sections: sourceSections } = buildEbookSections(project);
  const toc = ebookTocEntries(project, design);
  const items = [...sourceSections];
  const previewCover = coverInfo(project);
  if (previewCover) {
    items.unshift({ id: 'preview-cover', type: 'cover', title: 'Cover', href: '', blocks: [], wordCount: 0, startBlockIndex: null, endBlockIndex: null, synthetic: true, cover: previewCover });
  }
  if (design.visibleToc) {
    const firstChapter = items.findIndex((item) => item.type === 'chapter');
    const tocItem = { id: 'visible-toc', type: 'toc', title: 'Table of Contents', href: 'nav.xhtml', blocks: [], wordCount: 0, startBlockIndex: null, endBlockIndex: null, synthetic: true };
    items.splice(firstChapter >= 0 ? firstChapter : items.length, 0, tocItem);
  }
  const index = Math.max(0, Math.min(Math.max(0, items.length - 1), Number(sectionIndex) || 0));
  const section = items[index] || { id: 'empty', title: 'Empty book', type: 'front', blocks: [] };
  const html = section.type === 'cover' && section.cover
    ? `<div class="yrp-cover-preview"><img src="${escapeXml(section.cover.dataUrl)}" alt="${escapeXml(project.title || 'Book cover')}" /></div>`
    : section.synthetic
      ? previewTocHtml(toc)
      : section.blocks.map((block, blockIndex) => {
        const blankMode = section.type === 'chapter'
          ? blankRenderMode({ blocks: section.blocks, index: blockIndex, sectionType: section.type, policy: design.bodyBlankPolicy })
          : 'collapse';
        return renderBlock(block, { blankMode, sectionType: section.type, design, project, previewMode: true });
      }).join('\n');
  return {
    index,
    section,
    sections: items,
    sourceSections,
    toc,
    css: stylesheet(design),
    html,
  };
}

export function buildDevicePreviewHtml({ project } = {}) {
  if (!project) throw new Error('A publishing project is required.');
  const design = normalizeEbookDesign(project.editions?.ebook?.design || project.design?.ebook || {});
  const { sections } = buildEbookSections(project);
  const toc = ebookTocEntries(project, design);
  const cover = coverInfo(project);
  const items = [];
  if (cover) items.push({ id: 'cover', title: 'Cover', type: 'cover', html: `<div class="yrp-cover-preview"><img src="${escapeXml(cover.dataUrl)}" alt="${escapeXml(project.title || 'Book cover')}" /></div>` });
  for (const section of sections) {
    if (design.visibleToc && section.type === 'chapter' && !items.some((item) => item.type === 'toc')) {
      items.push({ id: 'toc', title: 'Table of Contents', type: 'toc', html: previewTocHtml(toc) });
    }
    const body = section.blocks.map((block, index) => {
      const blankMode = section.type === 'chapter'
        ? blankRenderMode({ blocks: section.blocks, index, sectionType: section.type, policy: design.bodyBlankPolicy })
        : 'collapse';
      return renderBlock(block, { blankMode, sectionType: section.type, design, project, previewMode: false });
    }).join('\n');
    items.push({ id: section.id, title: section.title, type: section.type, href: section.href, html: body });
  }
  if (design.visibleToc && !items.some((item) => item.type === 'toc')) items.push({ id: 'toc', title: 'Table of Contents', type: 'toc', html: previewTocHtml(toc) });

  const nav = items.map((item, index) => `<button type="button" data-go="${index}">${escapeXml(item.title)}</button>`).join('');
  const pages = items.map((item, index) => `<article class="reader-item ${index === 0 ? 'active' : ''}" data-item="${index}" data-type="${escapeXml(item.type)}" data-href="${escapeXml(item.href || '')}">${item.html}</article>`).join('\n');
  const title = escapeXml(project.title || 'YasReady Kindle Preview');
  const baseCss = stylesheet(design);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title} · Device Preview</title>
<style>
${baseCss}
:root{color-scheme:light dark}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#ececf0;color:#18181a}.bar,.footer,.drawer{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body.sepia{background:#e9dfc8}.shell{min-height:100vh;display:grid;grid-template-rows:auto 1fr}.bar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:8px;padding:10px max(12px,env(safe-area-inset-left));background:rgba(250,250,252,.92);backdrop-filter:blur(18px);border-bottom:1px solid rgba(0,0,0,.08)}.bar strong{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.bar button,.bar select{border:1px solid #d7d7dc;border-radius:10px;background:#fff;color:#111;padding:8px 10px;font-weight:700}.reader-wrap{display:grid;grid-template-columns:minmax(0,1fr);padding:18px}.reader-card{width:min(100%,760px);margin:0 auto;background:#fffdf9;color:#18181a;border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.14);overflow:hidden}.reader-item{display:none;padding:clamp(22px,6vw,52px);min-height:76vh}.reader-item.active{display:block}.reader-item[data-type="cover"]{padding:18px;background:#2d2d31}.reader-item[data-type="cover"] .yrp-cover-preview{min-height:72vh}.footer{position:sticky;bottom:0;display:flex;justify-content:space-between;gap:8px;padding:10px max(12px,env(safe-area-inset-left));background:rgba(250,250,252,.92);backdrop-filter:blur(18px);border-top:1px solid rgba(0,0,0,.08)}.footer button{border:0;border-radius:10px;padding:10px 14px;background:#171719;color:#fff;font-weight:800}.footer button:disabled{opacity:.35}.drawer{position:fixed;inset:auto 0 0 0;z-index:30;display:none;max-height:70vh;background:#fff;border-radius:18px 18px 0 0;box-shadow:0 -12px 40px rgba(0,0,0,.22);padding:12px 12px calc(12px + env(safe-area-inset-bottom));overflow:auto}.drawer.open{display:block}.drawer header{display:flex;justify-content:space-between;align-items:center;gap:12px}.drawer header button{border:0;background:#eeeef2;border-radius:9px;padding:8px 10px;font-weight:800}.drawer nav{display:grid;gap:6px;margin-top:10px}.drawer nav button{border:0;border-radius:10px;background:#f6f6f8;padding:10px;text-align:left}.reader-card.font-l{font-size:112%}.reader-card.font-xl{font-size:126%}body.dark{background:#111113}.dark .bar,.dark .footer{background:rgba(28,28,31,.94);color:#fff;border-color:#38383c}.dark .bar button,.dark .bar select{background:#2b2b2f;color:#fff;border-color:#48484d}.dark .reader-card{background:#151517;color:#f2f2f4}.dark .drawer{background:#202024;color:#fff}.dark .drawer nav button{background:#303036;color:#fff}@media(max-width:600px){.reader-wrap{padding:0}.reader-card{border-radius:0;box-shadow:none;min-height:calc(100vh - 102px)}.reader-item{min-height:calc(100vh - 102px);padding:28px 22px}.bar{padding-top:calc(10px + env(safe-area-inset-top))}}
</style>
</head>
<body>
<div class="shell">
  <div class="bar"><button id="contentsBtn" type="button">Contents</button><strong>${title}</strong><select id="viewMode" aria-label="Reader appearance"><option value="light">Light</option><option value="sepia">Sepia</option><option value="dark">Dark</option></select><select id="fontSize" aria-label="Font size"><option value="m">Aa</option><option value="l">Aa+</option><option value="xl">Aa++</option></select></div>
  <div class="reader-wrap"><main class="reader-card" id="readerCard">${pages}</main></div>
  <div class="footer"><button id="prevBtn" type="button">← Previous</button><button id="nextBtn" type="button">Next →</button></div>
</div>
<aside class="drawer" id="drawer"><header><strong>Reading Order</strong><button id="closeDrawer" type="button">Done</button></header><nav>${nav}</nav></aside>
<script>
(()=>{let index=0;const items=[...document.querySelectorAll('.reader-item')],drawer=document.getElementById('drawer'),card=document.getElementById('readerCard'),prev=document.getElementById('prevBtn'),next=document.getElementById('nextBtn');function show(i){index=Math.max(0,Math.min(items.length-1,i));items.forEach((el,n)=>el.classList.toggle('active',n===index));prev.disabled=index===0;next.disabled=index===items.length-1;window.scrollTo({top:0,behavior:'auto'});}document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>{drawer.classList.remove('open');show(Number(b.dataset.go)||0)}));document.querySelectorAll('[data-yrp-toc-href]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const href=a.dataset.yrpTocHref;const target=items.findIndex(el=>el.dataset.href===href);if(target>=0)show(target)}));document.getElementById('contentsBtn').addEventListener('click',()=>drawer.classList.add('open'));document.getElementById('closeDrawer').addEventListener('click',()=>drawer.classList.remove('open'));prev.addEventListener('click',()=>show(index-1));next.addEventListener('click',()=>show(index+1));document.getElementById('viewMode').addEventListener('change',e=>{document.body.classList.remove('dark','sepia');if(e.target.value!=='light')document.body.classList.add(e.target.value)});document.getElementById('fontSize').addEventListener('change',e=>{card.classList.remove('font-l','font-xl');if(e.target.value==='l')card.classList.add('font-l');if(e.target.value==='xl')card.classList.add('font-xl')});show(0)})();
</script>
</body>
</html>`;
}
