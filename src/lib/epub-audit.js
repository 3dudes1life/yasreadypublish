import { buildEpubPackageData } from './epub-export.js';
import { detectEbookPlaceholders } from './ebook-model.js';

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
  const expectedChapters = Number(project?.manuscript?.stats?.chapters || project?.manuscript?.chapters?.length || 0);
  const titleOk = unescapeXml(titleMatch?.[1] || '') === String(project?.title || '');
  const authorOk = unescapeXml(creatorMatch?.[1] || '') === String(project?.author || '');
  const coverOk = coverItems === 1 && coverHtml.length === 0 && [...files.keys()].some((path) => /^OEBPS\/images\/cover\.(?:jpg|png)$/i.test(path));
  const chaptersOk = chapterFiles.length === expectedChapters && chapterNavLinks === expectedChapters;
  const navInSpine = /<itemref idref="nav"\/>/.test(opf);
  const visibleTocInSpine = /<itemref idref="visible-toc"\/>/.test(opf);
  const visibleToc = String(files.get('OEBPS/text/contents.xhtml') || '');
  const navHiddenHack = /hidden=|display\s*:\s*none/i.test(nav);
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
    { id:'audit-visible-toc-file', ok:Boolean(visibleToc) && visibleTocTargetsOk, message:Boolean(visibleToc) && visibleTocTargetsOk ? 'Visible Contents is packaged separately and every link resolves.' : 'Visible Contents XHTML is missing or contains broken links.' },
    { id:'audit-guide', ok:guideOk, message:guideOk ? 'OPF guide declares Table of Contents and Begin Reading targets for Kindle compatibility.' : 'OPF guide is missing Kindle-friendly TOC/start references.' },
    { id:'audit-legacy-cover-meta', ok:legacyCoverMetaOk, message:legacyCoverMetaOk ? 'Cover is declared with EPUB 3 and legacy Kindle cover metadata.' : 'Legacy Kindle cover metadata is missing or mismatched.' },
    { id:'audit-begin-reading', ok:beginReading, message:beginReading ? 'Begin Reading landmark points to body matter.' : 'Begin Reading landmark is missing.' },
    { id:'audit-preview-leak', ok:!previewLeak, message:!previewLeak ? 'Production EPUB contains no Preview Studio CSS/classes/hooks.' : 'Preview Studio-only CSS/classes leaked into the production EPUB.' },
    { id:'audit-manuscript-media', ok:manuscriptMediaOk, message:manuscriptMediaOk ? `${manuscriptMedia.length} manuscript image asset${manuscriptMedia.length === 1 ? '' : 's'} match the EPUB manifest/package.` : 'One or more manuscript image assets are missing from the EPUB manifest/package.' },
    { id:'audit-note-targets', ok:noteTargetsOk, message:noteTargetsOk ? `${noteTargets.length} note reference${noteTargets.length === 1 ? '' : 's'} resolve to note text in the same XHTML document.` : 'One or more footnote/endnote references point to missing local note targets.' },
    { id:'audit-unique-xhtml-ids', ok:uniqueXhtmlIdsOk, message:uniqueXhtmlIdsOk ? 'Every XHTML id is unique within its document.' : `${duplicateIds.length} duplicate XHTML id${duplicateIds.length === 1 ? '' : 's'} were found.` },
    { id:'audit-local-fragments', ok:localFragmentsOk, message:localFragmentsOk ? 'Every fragment-only XHTML link resolves inside its own document.' : `${brokenFragmentTargets.length} local fragment link${brokenFragmentTargets.length === 1 ? '' : 's'} point to missing ids.` },
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
  };
}
