import { buildEbookSections, ebookTocEntries, normalizeEbookDesign, verifyEbookSourceCoverage } from './ebook-model.js';

const check = (id, label, status, message) => ({ id, label, status, message });

export function runEpubPreflight({ project, storyLockOk = true } = {}) {
  const design = normalizeEbookDesign(project?.design?.ebook || {});
  const { sections } = buildEbookSections(project);
  const toc = ebookTocEntries(project);
  const coverage = verifyEbookSourceCoverage(project, sections);
  const chapters = project?.manuscript?.stats?.chapters || 0;
  const imageCount = project?.manuscript?.metadata?.imageCount || 0;
  const title = String(project?.title || '').trim();
  const author = String(project?.author || '').trim();
  const languageOk = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(design.language);

  const checks = [
    check('story-lock', 'Story Lock', storyLockOk ? 'pass' : 'error', storyLockOk ? 'Source manuscript hash is verified.' : 'Story Lock failed. EPUB export is blocked.'),
    check('source-coverage', 'Source coverage', coverage.ok ? 'pass' : 'error', coverage.ok ? `All ${coverage.checkedBlocks} source paragraphs map into the reflowable book exactly once and in source order.` : `Ebook section mapping differs from the locked source in ${coverage.mismatches.length} detected location(s).`),
    check('chapters', 'Chapter navigation', chapters > 0 && toc.some((entry) => entry.type === 'chapter') ? 'pass' : 'error', chapters > 0 ? `${chapters} chapter starts feed the clickable EPUB navigation.` : 'No chapter starts were detected. Publish will not guess chapter boundaries.'),
    check('title', 'Book title metadata', title ? 'pass' : 'error', title ? `EPUB title: ${title}` : 'A book title is required for EPUB metadata.'),
    check('author', 'Author metadata', author ? 'pass' : 'warning', author ? `Creator metadata: ${author}` : 'Author metadata is blank. The EPUB can be generated, but author metadata should be set before release.'),
    check('language', 'Language metadata', languageOk ? 'pass' : 'error', languageOk ? `Language tag: ${design.language}` : `“${design.language}” is not a supported language-tag format.`),
    check('images', 'Image assets', imageCount === 0 ? 'pass' : 'error', imageCount === 0 ? 'No DOCX image assets need ebook packaging.' : `${imageCount} DOCX image asset(s) detected. v0.8 blocks EPUB export rather than silently omitting them.`),
    check('sections', 'Reflowable sections', sections.length > 0 ? 'pass' : 'error', `${sections.length} XHTML reading-order section${sections.length === 1 ? '' : 's'} will be packaged.`),
    check('toc', 'Clickable Contents', toc.length > 0 ? 'pass' : 'error', `${toc.length} navigation entr${toc.length === 1 ? 'y' : 'ies'} will be written to EPUB nav.xhtml and NCX.`),
  ];

  const summary = {
    passes: checks.filter((item) => item.status === 'pass').length,
    warnings: checks.filter((item) => item.status === 'warning').length,
    errors: checks.filter((item) => item.status === 'error').length,
  };

  return {
    ready: summary.errors === 0,
    checks,
    summary,
    sections: sections.length,
    tocEntries: toc.length,
    chapterEntries: toc.filter((entry) => entry.type === 'chapter').length,
    design,
    sourceCoverage: coverage,
  };
}
