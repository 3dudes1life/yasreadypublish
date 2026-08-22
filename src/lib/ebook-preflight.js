import { buildEbookSections, ebookTocEntries, normalizeEbookDesign, verifyEbookSourceCoverage } from './ebook-model.js';
import { effectiveStats } from './structure-overrides.js';

const check = (id, label, status, message) => ({ id, label, status, message });
const store = (id, label, ready, message) => ({ id, label, ready, message });

function coverStatus(project) {
  const cover = project?.editions?.ebook?.cover || null;
  if (!cover) return { ok: false, cover: null, message: 'No internal ebook cover image is attached.' };
  const typeOk = ['image/jpeg', 'image/png'].includes(cover.mimeType);
  const width = Number(cover.width) || 0;
  const height = Number(cover.height) || 0;
  const dimensionsOk = width > 0 && height > 0;
  const pixels = width * height;
  const applePixelsOk = !dimensionsOk || pixels <= 5_600_000;
  const googleMinOk = !dimensionsOk || Math.min(width, height) >= 640;
  return {
    ok: typeOk && dimensionsOk && applePixelsOk && googleMinOk && Boolean(cover.dataUrl),
    cover,
    typeOk,
    dimensionsOk,
    applePixelsOk,
    googleMinOk,
    pixels,
    shortSide: dimensionsOk ? Math.min(width, height) : 0,
    message: dimensionsOk ? `${width} × ${height}px ${cover.mimeType || ''}` : 'Cover dimensions could not be verified.',
  };
}

export function runEpubPreflight({ project, storyLockOk = true } = {}) {
  const design = normalizeEbookDesign(project?.editions?.ebook?.design || project?.design?.ebook || {});
  const { sections } = buildEbookSections(project);
  const toc = ebookTocEntries(project, design);
  const coverage = verifyEbookSourceCoverage(project, sections);
  const stats = effectiveStats(project);
  const chapters = stats.chapters || 0;
  const imageCount = project?.manuscript?.metadata?.imageCount || 0;
  const title = String(project?.title || '').trim();
  const author = String(project?.author || '').trim();
  const languageOk = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(design.language);
  const cover = coverStatus(project);
  const chapterTocEntries = toc.filter((entry) => entry.type === 'chapter').length;
  const tocComplete = chapters > 0 && chapterTocEntries === chapters;

  const checks = [
    check('story-lock', 'Story Lock', storyLockOk ? 'pass' : 'error', storyLockOk ? 'Source manuscript hash is verified.' : 'Story Lock failed. EPUB export is blocked.'),
    check('source-coverage', 'Source coverage', coverage.ok ? 'pass' : 'error', coverage.ok ? `All ${coverage.checkedBlocks} source paragraphs map into the reflowable book exactly once and in source order.` : `Ebook section mapping differs from the locked source in ${coverage.mismatches.length} detected location(s).`),
    check('chapters', 'Chapter navigation', tocComplete ? 'pass' : 'error', tocComplete ? `${chapterTocEntries} of ${chapters} chapter starts feed the logical EPUB Table of Contents.` : `${chapterTocEntries} chapter links were generated for ${chapters} detected chapters.`),
    check('visible-toc', 'Visible Table of Contents', design.visibleToc ? 'pass' : 'error', design.visibleToc ? 'A linked HTML/EPUB Table of Contents will be inserted in the reading order immediately before Chapter 1.' : 'Universal ebook mode requires a visible linked Table of Contents near the beginning of the book.'),
    check('logical-toc', 'Logical reader navigation', toc.length > 0 ? 'pass' : 'error', toc.length ? `EPUB 3 nav.xhtml and legacy NCX will contain ${toc.length} linked navigation entries.` : 'No logical navigation entries were generated.'),
    check('landmarks', 'Reader landmarks', tocComplete ? 'pass' : 'error', tocComplete ? 'EPUB landmarks identify the Table of Contents and the first chapter as the reading start.' : 'A first-chapter landmark cannot be created until chapter navigation is complete.'),
    check('toc-page-numbers', 'No ebook page numbers in TOC', 'pass', 'Generated ebook Contents uses chapter links only. Reflowable ebook page numbers are never inserted.'),
    check('cover', 'Internal ebook cover', cover.ok ? 'pass' : 'error', cover.ok ? `${cover.message}. The image will be marked as the EPUB cover-image without adding a duplicate HTML cover page.` : `${cover.message} Add a JPEG or PNG ebook front cover before release.`),
    check('cover-apple', 'Apple Books cover pixel limit', cover.cover && !cover.applePixelsOk ? 'error' : cover.cover ? 'pass' : 'error', cover.cover ? (cover.applePixelsOk ? 'Internal cover stays within Apple Books’ 5.6-million-pixel interior-image limit.' : `Cover is ${cover.pixels.toLocaleString()} pixels; Apple Books limits interior images to 5.6 million pixels.`) : 'Cover required before this check can pass.'),
    check('cover-google', 'Google Play cover size', cover.cover && !cover.googleMinOk ? 'error' : cover.cover ? 'pass' : 'error', cover.cover ? (cover.googleMinOk ? `Shortest cover side is ${cover.shortSide}px (Google minimum is 640px).` : `Shortest cover side is ${cover.shortSide}px; Google Play requires at least 640px.`) : 'Cover required before this check can pass.'),
    check('cover-quality', 'High-resolution cover target', cover.cover && cover.shortSide >= 1400 ? 'pass' : cover.cover ? 'warning' : 'error', cover.cover ? (cover.shortSide >= 1400 ? 'Cover also meets the 1400px-short-side quality target used by Apple’s store artwork guidance.' : `Cover shortest side is ${cover.shortSide}px. A 1400px+ short side is recommended for broad store quality.`) : 'Cover required before this check can pass.'),
    check('title', 'Book title metadata', title ? 'pass' : 'error', title ? `EPUB title: ${title}` : 'A book title is required for EPUB metadata.'),
    check('author', 'Author metadata', author ? 'pass' : 'warning', author ? `Creator metadata: ${author}` : 'Author metadata is blank. Set it before release.'),
    check('publisher', 'Publisher / imprint metadata', design.publisher ? 'pass' : 'warning', design.publisher ? `Publisher metadata: ${design.publisher}` : 'Publisher / imprint metadata is blank.'),
    check('language', 'Language metadata', languageOk ? 'pass' : 'error', languageOk ? `Language tag: ${design.language}` : `“${design.language}” is not a supported language-tag format.`),
    check('reflowable', 'Reflowable EPUB', 'pass', 'The ebook package contains no trim size, gutter, folios, print blank versos, or fixed print page numbers.'),
    check('images', 'DOCX image assets', imageCount === 0 ? 'pass' : 'error', imageCount === 0 ? 'No manuscript image assets need packaging.' : `${imageCount} DOCX image asset(s) detected. YasReady blocks EPUB export rather than silently omitting them.`),
    check('structure-overrides', 'Structure repair metadata', 'pass', `${stats.structureOverrides || 0} paragraph classification override(s) are applied outside Story Lock; source wording is unchanged.`),
    check('word-tables', 'Word tables', (project?.manuscript?.metadata?.tableCount || 0) ? 'warning' : 'pass', (project?.manuscript?.metadata?.tableCount || 0) ? `${project.manuscript.metadata.tableCount} Word table(s) were detected. Paragraph text is preserved, but table grid layout is not reproduced.` : 'No Word table structures detected.'),
    check('manual-breaks', 'Manual Word page breaks', (project?.manuscript?.metadata?.manualPageBreakCount || 0) ? 'warning' : 'pass', (project?.manuscript?.metadata?.manualPageBreakCount || 0) ? `${project.manuscript.metadata.manualPageBreakCount} manual Word page break(s) were detected and intentionally ignored in the reflowable edition.` : 'No manual Word page breaks detected.'),
    check('front-matter', 'Front matter reflow', 'pass', design.frontMatterMode === 'clean' ? 'Front matter uses clean reflow rules: source words/emphasis remain intact while print-only blank spacing is collapsed.' : 'Front matter uses bounded source paragraph alignment/spacing where available.'),
    check('sections', 'Reflowable sections', sections.length > 0 ? 'pass' : 'error', `${sections.length} source-backed XHTML section${sections.length === 1 ? '' : 's'} will be packaged plus the visible Table of Contents.`),
  ];

  const summary = {
    passes: checks.filter((item) => item.status === 'pass').length,
    warnings: checks.filter((item) => item.status === 'warning').length,
    errors: checks.filter((item) => item.status === 'error').length,
  };

  const coreReady = summary.errors === 0;
  const storeReadiness = [
    store('amazon', 'Amazon Kindle', coreReady, coreReady ? 'Logical TOC, visible HTML TOC, landmarks, reflowable text, and internal cover are ready for Kindle conversion.' : 'Fix the blocking EPUB checks before Kindle upload.'),
    store('apple', 'Apple Books', coreReady && cover.applePixelsOk, coreReady && cover.applePixelsOk ? 'EPUB navigation, reflowable spine, metadata, and cover-image packaging meet the current Apple Books structural checks YasReady validates.' : 'Fix the blocking EPUB/cover checks before Apple Books delivery.'),
    store('kobo', 'Kobo Writing Life', coreReady, coreReady ? 'Reflowable content plus built-in navigation and an in-book linked Contents page are ready for Kobo testing.' : 'Fix the blocking EPUB checks before Kobo upload.'),
    store('google', 'Google Play Books', coreReady && cover.googleMinOk, coreReady && cover.googleMinOk ? 'EPUB navigation and the required embedded front cover are present for Google Play Books.' : 'Fix the blocking EPUB/cover checks before Google Play Books upload.'),
    store('bn', 'B&N NOOK', coreReady, coreReady ? 'Legacy NCX, linked in-book Contents, reflowable XHTML, OPF manifest/spine, and cover metadata are present for NOOK compatibility.' : 'Fix the blocking EPUB checks before B&N Press upload.'),
  ];

  return {
    ready: coreReady && storeReadiness.every((item) => item.ready),
    checks,
    summary,
    sections: sections.length + (design.visibleToc ? 1 : 0),
    sourceSections: sections.length,
    tocEntries: toc.length,
    chapterEntries: chapterTocEntries,
    design,
    sourceCoverage: coverage,
    cover: cover.cover,
    storeReadiness,
  };
}
