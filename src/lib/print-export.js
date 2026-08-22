import { fontStack, normalizePrintDesign } from './print-model.js';
import { runningHeaderText } from './structure-model.js';

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function sliceRuns(block, startOffset = 0, endOffset = null) {
  if (!block?.runs?.length) return [];
  const end = endOffset == null ? block.text.length : endOffset;
  let cursor = 0;
  const out = [];
  for (const run of block.runs) {
    const runStart = cursor;
    const runEnd = cursor + run.text.length;
    cursor = runEnd;
    const overlapStart = Math.max(startOffset, runStart);
    const overlapEnd = Math.min(end, runEnd);
    if (overlapStart >= overlapEnd) continue;
    out.push({ ...run, text: run.text.slice(overlapStart - runStart, overlapEnd - runStart) });
  }
  return out;
}

function renderInline(fragment, blocksById) {
  const block = blocksById.get(fragment.sourceBlockId);
  if (!block) return escapeHtml(fragment.text);
  const runs = sliceRuns(block, fragment.startOffset || 0, fragment.endOffset ?? block.text.length);
  if (!runs.length || runs.map((run) => run.text).join('') !== fragment.text) return escapeHtml(fragment.text);
  return runs.map((run) => {
    const styles = [];
    if (run.bold) styles.push('font-weight:700');
    if (run.italic) styles.push('font-style:italic');
    const decorations = [run.underline ? 'underline' : '', run.strike ? 'line-through' : ''].filter(Boolean).join(' ');
    if (decorations) styles.push(`text-decoration:${decorations}`);
    if (run.smallCaps) styles.push('font-variant:small-caps');
    return `<span${styles.length ? ` style="${styles.join(';')}"` : ''}>${escapeHtml(run.text)}</span>`;
  }).join('');
}

function renderChapterTitle(text, design) {
  const safe = escapeHtml(text);
  const match = safe.match(/^(Chapter\s+(?:\d+|[IVXLCDM]+):?)(\s*)(.*)$/i);
  if (!match) return safe;
  return `<span style="font-weight:${design.chapterLabelWeight}">${match[1]}</span>${match[2]}<span style="font-weight:${design.chapterNameWeight}">${match[3]}</span>`;
}

function renderPage(page, design, project, blocksById) {
  const isLeft = page.side === 'left';
  const padding = isLeft
    ? `${design.topMargin}in ${design.insideMargin}in ${design.bottomMargin}in ${design.outsideMargin}in`
    : `${design.topMargin}in ${design.outsideMargin}in ${design.bottomMargin}in ${design.insideMargin}in`;

  const fragments = page.intentionalBlank ? '' : (page.fragments || []).map((fragment) => {
    if (fragment.kind === 'blank') {
      const h = Math.max(0, Number(fragment.measuredHeight || 0) / 96);
      return `<div class="fragment blank ${fragment.collapsedBlank ? 'collapsed' : ''}" style="height:${h}in"></div>`;
    }
    if (fragment.kind === 'generated-toc-title') {
      return `<div class="fragment generated-toc-title" style="padding-top:${design.tocTopSpace}in;padding-bottom:${design.tocAfterTitleSpace}in;font-size:${design.tocTitleSize}pt;text-align:center;font-weight:400;line-height:1.15">${escapeHtml(fragment.text)}</div>`;
    }
    if (fragment.kind === 'generated-toc-entry') {
      return `<div class="fragment generated-toc-entry" style="font-size:${design.tocEntryFontSize}pt;line-height:${design.tocLineHeight}"><span class="toc-label">${escapeHtml(fragment.tocTitle || fragment.text)}</span><span class="toc-leader"></span><span class="toc-page">${escapeHtml(fragment.tocPageNumber ?? '')}</span></div>`;
    }
    let style = '';
    let content = renderInline(fragment, blocksById);
    if (fragment.kind === 'chapter-title') {
      style += `padding-top:${design.chapterTopSpace}in;padding-bottom:${design.chapterAfterSpace}in;font-size:${design.chapterTitleSize}pt;line-height:${design.chapterTitleLineHeight};text-align:${design.chapterTitleAlignment};`;
      content = renderChapterTitle(fragment.text, design);
    }
    if (fragment.kind === 'body') style += `text-align:${design.bodyAlignment};`;
    if (fragment.kind === 'body' && !fragment.continuation && !fragment.suppressIndent) style += `text-indent:${design.firstLineIndent}in;`;
    if (fragment.isFinalPiece && design.paragraphGap && ['body','chapter-opening','text-message'].includes(fragment.kind)) style += `padding-bottom:${design.paragraphGap}in;`;
    return `<div class="fragment ${escapeHtml(fragment.kind)} ${fragment.continuation ? 'continuation' : ''}" style="${style}">${content}</div>`;
  }).join('');

  const showFolio = !page.intentionalBlank && design.pageNumbers !== 'none' && page.bookPageNumber != null;
  const folio = showFolio
    ? `<div class="folio ${isLeft ? 'left' : 'right'}" style="font-size:${design.pageNumberFontSize}pt;bottom:${design.folioBottom}in;${isLeft ? `left:${design.folioOutsideInset}in` : `right:${design.folioOutsideInset}in`}">${page.bookPageNumber}</div>`
    : '';

  const headerText = page.showRunningHeader
    ? runningHeaderText({
        side: page.side,
        projectTitle: project.title || '',
        author: project.author || '',
        chapterTitle: page.chapterTitle || '',
        mode: design.runningHeaderMode,
      })
    : '';
  const header = !page.intentionalBlank && design.runningHeaders && headerText
    ? `<div class="running-header ${isLeft ? 'left' : 'right'}" style="font-size:${design.runningHeaderFontSize}pt;top:${design.runningHeaderTop}in;${isLeft ? `left:${design.runningHeaderOutsideInset}in` : `right:${design.runningHeaderOutsideInset}in`}">${escapeHtml(headerText)}</div>`
    : '';

  return `<section class="pdf-page ${page.intentionalBlank ? 'intentional-blank' : ''}" data-page="${page.number}" data-book-page="${page.bookPageNumber ?? ''}" style="width:${design.trimWidth}in;height:${design.trimHeight}in;padding:${padding}">${header}${fragments}${folio}</section>`;
}

export function buildPrintMasterHtml({ project, preview, manuscriptHash = '', autoPrint = false } = {}) {
  if (!project || !preview?.pages?.length) throw new Error('A paginated preview is required before export.');
  const design = normalizePrintDesign(preview.design || project.design?.print || {});
  const blocksById = new Map((project.manuscript?.blocks || []).map((block) => [block.id, block]));
  const safeTitle = escapeHtml(project.title || 'YasReady Publish Book');
  const pages = preview.pages.map((page) => renderPage(page, design, project, blocksById)).join('\n');
  const generatedAt = new Date().toISOString();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle} - Print Master</title>
<meta name="yasready-story-lock" content="${escapeHtml(manuscriptHash)}">
<meta name="yasready-page-count" content="${preview.pages.length}">
<style>
  @page { size: ${design.trimWidth}in ${design.trimHeight}in; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; background:#d9d9dd; }
  body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .toolbar { position:sticky; top:0; z-index:5; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 16px; background:#111113; color:white; box-shadow:0 2px 12px rgba(0,0,0,.24); }
  .toolbar strong { display:block; font-size:14px; }
  .toolbar span { display:block; margin-top:2px; color:#bbb; font-size:11px; }
  .toolbar-actions { display:flex; align-items:center; gap:8px; }
  .toolbar button { border:0; border-radius:9px; padding:9px 13px; font-weight:800; cursor:pointer; }
  .toolbar button.primary { background:#fff; color:#111; }
  .toolbar button:disabled { opacity:.45; cursor:not-allowed; }
  #status.good { color:#78e6a6; } #status.bad { color:#ff8a8a; }
  .pages { padding:24px; display:grid; gap:18px; justify-content:center; }
  .pdf-page { position:relative; overflow:hidden; background:#fff; color:#111; font-family:${fontStack(design.bodyFont)}; font-size:${design.bodyFontSize}pt; line-height:${design.lineHeight}; box-shadow:0 5px 18px rgba(0,0,0,.18); break-after:page; page-break-after:always; }
  .pdf-page:last-child { break-after:auto; page-break-after:auto; }
  .fragment { margin:0; padding:0; white-space:pre-wrap; overflow-wrap:break-word; }
  .fragment.chapter-title { font-weight:400; }
  .generated-toc-entry { display:flex; align-items:baseline; gap:.08in; white-space:normal; }
  .generated-toc-entry .toc-label { flex:0 1 auto; }
  .generated-toc-entry .toc-leader { flex:1 1 auto; min-width:.16in; border-bottom:1px dotted currentColor; transform:translateY(-.08em); }
  .generated-toc-entry .toc-page { flex:0 0 auto; text-align:right; font-variant-numeric:tabular-nums; }
  .fragment.scene-break { text-align:center; }
  .folio { position:absolute; line-height:1; }
  .running-header { position:absolute; max-width:44%; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; line-height:1; color:#333; }
  .running-header.left { text-align:left; } .running-header.right { text-align:right; }
  .intentional-blank { padding:0 !important; }
  @media print {
    html, body { background:#fff !important; }
    .toolbar { display:none !important; }
    .pages { display:block; padding:0; margin:0; }
    .pdf-page { box-shadow:none; margin:0; }
  }
</style>
</head>
<body>
<div class="toolbar">
  <div><strong>${safeTitle} - KDP Print Master</strong><span id="status">Checking ${preview.pages.length} pages for overflow…</span></div>
  <div class="toolbar-actions"><button id="printButton" class="primary" disabled>Print / Save as PDF</button></div>
</div>
<main class="pages">${pages}</main>
<script>
(() => {
  const pages = Array.from(document.querySelectorAll('.pdf-page'));
  const status = document.getElementById('status');
  const button = document.getElementById('printButton');
  const finish = () => {
    const bad = pages.filter((page) => page.scrollHeight > page.clientHeight + 1 || page.scrollWidth > page.clientWidth + 1);
    if (bad.length) {
      status.textContent = 'BLOCKED: ' + bad.length + ' page(s) overflow the production page box.';
      status.className = 'bad';
      button.disabled = true;
    } else {
      status.textContent = 'Production layout check passed · ${preview.pages.length} single pages · Story Lock ${escapeHtml(manuscriptHash).slice(0, 12)}…';
      status.className = 'good';
      button.disabled = false;
      if (${autoPrint ? 'true' : 'false'}) setTimeout(() => window.print(), 250);
    }
  };
  button.addEventListener('click', () => window.print());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(finish)));
  else window.addEventListener('load', () => requestAnimationFrame(() => requestAnimationFrame(finish)));
})();
</script>
<!-- Generated by YasReady Publish 1.0.5 at ${generatedAt}. Source hash: ${escapeHtml(manuscriptHash)} -->
</body>
</html>`;
}
