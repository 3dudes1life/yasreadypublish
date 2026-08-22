import { buildEbookSections, ebookFontStack, ebookTocEntries, normalizeEbookDesign, verifyEbookSourceCoverage } from './ebook-model.js';
import { blankRenderMode } from './spacing-policy.js';

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
  // pages that need to reflow on Kindle/Apple/Kobo/Google readers.
  return `text-align:${align};text-indent:0;margin:0 0 .18em 0;`;
}

function renderBlock(block, { blankMode = 'preserve', sectionType = 'chapter', design } = {}) {
  const id = escapeXml(block.id || '');
  const content = inlineRuns(block);
  if (block.kind === 'blank') return `<p id="${id}" class="blank ${blankMode === 'collapse' ? 'collapsed' : blankMode === 'normalize' ? 'normalized' : 'preserved'}"></p>`;
  if (block.kind === 'chapter-title') return `<h1 id="${id}" class="chapter-title">${content}</h1>`;
  if (block.kind === 'front-back-heading' || block.kind === 'heading') {
    const style = sectionType === 'chapter' ? '' : matterParagraphStyle(block, design);
    return `<h2 id="${id}" class="matter-heading"${style ? ` style="${style}"` : ''}>${content}</h2>`;
  }
  if (block.kind === 'scene-break') return `<p id="${id}" class="scene-break">${content}</p>`;
  if (block.kind === 'text-message') return `<p id="${id}" class="text-message">${content}</p>`;
  if (sectionType !== 'chapter') return `<p id="${id}" class="matter-body" style="${matterParagraphStyle(block, design)}">${content}</p>`;
  if (block.kind === 'chapter-opening') return `<p id="${id}" class="body chapter-opening">${content}</p>`;
  return `<p id="${id}" class="body">${content}</p>`;
}

function stylesheet(designInput) {
  const design = normalizeEbookDesign(designInput);
  return `@charset "UTF-8";
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; padding: 0; font-family: ${ebookFontStack(design.fontFamily)}; line-height: ${design.lineHeight}; text-align: ${design.bodyAlignment}; }
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
    return renderBlock(block, { blankMode, sectionType, design });
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
  return `<nav epub:type="toc" id="toc" role="doc-toc"><h1>Table of Contents</h1><ol>${toc.map((entry) => `<li><a href="#">${escapeXml(entry.label)}</a></li>`).join('')}</ol></nav>`;
}

export function buildEbookPreviewHtml({ project, sectionIndex = 0 } = {}) {
  if (!project) throw new Error('A publishing project is required.');
  const design = normalizeEbookDesign(project.editions?.ebook?.design || project.design?.ebook || {});
  const { sections: sourceSections } = buildEbookSections(project);
  const toc = ebookTocEntries(project, design);
  const items = [...sourceSections];
  if (design.visibleToc) {
    const firstChapter = items.findIndex((item) => item.type === 'chapter');
    const tocItem = { id: 'visible-toc', type: 'toc', title: 'Table of Contents', href: 'nav.xhtml', blocks: [], wordCount: 0, startBlockIndex: null, endBlockIndex: null, synthetic: true };
    items.splice(firstChapter >= 0 ? firstChapter : items.length, 0, tocItem);
  }
  const index = Math.max(0, Math.min(Math.max(0, items.length - 1), Number(sectionIndex) || 0));
  const section = items[index] || { id: 'empty', title: 'Empty book', type: 'front', blocks: [] };
  const html = section.synthetic
    ? previewTocHtml(toc)
    : section.blocks.map((block, blockIndex) => {
        const blankMode = section.type === 'chapter'
          ? blankRenderMode({ blocks: section.blocks, index: blockIndex, sectionType: section.type, policy: design.bodyBlankPolicy })
          : 'collapse';
        return renderBlock(block, { blankMode, sectionType: section.type, design });
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
