import { buildEbookSections, detectEbookPlaceholders, ebookTocEntries, verifyEbookSourceCoverage } from './ebook-model.js';
import { buildEpubPackageData } from './epub-export.js';
import { auditEpubPackage } from './epub-audit.js';
import { countPresentationOverrides, ensurePresentationOverrides } from './presentation-overrides.js';
import { semanticRoleCounts } from './semantic-styles.js';
import { effectiveStats } from './structure-overrides.js';

const BODY_KINDS = new Set(['body', 'chapter-opening', 'text-message']);
const NORMAL_STYLE_RE = /^(normal|body text|body|no spacing|default paragraph font)$/i;

function issue({ id, severity = 'info', label, message, blockId = null, sectionId = null, count = null, action = null }) {
  return { id, severity, label, message, blockId, sectionId, count, action };
}


function styleName(block) {
  return String(block?.style?.name || 'Normal').trim() || 'Normal';
}

function chapterSections(project) {
  return buildEbookSections(project).sections.filter((section) => section.type === 'chapter');
}

function sourceStyleOutliers(project, chapters) {
  const blocks = chapters.flatMap((section) => section.blocks).filter((block) => BODY_KINDS.has(block.kind));
  const counts = new Map();
  for (const block of blocks) {
    const key = styleName(block);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0]?.[0] || 'Normal';
  const rareThreshold = Math.max(2, Math.floor(blocks.length * 0.003));
  const rare = sorted
    .filter(([name, count]) => name !== dominant && count <= rareThreshold && !NORMAL_STYLE_RE.test(name))
    .map(([name, count]) => ({ name, count }));
  return { dominant, rare, totalStyles: counts.size, blocks: blocks.length };
}

export function enhancedTypesettingAudit(project) {
  let data;
  try {
    data = buildEpubPackageData({ project });
  } catch (error) {
    return {
      ok: false,
      checks: [{ id: 'package-build', ok: false, label: 'Production package can be built', message: error?.message || 'EPUB package could not be built for reflow analysis.', severity: 'error' }],
      errors: 1,
      warnings: 0,
    };
  }
  const css = String(data.files.get('OEBPS/styles.css') || '');
  const opf = String(data.files.get('OEBPS/package.opf') || '');
  const checks = [];
  const add = (id, ok, label, message, severity = ok ? 'pass' : 'warning') => checks.push({ id, ok, label, message, severity });

  const bodyRule = css.match(/body\s*\{([^}]*)\}/i)?.[1] || '';
  add('reader-font-size', !/font-size\s*:\s*[^;]*(?:px|pt)/i.test(bodyRule), 'Reader-controlled body size', 'Body text does not force a fixed px/pt font size, so Kindle readers can resize it.', 'error');
  add('reader-line-height', !/line-height\s*:/i.test(bodyRule), 'Reader-controlled body line height', 'Body text leaves base line-height to the reading system.', 'warning');
  add('reflowable-layout', /<meta property="rendition:layout">reflowable<\/meta>/i.test(opf), 'Reflowable package', 'EPUB metadata explicitly declares a reflowable layout.', 'error');
  add('no-fixed-position', !/position\s*:\s*(?:fixed|absolute)/i.test(css), 'No fixed-position book content', 'Production CSS avoids fixed/absolute positioning that can fight reflow.', 'warning');
  add('no-negative-margins', !/margin(?:-[a-z]+)?\s*:\s*-[\d.]/i.test(css), 'No negative margins', 'Production CSS avoids negative-margin layout hacks.', 'warning');
  add('relative-heading-size', /h1\.chapter-title[^}]*font-size\s*:\s*[\d.]+em/i.test(css), 'Relative chapter sizing', 'Chapter headings use relative em sizing instead of fixed points.', 'warning');
  add('chapter-page-break', /(?:h1\.chapter-title|\.chapter-heading-wrap)[^}]*(?:break-before|page-break-before)\s*:\s*(?:page|always)/i.test(css), 'Chapter starts are explicit', 'Chapter headings or their Theme Studio wrapper carry a reflow-safe break-before rule.', 'warning');

  return {
    ok: checks.every((check) => check.ok || check.severity !== 'error'),
    checks,
    errors: checks.filter((check) => !check.ok && check.severity === 'error').length,
    warnings: checks.filter((check) => !check.ok && check.severity !== 'error').length,
  };
}

export function scanKindleQuality(project) {
  if (!project) return { score: 0, grade: '—', issues: [], summary: { errors: 0, warnings: 0, info: 0 }, ready: false };
  ensurePresentationOverrides(project);
  const { sections } = buildEbookSections(project);
  const chapters = sections.filter((section) => section.type === 'chapter');
  const toc = ebookTocEntries(project);
  const coverage = verifyEbookSourceCoverage(project, sections);
  let packageAudit;
  try {
    packageAudit = auditEpubPackage({ project });
  } catch (error) {
    packageAudit = { ok:false, checks:[{ id:'audit-build', ok:false, message:error?.message || 'Finished EPUB package could not be audited.' }] };
  }
  const enhanced = enhancedTypesettingAudit(project);
  const placeholders = detectEbookPlaceholders(project);
  const semanticCounts = semanticRoleCounts(project, sections);
  const notes = project?.manuscript?.notes || [];
  const media = project?.manuscript?.media || [];
  const mediaRefs = (project?.manuscript?.blocks || []).flatMap((block) => block.mediaRefs || []);
  const missingAlt = mediaRefs.filter((ref) => !String(ref.altText || '').trim());
  const issues = [];

  if (!coverage.ok) {
    issues.push(issue({ id: 'source-coverage', severity: 'error', label: 'Story coverage mismatch', message: `${coverage.mismatches.length} source coverage mismatch(es) were found. EPUB production must remain blocked.` }));
  }
  if (placeholders.length) {
    issues.push(issue({ id: 'placeholders', severity: 'error', label: 'Source placeholder text', message: `${placeholders.length} print-layout placeholder${placeholders.length === 1 ? '' : 's'} remain in ebook matter.`, blockId: placeholders[0]?.id || null }));
  }

  const sourceChapterCount = Number(project?.manuscript?.stats?.chapters || project?.manuscript?.chapters?.length || 0);
  const expectedChapters = Number(effectiveStats(project).chapters || 0);
  if (chapters.length !== expectedChapters) {
    issues.push(issue({ id: 'chapter-count', severity: 'error', label: 'Chapter map mismatch', message: `Effective book structure contains ${expectedChapters} chapters but the EPUB builder created ${chapters.length}.`, action:'structure' }));
  }
  if (sourceChapterCount !== expectedChapters) {
    const inferred = (project?.bookBrain?.interpretations || []).find((entry) => entry.category === 'structure' && entry.suggestion === 'chapter-title' && entry.state !== 'ignored' && !project?.manuscript?.blocks?.find((block) => block.id === entry.blockId && block.kind === 'chapter-title'));
    issues.push(issue({ id:'book-brain-chapter-variance', severity:'warning', label:'Book Brain chapter interpretation', message:`The source parser found ${sourceChapterCount} chapter${sourceChapterCount === 1 ? '' : 's'}; Book Brain currently interprets ${expectedChapters}. Review the inferred chapter start${expectedChapters - sourceChapterCount === 1 ? '' : 's'} before release.`, blockId:inferred?.blockId || null, action:'book-brain' }));
  }

  for (const section of chapters) {
    const titleBlocks = section.blocks.filter((block) => block.kind === 'chapter-title');
    if (titleBlocks.length !== 1) {
      issues.push(issue({ id: `chapter-title-${section.id}`, severity: 'error', label: 'Chapter title structure', message: `${section.title} contains ${titleBlocks.length} chapter-title blocks; expected exactly one.`, sectionId: section.id, blockId: titleBlocks[0]?.id || null }));
    }
    if ((section.wordCount || 0) < 40) {
      issues.push(issue({ id: `short-${section.id}`, severity: 'info', label: 'Very short chapter', message: `${section.title} contains only ${section.wordCount || 0} words. Confirm that is intentional.`, sectionId: section.id }));
    }
    if (String(section.title || '').length > 90) {
      issues.push(issue({ id: `long-title-${section.id}`, severity: 'warning', label: 'Long chapter title', message: `${section.title.slice(0, 70)}… may wrap heavily at larger Kindle text sizes.`, sectionId: section.id }));
    }
  }

  const overrideCount = countPresentationOverrides(project, 'ebook');
  if (overrideCount > 20) {
    issues.push(issue({ id: 'override-volume', severity: 'warning', label: 'Many local formatting overrides', message: `${overrideCount} block-specific Kindle overrides are active. Heavy local tweaking can make a long book harder to keep visually consistent.`, count: overrideCount }));
  } else if (overrideCount) {
    issues.push(issue({ id: 'override-volume', severity: 'info', label: 'Local formatting overrides', message: `${overrideCount} Story-Lock-safe Kindle formatting override${overrideCount === 1 ? '' : 's'} are active.`, count: overrideCount }));
  }

  const overrides = project.presentationOverrides?.ebook || {};
  const byId = new Map((project.manuscript?.blocks || []).map((block) => [block.id, block]));
  for (const [blockId, value] of Object.entries(overrides)) {
    const block = byId.get(blockId);
    if (!block) {
      issues.push(issue({ id: `orphan-override-${blockId}`, severity: 'warning', label: 'Orphan formatting override', message: `A Kindle override points to missing source block ${blockId}.`, blockId }));
      continue;
    }
    const extreme = Number(value.spaceBefore || 0) > 2.5 || Number(value.spaceAfter || 0) > 2.5 || Number(value.firstLineIndent || 0) > 2.5;
    if (extreme) {
      issues.push(issue({ id: `extreme-override-${blockId}`, severity: 'warning', label: 'Large local spacing override', message: `A local override on ${block.kind} ${blockId} is unusually large and should be visually checked at multiple reader sizes.`, blockId }));
    }
  }

  const semanticTotal = Object.values(semanticCounts).reduce((sum, value) => sum + Number(value || 0), 0);
  if (semanticTotal) {
    const summaryText = Object.entries(semanticCounts)
      .filter(([, count]) => count)
      .map(([role, count]) => `${role.replaceAll('-', ' ')} (${count})`)
      .join(', ');
    issues.push(issue({ id: 'semantic-styles', severity: 'info', label: 'Semantic fiction styles', message: `${semanticTotal} semantic block${semanticTotal === 1 ? '' : 's'} detected or assigned: ${summaryText}.` }));
  }
  if (notes.length) {
    issues.push(issue({ id: 'notes-present', severity: 'info', label: 'Footnotes / endnotes', message: `${notes.length} imported note${notes.length === 1 ? '' : 's'} are included in Story Lock and linked in the finished EPUB.` }));
  }
  if (media.length) {
    issues.push(issue({ id: 'media-present', severity: 'info', label: 'Inline manuscript images', message: `${media.length} embedded image asset${media.length === 1 ? '' : 's'} will be packaged in the finished EPUB.` }));
  }
  if (missingAlt.length) {
    issues.push(issue({ id: 'image-alt', severity: 'warning', label: 'Image accessibility text', message: `${missingAlt.length} inline image placement${missingAlt.length === 1 ? '' : 's'} have no source alt text. Decorative images are preserved, but meaningful images should receive alt text in the master DOCX.` }));
  }

  const styles = sourceStyleOutliers(project, chapters);
  if (styles.rare.length) {
    issues.push(issue({ id: 'rare-word-styles', severity: 'info', label: 'Rare Word styles detected', message: `${styles.rare.map((item) => `${item.name} (${item.count})`).join(', ')} appear only rarely inside chapter prose. YasReady normalizes ebook presentation, but these are worth a quick source check.` }));
  }

  for (const check of packageAudit.checks.filter((check) => !check.ok)) {
    issues.push(issue({ id: `package-${check.id}`, severity: 'error', label: 'Finished EPUB package', message: check.message, blockId: check.blockId || null, action: check.action || null }));
  }
  for (const check of enhanced.checks.filter((check) => !check.ok)) {
    issues.push(issue({ id: `enhanced-${check.id}`, severity: check.severity === 'error' ? 'error' : 'warning', label: check.label, message: check.message }));
  }

  const navChapterCount = toc.filter((entry) => entry.type === 'chapter').length;
  if (navChapterCount !== expectedChapters) {
    issues.push(issue({ id: 'toc-count', severity: 'error', label: 'Kindle navigation count', message: `Kindle navigation has ${navChapterCount} chapter links for ${expectedChapters} effective chapters.` }));
  }

  const summary = {
    errors: issues.filter((item) => item.severity === 'error').length,
    warnings: issues.filter((item) => item.severity === 'warning').length,
    info: issues.filter((item) => item.severity === 'info').length,
  };
  const score = Math.max(0, 100 - summary.errors * 25 - summary.warnings * 7);
  const grade = score >= 97 ? 'A+' : score >= 93 ? 'A' : score >= 90 ? 'A−' : score >= 87 ? 'B+' : score >= 83 ? 'B' : score >= 80 ? 'B−' : score >= 70 ? 'C' : 'Needs work';
  return {
    ready: summary.errors === 0,
    score,
    grade,
    issues,
    summary,
    chapters: chapters.length,
    tocChapters: navChapterCount,
    overrideCount,
    sourceStyleSummary: styles,
    enhanced,
    packageAudit,
    semanticCounts,
    noteCount: notes.length,
    mediaCount: media.length,
    missingAltText: missingAlt.length,
  };
}

export function kindleTorturePresets(referencePt = 11) {
  return [
    { id: 'small-phone', label: 'Small · Phone', detail: 'Narrow screen · smaller reader text', prefs: { device: 'phone', orientation: 'portrait', fontScale: 's', appearance: 'white', referencePt, mode: 'read', simulateEink: false } },
    { id: 'normal-kindle', label: 'Normal · Kindle', detail: 'Baseline reference view', prefs: { device: 'ereader', orientation: 'portrait', fontScale: 'm', appearance: 'white', referencePt, mode: 'read', simulateEink: false } },
    { id: 'large-tablet', label: 'Large · Tablet', detail: 'Wide screen · extra-large reader text', prefs: { device: 'tablet', orientation: 'portrait', fontScale: 'xl', appearance: 'white', referencePt, mode: 'read', simulateEink: false } },
  ];
}
