import { buildEpubPackageData } from './epub-export.js';
import { buildEbookSections, detectEbookPlaceholders } from './ebook-model.js';
import { effectiveStats } from './structure-overrides.js';

function count(text, pattern) {
  return [...String(text || '').matchAll(pattern)].length;
}

function unescapeXml(value = '') {
  return String(value)
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

function byteLength(value = '') {
  return new TextEncoder().encode(String(value || '')).length;
}

function stripTags(value = '') {
  return String(value || '').replace(/<[^>]+>/g, '').replace(/&(?:nbsp|amp|lt|gt|quot|apos);/g, 'x').trim();
}

function hiddenTextCount(xhtml = '') {
  let total = 0;
  for (const match of String(xhtml).matchAll(/<([a-z0-9]+)\b[^>]*class="[^"]*(?:chapter-source-hidden|scene-source-hidden)[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi)) {
    total += stripTags(match[2]).length;
  }
  return total;
}

function dataUrlBytes(dataUrl = '') {
  const match = String(dataUrl || '').match(/^data:[^;,]+;base64,(.+)$/s);
  if (!match) return null;
  try {
    const binary = globalThis.atob ? globalThis.atob(match[1]) : Buffer.from(match[1], 'base64').toString('binary');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch { return null; }
}

function imageFacts(asset = {}) {
  const mime = String(asset.mimeType || '').toLowerCase();
  const bytes = dataUrlBytes(asset.dataUrl || '');
  let width = Number(asset.width) || 0;
  let height = Number(asset.height) || 0;
  let transparent = false;
  let cmyk = false;
  if (bytes && mime === 'image/png' && bytes.length >= 26 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    const u32 = (i) => ((bytes[i]<<24)>>>0) + (bytes[i+1]<<16) + (bytes[i+2]<<8) + bytes[i+3];
    width = width || u32(16); height = height || u32(20);
    const colorType = bytes[25];
    transparent = colorType === 4 || colorType === 6;
    if (!transparent) {
      const ascii = Array.from(bytes.slice(0, Math.min(bytes.length, 65536))).map((b) => String.fromCharCode(b)).join('');
      transparent = ascii.includes('tRNS');
    }
  }
  if (bytes && mime === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i += 1; continue; }
      const marker = bytes[i+1];
      if (marker === 0xd9 || marker === 0xda) break;
      const len = (bytes[i+2] << 8) + bytes[i+3];
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && i + 9 < bytes.length) {
        height = height || ((bytes[i+5] << 8) + bytes[i+6]);
        width = width || ((bytes[i+7] << 8) + bytes[i+8]);
        cmyk = bytes[i+9] === 4;
        break;
      }
      if (!len || len < 2) break;
      i += 2 + len;
    }
  }
  return { mime, width, height, transparent, cmyk, readable:Boolean(bytes) };
}

export function auditEpubPackage({ project } = {}) {
  const data = buildEpubPackageData({ project });
  const files = data.files;
  const opf = String(files.get('OEBPS/package.opf') || '');
  const nav = String(files.get('OEBPS/nav.xhtml') || '');
  const css = String(files.get('OEBPS/styles.css') || '');
  const chapterFiles = [...files.keys()].filter((path) => /^OEBPS\/text\/chapter-\d+\.xhtml$/.test(path));
  const allText = [...files.entries()]
    .filter(([path]) => /\.(?:xhtml|css|opf|ncx)$/.test(path))
    .map(([, content]) => typeof content === 'string' ? content : '')
    .join('\n');
  const titleMatch = opf.match(/<dc:title>([\s\S]*?)<\/dc:title>/i);
  const creatorMatch = opf.match(/<dc:creator>([\s\S]*?)<\/dc:creator>/i);
  const coverItems = count(opf, /properties="cover-image"/g);
  const coverHtml = [...files.keys()].filter((path) => /cover\.xhtml$/i.test(path));
  const previewLeak = /(?:\.yrp-inspectable|\.yrp-selected|\.yrp-cover-preview|data-yrp-block-id|yrp-live-cover)/.test(allText);
  const tocNav = nav.match(/<nav[^>]*epub:type="toc"[\s\S]*?<\/nav>/i)?.[0] || '';
  const chapterNavLinks = count(tocNav, /href="text\/chapter-\d+\.xhtml"/g);
  const placeholders = detectEbookPlaceholders(project);
  const expectedChapters = Number(effectiveStats(project).chapters || 0);
  const titleOk = unescapeXml(titleMatch?.[1] || '') === String(project?.title || '');
  const authorOk = unescapeXml(creatorMatch?.[1] || '') === String(project?.author || '');
  const coverOk = coverItems === 1 && coverHtml.length === 0 && [...files.keys()].some((path) => /^OEBPS\/images\/cover\.(?:jpg|png)$/i.test(path));
  const chaptersOk = chapterFiles.length === expectedChapters && chapterNavLinks === expectedChapters;
  const navInSpine = /<itemref idref="nav"\/>/.test(opf);
  const visibleTocInSpine = /<itemref idref="visible-toc"\/>/.test(opf);
  const visibleToc = String(files.get('OEBPS/text/contents.xhtml') || '');
  const navHiddenHack = /hidden=|display\s*:\s*none/i.test(nav);
  const productionHiddenCss = /display\s*:\s*none|visibility\s*:\s*hidden/i.test(css);
  const hiddenCssSample = css.match(/.{0,80}(?:display\s*:\s*none|visibility\s*:\s*hidden).{0,80}/i)?.[0] || '';
  const privateOpfMetadata = /yasready:|yasready\.com\/vocab/i.test(opf);
  const guideOk = /<guide>[\s\S]*type="toc"[\s\S]*type="text"[\s\S]*<\/guide>/i.test(opf);
  const legacyCoverMetaOk = !project?.editions?.ebook?.cover || /<meta name="cover" content="cover-image"\/>/.test(opf);
  const beginReading = /epub:type="bodymatter"/.test(nav);
  const filePaths = new Set([...files.keys()].map((path) => path.replace(/^OEBPS\//, '')));
  const navTargets = [...nav.matchAll(/href="([^"#]+(?:#[^"]*)?)"/g)].map((match) => match[1].split('#')[0]).filter(Boolean);
  const navTargetsOk = navTargets.every((href) => href === 'nav.xhtml' || filePaths.has(href));
  const visibleTocTargets = [...visibleToc.matchAll(/<a\s+href="([^"#]+(?:#[^"]*)?)"/g)].map((match) => `text/${match[1].split('#')[0]}`).filter(Boolean);
  const visibleTocTargetsOk = visibleTocTargets.every((href) => filePaths.has(href));
  const manifestById = new Map([...opf.matchAll(/<item\s+id="([^"]+)"\s+href="([^"]+)"/g)].map((match) => [match[1], match[2]]));
  const spineIds = [...opf.matchAll(/<itemref\s+idref="([^"]+)"\s*\/>/g)].map((match) => match[1]);
  const spineTargetsOk = spineIds.every((id) => manifestById.has(id) && filePaths.has(manifestById.get(id)));
  const manuscriptMedia = project?.manuscript?.media || [];
  const manuscriptImageManifest = [...opf.matchAll(/<item\s+id="manuscript-image-[^"]+"\s+href="([^"]+)"\s+media-type="([^"]+)"\s*\/>/g)];
  const manuscriptMediaOk = manuscriptImageManifest.length === manuscriptMedia.length
    && manuscriptImageManifest.every((match) => filePaths.has(match[1]));
  const xhtmlEntries = [...files.entries()].filter(([path, content]) => /\.xhtml$/i.test(path) && typeof content === 'string');
  const hiddenMarkupPaths = xhtmlEntries.filter(([, content]) => /(?:\shidden(?:=|\s|>)|style="[^"]*(?:display\s*:\s*none|visibility\s*:\s*hidden))/i.test(content)).map(([path]) => path);
  const productionHiddenMarkup = hiddenMarkupPaths.length > 0;
  const htmlFileCount = xhtmlEntries.length;
  const htmlFileCountOk = htmlFileCount < 300;
  const xhtmlSizes = xhtmlEntries.map(([path, content]) => ({ path, bytes:byteLength(content) }));
  const oversizedXhtml = xhtmlSizes.filter((item) => item.bytes >= 30 * 1024 * 1024);
  const bodyRule = css.match(/(?:^|\n)body\s*\{([^}]*)\}/i)?.[1] || '';
  const forcedBodyTypography = /font-family|font-size|line-height|(?:^|;)\s*color\s*:|background(?:-color)?\s*:|text-align\s*:/i.test(bodyRule);
  const imposedBodySides = /margin-(?:left|right)\s*:|padding-(?:left|right)\s*:/i.test(bodyRule);
  const horizontalEmMargins = /(?:\.block-quote|\.written-note|\.verse|\.text-message)[^{]*\{[^}]*margin-(?:left|right)\s*:\s*[^;}]*em\b/i.test(css);
  const positionCss = /(^|[;}\s])position\s*:\s*(?:absolute|fixed|relative|sticky)/i.test(css);
  const negativeMargins = /margin(?:-(?:left|right|top|bottom))?\s*:\s*-[\d.]/i.test(css);
  const hiddenChars = xhtmlEntries.reduce((sum, [, content]) => sum + hiddenTextCount(content), 0);
  const sourceTables = Number(project?.manuscript?.metadata?.tableCount || 0);
  const sourceHyperlinks = Number(project?.manuscript?.metadata?.hyperlinkCount || 0);
  const preservedHyperlinks = (project?.manuscript?.blocks || []).flatMap((block) => block.runs || []).filter((run) => String(run.href || '').trim()).length;
  const ebookSections = buildEbookSections(project).sections;
  const numberedRows = ebookSections.flatMap((section) => (section.blocks || []).filter((block) => block.numbering).map((block) => ({ section, block })));
  const chapterNumberedRows = numberedRows.filter((row) => row.section.type === 'chapter');
  const matterNumberedRows = numberedRows.filter((row) => row.section.type !== 'chapter');
  const sourceNumberedBlocks = chapterNumberedRows.length;
  const nestedNumberedBlocks = chapterNumberedRows.filter((row) => String(row.block.numbering?.ilvl || '0') !== '0').length;
  const semanticListItems = xhtmlEntries.reduce((sum, [, content]) => sum + count(content, /<li\b[^>]*class="[^"]*semantic-list-item/gi), 0);
  const unconvertedSimpleListItems = Math.max(0, sourceNumberedBlocks - semanticListItems);
  const firstListProblem = chapterNumberedRows.find((row) => String(row.block.numbering?.ilvl || '0') !== '0') || (unconvertedSimpleListItems ? chapterNumberedRows[0] : null);
  const coverAsset = project?.editions?.ebook?.cover ? [project.editions.ebook.cover] : [];
  const themeAssets = [project?.editions?.ebook?.design?.themeStudio?.chapterArtwork, project?.editions?.ebook?.design?.themeStudio?.sceneBreakArtwork].filter(Boolean);
  const imageFactsRows = [...coverAsset, ...(project?.manuscript?.media || []), ...themeAssets].map((asset) => ({ asset, ...imageFacts(asset) }));
  const imageDimensionFailures = imageFactsRows.filter((item) => !item.width || !item.height || item.width <= 1 || item.height <= 1);
  const transparentImages = imageFactsRows.filter((item) => item.transparent);
  const cmykImages = imageFactsRows.filter((item) => item.cmyk);
  const duplicateIds = [];
  const brokenFragmentTargets = [];
  for (const [path, content] of xhtmlEntries) {
    const ids = [...content.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) duplicateIds.push({ path, id });
      seen.add(id);
    }
    for (const match of content.matchAll(/href="#([^"]+)"/g)) {
      if (!seen.has(match[1])) brokenFragmentTargets.push({ path, target: match[1] });
    }
  }
  const noteTargets = [...allText.matchAll(/href="#(note-(?:footnote|endnote)-[^"]+)"/g)].map((match) => match[1]);
  const noteTargetsOk = brokenFragmentTargets.filter((item) => /^note-(?:footnote|endnote)-/.test(item.target)).length === 0;
  const uniqueXhtmlIdsOk = duplicateIds.length === 0;
  const localFragmentsOk = brokenFragmentTargets.length === 0;
  const checks = [
    { id:'audit-title', ok:titleOk, message:titleOk ? 'EPUB title metadata matches the project title.' : 'EPUB title metadata does not match the project title.' },
    { id:'audit-author', ok:authorOk, message:authorOk ? 'EPUB creator metadata matches the project author.' : 'EPUB creator metadata does not match the project author.' },
    { id:'audit-kindle-private-meta', ok:!privateOpfMetadata, message:!privateOpfMetadata ? 'Publishable OPF contains only standard publication metadata; YasReady private metadata stays outside the EPUB.' : 'Private YasReady OPF metadata leaked into the publishable EPUB.' },
    { id:'audit-nav-targets', ok:navTargetsOk, message:navTargetsOk ? 'Every EPUB navigation link resolves to a packaged file.' : 'One or more EPUB navigation links point to missing package files.' },
    { id:'audit-spine-targets', ok:spineTargetsOk, message:spineTargetsOk ? 'Every reading-order spine item resolves to a manifest file.' : 'One or more spine entries point to missing manifest/package files.' },
    { id:'audit-cover', ok:coverOk, message:coverOk ? 'Exactly one internal cover image is packaged and no duplicate cover XHTML exists.' : 'Cover packaging is inconsistent or duplicated.' },
    { id:'audit-chapters', ok:chaptersOk, message:chaptersOk ? `${expectedChapters} chapter XHTML files and ${expectedChapters} chapter navigation links match.` : `Chapter package count/navigation does not match ${expectedChapters} detected chapters.` },
    { id:'audit-nav-spine', ok:!navInSpine && visibleTocInSpine, message:!navInSpine && visibleTocInSpine ? 'Logical nav stays out of the spine while the separate visible Contents page is in reading order.' : 'Kindle navigation and visible Contents are not separated correctly in the spine.' },
    { id:'audit-nav-hidden', ok:!navHiddenHack, message:!navHiddenHack ? 'Logical navigation contains no hidden/display:none TOC markup that Kindle conversion rejects.' : 'Logical navigation contains hidden/display:none markup that can break Kindle conversion.' },
    { id:'audit-amazon-no-hidden-css', ok:!productionHiddenCss && !productionHiddenMarkup, message:!productionHiddenCss && !productionHiddenMarkup ? 'Production EPUB contains no display:none/visibility:hidden CSS or hidden XHTML markup; Kindle Previewer E21018 trigger removed.' : `Production EPUB still contains hidden content${hiddenMarkupPaths.length ? ` in ${hiddenMarkupPaths.join(', ')}` : ''}${hiddenCssSample ? ' in styles.css' : ''}. Rebuild the package; YasReady 1.0.32 sanitizes these automatically.`, action:'package-rebuild' },
    { id:'audit-visible-toc-file', ok:Boolean(visibleToc) && visibleTocTargetsOk, message:Boolean(visibleToc) && visibleTocTargetsOk ? 'Visible Contents is packaged separately and every link resolves.' : 'Visible Contents XHTML is missing or contains broken links.' },
    { id:'audit-guide', ok:guideOk, message:guideOk ? 'OPF guide declares Table of Contents and Begin Reading targets for Kindle compatibility.' : 'OPF guide is missing Kindle-friendly TOC/start references.' },
    { id:'audit-legacy-cover-meta', ok:legacyCoverMetaOk, message:legacyCoverMetaOk ? 'Cover is declared with EPUB 3 and legacy Kindle cover metadata.' : 'Legacy Kindle cover metadata is missing or mismatched.' },
    { id:'audit-begin-reading', ok:beginReading, message:beginReading ? 'Begin Reading landmark points to body matter.' : 'Begin Reading landmark is missing.' },
    { id:'audit-preview-leak', ok:!previewLeak, message:!previewLeak ? 'Production EPUB contains no Preview Studio CSS/classes/hooks.' : 'Preview Studio-only CSS/classes leaked into the production EPUB.' },
    { id:'audit-manuscript-media', ok:manuscriptMediaOk, message:manuscriptMediaOk ? `${manuscriptMedia.length} manuscript image asset${manuscriptMedia.length === 1 ? '' : 's'} match the EPUB manifest/package.` : 'One or more manuscript image assets are missing from the EPUB manifest/package.' },
    { id:'audit-note-targets', ok:noteTargetsOk, message:noteTargetsOk ? `${noteTargets.length} note reference${noteTargets.length === 1 ? '' : 's'} resolve to note text in the same XHTML document.` : 'One or more footnote/endnote references point to missing local note targets.' },
    { id:'audit-unique-xhtml-ids', ok:uniqueXhtmlIdsOk, message:uniqueXhtmlIdsOk ? 'Every XHTML id is unique within its document.' : `${duplicateIds.length} duplicate XHTML id${duplicateIds.length === 1 ? '' : 's'} were found.` },
    { id:'audit-local-fragments', ok:localFragmentsOk, message:localFragmentsOk ? 'Every fragment-only XHTML link resolves inside its own document.' : `${brokenFragmentTargets.length} local fragment link${brokenFragmentTargets.length === 1 ? '' : 's'} point to missing ids.` },
    { id:'audit-amazon-body-defaults', ok:!forcedBodyTypography && !imposedBodySides, message:!forcedBodyTypography && !imposedBodySides ? 'Normal body text keeps Kindle reader-controlled font, size, line height, color, background, alignment, and side geometry.' : 'Production CSS forces one or more body-reading settings that Kindle readers should control.' },
    { id:'audit-amazon-percent-margins', ok:!horizontalEmMargins, message:!horizontalEmMargins ? 'Special paragraph horizontal margins use Kindle-safe percentage geometry.' : 'One or more left/right margins use em units; Amazon recommends percentages for differentiated paragraphs.' },
    { id:'audit-amazon-positioning', ok:!positionCss && !negativeMargins, message:!positionCss && !negativeMargins ? 'Production CSS uses no position property or negative margins.' : 'Production CSS contains positioned or negative-margin layout that can break reflow.' },
    { id:'audit-amazon-hidden-text', ok:hiddenChars === 0, message:hiddenChars === 0 ? 'Production XHTML contains zero non-empty hidden source characters.' : `${hiddenChars} non-empty hidden character(s) remain in production XHTML.` },
    { id:'audit-amazon-html-count', ok:htmlFileCountOk, message:htmlFileCountOk ? `${htmlFileCount} XHTML files; below Amazon’s 300-file ceiling.` : `${htmlFileCount} XHTML files; Amazon requires fewer than 300.` },
    { id:'audit-amazon-html-size', ok:oversizedXhtml.length === 0, message:oversizedXhtml.length === 0 ? 'Every generated XHTML file is below Amazon’s 30 MB ceiling.' : `${oversizedXhtml.length} XHTML file(s) exceed Amazon’s 30 MB ceiling.` },
    { id:'audit-amazon-images', ok:imageDimensionFailures.length === 0, message:imageDimensionFailures.length === 0 ? `${imageFactsRows.length} packaged image asset(s) have readable dimensions greater than 1 px.` : `${imageDimensionFailures.length} image asset(s) have missing/1-pixel dimensions that can break Kindle conversion.` },
    { id:'audit-amazon-tables', ok:sourceTables === 0, message:sourceTables === 0 ? 'No source tables require semantic reconstruction.' : `${sourceTables} source table(s) detected. Hard Mode blocks export rather than silently flattening tables.` },
    { id:'audit-amazon-hyperlinks', ok:sourceHyperlinks === 0 || preservedHyperlinks >= sourceHyperlinks, message:sourceHyperlinks === 0 ? 'No source hyperlinks require preservation.' : preservedHyperlinks >= sourceHyperlinks ? `${sourceHyperlinks} source hyperlink(s) are preserved in the ebook model.` : `${sourceHyperlinks} source hyperlink(s) were detected but only ${preservedHyperlinks} are preserved; re-import with 1.0.27.` },
    { id:'audit-amazon-lists', ok:nestedNumberedBlocks === 0 && unconvertedSimpleListItems === 0, message:sourceNumberedBlocks === 0 ? (matterNumberedRows.length ? `${matterNumberedRows.length} numbered front/back-matter paragraph(s) are outside chapter-list reconstruction and do not block Kindle export.` : 'No source numbered/bulleted lists require semantic reconstruction.') : nestedNumberedBlocks > 0 ? `${sourceNumberedBlocks} chapter list paragraph(s) include ${nestedNumberedBlocks} nested item(s); nested list reconstruction needs review.` : unconvertedSimpleListItems > 0 ? `${unconvertedSimpleListItems} of ${sourceNumberedBlocks} simple chapter list item(s) were not emitted as semantic HTML list items.` : `${sourceNumberedBlocks} chapter list item(s) are exported as semantic HTML lists.`, blockId:firstListProblem?.block?.id || null, action:firstListProblem ? 'source' : null },
  ];
  return {
    ok: checks.every((item) => item.ok),
    checks,
    placeholders,
    title: unescapeXml(titleMatch?.[1] || ''),
    author: unescapeXml(creatorMatch?.[1] || ''),
    chapterFiles: chapterFiles.length,
    chapterNavLinks,
    coverItems,
    navTargetsOk,
    visibleTocTargetsOk,
    spineTargetsOk,
    manuscriptMediaOk,
    noteTargetsOk,
    uniqueXhtmlIdsOk,
    localFragmentsOk,
    duplicateIds,
    brokenFragmentTargets,
    previewLeak,
    files: files.size,
    amazonHardMode: { htmlFileCount, oversizedXhtml, hiddenChars, productionHiddenCss, productionHiddenMarkup, hiddenMarkupPaths, hiddenCssSample, forcedBodyTypography, imposedBodySides, horizontalEmMargins, positionCss, negativeMargins, sourceTables, sourceHyperlinks, preservedHyperlinks, sourceNumberedBlocks, matterNumberedBlocks:matterNumberedRows.length, nestedNumberedBlocks, unconvertedSimpleListItems, semanticListItems, imageDimensionFailures:imageDimensionFailures.length, transparentImages:transparentImages.length, cmykImages:cmykImages.length },
  };
}
