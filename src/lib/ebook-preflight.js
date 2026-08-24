import { buildEbookSections, detectEbookPlaceholders, ebookTocEntries, normalizeEbookDesign, verifyEbookSourceCoverage } from './ebook-model.js';
import { auditEpubPackage } from './epub-audit.js';
import { effectiveStats } from './structure-overrides.js';
import { enhancedTypesettingAudit } from './kindle-quality.js';
import { themeArtworkAssets } from './ebook-theme-studio.js';

const check = (id, label, status, message) => ({ id, label, status, message });

function coverStatus(project) {
  const cover = project?.editions?.ebook?.cover || null;
  if (!cover) return { ok: false, cover: null, message: 'No internal Kindle cover image is attached.' };
  const typeOk = ['image/jpeg', 'image/png'].includes(cover.mimeType);
  const width = Number(cover.width) || 0;
  const height = Number(cover.height) || 0;
  const dimensionsOk = width > 0 && height > 0;
  const portrait = dimensionsOk && height > width;
  const recommended = dimensionsOk && width >= 1600 && height >= 2500;
  const shortSide = dimensionsOk ? Math.min(width, height) : 0;
  return {
    ok: typeOk && dimensionsOk && portrait && Boolean(cover.dataUrl),
    cover,
    typeOk,
    dimensionsOk,
    portrait,
    recommended,
    shortSide,
    message: dimensionsOk ? `${width} × ${height}px ${cover.mimeType || ''}` : 'Cover dimensions could not be verified.',
  };
}

function maxSectionApproxBytes(sections = []) {
  let max = 0;
  for (const section of sections) {
    const bytes = new TextEncoder().encode((section.blocks || []).map((block) => block.text || '').join('\n')).length;
    max = Math.max(max, bytes);
  }
  return max;
}

export function runEpubPreflight({ project, storyLockOk = true } = {}) {
  const design = normalizeEbookDesign(project?.editions?.ebook?.design || project?.design?.ebook || {});
  const { sections } = buildEbookSections(project);
  const toc = ebookTocEntries(project, design);
  const coverage = verifyEbookSourceCoverage(project, sections);
  const stats = effectiveStats(project);
  const chapters = stats.chapters || 0;
  const imageCount = project?.manuscript?.metadata?.imageCount || 0;
  const mediaAssets = project?.manuscript?.media || [];
  const mediaById = new Set(mediaAssets.map((asset) => asset.id));
  const imageRefs = (project?.manuscript?.blocks || []).flatMap((block) => block.mediaRefs || []);
  const missingImageRefs = imageRefs.filter((ref) => !mediaById.has(ref.mediaId));
  const supportedImageTypes = new Set(['image/jpeg','image/png']);
  const themeAssets = themeArtworkAssets(design);
  const unsupportedImages = [...mediaAssets, ...themeAssets].filter((asset) => !supportedImageTypes.has(String(asset.mimeType || '').toLowerCase()));
  const missingAltText = imageRefs.filter((ref) => !String(ref.altText || '').trim());
  const notes = project?.manuscript?.notes || [];
  const noteKeys = new Set(notes.map((note) => `${note.type}:${note.id}`));
  const noteRefs = (project?.manuscript?.blocks || []).flatMap((block) => (block.runs || []).map((run) => run.noteRef).filter(Boolean));
  const unresolvedNoteRefs = noteRefs.filter((ref) => !noteKeys.has(`${ref.type}:${ref.id}`));
  const title = String(project?.title || '').trim();
  const author = String(project?.author || '').trim();
  const languageOk = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(design.language);
  const cover = coverStatus(project);
  const chapterTocEntries = toc.filter((entry) => entry.type === 'chapter').length;
  const tocComplete = chapters > 0 && chapterTocEntries === chapters;
  const htmlFileCount = sections.length + (design.visibleToc ? 1 : 0);
  const fileCountOk = htmlFileCount < 300;
  const maxApproxBytes = maxSectionApproxBytes(sections);
  const sectionSizeOk = maxApproxBytes < 30 * 1024 * 1024;
  const paragraphSeparationOk = Number(design.firstLineIndentEm) > 0 || Number(design.paragraphGapEm) > 0;
  const placeholders = detectEbookPlaceholders(project);
  const packageAudit = auditEpubPackage({ project });
  const enhanced = enhancedTypesettingAudit(project);

  const checks = [
    check('story-lock', 'Story Lock', storyLockOk ? 'pass' : 'error', storyLockOk ? 'Source manuscript hash is verified.' : 'Story Lock failed. Kindle EPUB export is blocked.'),
    check('source-coverage', 'Exact source coverage', coverage.ok ? 'pass' : 'error', coverage.ok ? `All ${coverage.checkedBlocks} source paragraphs map into the reflowable book exactly once and in source order.` : `Ebook section mapping differs from the locked source in ${coverage.mismatches.length} detected location(s).`),
    check('chapters', 'Chapter navigation', tocComplete ? 'pass' : 'error', tocComplete ? `${chapterTocEntries} of ${chapters} chapter starts feed the Kindle logical Table of Contents.` : `${chapterTocEntries} chapter links were generated for ${chapters} detected chapters.`),
    check('visible-toc', 'Visible linked Contents', design.visibleToc ? 'pass' : 'error', design.visibleToc ? 'A linked HTML Table of Contents is placed in the reading order immediately before Chapter 1.' : 'Kindle mode requires the visible linked Contents page to stay on.'),
    check('logical-toc', 'Kindle Go To navigation', toc.length > 0 ? 'pass' : 'error', toc.length ? `EPUB 3 nav.xhtml and NCX contain ${toc.length} linked entries for Kindle navigation.` : 'No logical navigation entries were generated.'),
    check('landmarks', 'Reader landmarks', tocComplete ? 'pass' : 'error', tocComplete ? 'Landmarks identify the Contents and first chapter as the reading start.' : 'A first-chapter landmark cannot be created until chapter navigation is complete.'),
    check('toc-page-numbers', 'No fixed ebook page numbers', 'pass', 'The ebook Contents contains links only; print page numbers are never inserted into the reflowable TOC.'),
    check('cover', 'Internal Kindle cover', cover.ok ? 'pass' : 'error', cover.ok ? `${cover.message}. It will be packaged once as the EPUB cover-image with no duplicate HTML cover page.` : `${cover.message} Attach a portrait JPEG or PNG front cover before Kindle export.`),
    check('cover-quality', 'High-resolution cover', cover.cover && cover.recommended ? 'pass' : cover.cover ? 'warning' : 'error', cover.cover ? (cover.recommended ? 'Cover meets Amazon’s recommended ~1600 × 2560 high-resolution target.' : `${cover.message}. Amazon recommends approximately 1600 × 2560 for best Kindle cover quality.`) : 'Cover required before this check can pass.'),
    check('title', 'Book title metadata', title ? 'pass' : 'error', title ? `EPUB title: ${title}` : 'A book title is required for Kindle metadata.'),
    check('author', 'Author metadata', author ? 'pass' : 'error', author ? `Creator metadata: ${author}` : 'Author metadata is required before Kindle release.'),
    check('publisher', 'Publisher / imprint metadata', design.publisher ? 'pass' : 'warning', design.publisher ? `Publisher metadata: ${design.publisher}` : 'Publisher / imprint is blank. Add it if you want it embedded in the EPUB metadata.'),
    check('language', 'Language metadata', languageOk ? 'pass' : 'error', languageOk ? `Language tag: ${design.language}` : `“${design.language}” is not a supported language-tag format.`),
    check('reflowable', 'Kindle reflowable structure', 'pass', 'No trim size, gutter, print folios, fixed print page numbers, or print blank versos are packaged into the ebook.'),
    check('reader-defaults', 'Reader-controlled body text', packageAudit.amazonHardMode?.forcedBodyTypography || packageAudit.amazonHardMode?.imposedBodySides ? 'error' : 'pass', packageAudit.amazonHardMode?.forcedBodyTypography || packageAudit.amazonHardMode?.imposedBodySides ? 'Amazon Hard Mode found forced body typography/alignment/side geometry.' : 'Normal body text leaves font face, size, line height, color, background, alignment, and side geometry to the Kindle reader.'),
    ...enhanced.checks.map((item) => check(`enhanced-${item.id}`, `Enhanced Typesetting · ${item.label}`, item.ok ? 'pass' : item.severity === 'error' ? 'error' : 'warning', item.message)),
    check('paragraph-separation', 'Paragraph separation', paragraphSeparationOk ? 'pass' : 'error', paragraphSeparationOk ? 'Body paragraphs remain visually distinguishable with relative-unit spacing/indentation.' : 'Kindle body paragraphs need either an indent or paragraph spacing.'),
    check('html-file-count', 'Kindle HTML file count', packageAudit.amazonHardMode?.htmlFileCount < 300 ? 'pass' : 'error', `${packageAudit.amazonHardMode?.htmlFileCount ?? htmlFileCount} generated XHTML file(s); Amazon requires fewer than 300.`),
    check('html-file-size', 'Kindle section size', (packageAudit.amazonHardMode?.oversizedXhtml?.length || 0) === 0 ? 'pass' : 'error', (packageAudit.amazonHardMode?.oversizedXhtml?.length || 0) === 0 ? 'Every final generated XHTML file is below Amazon’s 30 MB ceiling.' : `${packageAudit.amazonHardMode.oversizedXhtml.length} generated XHTML file(s) exceed Amazon’s 30 MB ceiling.`),
    check('images', 'DOCX image assets', imageCount === 0 ? 'pass' : (mediaAssets.length === imageCount && missingImageRefs.length === 0 && unsupportedImages.length === 0 ? 'pass' : 'error'), imageCount === 0 ? 'No manuscript image assets need packaging.' : (mediaAssets.length === imageCount && missingImageRefs.length === 0 && unsupportedImages.length === 0 ? `${imageCount} embedded image asset${imageCount === 1 ? '' : 's'} are preserved and packaged in the Kindle EPUB.` : `${imageCount} DOCX image asset(s) detected, but ${missingImageRefs.length} reference(s) are unresolved and ${unsupportedImages.length} asset(s) use image types Kindle conversion does not accept. Use JPEG or PNG.`)),
    check('image-alt', 'Image accessibility text', missingAltText.length ? 'warning' : 'pass', missingAltText.length ? `${missingAltText.length} embedded image placement${missingAltText.length === 1 ? '' : 's'} have no Word alt text. The images are preserved, but add alt text in the final DOCX when the image conveys meaning.` : imageRefs.length ? `All ${imageRefs.length} embedded image placement${imageRefs.length === 1 ? '' : 's'} include alt text.` : 'No embedded manuscript images require alt text.'),
    check('image-transparency', 'Kindle image transparency', packageAudit.amazonHardMode?.transparentImages ? 'warning' : 'pass', packageAudit.amazonHardMode?.transparentImages ? `${packageAudit.amazonHardMode.transparentImages} PNG image(s) contain transparency. Kindle may flatten transparent pixels to white; review them in Kindle Previewer.` : 'No transparent PNG assets detected in the package.'),
    check('image-colorspace', 'Kindle image color space', packageAudit.amazonHardMode?.cmykImages ? 'warning' : 'pass', packageAudit.amazonHardMode?.cmykImages ? `${packageAudit.amazonHardMode.cmykImages} JPEG image(s) appear to use four color components (CMYK). Amazon converts CMYK to sRGB; replace with sRGB for predictable color.` : 'No likely CMYK JPEG assets detected.'),
    check('notes', 'Footnotes / endnotes', unresolvedNoteRefs.length ? 'error' : 'pass', unresolvedNoteRefs.length ? `${unresolvedNoteRefs.length} note reference${unresolvedNoteRefs.length === 1 ? '' : 's'} do not resolve to imported note text.` : notes.length ? `${notes.length} footnote/endnote${notes.length === 1 ? '' : 's'} are Story-Locked and packaged with linked note references.` : 'No footnotes or endnotes detected.'),
    check('structure-overrides', 'Structure repair metadata', 'pass', `${stats.structureOverrides || 0} paragraph classification override(s) are applied outside Story Lock; source wording is unchanged.`),
    check('word-tables', 'Word tables', (project?.manuscript?.metadata?.tableCount || 0) ? 'error' : 'pass', (project?.manuscript?.metadata?.tableCount || 0) ? `${project.manuscript.metadata.tableCount} Word table(s) were detected. Amazon Hard Mode blocks export rather than silently flattening table structure.` : 'No Word table structures detected.'),
    check('manual-breaks', 'Manual Word page breaks', (project?.manuscript?.metadata?.manualPageBreakCount || 0) ? 'warning' : 'pass', (project?.manuscript?.metadata?.manualPageBreakCount || 0) ? `${project.manuscript.metadata.manualPageBreakCount} manual Word page break(s) were detected and intentionally ignored in the reflowable edition.` : 'No manual Word page breaks detected.'),
    check('front-matter', 'Front matter reflow', 'pass', design.frontMatterMode === 'clean' ? 'Front matter uses clean Kindle reflow rules: source words/emphasis remain intact while print-only line wrapping and blank spacing are reflowed for an ebook.' : 'Front matter uses bounded source paragraph alignment/spacing where available.'),
    check('placeholders', 'Layout placeholder scan', placeholders.length ? 'error' : 'pass', placeholders.length ? `${placeholders.length} possible print-layout placeholder${placeholders.length === 1 ? '' : 's'} detected in front/back matter: ${placeholders.map((item) => item.text).join(', ')}. Remove or deliberately rewrite these in the master manuscript before final Kindle export.` : 'No CHAPTERS PAGE / TOC PAGE-style layout placeholders were detected in ebook matter.'),
    ...packageAudit.checks.map((item) => check(item.id, `Finished EPUB · ${item.id.replace(/^audit-/, '').replaceAll('-', ' ')}`, item.ok ? 'pass' : 'error', item.message)),
    check('sections', 'Reading-order sections', sections.length > 0 ? 'pass' : 'error', `${sections.length} source-backed XHTML section${sections.length === 1 ? '' : 's'} will be packaged plus the visible Contents.`),
  ];

  const summary = {
    passes: checks.filter((item) => item.status === 'pass').length,
    warnings: checks.filter((item) => item.status === 'warning').length,
    errors: checks.filter((item) => item.status === 'error').length,
  };
  const ready = summary.errors === 0;

  return {
    ready,
    target: 'Amazon KDP / Kindle',
    checks,
    summary,
    sections: sections.length + (design.visibleToc ? 1 : 0),
    sourceSections: sections.length,
    tocEntries: toc.length,
    chapterEntries: chapterTocEntries,
    design,
    sourceCoverage: coverage,
    cover: cover.cover,
    packageAudit,
    enhancedTypesetting: enhanced,
    placeholders,
    kdp: {
      ready,
      htmlFileCount,
      maxApproxSectionBytes: maxApproxBytes,
      message: ready ? 'Amazon Hard Mode passed. Ready for Kindle Previewer.' : `Fix ${summary.errors} blocking Amazon Hard Mode check${summary.errors === 1 ? '' : 's'} before export.`,
    },
  };
}
