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

function renderBlock(block, { blankMode = 'preserve' } = {}) {
  const id = escapeXml(block.id || '');
  const content = inlineRuns(block);
  if (block.kind === 'blank') return `<p id="${id}" class="blank ${blankMode === 'collapse' ? 'collapsed' : blankMode === 'normalize' ? 'normalized' : 'preserved'}"></p>`;
  if (block.kind === 'chapter-title') return `<h1 id="${id}" class="chapter-title">${content}</h1>`;
  if (block.kind === 'front-back-heading' || block.kind === 'heading') return `<h2 id="${id}" class="matter-heading">${content}</h2>`;
  if (block.kind === 'scene-break') return `<p id="${id}" class="scene-break">${content}</p>`;
  if (block.kind === 'text-message') return `<p id="${id}" class="text-message">${content}</p>`;
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
h2.matter-heading { margin: 2.6em 0 1.4em; font-size: 1.3em; line-height: 1.2; page-break-before: always; break-before: page; }
p.scene-break { margin: ${design.sceneBreakSpaceEm}em 0; text-indent: 0; text-align: center; }
p.text-message { margin:0 ${design.textMessageIndentEm}em ${design.paragraphGapEm}em; text-indent: 0; }
p.blank { min-height: .7em; }
p.blank.normalized { display:block; min-height:${design.bodyBlankSpaceEm}em; height:${design.bodyBlankSpaceEm}em; margin:0; padding:0; }
p.blank.collapsed { display:none; min-height:0; height:0; margin:0; padding:0; }
p.blank.preserved { min-height:.7em; }
.small-caps { font-variant: small-caps; }
.underline { text-decoration: underline; }
nav ol { padding-left: 1.3em; }
nav li { margin: .45em 0; }
nav a { color: inherit; text-decoration: none; }
@media amzn-kf8 { h1.chapter-title, h2.matter-heading { page-break-before: always; } }
`;
}

function sectionXhtml(section, project, design) {
  const title = escapeXml(section.title || project.title || 'Book');
  const body = section.blocks.map((block, index) => renderBlock(block, { blankMode: blankRenderMode({ blocks: section.blocks, index, sectionType: section.type, policy: design.bodyBlankPolicy }) })).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(design.language)}" lang="${escapeXml(design.language)}">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <link rel="stylesheet" type="text/css" href="../styles.css" />
</head>
<body class="${escapeXml(section.type)}">
${body}
</body>
</html>`;
}

function navXhtml(project, design, toc) {
  const items = toc.map((entry) => `<li><a href="${escapeXml(entry.href)}">${escapeXml(entry.label)}</a></li>`).join('\n      ');
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(design.language)}" lang="${escapeXml(design.language)}">
<head><meta charset="utf-8" /><title>Contents</title><link rel="stylesheet" type="text/css" href="styles.css" /></head>
<body>
<nav epub:type="toc" id="toc">
  <h1>Contents</h1>
  <ol>
      ${items}
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

function packageOpf(project, design, sections, generatedAt) {
  const title = escapeXml(project.title || 'Book');
  const author = escapeXml(project.author || '');
  const publisher = escapeXml(design.publisher || '');
  const identifier = escapeXml(safeIdentifier(project));
  const modified = generatedAt.replace(/\.\d{3}Z$/, 'Z');
  const manifestSections = sections.map((section, index) => `    <item id="s${index + 1}" href="${escapeXml(section.href)}" media-type="application/xhtml+xml"/>`).join('\n');
  const spine = sections.map((section, index) => `    <itemref idref="s${index + 1}"/>`).join('\n');
  const creator = author ? `\n    <dc:creator>${author}</dc:creator>` : '';
  const publisherMeta = publisher ? `\n    <dc:publisher>${publisher}</dc:publisher>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${escapeXml(design.language)}" prefix="yasready: https://yasready.com/vocab/#">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${identifier}</dc:identifier>
    <dc:title>${title}</dc:title>${creator}
    <dc:language>${escapeXml(design.language)}</dc:language>${publisherMeta}
    <meta property="dcterms:modified">${modified}</meta>
    <meta property="yasready:storyLockSha256">${escapeXml(project.source?.manuscriptHash || '')}</meta>
    <meta property="yasready:sourceFile">${escapeXml(project.source?.fileName || '')}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="styles.css" media-type="text/css"/>
${manifestSections}
  </manifest>
  <spine toc="ncx">
${spine}
  </spine>
</package>`;
}

export function buildEpubPackageData({ project } = {}) {
  if (!project) throw new Error('A publishing project is required.');
  const design = normalizeEbookDesign(project.design?.ebook || {});
  const { sections } = buildEbookSections(project);
  const coverage = verifyEbookSourceCoverage(project, sections);
  if (!coverage.ok) throw new Error('Story Lock ebook coverage failed. EPUB packaging was blocked.');
  const toc = ebookTocEntries(project);
  const generatedAt = new Date().toISOString();
  const files = new Map();
  files.set('mimetype', 'application/epub+zip');
  files.set('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  files.set('OEBPS/styles.css', stylesheet(design));
  files.set('OEBPS/nav.xhtml', navXhtml(project, design, toc));
  files.set('OEBPS/toc.ncx', ncx(project, toc));
  for (const section of sections) files.set(`OEBPS/${section.href}`, sectionXhtml(section, project, design));
  files.set('OEBPS/package.opf', packageOpf(project, design, sections, generatedAt));
  return { files, sections, toc, design, generatedAt, coverage };
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

export function buildEbookPreviewHtml({ project, sectionIndex = 0 } = {}) {
  if (!project) throw new Error('A publishing project is required.');
  const design = normalizeEbookDesign(project.design?.ebook || {});
  const { sections } = buildEbookSections(project);
  const toc = ebookTocEntries(project);
  const index = Math.max(0, Math.min(Math.max(0, sections.length - 1), Number(sectionIndex) || 0));
  const section = sections[index] || { id: 'empty', title: 'Empty book', type: 'front', blocks: [] };
  const body = section.blocks.map((block, index) => renderBlock(block, { blankMode: blankRenderMode({ blocks: section.blocks, index, sectionType: section.type, policy: design.bodyBlankPolicy }) })).join('\n');
  return {
    index,
    section,
    sections,
    toc,
    css: stylesheet(design),
    html: body,
  };
}
