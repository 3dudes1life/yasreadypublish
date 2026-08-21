import { parseDocx } from './lib/docx-parser.js';
import { createProjectFromImport, migrateProject, verifyProjectStoryLock } from './lib/project.js';
import { deleteProject, listProjects, loadProject, saveProject } from './lib/project-store.js';
import { shortHash } from './lib/hash.js';
import {
  applyTemplate,
  contentBoxInches,
  fontStack,
  normalizePrintDesign,
  pageSide,
  validatePrintDesign,
} from './lib/print-model.js';
import { analyzeMatter, chapterForBlockIndex, matterSectionForBlockIndex, runningHeaderText } from './lib/structure-model.js';

const VERSION = '0.4.0';
const CSS_PX_PER_INCH = 96;
const PREVIEW_PX_PER_INCH = 58;

const state = {
  project: null,
  projects: [],
  activeView: 'import',
  search: '',
  busy: false,
  busyMessage: '',
  error: '',
  preview: null,
  spreadIndex: 0,
};

const app = document.querySelector('#app');

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = units[0];
  for (let i = 1; value >= 1024 && i < units.length; i += 1) {
    value /= 1024;
    unit = units[i];
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value || 0);
}

function currentDesign() {
  return normalizePrintDesign(state.project?.design?.print || {});
}

function renderShell() {
  app.innerHTML = `
    <header class="topbar">
      <div class="topbar-inner">
        <div class="brand"><span class="brand-mark">Y</span><span>YasReady <span class="brand-product">Publish</span></span></div>
        <span class="version">PRIVATE ALPHA · v${VERSION}</span>
      </div>
    </header>
    <main class="app-shell">
      <section class="hero compact-hero">
        <div>
          <div class="eyebrow">Story-safe book production</div>
          <h1>Build the pages.<br>Protect every word.</h1>
          <p>Version 0.4 adds book-level structure around the locked manuscript: front matter, chapter body, back matter, optional running headers, and book metadata — while the source story remains untouchable.</p>
        </div>
        <div class="story-lock-pill"><span class="dot"></span> Story Lock is mandatory</div>
      </section>
      <div class="workspace">
        ${renderSidebar()}
        <section class="main" id="mainView">${renderMain()}</section>
      </div>
      <div class="footer-note">YasReady Publish v${VERSION} · Manuscripts stay local in this build · Design settings never alter source wording.</div>
    </main>`;
  bindEvents();
}

function renderSidebar() {
  const hasProject = Boolean(state.project);
  return `
    <aside class="sidebar">
      <div class="sidebar-head"><strong>Publish workspace</strong><span>0.4 understands the whole book around the Story-Locked manuscript.</span></div>
      <nav class="sidebar-nav">
        ${navButton('import', '＋', hasProject ? 'Project' : 'Import')}
        ${navButton('chapters', '☷', 'Contents', !hasProject)}
        ${navButton('matter', '§', 'Book Matter', !hasProject)}
        ${navButton('design', 'Aa', 'Design', !hasProject)}
        ${navButton('print', '▣', 'Print Preview', !hasProject)}
        ${navButton('source', '≡', 'Source', !hasProject)}
        ${navButton('library', '▦', 'Library')}
      </nav>
      <div class="sidebar-foot"><p><strong>Story Lock:</strong> page geometry, typography, and pagination can change. Manuscript text cannot.</p></div>
    </aside>`;
}

function navButton(view, icon, label, disabled = false) {
  return `<button class="nav-item ${state.activeView === view ? 'active' : ''}" data-view="${view}" ${disabled ? 'disabled' : ''}><span class="nav-icon">${icon}</span><span>${label}</span></button>`;
}

function renderMain() {
  if (state.busy) return renderBusy();
  if (state.activeView === 'library') return renderLibrary();
  if (!state.project) return renderImport();
  if (state.activeView === 'chapters') return renderChapters();
  if (state.activeView === 'matter') return renderMatter();
  if (state.activeView === 'design') return renderDesign();
  if (state.activeView === 'print') return renderPrint();
  if (state.activeView === 'source') return renderSource();
  return renderProject();
}

function renderImport() {
  return `
    <article class="panel">
      <div class="panel-head"><div><span class="badge good">Story Lock ON</span><h2>Create a publishing project</h2><p>Your original DOCX is read locally. YasReady Publish does not provide manuscript editing controls.</p></div></div>
      ${state.error ? `<div class="notice error">${escapeHtml(state.error)}</div>` : ''}
      <div class="empty-project" id="dropzone">
        <div class="drop-icon">⇧</div>
        <h3>Drop your final DOCX here</h3>
        <p>Publish maps the manuscript into paragraphs and chapters, fingerprints the exact source text, then keeps all design work in a separate layer.</p>
        <button class="btn primary" id="chooseFile">Choose DOCX</button>
        <input type="file" id="fileInput" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden>
        <div class="privacy-note">🔒 Local processing · no AI rewriting · no silent corrections</div>
      </div>
    </article>
    <article class="panel">
      <div class="panel-head"><div><div class="eyebrow">v0.4 capability</div><h2>Publish now understands the whole book</h2><p>Front matter, the chapter body, and recognized back matter are mapped without moving or rewriting a single source paragraph.</p></div></div>
      <div class="summary-grid six">
        <div class="stat"><b>✓</b><span>Read DOCX</span></div>
        <div class="stat"><b>✓</b><span>Story Lock</span></div>
        <div class="stat"><b>6×9</b><span>Trim</span></div>
        <div class="stat"><b>↔</b><span>Mirror margins</span></div>
        <div class="stat"><b>ODD</b><span>Chapter starts</span></div>
        <div class="stat"><b>§</b><span>Book matter</span></div>
      </div>
    </article>`;
}

function renderBusy() {
  return `<article class="panel importing"><div><div class="spinner"></div><strong>${escapeHtml(state.busyMessage || 'Working safely…')}</strong><p style="color:var(--muted);font-size:12px">The source manuscript remains locked while Publish works on structure and presentation.</p></div></article>`;
}

function renderProject() {
  const p = state.project;
  const s = p.manuscript.stats;
  const design = currentDesign();
  return `
    <article class="panel">
      <div class="panel-head"><div><span class="badge good">Imported safely</span><h2>${escapeHtml(p.title)}</h2><p>${escapeHtml(p.source.fileName)} · ${formatBytes(p.source.fileSize)}</p></div><button class="btn secondary" id="newImport">Import another</button></div>
      <div class="lock-card">
        <div class="lock-shield">◆</div>
        <div><strong>Story Lock verified</strong><p>Design can repaginate this manuscript, but source wording remains fingerprinted and read-only.</p></div>
        <div class="lock-hash">MANUSCRIPT SHA-256<br>${escapeHtml(shortHash(p.source.manuscriptHash, 18))}</div>
      </div>
      <div class="project-meta-grid">
        <label><span>Book title metadata</span><input id="projectTitle" value="${escapeHtml(p.title)}" aria-label="Project title"></label>
        <label><span>Author metadata</span><input id="projectAuthor" value="${escapeHtml(p.author || '')}" placeholder="Author / imprint name" aria-label="Author"></label>
        <div class="project-meta-actions"><button class="btn secondary" id="saveMetadata">Save metadata</button><button class="btn secondary" id="verifyLock">Verify Story Lock</button></div>
      </div>
      <div class="summary-grid">
        <div class="stat"><b>${formatNumber(s.chapters)}</b><span>Chapters</span></div>
        <div class="stat"><b>${formatNumber(s.words)}</b><span>Words</span></div>
        <div class="stat"><b>${formatNumber(s.paragraphs)}</b><span>Paragraphs</span></div>
        <div class="stat"><b>${design.trimWidth}×${design.trimHeight}</b><span>Trim inches</span></div>
        <div class="stat"><b>${design.insideMargin.toFixed(2)}”</b><span>Inside margin</span></div>
      </div>
      ${s.chapters === 0 ? `<div class="notice error"><strong>No chapter titles were auto-detected.</strong> Publish will not guess where chapters begin. Inspect Source before using print pagination.</div>` : ''}
      <div class="action-row"><button class="btn primary" data-go-view="design">Set print design</button><button class="btn secondary" data-go-view="print">Build print preview</button></div>
    </article>
    <article class="panel">
      <div class="panel-head"><div><div class="eyebrow">0.4 book engine</div><h2>Structure without manuscript surgery</h2><p>Publish can now identify the material before Chapter 1, the chapter body, and recognized back matter such as About the Authors or Join the Journey without reordering source blocks.</p></div></div>
      <div class="notice info"><strong>Story Lock still wins:</strong> inline bold/italic/underline styling is rendered from DOCX run metadata, but the exact manuscript characters are independently verified after pagination.</div>
    </article>`;
}

function renderChapters() {
  const chapters = state.project.manuscript.chapters;
  return `
    <article class="panel">
      <div class="panel-head"><div><div class="eyebrow">Detected structure</div><h2>Contents</h2><p>${chapters.length} chapter ${chapters.length === 1 ? 'start' : 'starts'} detected from the locked source.</p></div></div>
      ${chapters.length ? `<div class="chapter-list">${chapters.map((chapter) => `
        <div class="chapter-item">
          <span class="chapter-number">${chapter.number}</span>
          <div><strong>${escapeHtml(chapter.title)}</strong><small>Starts at source paragraph ${chapter.startIndex + 1} · ${chapter.paragraphCount} body paragraphs</small></div>
          <span class="words">${formatNumber(chapter.wordCount)} words</span>
        </div>`).join('')}</div>` : `<div class="notice info">No chapters detected. Source content remains intact; Publish did not guess or rewrite anything.</div>`}
    </article>`;
}


function renderMatter() {
  const structure = analyzeMatter(state.project.manuscript.blocks);
  const front = structure.frontMatterHeadings;
  const back = structure.backMatterHeadings;
  const headingRows = (items, emptyText) => items.length
    ? `<div class="matter-heading-list">${items.map((block) => `<div><span>${block.index + 1}</span><strong>${escapeHtml(block.text.trim())}</strong><small>${escapeHtml(block.kind)} · ${escapeHtml(block.style?.name || 'Normal')}</small></div>`).join('')}</div>`
    : `<div class="matter-empty">${escapeHtml(emptyText)}</div>`;
  return `
    <article class="panel">
      <div class="panel-head"><div><span class="badge good">Read-only structure map</span><h2>Book matter</h2><p>Publish maps where the book changes sections. It does not move, delete, rewrite, or invent manuscript paragraphs.</p></div></div>
      <div class="matter-summary">
        <div><b>${formatNumber(structure.counts.frontMatterBlocks)}</b><span>front-matter paragraphs</span></div>
        <div><b>${formatNumber(structure.counts.chapters)}</b><span>chapters</span></div>
        <div><b>${formatNumber(structure.counts.backMatterBlocks)}</b><span>back-matter paragraphs</span></div>
      </div>
      <div class="matter-flow"><span>FRONT MATTER</span><i>→</i><span>CHAPTER BODY</span><i>→</i><span>BACK MATTER</span></div>
      <div class="matter-grid">
        <section class="design-card"><div class="eyebrow">Before Chapter 1</div><h3>Front matter</h3><p class="matter-copy">Everything before the first detected chapter stays in source order and is unnumbered by the Tres Amigos template.</p>${headingRows(front, 'No styled front-matter headings were detected. The source paragraphs are still preserved.')}</section>
        <section class="design-card"><div class="eyebrow">After the story</div><h3>Back matter</h3><p class="matter-copy">Recognized post-story headings begin a back-matter section while normal book numbering continues.</p>${headingRows(back, 'No recognized back-matter heading was detected yet. Nothing was guessed.')}</section>
      </div>
      <div class="notice info"><strong>Safety behavior:</strong> if Publish cannot confidently identify back matter, it leaves those paragraphs in the chapter body rather than guessing. That can affect layout, but never the story text.</div>
    </article>`;
}

function designNumberField(id, label, value, step = '0.05', min = '0', max = '3', suffix = 'in') {
  return `<label class="design-field"><span>${label}</span><div class="number-wrap"><input type="number" id="${id}" value="${value}" step="${step}" min="${min}" max="${max}"><em>${suffix}</em></div></label>`;
}

function renderDesign() {
  const d = currentDesign();
  const validation = validatePrintDesign(d);
  return `
    <article class="panel">
      <div class="panel-head"><div><span class="badge good">Story layer untouched</span><h2>Print design</h2><p>Choose the calibrated Tres Amigos template or adjust presentation settings. None of these controls can edit manuscript wording.</p></div><button class="btn primary" id="saveDesign">Save design</button></div>
      <section class="template-banner">
        <div><div class="eyebrow">Series template</div><h3>Tres Amigos Series · Book 1</h3><p>Calibrated from the published 6×9 paperback interior. Use this as the Book 2 starting point.</p></div>
        <button class="btn secondary" id="applyTresTemplate">Apply Book 1 template</button>
      </section>
      <div class="design-layout">
        <section class="design-card">
          <div class="eyebrow">Page geometry</div><h3>Paperback</h3>
          <div class="field-grid two">
            ${designNumberField('trimWidth', 'Trim width', d.trimWidth, '0.1', '4', '12')}
            ${designNumberField('trimHeight', 'Trim height', d.trimHeight, '0.1', '5', '15')}
          </div>
          <div class="field-grid two">
            ${designNumberField('insideMargin', 'Inside / binding', d.insideMargin, '0.05', '0.25', '2')}
            ${designNumberField('outsideMargin', 'Outside', d.outsideMargin, '0.05', '0.25', '2')}
            ${designNumberField('topMargin', 'Top', d.topMargin, '0.05', '0.25', '2')}
            ${designNumberField('bottomMargin', 'Bottom', d.bottomMargin, '0.05', '0.25', '2')}
          </div>
          <label class="design-field"><span>Chapter begins</span><select id="chapterStarts"><option value="right" ${d.chapterStarts === 'right' ? 'selected' : ''}>Right-hand page (odd)</option><option value="next" ${d.chapterStarts === 'next' ? 'selected' : ''}>Next available page</option></select></label>
        </section>
        <section class="design-card">
          <div class="eyebrow">Book 1 typography</div><h3>Body + chapter rhythm</h3>
          <label class="design-field"><span>Body font</span><select id="bodyFont">${['Arial','Georgia','Garamond','Baskerville','Times New Roman'].map((name) => `<option ${d.bodyFont === name ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
          <div class="field-grid two">
            ${designNumberField('bodyFontSize', 'Body size', d.bodyFontSize, '0.25', '7', '18', 'pt')}
            ${designNumberField('lineHeight', 'Line height', d.lineHeight, '0.01', '1', '2', '×')}
            ${designNumberField('firstLineIndent', 'First-line indent', d.firstLineIndent, '0.01', '0', '1')}
            ${designNumberField('paragraphGap', 'Paragraph gap', d.paragraphGap, '0.01', '0', '0.75')}
            ${designNumberField('chapterTitleSize', 'Chapter title', d.chapterTitleSize, '0.25', '9', '28', 'pt')}
            ${designNumberField('chapterTopSpace', 'Chapter top space', d.chapterTopSpace, '0.01', '0', '2.5')}
            ${designNumberField('chapterAfterSpace', 'After chapter title', d.chapterAfterSpace, '0.01', '0', '1.5')}
            ${designNumberField('pageNumberFontSize', 'Page number', d.pageNumberFontSize, '0.25', '7', '18', 'pt')}
          </div>
          <div class="design-readout"><span>Live text box</span><strong>${validation.content.width.toFixed(2)} × ${validation.content.height.toFixed(2)} in</strong></div>
        </section>
        <section class="design-card">
          <div class="eyebrow">Page furniture</div><h3>Folios + running headers</h3>
          <label class="design-field"><span>Page numbers</span><select id="pageNumbers"><option value="outside-bottom" ${d.pageNumbers === 'outside-bottom' ? 'selected' : ''}>Outside bottom</option><option value="none" ${d.pageNumbers === 'none' ? 'selected' : ''}>Off</option></select></label>
          <label class="toggle-row"><input type="checkbox" id="runningHeaders" ${d.runningHeaders ? 'checked' : ''}><span><strong>Running headers</strong><small>Off by default for the Tres Amigos Book 1 template.</small></span></label>
          <label class="design-field"><span>Running-header pattern</span><select id="runningHeaderMode"><option value="book-chapter" ${d.runningHeaderMode === 'book-chapter' ? 'selected' : ''}>Book title / chapter title</option><option value="author-book" ${d.runningHeaderMode === 'author-book' ? 'selected' : ''}>Author / book title</option><option value="book-author" ${d.runningHeaderMode === 'book-author' ? 'selected' : ''}>Book title / author</option></select></label>
          <div class="field-grid two">
            ${designNumberField('runningHeaderFontSize', 'Header size', d.runningHeaderFontSize, '0.25', '6', '14', 'pt')}
            <label class="toggle-row compact"><input type="checkbox" id="suppressHeaderOnChapterOpen" ${d.suppressHeaderOnChapterOpen ? 'checked' : ''}><span><strong>Hide on chapter openings</strong><small>Recommended.</small></span></label>
          </div>
          <div class="notice info mini">Headers are generated from book metadata and chapter structure. They are not inserted into the Story-Locked manuscript.</div>
        </section>
      </div>
      <div class="calibration-grid">
        <div><b>6 × 9</b><span>published trim</span></div>
        <div><b>Arial 12</b><span>body type</span></div>
        <div><b>0.50”</b><span>paragraph indent</span></div>
        <div><b>1.25”</b><span>inside margin</span></div>
        <div><b>OUTSIDE</b><span>bottom folios</span></div>
      </div>
      ${validation.warnings.length ? `<div class="notice warning"><strong>Working warnings</strong><br>${validation.warnings.map(escapeHtml).join('<br>')}</div>` : `<div class="notice success"><strong>Book geometry is healthy.</strong> The calibrated template is a measured recreation of Book 1's core interior system; final PDF production still arrives in a later milestone.</div>`}
      <div class="notice info">Changing any setting invalidates the old preview. Save, then rebuild Print Preview so chapter parity and printed folios are recalculated from the locked manuscript.</div>
    </article>`;
}

function renderPrint() {
  if (!state.preview) {
    return `
      <article class="panel">
        <div class="panel-head"><div><span class="badge good">Story Lock required</span><h2>Print preview</h2><p>Build a structural page model from the locked manuscript and current Design settings.</p></div></div>
        <div class="preview-empty">
          <div class="spread-icon"><span></span><span></span></div>
          <h3>Ready to paginate</h3>
          <p>Publish will create mirrored left/right pages, force chapters to right-hand odd pages when selected, and insert intentional blank versos automatically.</p>
          <button class="btn primary" id="buildPreview">Build 6×9 preview</button>
        </div>
      </article>`;
  }

  const preview = state.preview;
  const maxSpread = Math.ceil(Math.max(0, preview.pages.length - 1) / 2);
  const spread = getSpread(preview.pages, state.spreadIndex);
  return `
    <article class="panel preview-panel">
      <div class="panel-head"><div><span class="badge good">Story Lock verified before pagination</span><h2>Print preview</h2><p>Structural preview · ${preview.design.trimWidth} × ${preview.design.trimHeight} in · ${preview.design.chapterStarts === 'right' ? 'chapters on right' : 'chapters on next page'}</p></div><button class="btn secondary" id="rebuildPreview">Rebuild</button></div>
      <div class="preview-stats six">
        <div><b>${formatNumber(preview.pages.length)}</b><span>physical pages</span></div>
        <div><b>${formatNumber(preview.blankVersos)}</b><span>blank versos inserted</span></div>
        <div><b>${formatNumber(preview.chapterStarts)}</b><span>chapter starts</span></div>
        <div><b>${formatNumber(preview.chaptersOnRight)}</b><span>chapters on right</span></div>
        <div><b>${formatNumber(preview.structure?.frontMatterBlocks || 0)}</b><span>front matter ¶</span></div>
        <div><b>${formatNumber(preview.structure?.backMatterBlocks || 0)}</b><span>back matter ¶</span></div>
      </div>
      <div class="spread-toolbar">
        <button class="btn secondary small" id="prevSpread" ${state.spreadIndex <= 0 ? 'disabled' : ''}>← Previous</button>
        <span>Spread ${state.spreadIndex + 1} of ${maxSpread + 1}</span>
        <div class="jump-wrap"><label for="jumpPage">Go to page</label><input id="jumpPage" type="number" min="1" max="${preview.pages.length}" value="${spread.right?.number || spread.left?.number || 1}"><button class="btn secondary small" id="jumpPageBtn">Go</button></div>
        <button class="btn secondary small" id="nextSpread" ${state.spreadIndex >= maxSpread ? 'disabled' : ''}>Next →</button>
      </div>
      <div class="book-spread">
        ${spread.left ? renderBookPage(spread.left, preview.design) : '<div class="book-page-placeholder"><span>Front</span></div>'}
        ${spread.right ? renderBookPage(spread.right, preview.design) : '<div class="book-page-placeholder"><span>End</span></div>'}
      </div>
      <div class="notice success preview-note"><strong>0.4 whole-book typesetting:</strong> front/body/back matter mapping, optional running headers, page furniture, Book 1 typography, right-page chapters, and Story Lock pagination integrity are active.</div>
    </article>`;
}

function getSpread(pages, spreadIndex) {
  if (spreadIndex === 0) return { left: null, right: pages[0] || null };
  return {
    left: pages[(spreadIndex * 2) - 1] || null,
    right: pages[spreadIndex * 2] || null,
  };
}

function sliceRunsForFragment(block, startOffset = 0, endOffset = null) {
  if (!block?.runs?.length) return [];
  const end = endOffset == null ? block.text.length : endOffset;
  const out = [];
  let cursor = 0;
  for (const run of block.runs) {
    const runStart = cursor;
    const runEnd = cursor + run.text.length;
    cursor = runEnd;
    const overlapStart = Math.max(startOffset, runStart);
    const overlapEnd = Math.min(end, runEnd);
    if (overlapStart >= overlapEnd) continue;
    out.push({
      ...run,
      text: run.text.slice(overlapStart - runStart, overlapEnd - runStart),
    });
  }
  return out;
}

function renderInlineRuns(fragment) {
  const block = state.project?.manuscript?.blocks?.find((candidate) => candidate.id === fragment.sourceBlockId);
  if (!block) return escapeHtml(fragment.text);
  const runs = sliceRunsForFragment(block, fragment.startOffset || 0, fragment.endOffset ?? block.text.length);
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

function renderChapterTitle(text) {
  const safe = escapeHtml(text);
  const match = safe.match(/^(Chapter\s+(?:\d+|[IVXLCDM]+):?)(\s*)(.*)$/i);
  if (!match) return safe;
  return `<strong>${match[1]}</strong>${match[2]}${match[3]}`;
}

function renderBookPage(page, design) {
  const px = PREVIEW_PX_PER_INCH;
  const width = design.trimWidth * px;
  const height = design.trimHeight * px;
  const top = design.topMargin * px;
  const bottom = design.bottomMargin * px;
  const inside = design.insideMargin * px;
  const outside = design.outsideMargin * px;
  const isLeft = page.side === 'left';
  const padding = isLeft
    ? `${top}px ${inside}px ${bottom}px ${outside}px`
    : `${top}px ${outside}px ${bottom}px ${inside}px`;
  const fontSize = design.bodyFontSize * (96 / 72) * (px / 96);
  const indent = design.firstLineIndent * px;
  const chapterTop = design.chapterTopSpace * px;
  const chapterAfter = design.chapterAfterSpace * px;
  const chapterSize = design.chapterTitleSize * (96 / 72) * (px / 96);
  const pageNumberSize = design.pageNumberFontSize * (96 / 72) * (px / 96);
  const runningHeaderSize = design.runningHeaderFontSize * (96 / 72) * (px / 96);

  const fragments = page.intentionalBlank
    ? `<div class="intentional-blank">Intentional blank verso<br><small>Kept blank so the next chapter opens on the right.</small></div>`
    : page.fragments.map((fragment) => {
      if (fragment.kind === 'blank') return `<div class="print-fragment blank-space" style="height:${fragment.previewHeight || 6}px"></div>`;
      const classes = `print-fragment ${escapeHtml(fragment.kind)} ${fragment.continuation ? 'continuation' : ''}`;
      let extra = '';
      let content = renderInlineRuns(fragment);
      if (fragment.kind === 'chapter-title') {
        extra = `padding-top:${chapterTop}px;padding-bottom:${chapterAfter}px;font-size:${chapterSize}px;line-height:${design.chapterTitleLineHeight};`;
        content = renderChapterTitle(fragment.text);
      }
      const shouldIndent = fragment.kind === 'body' && !fragment.continuation && !fragment.suppressIndent;
      if (shouldIndent) extra += `text-indent:${indent}px;`;
      const gap = fragment.isFinalPiece && design.paragraphGap && !['chapter-title','blank'].includes(fragment.kind)
        ? design.paragraphGap * px : 0;
      if (gap) extra += `padding-bottom:${gap}px;`;
      return `<div class="${classes}" style="${extra}">${content}</div>`;
    }).join('');

  const folio = design.pageNumbers !== 'none' && page.bookPageNumber != null
    ? `<div class="book-folio ${isLeft ? 'left' : 'right'}" style="font-size:${pageNumberSize}px">${page.bookPageNumber}</div>` : '';
  const headerText = page.showRunningHeader
    ? runningHeaderText({ side: page.side, projectTitle: state.project?.title || '', author: state.project?.author || '', chapterTitle: page.chapterTitle || '', mode: design.runningHeaderMode })
    : '';
  const header = design.runningHeaders && headerText
    ? `<div class="book-running-header ${isLeft ? 'left' : 'right'}" style="font-size:${runningHeaderSize}px">${escapeHtml(headerText)}</div>` : '';
  const sectionLabel = page.section === 'front' ? 'front matter' : page.section === 'back' ? 'back matter' : (page.chapterTitle || 'book body');

  return `<div class="book-page-wrap"><div class="book-page-label">${page.side.toUpperCase()} · physical ${page.number}${page.bookPageNumber != null ? ` · book ${page.bookPageNumber}` : ' · unnumbered'} · ${escapeHtml(sectionLabel)}</div><div class="book-page ${page.intentionalBlank ? 'is-blank' : ''}" style="width:${width}px;height:${height}px;padding:${padding};font-family:${fontStack(design.bodyFont)};font-size:${fontSize}px;line-height:${design.lineHeight};">${header}${fragments}${folio}</div></div>`;
}

function renderSource() {
  const allBlocks = state.project.manuscript.blocks;
  const query = state.search.trim().toLowerCase();
  const blocks = query
    ? allBlocks.filter((block) => block.text.toLowerCase().includes(query) || block.kind.includes(query) || block.style.name.toLowerCase().includes(query))
    : allBlocks;

  return `
    <article class="panel">
      <div class="panel-head"><div><div class="eyebrow">Read-only manuscript map</div><h2>Source inspector</h2><p>Inspect exactly what Publish imported. There is intentionally no editor.</p></div><span class="badge good">Read only</span></div>
      <div class="block-toolbar"><input id="sourceSearch" placeholder="Search text, type, or Word style…" value="${escapeHtml(state.search)}"><span class="block-count">Showing ${formatNumber(blocks.length)} of ${formatNumber(allBlocks.length)} paragraphs</span></div>
      <div class="block-list">${blocks.slice(0, 1200).map((block) => `
        <div class="block ${escapeHtml(block.kind)}">
          <div class="block-meta">${escapeHtml(block.id)}<br>${escapeHtml(block.kind)}<br>${escapeHtml(block.style.name)}</div>
          <div class="block-text">${block.text ? escapeHtml(block.text) : '<span style="color:#aaa">[blank paragraph]</span>'}</div>
        </div>`).join('')}</div>
      ${blocks.length > 1200 ? `<div class="notice info" style="margin-top:12px">For browser performance this inspector shows the first 1,200 matching paragraphs. The entire manuscript remains stored in the project.</div>` : ''}
    </article>`;
}

function renderLibrary() {
  return `
    <article class="panel">
      <div class="panel-head"><div><div class="eyebrow">Local projects</div><h2>Library</h2><p>Projects live in this browser's IndexedDB. Older projects are migrated to the 0.4 book-structure model without touching source blocks or Story Lock hashes.</p></div><button class="btn primary" id="libraryImport">New project</button></div>
      ${state.projects.length ? `<div class="project-list">${state.projects.map((raw) => { const p = migrateProject(raw); return `
        <div class="project-row">
          <div><strong>${escapeHtml(p.title)}</strong><span>${escapeHtml(p.source.fileName)} · ${p.manuscript.stats.chapters} chapters · ${formatNumber(p.manuscript.stats.words)} words · Updated ${new Date(p.updatedAt).toLocaleString()}</span></div>
          <div class="project-actions"><button class="btn secondary" data-open-project="${p.id}">Open</button><button class="btn danger" data-delete-project="${p.id}">Delete</button></div>
        </div>`; }).join('')}</div>` : `<div class="empty-project"><h3>No saved projects yet</h3><p>Import a DOCX and it will appear here automatically.</p></div>`}
    </article>`;
}

function updateMain() {
  document.querySelector('#mainView').innerHTML = renderMain();
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.view === state.activeView));
  bindDynamicEvents();
}

function bindEvents() {
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      state.activeView = button.dataset.view;
      updateMain();
    });
  });
  bindDynamicEvents();
}

function bindDynamicEvents() {
  const choose = document.querySelector('#chooseFile');
  const input = document.querySelector('#fileInput');
  const dropzone = document.querySelector('#dropzone');
  choose?.addEventListener('click', () => input?.click());
  input?.addEventListener('change', (event) => event.target.files?.[0] && importFile(event.target.files[0]));

  dropzone?.addEventListener('dragover', (event) => { event.preventDefault(); dropzone.classList.add('drag'); });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
  dropzone?.addEventListener('drop', (event) => {
    event.preventDefault(); dropzone.classList.remove('drag');
    const file = event.dataTransfer?.files?.[0];
    if (file) importFile(file);
  });

  document.querySelector('#newImport')?.addEventListener('click', () => {
    state.project = null; state.preview = null; state.activeView = 'import'; state.error = ''; renderShell();
  });
  document.querySelector('#libraryImport')?.addEventListener('click', () => {
    state.project = null; state.preview = null; state.activeView = 'import'; state.error = ''; renderShell();
  });
  document.querySelector('#saveMetadata')?.addEventListener('click', saveProjectMetadata);
  document.querySelector('#verifyLock')?.addEventListener('click', verifyLock);
  document.querySelector('#saveDesign')?.addEventListener('click', saveDesign);
  document.querySelector('#applyTresTemplate')?.addEventListener('click', applyTresAmigosTemplate);
  document.querySelector('#buildPreview')?.addEventListener('click', buildPreview);
  document.querySelector('#rebuildPreview')?.addEventListener('click', buildPreview);

  document.querySelectorAll('[data-go-view]').forEach((button) => button.addEventListener('click', () => {
    state.activeView = button.dataset.goView;
    updateMain();
  }));

  const search = document.querySelector('#sourceSearch');
  search?.addEventListener('input', (event) => {
    state.search = event.target.value;
    clearTimeout(search._timer);
    search._timer = setTimeout(updateMain, 180);
  });

  document.querySelector('#prevSpread')?.addEventListener('click', () => { state.spreadIndex = Math.max(0, state.spreadIndex - 1); updateMain(); });
  document.querySelector('#nextSpread')?.addEventListener('click', () => {
    if (!state.preview) return;
    const max = Math.ceil(Math.max(0, state.preview.pages.length - 1) / 2);
    state.spreadIndex = Math.min(max, state.spreadIndex + 1);
    updateMain();
  });
  document.querySelector('#jumpPageBtn')?.addEventListener('click', jumpToPage);
  document.querySelector('#jumpPage')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') jumpToPage(); });

  document.querySelectorAll('[data-open-project]').forEach((button) => button.addEventListener('click', async () => {
    const loaded = await loadProject(button.dataset.openProject);
    state.project = migrateProject(loaded);
    await saveProject(state.project);
    state.preview = null;
    state.spreadIndex = 0;
    state.activeView = 'import';
    renderShell();
  }));
  document.querySelectorAll('[data-delete-project]').forEach((button) => button.addEventListener('click', async () => {
    const project = state.projects.find((p) => p.id === button.dataset.deleteProject);
    if (!confirm(`Delete “${project?.title || 'this project'}” from this browser?`)) return;
    await deleteProject(button.dataset.deleteProject);
    state.projects = await listProjects();
    updateMain();
  }));
}

function jumpToPage() {
  if (!state.preview) return;
  const value = Number(document.querySelector('#jumpPage')?.value || 1);
  const page = Math.max(1, Math.min(state.preview.pages.length, Math.round(value)));
  state.spreadIndex = page === 1 ? 0 : Math.ceil((page - 1) / 2);
  updateMain();
}

async function importFile(file) {
  state.error = '';
  if (!/\.docx$/i.test(file.name)) {
    state.error = 'YasReady Publish only accepts .docx files in this build. No conversion was attempted.';
    updateMain();
    return;
  }
  state.busy = true;
  state.busyMessage = 'Reading manuscript safely…';
  updateMain();
  try {
    const arrayBuffer = await file.arrayBuffer();
    const parsed = await parseDocx(arrayBuffer);
    const project = await createProjectFromImport({ file, arrayBuffer, parsed });
    await saveProject(project);
    state.project = project;
    state.projects = await listProjects();
    state.preview = null;
    state.spreadIndex = 0;
    state.activeView = 'import';
  } catch (error) {
    console.error(error);
    state.error = error?.message || 'The manuscript could not be imported safely.';
    state.project = null;
  } finally {
    state.busy = false;
    state.busyMessage = '';
    updateMain();
  }
}

async function saveProjectMetadata() {
  if (!state.project) return;
  const title = document.querySelector('#projectTitle')?.value.trim();
  const author = document.querySelector('#projectAuthor')?.value.trim() || '';
  if (!title) return;
  state.project.title = title;
  state.project.author = author;
  state.project.updatedAt = new Date().toISOString();
  state.preview = null;
  await saveProject(state.project);
  state.projects = await listProjects();
  updateMain();
}

async function verifyLock(showAlert = true) {
  if (!state.project) return false;
  const result = await verifyProjectStoryLock(state.project);
  if (result.ok) {
    state.project.storyLock.verifiedAt = new Date().toISOString();
    state.project.storyLock.status = 'verified';
    await saveProject(state.project);
    if (showAlert) alert('Story Lock VERIFIED. The stored manuscript text matches the import fingerprint exactly.');
    return true;
  }
  state.project.storyLock.status = 'failed';
  await saveProject(state.project);
  if (showAlert) alert('STORY LOCK FAILED. Pagination and export must remain blocked until the source mismatch is resolved.');
  return false;
}


async function applyTresAmigosTemplate() {
  if (!state.project) return;
  state.project.design.print = applyTemplate('tres-amigos-book1');
  state.project.design.template = 'Tres Amigos Series · Book 1';
  state.project.updatedAt = new Date().toISOString();
  state.preview = null;
  state.spreadIndex = 0;
  await saveProject(state.project);
  state.projects = await listProjects();
  updateMain();
}

async function saveDesign() {
  if (!state.project) return;
  const value = (id) => document.querySelector(`#${id}`)?.value;
  const raw = {
    ...state.project.design.print,
    trimWidth: value('trimWidth'),
    trimHeight: value('trimHeight'),
    insideMargin: value('insideMargin'),
    outsideMargin: value('outsideMargin'),
    topMargin: value('topMargin'),
    bottomMargin: value('bottomMargin'),
    bodyFont: value('bodyFont'),
    bodyFontSize: value('bodyFontSize'),
    lineHeight: value('lineHeight'),
    firstLineIndent: value('firstLineIndent'),
    paragraphGap: value('paragraphGap'),
    chapterTitleSize: value('chapterTitleSize'),
    chapterTopSpace: value('chapterTopSpace'),
    chapterAfterSpace: value('chapterAfterSpace'),
    pageNumberFontSize: value('pageNumberFontSize'),
    pageNumbers: value('pageNumbers'),
    runningHeaders: Boolean(document.querySelector('#runningHeaders')?.checked),
    runningHeaderMode: value('runningHeaderMode'),
    runningHeaderFontSize: value('runningHeaderFontSize'),
    suppressHeaderOnChapterOpen: Boolean(document.querySelector('#suppressHeaderOnChapterOpen')?.checked),
    chapterStarts: value('chapterStarts'),
    templateId: 'custom',
  };
  state.project.design.print = normalizePrintDesign(raw);
  state.project.design.template = state.project.design.print.templateId === 'tres-amigos-book1' ? 'Tres Amigos Series · Book 1' : 'Custom';
  state.project.updatedAt = new Date().toISOString();
  state.preview = null;
  state.spreadIndex = 0;
  await saveProject(state.project);
  state.projects = await listProjects();
  updateMain();
}

function createMeasureRig(design) {
  const content = contentBoxInches(design);
  const root = document.createElement('div');
  root.className = 'print-measure-rig';
  Object.assign(root.style, {
    position: 'fixed',
    left: '-20000px',
    top: '0',
    width: `${content.width}in`,
    visibility: 'hidden',
    pointerEvents: 'none',
    fontFamily: fontStack(design.bodyFont),
    fontSize: `${design.bodyFontSize}pt`,
    lineHeight: String(design.lineHeight),
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
  });
  document.body.appendChild(root);
  return { root, content, pageHeightPx: content.height * CSS_PX_PER_INCH };
}

function measureFragment(rig, design, kind, text, continuation = false, isFinalPiece = true, suppressIndent = false) {
  const wrapper = document.createElement('div');
  wrapper.style.boxSizing = 'border-box';
  const paragraph = document.createElement('div');
  paragraph.textContent = text;
  paragraph.style.margin = '0';
  paragraph.style.padding = '0';
  paragraph.style.whiteSpace = 'pre-wrap';
  paragraph.style.overflowWrap = 'break-word';

  if (kind === 'chapter-title') {
    wrapper.style.paddingTop = `${design.chapterTopSpace}in`;
    wrapper.style.paddingBottom = `${design.chapterAfterSpace}in`;
    paragraph.style.fontSize = `${design.chapterTitleSize}pt`;
    paragraph.style.lineHeight = String(design.chapterTitleLineHeight);
    paragraph.style.fontWeight = '400';
    paragraph.style.textAlign = 'center';
  } else if (kind === 'scene-break') {
    wrapper.style.paddingTop = '0.12in';
    wrapper.style.paddingBottom = '0.12in';
    paragraph.style.textAlign = 'center';
  } else if (kind === 'front-back-heading' || kind === 'heading') {
    wrapper.style.paddingTop = '0.12in';
    wrapper.style.paddingBottom = '0.08in';
    paragraph.style.fontWeight = '700';
    paragraph.style.fontSize = '1.15em';
  } else if (kind === 'blank') {
    wrapper.style.height = '0.12in';
  } else if (kind === 'body' && !continuation && !suppressIndent) {
    paragraph.style.textIndent = `${design.firstLineIndent}in`;
  }

  if (isFinalPiece && design.paragraphGap && !['chapter-title','blank'].includes(kind)) {
    wrapper.style.paddingBottom = `${design.paragraphGap}in`;
  }
  wrapper.appendChild(paragraph);
  rig.root.replaceChildren(wrapper);
  return wrapper.getBoundingClientRect().height;
}

function findFittingCut(rig, design, kind, text, continuation, maxHeight, suppressIndent = false) {
  if (!text || maxHeight <= 0) return 0;
  let low = 1;
  let high = text.length;
  let best = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const height = measureFragment(rig, design, kind, text.slice(0, mid), continuation, false, suppressIndent);
    if (height <= maxHeight) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (best <= 0) return 0;
  if (best < text.length) {
    const whitespace = Math.max(text.lastIndexOf(' ', best - 1), text.lastIndexOf('\n', best - 1), text.lastIndexOf('\t', best - 1));
    if (whitespace > Math.max(8, best * 0.55)) return whitespace + 1;
  }
  return best;
}

function verifyPaginatedText(project, pages) {
  const collected = new Map(project.manuscript.blocks.map((block) => [block.id, '']));
  for (const page of pages) {
    for (const fragment of page.fragments || []) {
      if (!collected.has(fragment.sourceBlockId)) continue;
      collected.set(fragment.sourceBlockId, collected.get(fragment.sourceBlockId) + fragment.text);
    }
  }
  const mismatches = [];
  for (const block of project.manuscript.blocks) {
    if ((collected.get(block.id) ?? '') !== block.text) mismatches.push(block.id);
  }
  return { ok: mismatches.length === 0, mismatches };
}


function attachPageStructure(project, pages, design) {
  const structure = analyzeMatter(project.manuscript.blocks);
  const blockIndex = new Map(project.manuscript.blocks.map((block) => [block.id, block.index]));
  for (const page of pages) {
    const sourceFragments = (page.fragments || []).filter((fragment) => blockIndex.has(fragment.sourceBlockId));
    const firstIndex = sourceFragments.length ? blockIndex.get(sourceFragments[0].sourceBlockId) : null;
    page.section = firstIndex == null ? 'blank' : matterSectionForBlockIndex(firstIndex, structure);
    const chapter = firstIndex == null ? null : chapterForBlockIndex(firstIndex, structure);
    page.chapterTitle = chapter?.title || '';
    page.hasChapterTitle = (page.fragments || []).some((fragment) => fragment.kind === 'chapter-title');
    page.showRunningHeader = Boolean(
      design.runningHeaders &&
      !page.intentionalBlank &&
      page.section === 'body' &&
      !(design.suppressHeaderOnChapterOpen && page.hasChapterTitle)
    );
  }
  return structure;
}

async function paginateProject(project) {
  const design = currentDesign();
  const lock = await verifyProjectStoryLock(project);
  if (!lock.ok) throw new Error('Story Lock failed. Print pagination was blocked.');

  const rig = createMeasureRig(design);
  const structure = analyzeMatter(project.manuscript.blocks);
  const pages = [];
  let current = null;
  let blankVersos = 0;
  let chapterStarts = 0;
  let chaptersOnRight = 0;
  let firstChapterPhysicalPage = null;
  let previousNonEmptyKind = null;

  const newPage = ({ intentionalBlank = false } = {}) => {
    const number = pages.length + 1;
    current = { number, side: pageSide(number), fragments: [], usedPx: 0, intentionalBlank, bookPageNumber: null };
    pages.push(current);
    if (intentionalBlank) blankVersos += 1;
    return current;
  };

  const ensurePage = () => current || newPage();
  const remaining = () => rig.pageHeightPx - (current?.usedPx || 0);

  const addFragment = (block, text, kind, continuation = false, measuredHeight = null, meta = {}) => {
    ensurePage();
    const height = measuredHeight ?? measureFragment(rig, design, kind, text, continuation, meta.isFinalPiece !== false, meta.suppressIndent);
    current.fragments.push({
      sourceBlockId: block.id,
      kind,
      text,
      continuation,
      measuredHeight: height,
      previewHeight: kind === 'blank' ? height * (PREVIEW_PX_PER_INCH / CSS_PX_PER_INCH) : null,
      startOffset: meta.startOffset ?? 0,
      endOffset: meta.endOffset ?? text.length,
      isFinalPiece: meta.isFinalPiece !== false,
      suppressIndent: Boolean(meta.suppressIndent),
    });
    current.usedPx += height;
  };

  const placeTextBlock = (block) => {
    const kind = block.kind;
    const text = block.text;
    const suppressIndent = kind === 'chapter-opening' || previousNonEmptyKind === 'scene-break';
    if (kind === 'blank') {
      ensurePage();
      const height = measureFragment(rig, design, kind, '', false, true, true);
      if (height > remaining() && current.fragments.length) newPage();
      addFragment(block, '', kind, false, height, { startOffset: 0, endOffset: 0, isFinalPiece: true, suppressIndent: true });
      return;
    }

    let offset = 0;
    let rest = text;
    let continuation = false;
    while (rest.length) {
      ensurePage();
      const fullHeight = measureFragment(rig, design, kind, rest, continuation, true, suppressIndent);
      if (fullHeight <= remaining()) {
        addFragment(block, rest, kind, continuation, fullHeight, {
          startOffset: offset,
          endOffset: offset + rest.length,
          isFinalPiece: true,
          suppressIndent,
        });
        offset += rest.length;
        rest = '';
        break;
      }

      if (fullHeight <= rig.pageHeightPx && current.fragments.length) {
        newPage();
        continue;
      }

      if (remaining() < design.bodyFontSize * 1.8 && current.fragments.length) {
        newPage();
        continue;
      }

      const cut = findFittingCut(rig, design, kind, rest, continuation, remaining(), suppressIndent);
      if (!cut) {
        if (current.fragments.length) { newPage(); continue; }
        addFragment(block, rest, kind, continuation, Math.min(fullHeight, rig.pageHeightPx), {
          startOffset: offset,
          endOffset: offset + rest.length,
          isFinalPiece: true,
          suppressIndent,
        });
        offset += rest.length;
        rest = '';
        break;
      }
      const piece = rest.slice(0, cut);
      const height = measureFragment(rig, design, kind, piece, continuation, false, suppressIndent);
      addFragment(block, piece, kind, continuation, height, {
        startOffset: offset,
        endOffset: offset + piece.length,
        isFinalPiece: false,
        suppressIndent,
      });
      offset += piece.length;
      rest = rest.slice(cut);
      continuation = true;
      if (rest.length) newPage();
    }
  };

  try {
    for (let i = 0; i < project.manuscript.blocks.length; i += 1) {
      const block = project.manuscript.blocks[i];
      if (structure.backMatterStartIndex === i && current?.fragments?.length) newPage();
      if (block.kind === 'chapter-title') {
        chapterStarts += 1;
        if (!current) newPage();
        else if (current.fragments.length || current.intentionalBlank) newPage();
        if (design.chapterStarts === 'right' && current.side !== 'right') {
          current.intentionalBlank = true;
          blankVersos += 1;
          newPage();
        }
        if (firstChapterPhysicalPage == null) firstChapterPhysicalPage = current.number;
        if (current.side === 'right') chaptersOnRight += 1;
      }
      placeTextBlock(block);
      if (block.kind !== 'blank') previousNonEmptyKind = block.kind;
      if (i && i % 250 === 0) await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  } finally {
    rig.root.remove();
  }

  if (firstChapterPhysicalPage != null && design.numberFromFirstChapter) {
    for (const page of pages) {
      if (page.number >= firstChapterPhysicalPage) page.bookPageNumber = page.number - firstChapterPhysicalPage + 1;
    }
  } else {
    for (const page of pages) page.bookPageNumber = page.number;
  }

  attachPageStructure(project, pages, design);

  const integrity = verifyPaginatedText(project, pages);
  if (!integrity.ok) {
    throw new Error(`Story Lock pagination integrity failed for ${integrity.mismatches.length} source paragraph(s). Preview was blocked.`);
  }

  return {
    builtAt: new Date().toISOString(),
    design: { ...design },
    pages,
    blankVersos,
    chapterStarts,
    chaptersOnRight,
    firstChapterPhysicalPage,
    structure: { ...structure.counts, backMatterStartIndex: structure.backMatterStartIndex },
    integrity: { ok: true, checkedBlocks: project.manuscript.blocks.length },
  };
}

async function buildPreview() {
  if (!state.project) return;
  if (state.project.manuscript.stats.chapters === 0) {
    alert('No chapter starts were detected. Publish will not guess chapter boundaries. Inspect Source first.');
    return;
  }
  state.busy = true;
  state.busyMessage = 'Building mirrored book pages…';
  updateMain();
  try {
    state.preview = await paginateProject(state.project);
    state.spreadIndex = 0;
  } catch (error) {
    console.error(error);
    alert(error?.message || 'Print preview could not be built safely.');
    state.preview = null;
  } finally {
    state.busy = false;
    state.busyMessage = '';
    state.activeView = 'print';
    updateMain();
  }
}

async function init() {
  try { state.projects = await listProjects(); } catch (error) { console.warn('Project library unavailable', error); }
  renderShell();
}

init();
