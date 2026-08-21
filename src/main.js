import { parseDocx } from './lib/docx-parser.js';
import { createProjectFromImport, migrateProject, verifyProjectStoryLock } from './lib/project.js';
import { deleteProject, listProjects, loadProject, saveProject } from './lib/project-store.js';
import { shortHash } from './lib/hash.js';
import {
  contentBoxInches,
  fontStack,
  normalizePrintDesign,
  pageSide,
  validatePrintDesign,
} from './lib/print-model.js';

const VERSION = '0.2.0';
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
          <p>Version 0.2 adds the print structure engine: 6×9 trim, mirrored margins, gutter controls, right-hand chapter starts, automatic blank versos, and a live two-page structural preview.</p>
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
      <div class="sidebar-head"><strong>Publish workspace</strong><span>0.2 separates the locked manuscript from an editable print-design layer.</span></div>
      <nav class="sidebar-nav">
        ${navButton('import', '＋', hasProject ? 'Project' : 'Import')}
        ${navButton('chapters', '☷', 'Contents', !hasProject)}
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
      <div class="panel-head"><div><div class="eyebrow">v0.2 capability</div><h2>Now we can build the physical book</h2><p>After import, Design controls the page geometry while Print Preview creates the left/right book structure.</p></div></div>
      <div class="summary-grid six">
        <div class="stat"><b>✓</b><span>Read DOCX</span></div>
        <div class="stat"><b>✓</b><span>Story Lock</span></div>
        <div class="stat"><b>6×9</b><span>Trim</span></div>
        <div class="stat"><b>↔</b><span>Mirror margins</span></div>
        <div class="stat"><b>ODD</b><span>Chapter starts</span></div>
        <div class="stat"><b>Aa</b><span>Draft typesetting</span></div>
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
      <div class="project-title-row"><input id="projectTitle" value="${escapeHtml(p.title)}" aria-label="Project title"><button class="btn secondary" id="saveTitle">Save project name</button><button class="btn secondary" id="verifyLock">Verify Story Lock</button></div>
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
      <div class="panel-head"><div><div class="eyebrow">0.2 print engine</div><h2>Structure before decoration</h2><p>This milestone establishes physical pages and chapter parity. Running headers, final series typography, and production PDF export come after this foundation survives Book 2.</p></div></div>
      <div class="notice info"><strong>Important:</strong> the 0.2 preview is a structural pagination preview. It can split oversized paragraphs without changing their stored source text, but final production typography will still change page count in later builds.</div>
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

function designNumberField(id, label, value, step = '0.05', min = '0', max = '3', suffix = 'in') {
  return `<label class="design-field"><span>${label}</span><div class="number-wrap"><input type="number" id="${id}" value="${value}" step="${step}" min="${min}" max="${max}"><em>${suffix}</em></div></label>`;
}

function renderDesign() {
  const d = currentDesign();
  const validation = validatePrintDesign(d);
  return `
    <article class="panel">
      <div class="panel-head"><div><span class="badge good">Story layer untouched</span><h2>Print design</h2><p>These controls only change presentation metadata. The manuscript hash does not change.</p></div><button class="btn primary" id="saveDesign">Save design</button></div>
      <div class="design-layout">
        <section class="design-card">
          <div class="eyebrow">Page</div><h3>6 × 9 paperback</h3>
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
          <div class="eyebrow">Draft typography</div><h3>Body text</h3>
          <label class="design-field"><span>Preview font</span><select id="bodyFont">${['Georgia','Garamond','Baskerville','Times New Roman'].map((name) => `<option ${d.bodyFont === name ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
          <div class="field-grid two">
            ${designNumberField('bodyFontSize', 'Font size', d.bodyFontSize, '0.25', '7', '18', 'pt')}
            ${designNumberField('lineHeight', 'Line height', d.lineHeight, '0.01', '1', '2', '×')}
            ${designNumberField('firstLineIndent', 'First-line indent', d.firstLineIndent, '0.01', '0', '1')}
            ${designNumberField('chapterTopSpace', 'Chapter top space', d.chapterTopSpace, '0.05', '0', '2.5')}
          </div>
          <div class="design-readout"><span>Live text box</span><strong>${validation.content.width.toFixed(2)} × ${validation.content.height.toFixed(2)} in</strong></div>
        </section>
      </div>
      ${validation.warnings.length ? `<div class="notice warning"><strong>Working warnings</strong><br>${validation.warnings.map(escapeHtml).join('<br>')}</div>` : `<div class="notice success"><strong>Geometry looks healthy for the 0.2 working model.</strong> We will calibrate exact Book 1 values in the series-template milestone.</div>`}
      <div class="notice info">Changing any setting invalidates the old preview by design. Save, then rebuild Print Preview so page parity is recalculated from the locked manuscript.</div>
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
      <div class="preview-stats">
        <div><b>${formatNumber(preview.pages.length)}</b><span>physical pages</span></div>
        <div><b>${formatNumber(preview.blankVersos)}</b><span>blank versos inserted</span></div>
        <div><b>${formatNumber(preview.chapterStarts)}</b><span>chapter starts</span></div>
        <div><b>${formatNumber(preview.chaptersOnRight)}</b><span>chapters on right</span></div>
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
      <div class="notice info preview-note"><strong>0.2 structural preview:</strong> physical page parity and margin geometry are active. Final production fonts, headers/footers, widow/orphan controls, and PDF export are intentionally not claimed yet.</div>
    </article>`;
}

function getSpread(pages, spreadIndex) {
  if (spreadIndex === 0) return { left: null, right: pages[0] || null };
  return {
    left: pages[(spreadIndex * 2) - 1] || null,
    right: pages[spreadIndex * 2] || null,
  };
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

  const fragments = page.intentionalBlank
    ? `<div class="intentional-blank">Intentional blank verso<br><small>Inserted to keep the next chapter on a right-hand page.</small></div>`
    : page.fragments.map((fragment) => {
      if (fragment.kind === 'blank') return `<div class="print-fragment blank-space" style="height:${fragment.previewHeight || 6}px"></div>`;
      const classes = `print-fragment ${escapeHtml(fragment.kind)} ${fragment.continuation ? 'continuation' : ''}`;
      let extra = '';
      if (fragment.kind === 'chapter-title') extra = `padding-top:${chapterTop}px;padding-bottom:${chapterAfter}px;`;
      const shouldIndent = ['body'].includes(fragment.kind) && !fragment.continuation;
      if (shouldIndent) extra += `text-indent:${indent}px;`;
      return `<div class="${classes}" style="${extra}">${escapeHtml(fragment.text)}</div>`;
    }).join('');

  return `<div class="book-page-wrap"><div class="book-page-label">${page.side.toUpperCase()} · ${page.number}</div><div class="book-page ${page.intentionalBlank ? 'is-blank' : ''}" style="width:${width}px;height:${height}px;padding:${padding};font-family:${fontStack(design.bodyFont)};font-size:${fontSize}px;line-height:${design.lineHeight};">${fragments}</div><div class="physical-page-number">${page.number}</div></div>`;
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
      <div class="panel-head"><div><div class="eyebrow">Local projects</div><h2>Library</h2><p>Projects live in this browser's IndexedDB. Existing v0.1 projects are migrated to the 0.2 design model without touching source blocks.</p></div><button class="btn primary" id="libraryImport">New project</button></div>
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
  document.querySelector('#saveTitle')?.addEventListener('click', saveProjectTitle);
  document.querySelector('#verifyLock')?.addEventListener('click', verifyLock);
  document.querySelector('#saveDesign')?.addEventListener('click', saveDesign);
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

async function saveProjectTitle() {
  if (!state.project) return;
  const input = document.querySelector('#projectTitle');
  const title = input?.value.trim();
  if (!title) return;
  state.project.title = title;
  state.project.updatedAt = new Date().toISOString();
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
    chapterTopSpace: value('chapterTopSpace'),
    chapterStarts: value('chapterStarts'),
  };
  state.project.design.print = normalizePrintDesign(raw);
  state.project.design.template = 'Novel 6×9 Draft';
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

function measureFragment(rig, design, kind, text, continuation = false) {
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
    paragraph.style.fontSize = '1.55em';
    paragraph.style.lineHeight = '1.12';
    paragraph.style.fontWeight = '700';
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
  } else if (kind === 'body' && !continuation) {
    paragraph.style.textIndent = `${design.firstLineIndent}in`;
  }

  if (design.paragraphGap && !['chapter-title','blank'].includes(kind)) wrapper.style.paddingBottom = `${design.paragraphGap}in`;
  wrapper.appendChild(paragraph);
  rig.root.replaceChildren(wrapper);
  return wrapper.getBoundingClientRect().height;
}

function findFittingCut(rig, design, kind, text, continuation, maxHeight) {
  if (!text || maxHeight <= 0) return 0;
  let low = 1;
  let high = text.length;
  let best = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const height = measureFragment(rig, design, kind, text.slice(0, mid), continuation);
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

async function paginateProject(project) {
  const design = currentDesign();
  const lock = await verifyProjectStoryLock(project);
  if (!lock.ok) throw new Error('Story Lock failed. Print pagination was blocked.');

  const rig = createMeasureRig(design);
  const pages = [];
  let current = null;
  let blankVersos = 0;
  let chapterStarts = 0;
  let chaptersOnRight = 0;

  const newPage = ({ intentionalBlank = false } = {}) => {
    const number = pages.length + 1;
    current = { number, side: pageSide(number), fragments: [], usedPx: 0, intentionalBlank };
    pages.push(current);
    if (intentionalBlank) blankVersos += 1;
    return current;
  };

  const ensurePage = () => current || newPage();
  const remaining = () => rig.pageHeightPx - (current?.usedPx || 0);

  const addFragment = (block, text, kind, continuation = false, measuredHeight = null) => {
    ensurePage();
    const height = measuredHeight ?? measureFragment(rig, design, kind, text, continuation);
    current.fragments.push({
      sourceBlockId: block.id,
      kind,
      text,
      continuation,
      measuredHeight: height,
      previewHeight: kind === 'blank' ? height * (PREVIEW_PX_PER_INCH / CSS_PX_PER_INCH) : null,
    });
    current.usedPx += height;
  };

  const placeTextBlock = (block) => {
    const kind = block.kind;
    const text = block.text;
    if (kind === 'blank') {
      ensurePage();
      const height = measureFragment(rig, design, kind, '', false);
      if (height > remaining() && current.fragments.length) newPage();
      addFragment(block, '', kind, false, height);
      return;
    }

    let rest = text;
    let continuation = false;
    while (rest.length) {
      ensurePage();
      const fullHeight = measureFragment(rig, design, kind, rest, continuation);
      if (fullHeight <= remaining()) {
        addFragment(block, rest, kind, continuation, fullHeight);
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

      const cut = findFittingCut(rig, design, kind, rest, continuation, remaining());
      if (!cut) {
        if (current.fragments.length) { newPage(); continue; }
        // Extreme fallback: preserve the text even if one unbreakable token is taller than a page.
        addFragment(block, rest, kind, continuation, Math.min(fullHeight, rig.pageHeightPx));
        rest = '';
        break;
      }
      const piece = rest.slice(0, cut);
      const height = measureFragment(rig, design, kind, piece, continuation);
      addFragment(block, piece, kind, continuation, height);
      rest = rest.slice(cut);
      continuation = true;
      if (rest.length) newPage();
    }
  };

  try {
    for (let i = 0; i < project.manuscript.blocks.length; i += 1) {
      const block = project.manuscript.blocks[i];
      if (block.kind === 'chapter-title') {
        chapterStarts += 1;
        if (!current) newPage();
        else if (current.fragments.length || current.intentionalBlank) newPage();
        if (design.chapterStarts === 'right' && current.side !== 'right') {
          current.intentionalBlank = true;
          blankVersos += 1;
          newPage();
        }
        if (current.side === 'right') chaptersOnRight += 1;
      }
      placeTextBlock(block);
      if (i && i % 250 === 0) await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  } finally {
    rig.root.remove();
  }

  return {
    builtAt: new Date().toISOString(),
    design: { ...design },
    pages,
    blankVersos,
    chapterStarts,
    chaptersOnRight,
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
