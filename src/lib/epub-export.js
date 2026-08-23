import { buildEbookSections, ebookFontStack, ebookTocEntries, matterSectionHeading, normalizeEbookDesign, verifyEbookSourceCoverage } from './ebook-model.js';
import { blankRenderMode } from './spacing-policy.js';
import { getBlockPresentationOverride } from './presentation-overrides.js';
import { semanticRoleForBlock } from './semantic-styles.js';
import { chapterHeadingOverride, normalizeEbookThemeStudio, splitChapterHeading, themeArtworkAssets } from './ebook-theme-studio.js';

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

function noteLookup(project) {
  const notes = project?.manuscript?.notes || [];
  const lookup = new Map();
  const sequenceByKey = new Map();
  let sequence = 0;
  for (const note of notes) {
    const key = `${note.type || 'footnote'}:${String(note.id ?? '')}`;
    lookup.set(key, note);
    sequence += 1;
    sequenceByKey.set(key, sequence);
  }
  return { lookup, sequenceByKey };
}

function xmlIdPart(value = '') {
  const safe = String(value || '').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe || 'block';
}

function noteReferenceId(block, noteRef, runIndex = 0) {
  return `noteref-${xmlIdPart(noteRef?.type || 'footnote')}-${xmlIdPart(String(noteRef?.id ?? ''))}-${xmlIdPart(block?.id || '')}-${runIndex + 1}`;
}

function inlineRuns(block, project = null, noteContext = null) {
  const runs = block?.runs || [];
  const textMatches = runs.map((run) => run.text || '').join('') === String(block?.text || '');
  if (!runs.length || !textMatches) return escapeXml(block?.text || '').replaceAll('\n', '<br/>');
  const context = noteContext || noteLookup(project);
  return runs.map((run, runIndex) => {
    if (run.noteRef) {
      const key = `${run.noteRef.type || 'footnote'}:${String(run.noteRef.id ?? '')}`;
      const note = context.lookup.get(key);
      const number = context.sequenceByKey.get(key);
      if (!note || !number) return '';
      const targetId = `note-${escapeXml(run.noteRef.type || 'footnote')}-${escapeXml(String(run.noteRef.id ?? ''))}`;
      const refId = escapeXml(noteReferenceId(block, run.noteRef, runIndex));
      return `<a epub:type="noteref" class="note-ref" id="${refId}" href="#${targetId}"><sup>${number}</sup></a>`;
    }
    let value = escapeXml(run.text || '').replaceAll('\n', '<br/>');
    if (!value) return '';
    if (run.smallCaps) value = `<span class="small-caps">${value}</span>`;
    if (run.strike) value = `<s>${value}</s>`;
    if (run.underline) value = `<span class="underline">${value}</span>`;
    if (run.italic) value = `<em>${value}</em>`;
    if (run.bold) value = `<strong>${value}</strong>`;
    return value;
  }).join('');
}

function safeMediaExtension(asset = {}) {
  const mime = String(asset.mimeType || '').toLowerCase();
  if (mime === 'image/png') return 'png';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/svg+xml') return 'svg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/bmp') return 'bmp';
  if (mime === 'image/tiff') return 'tiff';
  return 'jpg';
}

function manuscriptMediaInfo(project) {
  return (project?.manuscript?.media || []).map((asset, index) => ({
    ...asset,
    manifestId: `manuscript-image-${index + 1}`,
    href: `images/manuscript-${String(index + 1).padStart(3, '0')}.${safeMediaExtension(asset)}`,
  }));
}

function renderMediaForBlock(block, project, previewMode = false) {
  const refs = block?.mediaRefs || [];
  if (!refs.length) return '';
  const assets = new Map(manuscriptMediaInfo(project).map((asset) => [asset.id, asset]));
  return refs.map((ref) => {
    const asset = assets.get(ref.mediaId);
    if (!asset) return '';
    const src = previewMode ? asset.dataUrl : `../${asset.href}`;
    const alt = String(ref.altText || '').trim();
    const altAttr = alt ? ` alt="${escapeXml(alt)}"` : ' alt=""';
    const decorative = alt ? '' : ' role="presentation"';
    return `<figure class="inline-image"><img src="${escapeXml(src)}"${altAttr}${decorative} /></figure>`;
  }).join('\n');
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

function themeArtworkSource(design, kind, previewMode = false) {
  const asset = themeArtworkAssets(design).find((item) => item.kind === kind);
  if (!asset) return '';
  return previewMode ? asset.dataUrl : `../${asset.href}`;
}

function artworkHtml(design, kind, previewMode = false, className = 'theme-artwork') {
  const studio = normalizeEbookThemeStudio(design?.themeStudio || {});
  const asset = kind === 'chapter' ? studio.chapterArtwork : studio.sceneBreakArtwork;
  const src = themeArtworkSource(design, kind, previewMode);
  if (!asset || !src) return '';
  const alt = String(asset.altText || '').trim();
  return `<img class="${className}" src="${escapeXml(src)}" alt="${escapeXml(alt)}"${alt ? '' : ' role="presentation"'} />`;
}

function chapterDividerHtml(design) {
  const studio = normalizeEbookThemeStudio(design?.themeStudio || {});
  const divider = studio.chapterDivider;
  if (!divider || divider === 'none') return '';
  const content = divider === 'line' ? '' : divider === 'dots' ? '• • •' : divider === 'diamond' ? '◆' : '✦';
  return `<span class="chapter-divider chapter-divider-${escapeXml(divider)}" aria-hidden="true">${escapeXml(content)}</span>`;
}

function sceneOrnamentHtml(content, design, previewMode = false) {
  const treatment = design?.sceneBreakTreatment || 'source';
  const studio = normalizeEbookThemeStudio(design?.themeStudio || {});
  if (treatment === 'source') return content;
  if (treatment === 'whitespace') return `<span class="scene-source-hidden">${content}</span><span class="scene-whitespace" aria-hidden="true"></span>`;
  if (treatment === 'custom-image') {
    const image = artworkHtml(design, 'scene-break', previewMode, 'scene-break-artwork');
    return image ? `<span class="scene-source-hidden">${content}</span>${image}` : content;
  }
  const ornament = treatment === 'dots' ? '• • •'
    : treatment === 'diamond' ? '◆'
      : treatment === 'flourish' ? '✦'
        : treatment === 'custom-text' ? (studio.sceneBreakCustomText || '✦')
          : '* * *';
  return `<span class="scene-source-hidden">${content}</span><span class="scene-ornament" aria-hidden="true">${escapeXml(ornament)}</span>`;
}

function renderBlock(block, { blankMode = 'preserve', sectionType = 'chapter', design, project = null, previewMode = false, afterBreak = false } = {}) {
  const id = escapeXml(block.id || '');
  const attrs = previewAttrs(block, previewMode);
  const inspectClass = previewMode ? ' yrp-inspectable' : '';
  const content = inlineRuns(block, project);
  const overrideStyle = presentationStyle(project, block, sectionType);
  const media = renderMediaForBlock(block, project, previewMode);

  if (media) {
    const textPart = String(block.text || '').trim()
      ? `<p class="body media-caption">${content}</p>`
      : '';
    return `<div id="${id}" class="media-block${inspectClass}"${attrs}${overrideStyle ? ` style="${overrideStyle}"` : ''}>${media}${textPart}</div>`;
  }

  if (block.kind === 'blank') return `<p id="${id}" class="blank ${blankMode === 'collapse' ? 'collapsed' : blankMode === 'normalize' ? 'normalized' : 'preserved'}"${attrs}></p>`;
  if (block.kind === 'chapter-title') {
    const studio = normalizeEbookThemeStudio(design?.themeStudio || {});
    const chapterOverride = chapterHeadingOverride(project, block.id);
    const chapterStyles = [];
    if (chapterOverride?.spaceBefore != null) chapterStyles.push(`margin-top:${chapterOverride.spaceBefore}em`);
    if (chapterOverride?.spaceAfter != null) chapterStyles.push(`margin-bottom:${chapterOverride.spaceAfter}em`);
    if (chapterOverride?.alignment) chapterStyles.push(`text-align:${chapterOverride.alignment}`);
    if (chapterOverride?.sizeEm != null) chapterStyles.push(`font-size:${chapterOverride.sizeEm}em`);
    const style = mergeInlineStyles(overrideStyle, chapterStyles.join(';'));
    const artwork = artworkHtml(design, 'chapter', previewMode, 'chapter-heading-artwork');
    const before = artwork && studio.chapterArtworkPosition === 'above' ? artwork : '';
    const after = artwork && studio.chapterArtworkPosition === 'below' ? artwork : '';
    const split = splitChapterHeading(block.text || '');
    const layout = split.split ? studio.chapterHeadingLayout : 'combined';
    let headingContent = content;
    if (layout !== 'combined' && split.split) {
      const label = escapeXml(split.label);
      const title = escapeXml(split.title);
      if (layout === 'number-only') headingContent = `<span class="chapter-label">${label}</span><span class="chapter-name chapter-source-hidden">${title}</span>`;
      else if (layout === 'title-only') headingContent = `<span class="chapter-label chapter-source-hidden">${label}</span><span class="chapter-name">${title}</span>`;
      else headingContent = `<span class="chapter-label">${label}</span><span class="chapter-name">${title}</span>`;
    }
    const layoutClass = ` chapter-layout-${layout}`;
    return `<div class="chapter-heading-wrap${layoutClass}">${before}<h1 id="${id}" class="chapter-title${inspectClass}"${attrs}${style ? ` style="${style}"` : ''}>${headingContent}</h1>${chapterDividerHtml(design)}${after}</div>`;
  }
  if (sectionType !== 'chapter' && (block.kind === 'front-back-heading' || matterSectionHeading(block, sectionType))) {
    const baseStyle = matterParagraphStyle(block, design);
    const style = mergeInlineStyles(baseStyle, overrideStyle);
    return `<h2 id="${id}" class="matter-heading${inspectClass}"${attrs}${style ? ` style="${style}"` : ''}>${content}</h2>`;
  }
  if (sectionType !== 'chapter') {
    const style = mergeInlineStyles(matterParagraphStyle(block, design), overrideStyle);
    return `<p id="${id}" class="matter-body${inspectClass}"${attrs} style="${style}">${content}</p>`;
  }

  const role = semanticRoleForBlock(project, block, sectionType);
  const semanticAttr = ` data-yrp-semantic-role="${escapeXml(role)}"`;
  if (role === 'subhead') return `<h2 id="${id}" class="subhead${inspectClass}"${attrs}${semanticAttr}${overrideStyle ? ` style="${overrideStyle}"` : ''}>${content}</h2>`;
  if (role === 'block-quote') return `<blockquote id="${id}" class="block-quote${inspectClass}"${attrs}${semanticAttr}${overrideStyle ? ` style="${overrideStyle}"` : ''}><p>${content}</p></blockquote>`;
  if (role === 'written-note') return `<aside id="${id}" class="written-note${inspectClass}"${attrs}${semanticAttr}${overrideStyle ? ` style="${overrideStyle}"` : ''}><p>${content}</p></aside>`;
  if (role === 'verse') return `<p id="${id}" class="verse${inspectClass}"${attrs}${semanticAttr}${overrideStyle ? ` style="${overrideStyle}"` : ''}>${content}</p>`;
  if (role === 'scene-break') return `<p id="${id}" class="scene-break${inspectClass}"${attrs}${semanticAttr}${overrideStyle ? ` style="${overrideStyle}"` : ''}>${sceneOrnamentHtml(content, design, previewMode)}</p>`;
  if (role === 'text-message') return `<p id="${id}" class="text-message${inspectClass}"${attrs}${semanticAttr}${overrideStyle ? ` style="${overrideStyle}"` : ''}>${content}</p>`;
  const openingClass = block.kind === 'chapter-opening' ? ' chapter-opening' : '';
  const afterBreakClass = afterBreak ? ' paragraph-after-break' : '';
  return `<p id="${id}" class="body${openingClass}${afterBreakClass}${inspectClass}"${attrs}${semanticAttr}${overrideStyle ? ` style="${overrideStyle}"` : ''}>${content}</p>`;
}


function matterMetadataLine(text = '') {
  const value = String(text || '').trim();
  return /@/.test(value)
    || /^ISBN:?$/i.test(value)
    || /^97[89][-\d]/.test(value)
    || /^(first|second|third|fourth) edition\b/i.test(value)
    || /^cover design\b/i.test(value)
    || /^printed in\b/i.test(value)
    || /^publisher\b/i.test(value);
}

function endsSentence(text = '') {
  return /[.!?…][”’"')\]]?$/.test(String(text || '').trim());
}

function startsLowercase(text = '') {
  return /^[“”'‘’(\[]*[a-z]/.test(String(text || '').trim());
}

function renderMatterInlineBlock(block, { project, sectionType, previewMode }) {
  const content = inlineRuns(block, project);
  const id = escapeXml(block.id || '');
  const inspectClass = previewMode ? ' yrp-inspectable' : '';
  const attrs = previewAttrs(block, previewMode);
  const overrideStyle = presentationStyle(project, block, sectionType);
  return `<span id="${id}" class="matter-source-line${inspectClass}"${attrs}${overrideStyle ? ` style="${overrideStyle}"` : ''}>${content}</span>`;
}

function hiddenMatterBlank(block, previewMode = false) {
  const id = escapeXml(block.id || '');
  const attrs = previewAttrs(block, previewMode);
  return `<span id="${id}" class="matter-source-blank"${attrs} aria-hidden="true"></span>`;
}

function usesTresAmigosMatterMatch(design = {}) {
  const studio = normalizeEbookThemeStudio(design?.themeStudio || {});
  return String(studio.themeId || design?.themeId || '') === 'tres-amigos-private';
}

function renderTresAmigosMatterFlow(section, project, design, previewMode = false, role = 'front') {
  const blocks = section.blocks || [];
  const out = [];
  let group = [];
  let pendingBlanks = [];
  let groupAfterBlank = false;

  const flush = (extraClass = '') => {
    if (!group.length) return;
    const spans = group.map((block) => renderMatterInlineBlock(block, { project, sectionType: section.type, previewMode })).join(' ');
    const classes = ['matter-flow'];
    if (extraClass) classes.push(extraClass);
    if (groupAfterBlank) classes.push('matter-after-blank');
    out.push(`<p class="${classes.join(' ')}">${spans}</p>`);
    group = [];
    groupAfterBlank = false;
  };

  for (const block of blocks) {
    if (block.mediaRefs?.length) {
      flush();
      if (pendingBlanks.length) out.push(pendingBlanks.map((blank) => hiddenMatterBlank(blank, previewMode)).join(''));
      pendingBlanks = [];
      out.push(renderBlock(block, { blankMode:'collapse', sectionType:section.type, design, project, previewMode }));
      continue;
    }
    if (block.kind === 'blank') {
      pendingBlanks.push(block);
      continue;
    }
    if (matterSectionHeading(block, section.type)) {
      flush();
      groupAfterBlank = pendingBlanks.length > 0;
      if (pendingBlanks.length) out.push(pendingBlanks.map((blank) => hiddenMatterBlank(blank, previewMode)).join(''));
      pendingBlanks = [];
      group = [block];
      flush(`matter-${role}-lead`);
      continue;
    }

    const previous = group.at(-1);
    const hasBlankBoundary = pendingBlanks.length > 0;
    const metadata = matterMetadataLine(block.text) || (previous && matterMetadataLine(previous.text));
    const naturalSentenceBoundary = previous && endsSentence(previous.text) && !startsLowercase(block.text);
    const continueAcrossBlank = previous && hasBlankBoundary && !endsSentence(previous.text) && startsLowercase(block.text);
    const shouldBreak = group.length && (metadata || (hasBlankBoundary && !continueAcrossBlank) || (!hasBlankBoundary && naturalSentenceBoundary));
    if (shouldBreak) flush();
    if (!group.length && pendingBlanks.length) groupAfterBlank = true;
    if (pendingBlanks.length) {
      out.push(pendingBlanks.map((blank) => hiddenMatterBlank(blank, previewMode)).join(''));
      pendingBlanks = [];
    }
    group.push(block);
  }
  flush();
  if (pendingBlanks.length) out.push(pendingBlanks.map((blank) => hiddenMatterBlank(blank, previewMode)).join(''));
  return `<div class="matter-clean matter-${escapeXml(section.role || section.type)} matter-book1-${escapeXml(role)}">${out.join('\n')}</div>`;
}

function renderCleanMatterSection(section, project, design, previewMode = false) {
  const blocks = section.blocks || [];
  const book1Match = usesTresAmigosMatterMatch(design);
  if (section.role === 'title') {
    const visible = blocks.filter((block) => block.kind !== 'blank' || block.mediaRefs?.length);
    const lines = visible.map((block, index) => {
      if (block.mediaRefs?.length) return renderBlock(block, { blankMode:'collapse', sectionType:section.type, design, project, previewMode });
      const id = escapeXml(block.id || '');
      const attrs = previewAttrs(block, previewMode);
      const inspectClass = previewMode ? ' yrp-inspectable' : '';
      const cls = index === 0 ? 'matter-title-primary' : index === 1 ? 'matter-title-secondary' : index === 2 ? 'matter-title-byline' : 'matter-title-line';
      const style = presentationStyle(project, block, section.type);
      return `<p id="${id}" class="${cls}${inspectClass}"${attrs}${style ? ` style="${style}"` : ''}>${inlineRuns(block, project)}</p>`;
    });
    const blanks = blocks.filter((block) => block.kind === 'blank').map((block) => hiddenMatterBlank(block, previewMode));
    return `<div class="matter-title-page${book1Match ? ' matter-book1-title' : ''}">${lines.join('\n')}${blanks.join('')}</div>`;
  }

  if (book1Match && section.role === 'copyright') {
    return renderTresAmigosMatterFlow(section, project, design, previewMode, 'copyright');
  }
  if (book1Match && section.role === 'dedication') {
    return renderTresAmigosMatterFlow(section, project, design, previewMode, 'dedication');
  }

  const out = [];
  let group = [];
  let pendingBlanks = [];
  const flush = () => {
    if (!group.length) return;
    const spans = group.map((block) => renderMatterInlineBlock(block, { project, sectionType: section.type, previewMode })).join(' ');
    out.push(`<p class="matter-flow">${spans}</p>`);
    group = [];
  };

  for (const block of blocks) {
    if (block.mediaRefs?.length) {
      flush();
      if (pendingBlanks.length) out.push(pendingBlanks.map((blank) => hiddenMatterBlank(blank, previewMode)).join(''));
      pendingBlanks = [];
      out.push(renderBlock(block, { blankMode:'collapse', sectionType:section.type, design, project, previewMode }));
      continue;
    }
    if (block.kind === 'blank') {
      pendingBlanks.push(block);
      continue;
    }
    if (matterSectionHeading(block, section.type)) {
      flush();
      if (pendingBlanks.length) out.push(pendingBlanks.map((blank) => hiddenMatterBlank(blank, previewMode)).join(''));
      pendingBlanks = [];
      out.push(renderBlock(block, { blankMode:'collapse', sectionType:section.type, design, project, previewMode }));
      continue;
    }

    const previous = group.at(-1);
    const hasBlankBoundary = pendingBlanks.length > 0;
    const metadata = matterMetadataLine(block.text) || (previous && matterMetadataLine(previous.text));
    const naturalSentenceBoundary = previous && endsSentence(previous.text) && !startsLowercase(block.text);
    const continueAcrossBlank = previous && hasBlankBoundary && !endsSentence(previous.text) && startsLowercase(block.text);
    const shouldBreak = group.length && (metadata || (hasBlankBoundary && !continueAcrossBlank) || (!hasBlankBoundary && naturalSentenceBoundary));
    if (shouldBreak) flush();
    if (pendingBlanks.length) {
      out.push(pendingBlanks.map((blank) => hiddenMatterBlank(blank, previewMode)).join(''));
      pendingBlanks = [];
    }
    group.push(block);
  }
  flush();
  if (pendingBlanks.length) out.push(pendingBlanks.map((blank) => hiddenMatterBlank(blank, previewMode)).join(''));
  return `<div class="matter-clean matter-${escapeXml(section.role || section.type)}">${out.join('\n')}</div>`;
}

function noteParagraphHtml(paragraph, project) {
  const block = { text: paragraph?.text || '', runs: paragraph?.runs || [] };
  return `<p>${inlineRuns(block, project)}</p>`;
}

function sectionNotesHtml(section, project) {
  const context = noteLookup(project);
  const references = new Map();
  for (const block of section.blocks || []) {
    (block.runs || []).forEach((run, runIndex) => {
      if (!run.noteRef) return;
      const key = `${run.noteRef.type || 'footnote'}:${String(run.noteRef.id ?? '')}`;
      if (!references.has(key) && context.lookup.has(key)) references.set(key, noteReferenceId(block, run.noteRef, runIndex));
    });
  }
  if (!references.size) return '';
  const asides = [...references.entries()].map(([key, firstRefId]) => {
    const note = context.lookup.get(key);
    const number = context.sequenceByKey.get(key);
    const id = `note-${escapeXml(note.type)}-${escapeXml(String(note.id))}`;
    const refId = escapeXml(firstRefId);
    const epubType = note.type === 'endnote' ? 'endnote' : 'footnote';
    const body = (note.paragraphs || []).map((paragraph) => noteParagraphHtml(paragraph, project)).join('');
    return `<aside epub:type="${epubType}" class="ebook-note" id="${id}"><a class="note-backref" href="#${refId}" aria-label="Back to note reference">${number}.</a>${body}</aside>`;
  }).join('\n');
  return `<section class="ebook-notes" aria-label="Notes">${asides}</section>`;
}

function renderSectionBody(section, project, design, previewMode = false) {
  const body = section.type !== 'chapter' && design.frontMatterMode === 'clean'
    ? renderCleanMatterSection(section, project, design, previewMode)
    : (section.blocks || []).map((block, index) => {
      const blankMode = section.type === 'chapter'
        ? blankRenderMode({ blocks:section.blocks, index, sectionType:section.type, policy:design.bodyBlankPolicy })
        : 'collapse';
      let afterBreak = false;
      if (section.type === 'chapter' && block.kind !== 'blank') {
        for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
          const previous = section.blocks[previousIndex];
          if (!previous || previous.kind === 'blank') continue;
          afterBreak = semanticRoleForBlock(project, previous, section.type) === 'scene-break';
          break;
        }
      }
      return renderBlock(block, { blankMode, sectionType:section.type, design, project, previewMode, afterBreak });
    }).join('\n');
  return `${body}${sectionNotesHtml(section, project)}`;
}

function stylesheet(designInput) {
  const design = normalizeEbookDesign(designInput);
  const studio = normalizeEbookThemeStudio(design.themeStudio || {});
  const bodyAlignment = design.bodyAlignment === 'reader' ? '' : ` text-align:${design.bodyAlignment};`;
  const firstParagraphCss = studio.firstParagraphTreatment === 'drop-cap'
    ? `p.chapter-opening::first-letter { float:left; font-size:3.05em; line-height:.82; padding:.08em .08em 0 0; font-weight:700; }`
    : studio.firstParagraphTreatment === 'small-caps'
      ? `p.chapter-opening::first-line { font-variant:small-caps; letter-spacing:.035em; }`
      : '';
  const textMessageExtra = design.textMessageStyle === 'bubbles'
    ? `.text-message { border:.08em solid currentColor; border-radius:.75em; padding:.55em .7em; margin-top:.4em; }`
    : design.textMessageStyle === 'left-right'
      ? `.text-message { max-width:78%; border:.08em solid currentColor; border-radius:.75em; padding:.5em .65em; margin-top:.4em; } .text-message:nth-of-type(even) { margin-left:auto; }`
      : design.textMessageStyle === 'transcript'
        ? `.text-message { margin-left:${Math.max(.4, design.textMessageIndentEm * .5)}em; margin-right:${Math.max(.4, design.textMessageIndentEm * .5)}em; }`
        : '';
  return `@charset "UTF-8";
html { -webkit-text-size-adjust: 100%; }
body { margin:0; padding:0; font-family:${ebookFontStack(design.fontFamily)};${bodyAlignment} }
p { margin:0; }
p.body { margin:0 0 ${design.paragraphGapEm}em 0; text-indent: ${design.firstLineIndentEm}em; }
p.chapter-opening, p.paragraph-after-break { text-indent: 0; }
${firstParagraphCss}
.chapter-heading-wrap { page-break-before:always; break-before:page; text-align:${design.chapterTitleAlignment}; padding-top:${design.chapterTopEm}em; margin-bottom:${design.chapterAfterEm}em; }
h1.chapter-title { margin:0; text-align:${design.chapterTitleAlignment}; font-size:1em; line-height:1.2; font-weight:400; page-break-before:auto; break-before:auto; }
.chapter-layout-combined h1.chapter-title { font-size:${studio.chapterTitleSizeEm}em; font-weight:${studio.chapterTitleWeight}; letter-spacing:${studio.chapterTitleLetterSpacingEm}em; text-transform:${studio.chapterTitleTransform}; }
.chapter-label { display:block; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif; font-size:${studio.chapterLabelSizeEm}em; line-height:1.1; font-weight:400; letter-spacing:.025em; text-transform:uppercase; }
.chapter-name { display:block; margin-top:${studio.chapterNameGapEm}em; font-size:${studio.chapterNameSizeEm}em; line-height:1.25; font-weight:400; font-style:${studio.chapterNameItalic ? 'italic' : 'normal'}; text-transform:none; letter-spacing:0; }
.chapter-source-hidden { display:none; }
.chapter-divider { display:block; width:100%; margin:.35em auto 1.6em; text-align:center; letter-spacing:.12em; }
.chapter-divider-line { width:28%; max-width:7em; height:.08em; background:currentColor; opacity:.55; }
.chapter-heading-artwork { display:block; max-width:8em; max-height:4.5em; width:auto; height:auto; margin:1em auto; }
h2.matter-heading { margin:1.8em 0 1em; font-size:1.3em; line-height:1.2; font-weight:700; }
p.matter-body { text-indent:0; }
.matter-clean { max-width:38em; margin:0 auto; }
.matter-flow { margin:0 0 .78em; text-indent:0; }
.matter-source-blank { display:none; }
.matter-title-page { text-align:center; padding-top:4.5em; }
.matter-title-page p { text-indent:0; }
.matter-title-primary { margin:0 0 .45em; font-size:1.65em; font-weight:700; }
.matter-title-secondary { margin:0 0 1.3em; font-size:1.18em; }
.matter-title-byline { margin:0; font-size:1em; }
.matter-title-line { margin:.45em 0 0; }
.matter-dedication { text-align:center; max-width:31em; padding-top:2.2em; }
.matter-dedication .matter-flow { margin-bottom:1.1em; }
.matter-book1-title { max-width:31em; margin:0 auto; padding-top:8em; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif; }
.matter-book1-title .matter-title-primary { margin:0; font-size:1.45em; line-height:1.45; font-weight:400; letter-spacing:.14em; text-transform:uppercase; }
.matter-book1-title .matter-title-secondary { margin:2.15em 0 0; font-size:1.02em; line-height:1.35; font-weight:400; }
.matter-book1-title .matter-title-byline { margin:3.5em 0 0; font-size:1.06em; line-height:1.3; font-weight:400; }
.matter-book1-title .matter-title-line { margin:5.4em 0 0; font-family:${ebookFontStack(design.fontFamily)}; font-size:1em; line-height:1.3; font-weight:700; }
.matter-book1-copyright { max-width:31em; margin:0 auto; padding-top:5.1em; text-align:center; font-size:.94em; line-height:1.45; }
.matter-book1-copyright .matter-flow { margin:0 0 .32em; text-indent:0; }
.matter-book1-copyright .matter-flow.matter-after-blank { margin-top:1.18em; }
.matter-book1-copyright .matter-copyright-lead { margin-bottom:.32em; font-size:1em; line-height:1.35; font-weight:400; }
.matter-book1-copyright strong, .matter-book1-copyright .matter-copyright-lead strong { font-weight:400; }
.matter-book1-dedication { max-width:29em; margin:0 auto; padding-top:6.4em; text-align:center; font-size:.96em; line-height:1.35; font-style:italic; }
.matter-book1-dedication .matter-flow { margin:0 0 1.75em; text-indent:0; }
.matter-book1-dedication .matter-flow:last-of-type { margin-bottom:0; }
.matter-book1-dedication .matter-flow.matter-after-blank { margin-top:0; }
.matter-book1-dedication .matter-dedication-lead { margin-bottom:2em; font-size:1em; line-height:1.35; font-weight:400; }
.matter-book1-dedication strong, .matter-book1-dedication .matter-dedication-lead strong { font-weight:400; }
body.front p.blank, body.back p.blank { display:none; min-height:0; height:0; margin:0; padding:0; }
p.scene-break { margin:${design.sceneBreakSpaceEm}em 0; text-indent:0; text-align:center; }
.scene-source-hidden { display:none; }
.scene-ornament { letter-spacing:.12em; }
.scene-whitespace { display:block; min-height:.4em; }
.scene-break-artwork { display:block; width:auto; max-width:${studio.sceneBreakArtworkWidthEm}em; max-height:2.5em; margin:0 auto; }
.subhead { margin:1.35em 0 .6em; text-align:${design.subheadAlignment}; font-size:${design.subheadSizeEm}em; line-height:1.25; font-weight:700; break-after:avoid; page-break-after:avoid; }
.block-quote { margin:.8em ${design.blockQuoteIndentEm}em; padding:0; border:0; ${design.blockQuoteStyle === 'italic' ? 'font-style:italic;' : ''} }
.block-quote p { margin:0; text-indent:0; }
.written-note { margin:.95em ${design.writtenNoteStyle === 'inset' ? '1.15' : '0'}em; padding:${design.writtenNoteStyle === 'inset' ? '.75em .9em' : '0'}; border-left:${design.writtenNoteStyle === 'inset' ? '.16em solid currentColor' : '0'}; }
.written-note p { margin:0; text-indent:0; }
.verse { margin:.8em 0 .8em ${design.verseIndentEm}em; text-indent:0; white-space:normal; }
.text-message { margin:0 ${design.textMessageStyle === 'compact' ? Math.max(.35, design.textMessageIndentEm * .55) : design.textMessageIndentEm}em ${design.paragraphGapEm}em; text-indent:0; }
${textMessageExtra}
.media-block { margin:1em 0; text-align:center; }
figure.inline-image { margin:0 auto .55em; max-width:100%; }
figure.inline-image img { display:block; max-width:100%; height:auto; margin:0 auto; }
p.media-caption { text-indent:0; text-align:center; font-size:.92em; }
.note-ref { text-decoration:none; vertical-align:super; font-size:.72em; line-height:0; }
.ebook-notes { margin:1.6em 0 0; padding-top:.8em; border-top:.08em solid currentColor; }
.ebook-note { margin:.7em 0; font-size:.92em; }
.ebook-note p { display:inline; margin:0; text-indent:0; }
.note-backref { margin-right:.35em; text-decoration:none; font-weight:700; }
p.blank { min-height:.7em; }
p.blank.normalized { display:block; min-height:${design.bodyBlankSpaceEm}em; height:${design.bodyBlankSpaceEm}em; margin:0; padding:0; }
p.blank.collapsed { display:none; min-height:0; height:0; margin:0; padding:0; }
p.blank.preserved { min-height:.7em; }
.small-caps { font-variant:small-caps; }
.underline { text-decoration:underline; }
nav[epub\\:type="toc"] h1 { margin:1.2em 0; text-align:${studio.contentsAlignment}; font-size:${studio.contentsStyle === 'dramatic' ? '1.65' : studio.contentsStyle === 'classic' ? '1.5' : '1.45'}em; ${studio.contentsStyle === 'dramatic' ? 'text-transform:uppercase;letter-spacing:.055em;' : ''} }
nav[epub\\:type="toc"] ol { padding-left:${studio.contentsAlignment === 'center' ? '0' : '1.2em'}; ${studio.contentsAlignment === 'center' ? 'list-style-position:inside;text-align:center;' : ''} }
nav[epub\\:type="toc"] li { margin:.5em 0; }
nav a { color:inherit; text-decoration:none; }
.hidden-nav { display:none; }
@media amzn-kf8 { .chapter-heading-wrap { page-break-before:always; } }
`;
}

function sectionXhtml(section, project, design) {
  const title = escapeXml(section.title || project.title || 'Book');
  const sectionType = section.type || 'chapter';
  const body = renderSectionBody(section, project, design, false);
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

function packageOpf(project, design, sections, generatedAt, cover = null, manuscriptMedia = [], themeAssets = []) {
  const title = escapeXml(project.title || 'Book');
  const author = escapeXml(project.author || '');
  const publisher = escapeXml(design.publisher || '');
  const identifier = escapeXml(safeIdentifier(project));
  const modified = generatedAt.replace(/\.\d{3}Z$/, 'Z');
  const manifestSections = sections.map((section, index) => `    <item id="s${index + 1}" href="${escapeXml(section.href)}" media-type="application/xhtml+xml"/>`).join('\n');
  const creator = author ? `\n    <dc:creator>${author}</dc:creator>` : '';
  const publisherMeta = publisher ? `\n    <dc:publisher>${publisher}</dc:publisher>` : '';
  const coverManifest = cover ? `\n    <item id="cover-image" href="${escapeXml(cover.href)}" media-type="${escapeXml(cover.mimeType)}" properties="cover-image"/>` : '';
  const manuscriptMediaManifest = manuscriptMedia.map((asset) => `\n    <item id="${escapeXml(asset.manifestId)}" href="${escapeXml(asset.href)}" media-type="${escapeXml(asset.mimeType)}"/>`).join('');
  const themeMediaManifest = themeAssets.map((asset) => `\n    <item id="${escapeXml(asset.id)}" href="${escapeXml(asset.href)}" media-type="${escapeXml(asset.mimeType)}"/>`).join('');
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
    <item id="css" href="styles.css" media-type="text/css"/>${coverManifest}${manuscriptMediaManifest}${themeMediaManifest}
${manifestSections}
  </manifest>
  <spine toc="ncx">
${spineRows.join('\n')}
  </spine>
</package>`;
}

function dataUrlBytes(dataUrl = '') {
  const match = String(dataUrl).match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) throw new Error('An ebook image asset is not stored as readable base64 data.');
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
  const manuscriptMedia = manuscriptMediaInfo(project);
  const themeAssets = themeArtworkAssets(design);
  const files = new Map();
  files.set('mimetype', 'application/epub+zip');
  files.set('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  files.set('OEBPS/styles.css', stylesheet(design));
  files.set('OEBPS/nav.xhtml', navXhtml(project, design, toc, sections));
  files.set('OEBPS/toc.ncx', ncx(project, toc));
  for (const section of sections) files.set(`OEBPS/${section.href}`, sectionXhtml(section, project, design));
  if (cover) files.set(`OEBPS/${cover.href}`, dataUrlBytes(cover.dataUrl));
  for (const asset of manuscriptMedia) {
    if (asset?.dataUrl) files.set(`OEBPS/${asset.href}`, dataUrlBytes(asset.dataUrl));
  }
  for (const asset of themeAssets) {
    if (asset?.dataUrl) files.set(`OEBPS/${asset.href}`, dataUrlBytes(asset.dataUrl));
  }
  files.set('OEBPS/package.opf', packageOpf(project, design, sections, generatedAt, cover, manuscriptMedia, themeAssets));
  return { files, sections, toc, design, generatedAt, coverage, cover, manuscriptMedia, themeAssets, visibleTocInSpine: Boolean(design.visibleToc) };
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

export function buildEbookPreviewHtml({ project, sectionIndex = 0, inspectMode = false } = {}) {
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
    ? `<div class="yrp-cover-preview yrp-live-cover"><img src="${escapeXml(section.cover.dataUrl)}" alt="${escapeXml(project.title || 'Book cover')}" /></div>`
    : section.synthetic
      ? previewTocHtml(toc)
      : renderSectionBody(section, project, design, Boolean(inspectMode));
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
    const body = renderSectionBody(section, project, design, false);
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
.yrp-cover-preview{min-height:72vh;display:grid;place-items:center;padding:1em}.yrp-cover-preview img{display:block;max-width:100%;max-height:78vh;width:auto;height:auto;object-fit:contain}\n:root{color-scheme:light dark}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#ececf0;color:#18181a}.bar,.footer,.drawer{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body.sepia{background:#e9dfc8}.shell{min-height:100vh;display:grid;grid-template-rows:auto 1fr}.bar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:8px;padding:10px max(12px,env(safe-area-inset-left));background:rgba(250,250,252,.92);backdrop-filter:blur(18px);border-bottom:1px solid rgba(0,0,0,.08)}.bar strong{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.bar button,.bar select{border:1px solid #d7d7dc;border-radius:10px;background:#fff;color:#111;padding:8px 10px;font-weight:700}.reader-wrap{display:grid;grid-template-columns:minmax(0,1fr);padding:18px}.reader-card{width:min(100%,760px);margin:0 auto;background:#fffdf9;color:#18181a;border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.14);overflow:hidden}.reader-item{display:none;padding:clamp(22px,6vw,52px);min-height:76vh}.reader-item.active{display:block}.reader-item[data-type="cover"]{padding:18px;background:#2d2d31}.reader-item[data-type="cover"] .yrp-cover-preview{min-height:72vh}.footer{position:sticky;bottom:0;display:flex;justify-content:space-between;gap:8px;padding:10px max(12px,env(safe-area-inset-left));background:rgba(250,250,252,.92);backdrop-filter:blur(18px);border-top:1px solid rgba(0,0,0,.08)}.footer button{border:0;border-radius:10px;padding:10px 14px;background:#171719;color:#fff;font-weight:800}.footer button:disabled{opacity:.35}.drawer{position:fixed;inset:auto 0 0 0;z-index:30;display:none;max-height:70vh;background:#fff;border-radius:18px 18px 0 0;box-shadow:0 -12px 40px rgba(0,0,0,.22);padding:12px 12px calc(12px + env(safe-area-inset-bottom));overflow:auto}.drawer.open{display:block}.drawer header{display:flex;justify-content:space-between;align-items:center;gap:12px}.drawer header button{border:0;background:#eeeef2;border-radius:9px;padding:8px 10px;font-weight:800}.drawer nav{display:grid;gap:6px;margin-top:10px}.drawer nav button{border:0;border-radius:10px;background:#f6f6f8;padding:10px;text-align:left}.reader-card.font-l{font-size:112%}.reader-card.font-xl{font-size:126%}body.dark{background:#111113}.dark .bar,.dark .footer{background:rgba(28,28,31,.94);color:#fff;border-color:#38383c}.dark .bar button,.dark .bar select{background:#2b2b2f;color:#fff;border-color:#48484d}.dark .reader-card{background:#151517;color:#f2f2f4}.dark .drawer{background:#202024;color:#fff}.dark .drawer nav button{background:#303036;color:#fff}@media(max-width:600px){.reader-wrap{padding:0}.reader-card{border-radius:0;box-shadow:none;min-height:calc(100vh - 102px)}.reader-item{min-height:calc(100vh - 102px);padding:28px 22px}.bar{padding-top:calc(10px + env(safe-area-inset-top))}}
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
