import { parseDocx } from './lib/docx-parser.js';
import { createProjectFromImport, migrateProject, verifyProjectStoryLock } from './lib/project.js';
import { deleteProject, listProjects, loadProject, saveProject } from './lib/project-store.js';
import { shortHash } from './lib/hash.js';
import {
  applyTemplate,
  BUILT_IN_PRINT_THEMES,
  compareDesignToTemplate,
  TRES_AMIGOS_TEMPLATE,
  contentBoxInches,
  fontStack,
  normalizePrintDesign,
  pageSide,
  validatePrintDesign,
} from './lib/print-model.js';
import { analyzeMatter, chapterForBlockIndex, matterSectionForBlockIndex, runningHeaderText } from './lib/structure-model.js';
import { adjacentChapter, buildPreviewNavigation, currentNavigationEntry, spreadIndexForPhysicalPage, spreadPageNumbers } from './lib/navigator-model.js';
import { deleteCustomTheme, loadCustomThemes, parseThemeJson, saveCustomTheme, serializeTheme } from './lib/theme-store.js';
import { runKdpPreflight } from './lib/preflight-model.js';
import { buildPrintMasterHtml } from './lib/print-export.js';
import { normalizeEbookDesign } from './lib/ebook-model.js';
import { runEpubPreflight } from './lib/ebook-preflight.js';
import { buildEbookPreviewHtml, buildEpubBlob } from './lib/epub-export.js';
import { effectiveBlocks, effectiveChapters, effectiveStats, setStructureOverride, structureOverrideSummary, STRUCTURE_OVERRIDE_KINDS } from './lib/structure-overrides.js';
import { buildPrintTocEntries, printTocSignature, shouldGeneratePrintToc, verifyGeneratedPrintToc } from './lib/print-toc.js';

const VERSION = '0.9.0';
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
  navigatorSearch: '',
  previewZoom: 58,
  customThemes: [],
  themeMessage: '',
  ebookSectionIndex: 0,
  ebookMessage: '',
  repairSearch: '',
  repairMessage: '',
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
          <p>Version 0.9 adds automatic print Table of Contents generation, metadata-only structure repair, and edge-case preflight hardening while Story Lock keeps every source character immutable.</p>
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
      <div class="sidebar-head"><strong>Publish workspace</strong><span>0.9 adds a third safety layer: generated print matter and structure repair live outside the locked manuscript, while paperback and Kindle continue from the same exact source text.</span></div>
      <nav class="sidebar-nav">
        ${navButton('import', '＋', hasProject ? 'Project' : 'Import')}
        ${navButton('chapters', '☷', 'Contents', !hasProject)}
        ${navButton('matter', '§', 'Book Matter', !hasProject)}
        ${navButton('repair', '⚙', 'Structure Repair', !hasProject)}
        ${navButton('navigator', '⌘', 'Navigator', !hasProject)}
        ${navButton('design', 'Aa', 'Design', !hasProject)}
        ${navButton('print', '▣', 'Print Preview', !hasProject)}
        ${navButton('export', '⇩', 'KDP Export', !hasProject)}
        ${navButton('ebook', 'e', 'Ebook / Kindle', !hasProject)}
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
  if (state.activeView === 'repair') return renderRepair();
  if (state.activeView === 'navigator') return renderNavigator();
  if (state.activeView === 'design') return renderDesign();
  if (state.activeView === 'print') return renderPrint();
  if (state.activeView === 'export') return renderExport();
  if (state.activeView === 'ebook') return renderEbook();
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
      <div class="panel-head"><div><div class="eyebrow">v0.9 production hardening</div><h2>Automatic print Contents + safe structure repair</h2><p>YasReady can now generate print Table of Contents page numbers from final pagination and repair misclassified chapter/scene/message structure as metadata only—without editing or deleting source text.</p></div></div>
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
  const s = effectiveStats(p);
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
      <div class="action-row"><button class="btn primary" data-go-view="design">Set print design</button><button class="btn secondary" data-go-view="print">Build print preview</button><button class="btn secondary" data-go-view="export">KDP preflight</button><button class="btn secondary" data-go-view="ebook">Build Kindle EPUB</button></div>
    </article>
    <article class="panel">
      <div class="panel-head"><div><div class="eyebrow">0.9 production workspace</div><h2>One manuscript, print + ebook + generated matter</h2><p>Publish maps front matter, chapter body, and recognized back matter; structure repairs and generated print Contents stay outside the canonical Story-Locked text.</p></div></div>
      <div class="notice info"><strong>Story Lock still wins:</strong> inline bold/italic/underline styling is rendered from DOCX run metadata, but the exact manuscript characters are independently verified after pagination.</div>
    </article>`;
}

function renderChapters() {
  const chapters = effectiveChapters(state.project);
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
  const structure = analyzeMatter(effectiveBlocks(state.project));
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


function renderRepair() {
  const sourceBlocks = state.project.manuscript.blocks || [];
  const effective = effectiveBlocks(state.project);
  const effectiveById = new Map(effective.map((block) => [block.id, block]));
  const overrides = structureOverrideSummary(state.project);
  const overrideIds = new Set(overrides.map((item) => item.blockId));
  const query = state.repairSearch.trim().toLowerCase();
  const candidates = sourceBlocks.filter((block) => {
    if (block.kind === 'blank' && !overrideIds.has(block.id)) return false;
    if (query) return block.text.toLowerCase().includes(query) || block.kind.includes(query) || (block.style?.name || '').toLowerCase().includes(query) || block.id.toLowerCase().includes(query);
    return overrideIds.has(block.id) || block.kind !== 'body' || /chapter|heading|title/i.test(block.style?.name || '');
  }).slice(0, 500);
  const labels = {
    'chapter-title': 'Chapter title',
    body: 'Body paragraph',
    'scene-break': 'Scene break',
    'text-message': 'Text message',
    'front-back-heading': 'Front / back heading',
    heading: 'Heading',
    blank: 'Blank paragraph',
  };
  const sourceStats = state.project.manuscript.stats || {};
  const derivedStats = effectiveStats(state.project);
  return `
    <article class="panel">
      <div class="panel-head"><div><span class="badge good">Metadata only</span><h2>Structure Repair</h2><p>Fix chapter, scene-break, message, or book-matter classification without editing a single character of manuscript text.</p></div></div>
      ${state.repairMessage ? `<div class="notice success">${escapeHtml(state.repairMessage)}</div>` : ''}
      <div class="repair-summary">
        <div><b>${formatNumber(overrides.length)}</b><span>manual overrides</span></div>
        <div><b>${formatNumber(sourceStats.chapters || 0)}</b><span>source-detected chapters</span></div>
        <div><b>${formatNumber(derivedStats.chapters || 0)}</b><span>effective chapters</span></div>
      </div>
      <div class="notice info"><strong>Story Lock rule:</strong> these controls only change a paragraph's structural label. The text, punctuation, capitalization, order, and SHA-256 source fingerprint are never changed.</div>
      <div class="repair-toolbar"><input id="repairSearch" placeholder="Find text, paragraph ID, Word style, or classification…" value="${escapeHtml(state.repairSearch)}"><span>${formatNumber(candidates.length)} shown</span></div>
      <div class="repair-list">${candidates.map((block) => {
        const effectiveBlock = effectiveById.get(block.id) || block;
        const currentOverride = state.project.structureOverrides?.[block.id] || '';
        return `<div class="repair-row ${currentOverride ? 'overridden' : ''}">
          <div class="repair-meta"><b>${escapeHtml(block.id)}</b><span>source: ${escapeHtml(block.kind)}</span><span>${escapeHtml(block.style?.name || 'Normal')}</span></div>
          <div class="repair-text">${escapeHtml(block.text || '[blank paragraph]')}</div>
          <label class="repair-select"><span>${currentOverride ? `Override → ${escapeHtml(effectiveBlock.kind)}` : 'Use source detection'}</span><select data-repair-block="${escapeHtml(block.id)}">
            <option value="" ${!currentOverride ? 'selected' : ''}>Use source detection (${escapeHtml(block.kind)})</option>
            ${STRUCTURE_OVERRIDE_KINDS.map((kind) => `<option value="${kind}" ${currentOverride === kind ? 'selected' : ''}>${escapeHtml(labels[kind] || kind)}</option>`).join('')}
          </select></label>
        </div>`;
      }).join('')}</div>
      ${!candidates.length ? '<div class="matter-empty">No matching paragraphs.</div>' : ''}
      ${candidates.length >= 500 ? '<div class="notice warning">Showing the first 500 matches. Narrow the search to locate a specific paragraph.</div>' : ''}
    </article>`;
}


function currentPhysicalPage() {
  if (!state.preview?.pages?.length) return 1;
  const visible = spreadPageNumbers(state.spreadIndex);
  const candidate = visible.right && visible.right <= state.preview.pages.length ? visible.right : visible.left;
  return Math.max(1, Math.min(state.preview.pages.length, candidate || 1));
}

function previewNavigation() {
  return state.preview ? buildPreviewNavigation(state.preview.pages) : [];
}

function renderNavigator() {
  const query = state.navigatorSearch.trim().toLowerCase();
  const sourceChapters = effectiveChapters(state.project);

  if (!state.preview) {
    const chapters = sourceChapters.filter((chapter) => !query || chapter.title.toLowerCase().includes(query));
    return `
      <article class="panel">
        <div class="panel-head"><div><span class="badge good">Read-only navigator</span><h2>Manuscript navigator</h2><p>All ${formatNumber(sourceChapters.length)} detected chapters are mapped from the locked source. Build Print Preview to add physical and printed page numbers.</p></div><button class="btn primary" id="buildPreviewFromNavigator">Build page map</button></div>
        <div class="navigator-toolbar"><input id="navigatorSearch" placeholder="Find a chapter…" value="${escapeHtml(state.navigatorSearch)}"><span>${formatNumber(chapters.length)} shown</span></div>
        <div class="navigator-list source-only">${chapters.map((chapter) => `
          <div class="navigator-row">
            <span class="navigator-kind">CH</span>
            <div><strong>${escapeHtml(chapter.title)}</strong><small>Source paragraph ${chapter.startIndex + 1} · ${formatNumber(chapter.wordCount)} words</small></div>
            <span class="navigator-page">—</span>
          </div>`).join('')}</div>
        <div class="notice info"><strong>No page numbers guessed.</strong> Page locations only appear after the current design is actually paginated and Story Lock passes.</div>
      </article>`;
  }

  const allEntries = previewNavigation();
  const entries = allEntries.filter((entry) => !query || entry.title.toLowerCase().includes(query) || entry.type.includes(query));
  const current = currentNavigationEntry(allEntries, currentPhysicalPage());
  const chapterEntries = allEntries.filter((entry) => entry.type === 'chapter');
  return `
    <article class="panel navigator-panel">
      <div class="panel-head"><div><span class="badge good">Page map built</span><h2>Manuscript navigator</h2><p>Jump through the paginated book without scrolling hundreds of pages. Page mapping is generated from presentation data only.</p></div><button class="btn secondary" id="rebuildPreviewFromNavigator">Rebuild page map</button></div>
      <div class="navigator-summary">
        <div><b>${formatNumber(chapterEntries.length)}</b><span>chapters mapped</span></div>
        <div><b>${formatNumber(state.preview.pages.length)}</b><span>physical pages</span></div>
        <div><b>${current?.type === 'chapter' ? escapeHtml(current.title.replace(/^Chapter\s+/i,'')) : escapeHtml(current?.title || 'Front')}</b><span>current location</span></div>
      </div>
      <div class="navigator-toolbar"><input id="navigatorSearch" placeholder="Find chapter or section…" value="${escapeHtml(state.navigatorSearch)}"><span>${formatNumber(entries.length)} destinations</span></div>
      <div class="navigator-list">${entries.map((entry) => `
        <button class="navigator-row ${current?.id === entry.id ? 'active' : ''}" data-nav-page="${entry.physicalPage}">
          <span class="navigator-kind">${entry.type === 'chapter' ? 'CH' : entry.type === 'front' ? 'FM' : 'BM'}</span>
          <div><strong>${escapeHtml(entry.title)}</strong><small>Physical ${entry.physicalPage}${entry.bookPageNumber != null ? ` · printed ${entry.bookPageNumber}` : ' · unnumbered'} · spread ${entry.spreadIndex + 1}</small></div>
          <span class="navigator-page">${entry.bookPageNumber ?? '—'}</span>
        </button>`).join('')}</div>
      <div class="notice success"><strong>Navigator is non-destructive.</strong> It stores no alternate copy of the prose; every destination points back to pages generated from the Story-Locked source.</div>
    </article>`;
}

function designNumberField(id, label, value, step = '0.05', min = '0', max = '3', suffix = 'in') {
  return `<label class="design-field"><span>${label}</span><div class="number-wrap"><input type="number" id="${id}" value="${value}" step="${step}" min="${min}" max="${max}"><em>${suffix}</em></div></label>`;
}

function formatCalibrationValue(value, unit) {
  if (typeof value === 'number') {
    if (unit === 'pt') return `${Number(value.toFixed(2))} pt`;
    if (unit === 'in') return `${Number(value.toFixed(3))}”`;
    if (unit === 'x') return `${Number(value.toFixed(3))}×`;
  }
  return String(value);
}

function renderThemeCard(theme, builtIn = true) {
  const design = normalizePrintDesign(theme.design || theme);
  const activeId = currentDesign().templateId;
  const id = builtIn ? design.templateId : theme.id;
  const active = activeId === id;
  return `<div class="theme-card ${active ? 'active' : ''}">
    <div class="theme-card-top"><span class="badge ${builtIn ? 'good' : 'info'}">${builtIn ? 'BUILT IN' : 'PRIVATE'}</span>${active ? '<span class="theme-active">ACTIVE</span>' : ''}</div>
    <h4>${escapeHtml(theme.name || design.name)}</h4>
    <p>${escapeHtml(theme.description || design.description || 'Reusable publishing theme')}</p>
    <div class="theme-spec"><span>${design.trimWidth}×${design.trimHeight}</span><span>${escapeHtml(design.bodyFont)} ${design.bodyFontSize}pt</span><span>${design.chapterStarts === 'right' ? 'Right chapters' : 'Next-page chapters'}</span></div>
    <div class="theme-actions">
      <button class="btn secondary" data-apply-theme="${escapeHtml(id)}" data-theme-kind="${builtIn ? 'built-in' : 'custom'}">Apply</button>
      ${builtIn ? '' : `<button class="btn ghost" data-export-theme="${escapeHtml(id)}">Export</button><button class="btn danger subtle" data-delete-theme="${escapeHtml(id)}">Delete</button>`}
    </div>
  </div>`;
}

function renderDesign() {
  const d = currentDesign();
  const validation = validatePrintDesign(d);
  const calibration = compareDesignToTemplate(d, TRES_AMIGOS_TEMPLATE);
  const changedRows = calibration.rows.filter((row) => !row.match);
  const tocMode = shouldGeneratePrintToc(state.project, d);
  return `
    <article class="panel">
      <div class="panel-head"><div><span class="badge good">Story layer untouched</span><h2>Design studio</h2><p>Choose a reusable house style or tune the page system. Themes contain only presentation metadata; Story-Locked manuscript wording is never stored inside them.</p></div><button class="btn primary" id="saveDesign">Save design</button></div>
      ${state.themeMessage ? `<div class="notice success">${escapeHtml(state.themeMessage)}</div>` : ''}
      <section class="theme-library">
        <div class="theme-library-head"><div><div class="eyebrow">Theme library</div><h3>Reusable book styles</h3><p>Apply a complete layout in one click. Save your own private themes for future books and series.</p></div><button class="btn secondary" id="importThemeButton">Import theme JSON</button><input type="file" id="themeFileInput" accept=".json,application/json" hidden></div>
        <div class="theme-grid">
          ${BUILT_IN_PRINT_THEMES.map((theme) => renderThemeCard(theme, true)).join('')}
          ${state.customThemes.map((theme) => renderThemeCard(theme, false)).join('')}
        </div>
        <div class="save-theme-row"><input id="customThemeName" maxlength="80" placeholder="Name this house style…"><input id="customThemeDescription" maxlength="240" placeholder="Optional note, e.g. Book 3 / series paperback"><button class="btn secondary" id="saveCustomTheme">Save current as private theme</button></div>
      </section>
      <section class="template-banner calibration-banner">
        <div><div class="eyebrow">Book 1 calibration target</div><h3>Tres Amigos Series · Book 1</h3><p>This inspector compares the current presentation values against the locked Book 1 reference profile. It measures design metadata only.</p></div>
        <div class="calibration-score ${calibration.exact ? 'perfect' : ''}"><b>${calibration.percent}%</b><span>${calibration.matches}/${calibration.total} settings match</span></div>
      </section>
      ${changedRows.length ? `<div class="calibration-diff"><div class="calibration-diff-head"><strong>${changedRows.length} setting${changedRows.length === 1 ? '' : 's'} differ from Book 1</strong><button class="btn ghost" id="applyTresTemplate">Restore exact Book 1 profile</button></div>${changedRows.map((row) => `<div class="calibration-row"><span>${escapeHtml(row.label)}</span><b>${escapeHtml(formatCalibrationValue(row.actual, row.unit))}</b><em>Book 1: ${escapeHtml(formatCalibrationValue(row.target, row.unit))}</em></div>`).join('')}</div>` : `<div class="notice success"><strong>Exact Book 1 design profile loaded.</strong> All ${calibration.total} tracked presentation settings match the saved Tres Amigos reference.</div>`}
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
          <div class="eyebrow">Typography</div><h3>Body + chapter rhythm</h3>
          <label class="design-field"><span>Body font</span><select id="bodyFont">${['Arial','Georgia','Garamond','Baskerville','Times New Roman'].map((name) => `<option ${d.bodyFont === name ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
          <label class="design-field"><span>Body alignment</span><select id="bodyAlignment"><option value="left" ${d.bodyAlignment === 'left' ? 'selected' : ''}>Left / ragged right</option><option value="justify" ${d.bodyAlignment === 'justify' ? 'selected' : ''}>Justified</option></select></label>
          <div class="field-grid two">
            ${designNumberField('bodyFontSize', 'Body size', d.bodyFontSize, '0.25', '7', '18', 'pt')}
            ${designNumberField('lineHeight', 'Line height', d.lineHeight, '0.01', '1', '2', '×')}
            ${designNumberField('firstLineIndent', 'First-line indent', d.firstLineIndent, '0.01', '0', '1')}
            ${designNumberField('paragraphGap', 'Paragraph gap', d.paragraphGap, '0.01', '0', '0.75')}
            ${designNumberField('chapterTitleSize', 'Chapter title', d.chapterTitleSize, '0.25', '9', '28', 'pt')}
            ${designNumberField('chapterTopSpace', 'Chapter top space', d.chapterTopSpace, '0.01', '0', '2.5')}
            ${designNumberField('chapterAfterSpace', 'After chapter title', d.chapterAfterSpace, '0.01', '0', '1.5')}
            <label class="design-field"><span>Chapter alignment</span><select id="chapterTitleAlignment"><option value="center" ${d.chapterTitleAlignment === 'center' ? 'selected' : ''}>Center</option><option value="left" ${d.chapterTitleAlignment === 'left' ? 'selected' : ''}>Left</option><option value="right" ${d.chapterTitleAlignment === 'right' ? 'selected' : ''}>Right</option></select></label>
          </div>
          <div class="design-readout"><span>Live text box</span><strong>${validation.content.width.toFixed(2)} × ${validation.content.height.toFixed(2)} in</strong></div>
        </section>
        <section class="design-card">
          <div class="eyebrow">Generated front matter</div><h3>Print Table of Contents</h3>
          <label class="toggle-row"><input type="checkbox" id="printToc" ${d.printToc ? 'checked' : ''}><span><strong>Generate print Table of Contents</strong><small>Page numbers are calculated from final pagination.</small></span></label>
          <label class="design-field"><span>TOC title</span><input id="tocTitle" value="${escapeHtml(d.tocTitle)}" maxlength="80"></label>
          <label class="toggle-row"><input type="checkbox" id="tocIncludeBackMatter" ${d.tocIncludeBackMatter ? 'checked' : ''}><span><strong>Include recognized back matter</strong><small>Matches Book 1 behavior for About the Authors / Join the Journey.</small></span></label>
          <div class="field-grid two">
            ${designNumberField('tocTitleSize', 'TOC title size', d.tocTitleSize, '0.25', '9', '24', 'pt')}
            ${designNumberField('tocEntryFontSize', 'TOC entry size', d.tocEntryFontSize, '0.25', '7', '16', 'pt')}
            ${designNumberField('tocLineHeight', 'TOC line height', d.tocLineHeight, '0.01', '1', '2', '×')}
            ${designNumberField('tocTopSpace', 'TOC top space', d.tocTopSpace, '0.01', '0', '1.5')}
            ${designNumberField('tocAfterTitleSpace', 'After TOC title', d.tocAfterTitleSpace, '0.01', '0', '1.5')}
          </div>
          ${tocMode.reason === 'source-toc-detected' ? '<div class="notice warning mini"><strong>Manual TOC detected in the DOCX.</strong> Generated TOC will stay off during pagination so YasReady does not duplicate or remove source content. Remove the manual TOC from the master DOCX and re-import to use generated page numbers.</div>' : '<div class="notice success mini"><strong>Automatic TOC ready.</strong> YasReady will insert generated Contents pages before Chapter 1 and verify every printed page number against final pagination.</div>'}
        </section>
        <section class="design-card">
          <div class="eyebrow">Page furniture</div><h3>Folios + running headers</h3>
          <label class="design-field"><span>Page numbers</span><select id="pageNumbers"><option value="outside-bottom" ${d.pageNumbers === 'outside-bottom' ? 'selected' : ''}>Outside bottom</option><option value="none" ${d.pageNumbers === 'none' ? 'selected' : ''}>Off</option></select></label>
          <div class="field-grid two">
            ${designNumberField('pageNumberFontSize', 'Page number', d.pageNumberFontSize, '0.25', '7', '18', 'pt')}
            ${designNumberField('folioBottom', 'Folio from bottom', d.folioBottom, '0.01', '0.15', '1.5')}
            ${designNumberField('folioOutsideInset', 'Folio outside inset', d.folioOutsideInset, '0.01', '0.1', '1.5')}
          </div>
          <label class="toggle-row"><input type="checkbox" id="runningHeaders" ${d.runningHeaders ? 'checked' : ''}><span><strong>Running headers</strong><small>Off in the Tres Amigos Book 1 reference.</small></span></label>
          <label class="design-field"><span>Running-header pattern</span><select id="runningHeaderMode"><option value="book-chapter" ${d.runningHeaderMode === 'book-chapter' ? 'selected' : ''}>Book title / chapter title</option><option value="author-book" ${d.runningHeaderMode === 'author-book' ? 'selected' : ''}>Author / book title</option><option value="book-author" ${d.runningHeaderMode === 'book-author' ? 'selected' : ''}>Book title / author</option></select></label>
          <div class="field-grid two">
            ${designNumberField('runningHeaderFontSize', 'Header size', d.runningHeaderFontSize, '0.25', '6', '14', 'pt')}
            ${designNumberField('runningHeaderTop', 'Header from top', d.runningHeaderTop, '0.01', '0.1', '1.5')}
            ${designNumberField('runningHeaderOutsideInset', 'Header outside inset', d.runningHeaderOutsideInset, '0.01', '0.1', '1.5')}
            <label class="toggle-row compact"><input type="checkbox" id="suppressHeaderOnChapterOpen" ${d.suppressHeaderOnChapterOpen ? 'checked' : ''}><span><strong>Hide on chapter openings</strong><small>Recommended.</small></span></label>
          </div>
          <div class="notice info mini">Folios and headers are generated from presentation metadata. They are never inserted into the Story-Locked manuscript.</div>
        </section>
      </div>
      ${validation.warnings.length ? `<div class="notice warning"><strong>Working warnings</strong><br>${validation.warnings.map(escapeHtml).join('<br>')}</div>` : `<div class="notice success"><strong>Book geometry is healthy.</strong> Save this design as a private theme if you want to reuse it in another book.</div>`}
      <div class="notice info">Changing or applying a theme invalidates the old preview. Save/apply, then rebuild Print Preview so pagination is recalculated from the locked manuscript.</div>
    </article>`;
}
function renderPreviewNavigatorRail(preview) {
  const entries = buildPreviewNavigation(preview.pages);
  const currentPage = currentPhysicalPage();
  const current = currentNavigationEntry(entries, currentPage);
  const query = state.navigatorSearch.trim().toLowerCase();
  const filtered = entries.filter((entry) => !query || entry.title.toLowerCase().includes(query) || entry.type.includes(query));
  return `
    <aside class="preview-rail">
      <div class="preview-rail-head"><strong>Navigator</strong><span>${formatNumber(entries.filter((entry) => entry.type === 'chapter').length)} chapters</span></div>
      <input id="previewNavigatorSearch" class="preview-rail-search" placeholder="Find chapter…" value="${escapeHtml(state.navigatorSearch)}">
      <div class="preview-rail-list">${filtered.map((entry) => `
        <button class="preview-rail-row ${current?.id === entry.id ? 'active' : ''}" data-nav-page="${entry.physicalPage}">
          <span>${entry.type === 'chapter' ? 'CH' : entry.type === 'front' ? 'FM' : 'BM'}</span>
          <div><strong>${escapeHtml(entry.title)}</strong><small>${entry.bookPageNumber != null ? `p. ${entry.bookPageNumber}` : `physical ${entry.physicalPage}`}</small></div>
        </button>`).join('')}</div>
    </aside>`;
}

function renderPrint() {
  if (!state.preview) {
    return `
      <article class="panel">
        <div class="panel-head"><div><span class="badge good">Story Lock required</span><h2>Print preview</h2><p>Build a structural page model from the locked manuscript and current Design settings.</p></div></div>
        <div class="preview-empty">
          <div class="spread-icon"><span></span><span></span></div>
          <h3>Ready to paginate</h3>
          <p>Publish will create mirrored left/right pages, force chapters to right-hand odd pages when selected, insert intentional blank versos automatically, and build a chapter/page navigator.</p>
          <button class="btn primary" id="buildPreview">Build 6×9 preview</button>
        </div>
      </article>`;
  }

  const preview = state.preview;
  const maxSpread = Math.ceil(Math.max(0, preview.pages.length - 1) / 2);
  state.spreadIndex = Math.max(0, Math.min(maxSpread, state.spreadIndex));
  const spread = getSpread(preview.pages, state.spreadIndex);
  const entries = buildPreviewNavigation(preview.pages);
  const currentPage = currentPhysicalPage();
  const current = currentNavigationEntry(entries, currentPage);
  const previousChapter = adjacentChapter(entries, currentPage, -1);
  const nextChapter = adjacentChapter(entries, currentPage, 1);
  return `
    <article class="panel preview-panel">
      <div class="panel-head"><div><span class="badge good">Story Lock verified before pagination</span><h2>Print preview</h2><p>Production workbench · ${preview.design.trimWidth} × ${preview.design.trimHeight} in · ${preview.design.chapterStarts === 'right' ? 'chapters on right' : 'chapters on next page'}</p></div><button class="btn secondary" id="rebuildPreview">Rebuild</button></div>
      <div class="preview-stats six">
        <div><b>${formatNumber(preview.pages.length)}</b><span>physical pages</span></div>
        <div><b>${formatNumber(preview.blankVersos)}</b><span>blank versos inserted</span></div>
        <div><b>${formatNumber(preview.chapterStarts)}</b><span>chapter starts</span></div>
        <div><b>${formatNumber(preview.chaptersOnRight)}</b><span>chapters on right</span></div>
        <div><b>${formatNumber(preview.generatedToc?.entries?.length || 0)}</b><span>TOC entries</span></div>
        <div><b>${formatNumber(preview.structure?.backMatterBlocks || 0)}</b><span>back matter ¶</span></div>
      </div>
      <div class="preview-commandbar">
        <button class="btn secondary small" id="prevChapter" ${!previousChapter || previousChapter.physicalPage >= currentPage ? 'disabled' : ''}>⇤ Chapter</button>
        <button class="btn secondary small" id="prevSpread" ${state.spreadIndex <= 0 ? 'disabled' : ''}>← Spread</button>
        <div class="preview-location"><strong>${escapeHtml(current?.title || 'Front Matter')}</strong><span>Spread ${state.spreadIndex + 1} / ${maxSpread + 1} · physical ${spread.left?.number ? `${spread.left.number}–` : ''}${spread.right?.number || spread.left?.number || 1}</span></div>
        <div class="zoom-wrap"><label>Zoom</label><select id="previewZoom">${[46,58,70,82].map((value) => `<option value="${value}" ${state.previewZoom === value ? 'selected' : ''}>${Math.round(value / 58 * 100)}%</option>`).join('')}</select></div>
        <div class="jump-wrap"><label for="jumpPage">Page</label><input id="jumpPage" type="number" min="1" max="${preview.pages.length}" value="${currentPage}"><button class="btn secondary small" id="jumpPageBtn">Go</button></div>
        <button class="btn secondary small" id="nextSpread" ${state.spreadIndex >= maxSpread ? 'disabled' : ''}>Spread →</button>
        <button class="btn secondary small" id="nextChapter" ${!nextChapter || nextChapter.physicalPage <= currentPage ? 'disabled' : ''}>Chapter ⇥</button>
      </div>
      <div class="page-scrubber-wrap"><span>1</span><input id="pageScrubber" type="range" min="1" max="${preview.pages.length}" value="${currentPage}" step="1"><span>${preview.pages.length}</span></div>
      <div class="preview-workbench">
        ${renderPreviewNavigatorRail(preview)}
        <div class="preview-stage">
          <div class="book-spread">
            ${spread.left ? renderBookPage(spread.left, preview.design) : '<div class="book-page-placeholder"><span>Front</span></div>'}
            ${spread.right ? renderBookPage(spread.right, preview.design) : '<div class="book-page-placeholder"><span>End</span></div>'}
          </div>
        </div>
      </div>
      <div class="notice success preview-note"><strong>Print production path:</strong> this page map feeds KDP Preflight and the fixed single-page print master. Generated TOC numbers are verified against this final page map; intentional blank versos suppress both running headers and folios.</div>
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

function renderChapterTitle(text, design = currentDesign()) {
  const safe = escapeHtml(text);
  const match = safe.match(/^(Chapter\s+(?:\d+|[IVXLCDM]+):?)(\s*)(.*)$/i);
  if (!match) return safe;
  return `<span style="font-weight:${design.chapterLabelWeight}">${match[1]}</span>${match[2]}<span style="font-weight:${design.chapterNameWeight}">${match[3]}</span>`;
}

function renderBookPage(page, design) {
  const px = state.previewZoom || PREVIEW_PX_PER_INCH;
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
      if (fragment.kind === 'blank') return `<div class="print-fragment blank-space" style="height:${(fragment.previewHeight || 6) * (px / PREVIEW_PX_PER_INCH)}px"></div>`;
      if (fragment.kind === 'generated-toc-title') {
        const tocTitlePx = design.tocTitleSize * (96 / 72) * (px / 96);
        return `<div class="print-fragment generated-toc-title" style="padding-top:${design.tocTopSpace * px}px;padding-bottom:${design.tocAfterTitleSpace * px}px;font-size:${tocTitlePx}px;text-align:center;line-height:1.15">${escapeHtml(fragment.text)}</div>`;
      }
      if (fragment.kind === 'generated-toc-entry') {
        const tocEntryPx = design.tocEntryFontSize * (96 / 72) * (px / 96);
        return `<div class="print-fragment generated-toc-entry" style="font-size:${tocEntryPx}px;line-height:${design.tocLineHeight}"><span class="toc-label">${escapeHtml(fragment.tocTitle || fragment.text)}</span><span class="toc-leader"></span><span class="toc-page">${escapeHtml(fragment.tocPageNumber ?? '')}</span></div>`;
      }
      const classes = `print-fragment ${escapeHtml(fragment.kind)} ${fragment.continuation ? 'continuation' : ''}`;
      let extra = '';
      let content = renderInlineRuns(fragment);
      if (fragment.kind === 'chapter-title') {
        extra = `padding-top:${chapterTop}px;padding-bottom:${chapterAfter}px;font-size:${chapterSize}px;line-height:${design.chapterTitleLineHeight};text-align:${design.chapterTitleAlignment};`;
        content = renderChapterTitle(fragment.text, design);
      }
      const shouldIndent = fragment.kind === 'body' && !fragment.continuation && !fragment.suppressIndent;
      if (fragment.kind === 'body') extra += `text-align:${design.bodyAlignment};`;
      if (shouldIndent) extra += `text-indent:${indent}px;`;
      const gap = fragment.isFinalPiece && design.paragraphGap && !['chapter-title','blank','generated-toc-title','generated-toc-entry'].includes(fragment.kind)
        ? design.paragraphGap * px : 0;
      if (gap) extra += `padding-bottom:${gap}px;`;
      return `<div class="${classes}" style="${extra}">${content}</div>`;
    }).join('');

  const folio = !page.intentionalBlank && design.pageNumbers !== 'none' && page.bookPageNumber != null
    ? `<div class="book-folio ${isLeft ? 'left' : 'right'}" style="font-size:${pageNumberSize}px;bottom:${design.folioBottom * px}px;${isLeft ? `left:${design.folioOutsideInset * px}px` : `right:${design.folioOutsideInset * px}px`}">${page.bookPageNumber}</div>` : '';
  const headerText = page.showRunningHeader
    ? runningHeaderText({ side: page.side, projectTitle: state.project?.title || '', author: state.project?.author || '', chapterTitle: page.chapterTitle || '', mode: design.runningHeaderMode })
    : '';
  const header = design.runningHeaders && headerText
    ? `<div class="book-running-header ${isLeft ? 'left' : 'right'}" style="font-size:${runningHeaderSize}px;top:${design.runningHeaderTop * px}px;${isLeft ? `left:${design.runningHeaderOutsideInset * px}px` : `right:${design.runningHeaderOutsideInset * px}px`}">${escapeHtml(headerText)}</div>` : '';
  const sectionLabel = page.section === 'front' ? 'front matter' : page.section === 'back' ? 'back matter' : (page.chapterTitle || 'book body');

  return `<div class="book-page-wrap"><div class="book-page-label">${page.side.toUpperCase()} · physical ${page.number}${page.bookPageNumber != null ? ` · book ${page.bookPageNumber}` : ' · unnumbered'} · ${escapeHtml(sectionLabel)}</div><div class="book-page ${page.intentionalBlank ? 'is-blank' : ''}" style="width:${width}px;height:${height}px;padding:${padding};font-family:${fontStack(design.bodyFont)};font-size:${fontSize}px;line-height:${design.lineHeight};">${header}${fragments}${folio}</div></div>`;
}


function currentPreflight(storyLockOk = true) {
  if (!state.project || !state.preview) return null;
  return runKdpPreflight({ project: state.project, preview: state.preview, storyLockOk });
}

function renderPreflightCheck(item) {
  const icon = item.status === 'pass' ? '✓' : item.status === 'warning' ? '!' : '×';
  return `<div class="preflight-row ${item.status}"><div class="preflight-icon">${icon}</div><div><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(item.message)}</p></div><span>${item.status.toUpperCase()}</span></div>`;
}

function renderExport() {
  if (!state.preview) {
    return `
      <article class="panel">
        <div class="panel-head"><div><span class="badge good">Story Lock required</span><h2>KDP export</h2><p>Production export cannot run from an unpaginated manuscript.</p></div></div>
        <div class="preview-empty">
          <div class="spread-icon"><span></span><span></span></div>
          <h3>Build the book first</h3>
          <p>Pagination must be frozen before KDP margin, chapter parity, blank-page, and page-count checks can be evaluated.</p>
          <button class="btn primary" id="buildPreviewForExport">Build Print Preview</button>
        </div>
      </article>`;
  }

  const report = currentPreflight(state.project?.storyLock?.status === 'verified');
  const readyClass = report.ready ? 'ready' : 'blocked';
  return `
    <article class="panel export-panel">
      <div class="panel-head"><div><span class="badge ${report.ready ? 'good' : 'bad'}">${report.ready ? 'PRE-FLIGHT READY' : 'EXPORT BLOCKED'}</span><h2>KDP paperback preflight</h2><p>${report.pageCount} physical pages · ${report.design.trimWidth} × ${report.design.trimHeight} in · no-bleed interior</p></div><button class="btn secondary" id="buildPreviewForExport">Rebuild pages</button></div>
      <div class="preflight-hero ${readyClass}">
        <div class="preflight-ring"><b>${report.summary.passes}</b><span>passes</span></div>
        <div><h3>${report.ready ? 'Layout gate passed.' : `${report.summary.errors} blocking issue${report.summary.errors === 1 ? '' : 's'} found.`}</h3><p>${report.ready ? 'You can open the print master. The export window performs one final production overflow check before enabling Print / Save as PDF.' : 'Fix the blocking checks below, rebuild pagination, and run preflight again. Manuscript wording remains untouched.'}</p></div>
        <div class="preflight-counts"><span class="pass">${report.summary.passes} pass</span><span class="warning">${report.summary.warnings} warning</span><span class="error">${report.summary.errors} error</span></div>
      </div>
      <div class="preflight-list">${report.checks.map(renderPreflightCheck).join('')}</div>
      <div class="export-actions">
        <button class="btn primary" id="openPrintMaster" ${report.ready ? '' : 'disabled'}>Open PDF Print Master</button>
        <button class="btn secondary" id="downloadPrintMaster" ${report.ready ? '' : 'disabled'}>Download Print Master HTML</button>
        <button class="btn secondary" id="downloadPreflightReport">Download Preflight Report</button>
      </div>
      <div class="notice info"><strong>PDF workflow:</strong> the print master contains one fixed ${report.design.trimWidth} × ${report.design.trimHeight} in page per physical page. In the export window, click <strong>Print / Save as PDF</strong>. Keep scale at 100%, disable browser headers/footers, and save as PDF. Font embedding must still be confirmed in the resulting PDF before KDP upload.</div>
    </article>`;
}


function renderEbook() {
  const project = state.project;
  const design = normalizeEbookDesign(project.design?.ebook || {});
  const report = runEpubPreflight({ project, storyLockOk: project.storyLock?.status === 'verified' });
  const preview = buildEbookPreviewHtml({ project, sectionIndex: state.ebookSectionIndex });
  state.ebookSectionIndex = preview.index;
  const frameHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preview.css}body{padding:2.2em 2.5em;max-width:42em;margin:0 auto;color:#18181a;background:#fffdf9} @media(max-width:600px){body{padding:1.4em}}</style></head><body>${preview.html}</body></html>`;
  const sectionRows = preview.sections.map((section, index) => `
    <button class="ebook-toc-row ${index === preview.index ? 'active' : ''}" data-ebook-section="${index}">
      <span>${section.type === 'chapter' ? 'CH' : section.type === 'front' ? 'FR' : 'BK'}</span>
      <div><strong>${escapeHtml(section.title)}</strong><small>${formatNumber(section.wordCount)} words · source ${section.startBlockIndex + 1}–${section.endBlockIndex + 1}</small></div>
    </button>`).join('');

  return `
    <article class="panel ebook-panel">
      <div class="panel-head"><div><span class="badge ${report.ready ? 'good' : 'bad'}">${report.ready ? 'EPUB READY' : 'EPUB BLOCKED'}</span><h2>Ebook / Kindle</h2><p>Reflowable EPUB 3 uses the same locked manuscript, but deliberately excludes print-only folios, gutters, fixed pages, and blank versos.</p></div><button class="btn secondary" data-go-view="import">Book metadata</button></div>
      ${state.ebookMessage ? `<div class="notice info">${escapeHtml(state.ebookMessage)}</div>` : ''}
      <div class="ebook-engine-banner">
        <div><div class="eyebrow">Separate output engine</div><h3>Reader-controlled pages. Publisher-controlled structure.</h3><p>Chapter order, inline emphasis, scene breaks, text messages, and navigation survive. Screen size and reader font choices are allowed to reflow the book.</p></div>
        <div class="ebook-format-chip"><b>EPUB 3</b><span>Kindle-ready reflowable</span></div>
      </div>
      <div class="ebook-settings-grid">
        <label class="design-field"><span>Language</span><input id="ebookLanguage" value="${escapeHtml(design.language)}" placeholder="en"></label>
        <label class="design-field"><span>Publisher metadata</span><input id="ebookPublisher" value="${escapeHtml(design.publisher)}" placeholder="Optional publisher / imprint"></label>
        <label class="design-field"><span>Reader font behavior</span><select id="ebookFontFamily"><option value="reader" ${design.fontFamily === 'reader' ? 'selected' : ''}>Reader default</option><option value="serif" ${design.fontFamily === 'serif' ? 'selected' : ''}>Publisher serif fallback</option><option value="sans" ${design.fontFamily === 'sans' ? 'selected' : ''}>Publisher sans fallback</option></select></label>
        <label class="design-field"><span>Body alignment</span><select id="ebookBodyAlignment"><option value="left" ${design.bodyAlignment === 'left' ? 'selected' : ''}>Left</option><option value="justify" ${design.bodyAlignment === 'justify' ? 'selected' : ''}>Justified</option></select></label>
        <label class="design-field"><span>Line height</span><input id="ebookLineHeight" type="number" min="1" max="2.2" step="0.01" value="${design.lineHeight}"></label>
        <label class="design-field"><span>First-line indent</span><div class="number-wrap"><input id="ebookFirstIndent" type="number" min="0" max="3" step="0.05" value="${design.firstLineIndentEm}"><em>em</em></div></label>
        <label class="design-field"><span>Paragraph gap</span><div class="number-wrap"><input id="ebookParagraphGap" type="number" min="0" max="2" step="0.05" value="${design.paragraphGapEm}"><em>em</em></div></label>
        <label class="design-field"><span>Chapter title alignment</span><select id="ebookChapterAlignment"><option value="left" ${design.chapterTitleAlignment === 'left' ? 'selected' : ''}>Left</option><option value="center" ${design.chapterTitleAlignment === 'center' ? 'selected' : ''}>Center</option><option value="right" ${design.chapterTitleAlignment === 'right' ? 'selected' : ''}>Right</option></select></label>
      </div>
      <div class="action-row"><button class="btn primary" id="saveEbookSettings">Save Ebook Settings</button><button class="btn secondary" id="downloadEpubPreflight">Download EPUB Preflight</button><button class="btn primary" id="downloadEpub" ${report.ready ? '' : 'disabled'}>Download .EPUB</button></div>
      <div class="ebook-summary-grid">
        <div><b>${report.sections}</b><span>Reading-order files</span></div>
        <div><b>${report.chapterEntries}</b><span>Chapter links</span></div>
        <div><b>${report.tocEntries}</b><span>Contents links</span></div>
        <div><b>${project.manuscript.stats.words.toLocaleString()}</b><span>Locked words</span></div>
      </div>
      <div class="preflight-list ebook-preflight">${report.checks.map(renderPreflightCheck).join('')}</div>
    </article>
    <article class="panel ebook-workbench-panel">
      <div class="panel-head"><div><div class="eyebrow">Reflowable preview</div><h2>${escapeHtml(preview.section.title)}</h2><p>Section ${preview.index + 1} of ${preview.sections.length}. This preview intentionally has no physical page numbers.</p></div><div class="ebook-section-buttons"><button class="btn small secondary" id="prevEbookSection" ${preview.index <= 0 ? 'disabled' : ''}>← Previous</button><button class="btn small secondary" id="nextEbookSection" ${preview.index >= preview.sections.length - 1 ? 'disabled' : ''}>Next →</button></div></div>
      <div class="ebook-workbench">
        <aside class="ebook-toc"><div class="ebook-toc-head"><strong>Generated Contents</strong><span>${report.tocEntries} links</span></div><div class="ebook-toc-list">${sectionRows}</div></aside>
        <div class="ebook-reader-shell"><iframe class="ebook-reader" title="Ebook reflowable preview" srcdoc="${escapeHtml(frameHtml)}"></iframe></div>
      </div>
      <div class="notice info"><strong>Clickable Kindle Contents:</strong> the EPUB writes both EPUB 3 <code>nav.xhtml</code> and legacy <code>toc.ncx</code> navigation from detected structure. Chapter links update automatically from the manuscript structure; there are no manually typed ebook page numbers to maintain.</div>
    </article>`;
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
      <div class="panel-head"><div><div class="eyebrow">Local projects</div><h2>Library</h2><p>Projects live in this browser's IndexedDB. Older projects are migrated to the 0.9 print + ebook + structure-repair model without touching source blocks or Story Lock hashes.</p></div><button class="btn primary" id="libraryImport">New project</button></div>
      ${state.projects.length ? `<div class="project-list">${state.projects.map((raw) => { const p = migrateProject(raw); return `
        <div class="project-row">
          <div><strong>${escapeHtml(p.title)}</strong><span>${escapeHtml(p.source.fileName)} · ${effectiveStats(p).chapters} chapters · ${formatNumber(effectiveStats(p).words)} words · Updated ${new Date(p.updatedAt).toLocaleString()}</span></div>
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
    state.project = null; state.preview = null; state.ebookSectionIndex = 0; state.ebookMessage = ''; state.activeView = 'import'; state.error = ''; renderShell();
  });
  document.querySelector('#libraryImport')?.addEventListener('click', () => {
    state.project = null; state.preview = null; state.ebookSectionIndex = 0; state.ebookMessage = ''; state.activeView = 'import'; state.error = ''; renderShell();
  });
  document.querySelector('#saveMetadata')?.addEventListener('click', saveProjectMetadata);
  document.querySelector('#verifyLock')?.addEventListener('click', verifyLock);
  document.querySelector('#saveDesign')?.addEventListener('click', saveDesign);
  document.querySelector('#applyTresTemplate')?.addEventListener('click', applyTresAmigosTemplate);
  document.querySelector('#saveCustomTheme')?.addEventListener('click', saveCurrentCustomTheme);
  document.querySelector('#importThemeButton')?.addEventListener('click', () => document.querySelector('#themeFileInput')?.click());
  document.querySelector('#themeFileInput')?.addEventListener('change', (event) => event.target.files?.[0] && importThemeFile(event.target.files[0]));
  document.querySelectorAll('[data-apply-theme]').forEach((button) => button.addEventListener('click', () => applyThemeFromLibrary(button.dataset.applyTheme, button.dataset.themeKind)));
  document.querySelectorAll('[data-export-theme]').forEach((button) => button.addEventListener('click', () => exportCustomTheme(button.dataset.exportTheme)));
  document.querySelectorAll('[data-delete-theme]').forEach((button) => button.addEventListener('click', () => removeCustomTheme(button.dataset.deleteTheme)));
  document.querySelector('#buildPreview')?.addEventListener('click', buildPreview);
  document.querySelector('#rebuildPreview')?.addEventListener('click', buildPreview);
  document.querySelector('#buildPreviewForExport')?.addEventListener('click', buildPreviewForExport);
  document.querySelector('#openPrintMaster')?.addEventListener('click', openPrintMaster);
  document.querySelector('#downloadPrintMaster')?.addEventListener('click', downloadPrintMaster);
  document.querySelector('#downloadPreflightReport')?.addEventListener('click', downloadPreflightReport);
  document.querySelector('#saveEbookSettings')?.addEventListener('click', saveEbookSettings);
  document.querySelector('#downloadEpub')?.addEventListener('click', downloadEpub);
  document.querySelector('#downloadEpubPreflight')?.addEventListener('click', downloadEpubPreflight);
  document.querySelector('#prevEbookSection')?.addEventListener('click', () => jumpEbookSection(state.ebookSectionIndex - 1));
  document.querySelector('#nextEbookSection')?.addEventListener('click', () => jumpEbookSection(state.ebookSectionIndex + 1));
  document.querySelectorAll('[data-ebook-section]').forEach((button) => button.addEventListener('click', () => jumpEbookSection(Number(button.dataset.ebookSection))));

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

  const repairSearch = document.querySelector('#repairSearch');
  repairSearch?.addEventListener('input', (event) => {
    state.repairSearch = event.target.value;
    clearTimeout(repairSearch._timer);
    repairSearch._timer = setTimeout(updateMain, 160);
  });
  document.querySelectorAll('[data-repair-block]').forEach((select) => select.addEventListener('change', () => applyStructureRepair(select.dataset.repairBlock, select.value)));

  const navigatorSearch = document.querySelector('#navigatorSearch');
  navigatorSearch?.addEventListener('input', (event) => {
    state.navigatorSearch = event.target.value;
    clearTimeout(navigatorSearch._timer);
    navigatorSearch._timer = setTimeout(updateMain, 140);
  });
  const previewNavigatorSearch = document.querySelector('#previewNavigatorSearch');
  previewNavigatorSearch?.addEventListener('input', (event) => {
    state.navigatorSearch = event.target.value;
    clearTimeout(previewNavigatorSearch._timer);
    previewNavigatorSearch._timer = setTimeout(updateMain, 140);
  });

  document.querySelector('#buildPreviewFromNavigator')?.addEventListener('click', buildPreview);
  document.querySelector('#rebuildPreviewFromNavigator')?.addEventListener('click', buildPreview);
  document.querySelectorAll('[data-nav-page]').forEach((button) => button.addEventListener('click', () => {
    jumpToPhysicalPage(Number(button.dataset.navPage));
    if (state.activeView === 'navigator') state.activeView = 'print';
    updateMain();
  }));

  document.querySelector('#prevSpread')?.addEventListener('click', () => { state.spreadIndex = Math.max(0, state.spreadIndex - 1); updateMain(); });
  document.querySelector('#nextSpread')?.addEventListener('click', () => {
    if (!state.preview) return;
    const max = Math.ceil(Math.max(0, state.preview.pages.length - 1) / 2);
    state.spreadIndex = Math.min(max, state.spreadIndex + 1);
    updateMain();
  });
  document.querySelector('#jumpPageBtn')?.addEventListener('click', jumpToPage);
  document.querySelector('#jumpPage')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') jumpToPage(); });
  document.querySelector('#pageScrubber')?.addEventListener('change', (event) => jumpToPhysicalPage(Number(event.target.value), true));
  document.querySelector('#previewZoom')?.addEventListener('change', (event) => {
    state.previewZoom = Number(event.target.value) || PREVIEW_PX_PER_INCH;
    updateMain();
  });
  document.querySelector('#prevChapter')?.addEventListener('click', () => jumpAdjacentChapter(-1));
  document.querySelector('#nextChapter')?.addEventListener('click', () => jumpAdjacentChapter(1));

  document.querySelectorAll('[data-open-project]').forEach((button) => button.addEventListener('click', async () => {
    const loaded = await loadProject(button.dataset.openProject);
    state.project = migrateProject(loaded);
    await saveProject(state.project);
    state.preview = null;
    state.spreadIndex = 0;
    state.ebookSectionIndex = 0;
    state.ebookMessage = '';
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

async function applyStructureRepair(blockId, kind) {
  if (!state.project) return;
  try {
    setStructureOverride(state.project, blockId, kind || null);
    state.project.updatedAt = new Date().toISOString();
    state.preview = null;
    state.spreadIndex = 0;
    state.ebookSectionIndex = 0;
    state.repairMessage = kind
      ? `Structure metadata updated for ${blockId}. Story text was not changed.`
      : `Structure override cleared for ${blockId}; source detection is active again.`;
    await saveProject(state.project);
    state.projects = await listProjects();
    updateMain();
  } catch (error) {
    console.error(error);
    alert(error?.message || 'Structure repair could not be saved safely.');
  }
}

function jumpToPhysicalPage(value, rerender = true) {
  if (!state.preview) return;
  const page = Math.max(1, Math.min(state.preview.pages.length, Math.round(Number(value) || 1)));
  state.spreadIndex = spreadIndexForPhysicalPage(page);
  if (rerender) updateMain();
}

function jumpToPage() {
  const value = Number(document.querySelector('#jumpPage')?.value || 1);
  jumpToPhysicalPage(value, true);
}

function jumpAdjacentChapter(direction) {
  if (!state.preview) return;
  const entries = buildPreviewNavigation(state.preview.pages);
  const target = adjacentChapter(entries, currentPhysicalPage(), direction);
  if (!target) return;
  jumpToPhysicalPage(target.physicalPage, true);
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
    state.ebookSectionIndex = 0;
    state.ebookMessage = '';
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


function downloadTextFile(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadBlobFile(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


async function ensureExportReady() {
  if (!state.project || !state.preview) return { ok: false, report: null };
  const lock = await verifyProjectStoryLock(state.project);
  if (!lock.ok) {
    state.project.storyLock.status = 'failed';
    await saveProject(state.project);
    return { ok: false, report: currentPreflight(false) };
  }
  state.project.storyLock.status = 'verified';
  state.project.storyLock.verifiedAt = new Date().toISOString();
  await saveProject(state.project);
  const report = currentPreflight(true);
  return { ok: Boolean(report?.ready), report };
}

function safeExportBaseName() {
  return (state.project?.title || 'yasready-book').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'yasready-book';
}

async function buildPreviewForExport() {
  await buildPreview();
  state.activeView = 'export';
  updateMain();
}

async function openPrintMaster() {
  const popup = window.open('', '_blank');
  const result = await ensureExportReady();
  if (!result.ok) {
    popup?.close();
    alert('KDP export is blocked. Review the preflight checks first.');
    state.activeView = 'export';
    updateMain();
    return;
  }
  const html = buildPrintMasterHtml({ project: state.project, preview: state.preview, manuscriptHash: state.project.source.manuscriptHash });
  if (!popup) {
    alert('Your browser blocked the print-master window. Allow popups for YasReady Publish and try again.');
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}

async function downloadPrintMaster() {
  const result = await ensureExportReady();
  if (!result.ok) {
    alert('KDP export is blocked. Review the preflight checks first.');
    state.activeView = 'export';
    updateMain();
    return;
  }
  const html = buildPrintMasterHtml({ project: state.project, preview: state.preview, manuscriptHash: state.project.source.manuscriptHash });
  downloadTextFile(`${safeExportBaseName()}-print-master.html`, html, 'text/html;charset=utf-8');
}

function downloadPreflightReport() {
  if (!state.project || !state.preview) return;
  const report = currentPreflight(state.project.storyLock?.status === 'verified');
  const payload = {
    yasreadyPublishVersion: VERSION,
    bookTitle: state.project.title,
    author: state.project.author || '',
    sourceFile: state.project.source.fileName,
    manuscriptSha256: state.project.source.manuscriptHash,
    ...report,
  };
  downloadTextFile(`${safeExportBaseName()}-kdp-preflight.json`, JSON.stringify(payload, null, 2));
}


function readEbookForm() {
  const value = (id) => document.querySelector(`#${id}`)?.value;
  const base = normalizeEbookDesign(state.project?.design?.ebook || {});
  return normalizeEbookDesign({
    ...base,
    language: value('ebookLanguage') ?? base.language,
    publisher: value('ebookPublisher') ?? base.publisher,
    fontFamily: value('ebookFontFamily') ?? base.fontFamily,
    bodyAlignment: value('ebookBodyAlignment') ?? base.bodyAlignment,
    lineHeight: value('ebookLineHeight') ?? base.lineHeight,
    firstLineIndentEm: value('ebookFirstIndent') ?? base.firstLineIndentEm,
    paragraphGapEm: value('ebookParagraphGap') ?? base.paragraphGapEm,
    chapterTitleAlignment: value('ebookChapterAlignment') ?? base.chapterTitleAlignment,
  });
}

async function saveEbookSettings() {
  if (!state.project) return;
  state.project.design = state.project.design || {};
  state.project.design.ebook = readEbookForm();
  state.project.updatedAt = new Date().toISOString();
  state.ebookMessage = 'Ebook settings saved. Story wording and Story Lock hash were not changed.';
  await saveProject(state.project);
  state.projects = await listProjects();
  updateMain();
}

function jumpEbookSection(index) {
  if (!state.project) return;
  const preview = buildEbookPreviewHtml({ project: state.project, sectionIndex: index });
  state.ebookSectionIndex = preview.index;
  updateMain();
}

async function ensureEpubReady() {
  if (!state.project) return { ok: false, report: null };
  const lock = await verifyProjectStoryLock(state.project);
  if (!lock.ok) {
    state.project.storyLock.status = 'failed';
    await saveProject(state.project);
    return { ok: false, report: runEpubPreflight({ project: state.project, storyLockOk: false }) };
  }
  state.project.storyLock.status = 'verified';
  state.project.storyLock.verifiedAt = new Date().toISOString();
  await saveProject(state.project);
  const report = runEpubPreflight({ project: state.project, storyLockOk: true });
  return { ok: Boolean(report.ready), report };
}

async function downloadEpub() {
  if (!state.project) return;
  state.project.design = state.project.design || {};
  state.project.design.ebook = readEbookForm();
  state.project.updatedAt = new Date().toISOString();
  await saveProject(state.project);

  state.busy = true;
  state.busyMessage = 'Packaging EPUB without touching the manuscript…';
  updateMain();
  try {
    const ready = await ensureEpubReady();
    if (!ready.ok) {
      alert('EPUB export is blocked. Review the ebook preflight checks first.');
      return;
    }
    const packaged = await buildEpubBlob({ project: state.project });
    downloadBlobFile(`${safeExportBaseName()}.epub`, packaged.blob);
    state.ebookMessage = `EPUB built with ${packaged.sections.length} reading-order files and ${packaged.toc.length} clickable Contents links. Story Lock verified immediately before packaging.`;
  } catch (error) {
    console.error(error);
    alert(error?.message || 'EPUB export failed safely.');
  } finally {
    state.busy = false;
    state.busyMessage = '';
    state.activeView = 'ebook';
    updateMain();
  }
}

async function downloadEpubPreflight() {
  if (!state.project) return;
  state.project.design = state.project.design || {};
  state.project.design.ebook = readEbookForm();
  const lock = await verifyProjectStoryLock(state.project);
  const report = runEpubPreflight({ project: state.project, storyLockOk: lock.ok });
  const payload = {
    yasreadyPublishVersion: VERSION,
    format: 'EPUB 3 reflowable',
    bookTitle: state.project.title,
    author: state.project.author || '',
    sourceFile: state.project.source.fileName,
    manuscriptSha256: state.project.source.manuscriptHash,
    generatedAt: new Date().toISOString(),
    ...report,
  };
  downloadTextFile(`${safeExportBaseName()}-epub-preflight.json`, JSON.stringify(payload, null, 2));
}

async function applyThemeFromLibrary(id, kind = 'built-in') {
  if (!state.project) return;
  let design = null;
  let name = '';
  if (kind === 'custom') {
    const theme = state.customThemes.find((candidate) => candidate.id === id);
    if (!theme) return;
    design = normalizePrintDesign({ ...theme.design, templateId: theme.id, name: theme.name });
    name = theme.name;
  } else {
    design = applyTemplate(id);
    name = design.name;
  }
  state.project.design.print = design;
  state.project.design.template = name;
  state.project.updatedAt = new Date().toISOString();
  state.preview = null;
  state.spreadIndex = 0;
  state.themeMessage = `Applied “${name}”. Preview invalidated so pagination can be rebuilt safely.`;
  await saveProject(state.project);
  state.projects = await listProjects();
  updateMain();
}

async function saveCurrentCustomTheme() {
  if (!state.project) return;
  const name = document.querySelector('#customThemeName')?.value.trim();
  const description = document.querySelector('#customThemeDescription')?.value.trim() || '';
  if (!name) {
    alert('Give the house style a name first.');
    return;
  }
  const record = saveCustomTheme({ name, description, design: readDesignForm() });
  state.customThemes = loadCustomThemes();
  state.themeMessage = `Saved private theme “${record.name}”. It contains design metadata only — no manuscript text.`;
  updateMain();
}

async function importThemeFile(file) {
  try {
    const text = await file.text();
    const parsed = parseThemeJson(text);
    const record = saveCustomTheme({ name: parsed.name, description: parsed.description, design: parsed.design });
    state.customThemes = loadCustomThemes();
    state.themeMessage = `Imported private theme “${record.name}”.`;
    updateMain();
  } catch (error) {
    console.error(error);
    alert(error?.message || 'Theme import failed safely.');
  }
}

function exportCustomTheme(id) {
  const theme = state.customThemes.find((candidate) => candidate.id === id);
  if (!theme) return;
  const safeName = theme.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'yasready-theme';
  downloadTextFile(`${safeName}.yasready-theme.json`, serializeTheme(theme));
}

function removeCustomTheme(id) {
  const theme = state.customThemes.find((candidate) => candidate.id === id);
  if (!theme) return;
  if (!confirm(`Delete private theme “${theme.name}”? This does not delete or change any book manuscript.`)) return;
  state.customThemes = deleteCustomTheme(id);
  state.themeMessage = `Deleted private theme “${theme.name}”.`;
  updateMain();
}

async function applyTresAmigosTemplate() {
  return applyThemeFromLibrary('tres-amigos-book1', 'built-in');
}

function readDesignForm() {
  const value = (id) => document.querySelector(`#${id}`)?.value;
  const base = currentDesign();
  return normalizePrintDesign({
    ...base,
    trimWidth: value('trimWidth') ?? base.trimWidth,
    trimHeight: value('trimHeight') ?? base.trimHeight,
    insideMargin: value('insideMargin') ?? base.insideMargin,
    outsideMargin: value('outsideMargin') ?? base.outsideMargin,
    topMargin: value('topMargin') ?? base.topMargin,
    bottomMargin: value('bottomMargin') ?? base.bottomMargin,
    bodyFont: value('bodyFont') ?? base.bodyFont,
    bodyAlignment: value('bodyAlignment') ?? base.bodyAlignment,
    bodyFontSize: value('bodyFontSize') ?? base.bodyFontSize,
    lineHeight: value('lineHeight') ?? base.lineHeight,
    firstLineIndent: value('firstLineIndent') ?? base.firstLineIndent,
    paragraphGap: value('paragraphGap') ?? base.paragraphGap,
    chapterTitleSize: value('chapterTitleSize') ?? base.chapterTitleSize,
    chapterTitleAlignment: value('chapterTitleAlignment') ?? base.chapterTitleAlignment,
    chapterTopSpace: value('chapterTopSpace') ?? base.chapterTopSpace,
    chapterAfterSpace: value('chapterAfterSpace') ?? base.chapterAfterSpace,
    pageNumberFontSize: value('pageNumberFontSize') ?? base.pageNumberFontSize,
    folioBottom: value('folioBottom') ?? base.folioBottom,
    folioOutsideInset: value('folioOutsideInset') ?? base.folioOutsideInset,
    pageNumbers: value('pageNumbers') ?? base.pageNumbers,
    runningHeaders: document.querySelector('#runningHeaders') ? Boolean(document.querySelector('#runningHeaders')?.checked) : base.runningHeaders,
    runningHeaderMode: value('runningHeaderMode') ?? base.runningHeaderMode,
    runningHeaderFontSize: value('runningHeaderFontSize') ?? base.runningHeaderFontSize,
    runningHeaderTop: value('runningHeaderTop') ?? base.runningHeaderTop,
    runningHeaderOutsideInset: value('runningHeaderOutsideInset') ?? base.runningHeaderOutsideInset,
    suppressHeaderOnChapterOpen: document.querySelector('#suppressHeaderOnChapterOpen') ? Boolean(document.querySelector('#suppressHeaderOnChapterOpen')?.checked) : base.suppressHeaderOnChapterOpen,
    printToc: document.querySelector('#printToc') ? Boolean(document.querySelector('#printToc')?.checked) : base.printToc,
    tocTitle: value('tocTitle') ?? base.tocTitle,
    tocIncludeBackMatter: document.querySelector('#tocIncludeBackMatter') ? Boolean(document.querySelector('#tocIncludeBackMatter')?.checked) : base.tocIncludeBackMatter,
    tocTitleSize: value('tocTitleSize') ?? base.tocTitleSize,
    tocEntryFontSize: value('tocEntryFontSize') ?? base.tocEntryFontSize,
    tocLineHeight: value('tocLineHeight') ?? base.tocLineHeight,
    tocTopSpace: value('tocTopSpace') ?? base.tocTopSpace,
    tocAfterTitleSpace: value('tocAfterTitleSpace') ?? base.tocAfterTitleSpace,
    chapterStarts: value('chapterStarts') ?? base.chapterStarts,
    templateId: 'custom',
    name: 'Custom',
    description: '',
  });
}

async function saveDesign() {
  if (!state.project) return;
  state.project.design.print = readDesignForm();
  state.project.design.template = state.project.design.print.name || 'Custom';
  state.project.updatedAt = new Date().toISOString();
  state.preview = null;
  state.spreadIndex = 0;
  state.themeMessage = 'Saved custom design. Preview invalidated so pagination can be rebuilt safely.';
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

function measureTocEntry(rig, design, title, pageNumber) {
  const wrapper = document.createElement('div');
  wrapper.style.boxSizing = 'border-box';
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'baseline';
  wrapper.style.gap = '0.08in';
  wrapper.style.fontSize = `${design.tocEntryFontSize}pt`;
  wrapper.style.lineHeight = String(design.tocLineHeight);
  wrapper.style.whiteSpace = 'normal';

  const label = document.createElement('span');
  label.textContent = title;
  label.style.flex = '0 1 auto';
  label.style.minWidth = '0';
  const leader = document.createElement('span');
  leader.style.flex = '1 1 auto';
  leader.style.minWidth = '0.16in';
  leader.style.borderBottom = '1px dotted currentColor';
  const page = document.createElement('span');
  page.textContent = String(pageNumber ?? '');
  page.style.flex = '0 0 auto';
  page.style.textAlign = 'right';
  wrapper.append(label, leader, page);
  rig.root.replaceChildren(wrapper);
  return wrapper.getBoundingClientRect().height;
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

  if (kind === 'generated-toc-title') {
    wrapper.style.paddingTop = `${design.tocTopSpace}in`;
    wrapper.style.paddingBottom = `${design.tocAfterTitleSpace}in`;
    paragraph.style.fontSize = `${design.tocTitleSize}pt`;
    paragraph.style.lineHeight = '1.15';
    paragraph.style.fontWeight = '400';
    paragraph.style.textAlign = 'center';
  } else if (kind === 'chapter-title') {
    wrapper.style.paddingTop = `${design.chapterTopSpace}in`;
    wrapper.style.paddingBottom = `${design.chapterAfterSpace}in`;
    paragraph.style.fontSize = `${design.chapterTitleSize}pt`;
    paragraph.style.lineHeight = String(design.chapterTitleLineHeight);
    paragraph.style.fontWeight = '400';
    paragraph.style.textAlign = design.chapterTitleAlignment;
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

  if (isFinalPiece && design.paragraphGap && !['chapter-title','blank','generated-toc-title','generated-toc-entry'].includes(kind)) {
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
  const effective = effectiveBlocks(project);
  const structure = analyzeMatter(effective);
  const blockIndex = new Map(effective.map((block) => [block.id, block.index]));
  for (const page of pages) {
    const generatedTocPage = (page.fragments || []).some((fragment) => fragment.kind === 'generated-toc-title' || fragment.kind === 'generated-toc-entry');
    const sourceFragments = (page.fragments || []).filter((fragment) => blockIndex.has(fragment.sourceBlockId));
    const firstIndex = sourceFragments.length ? blockIndex.get(sourceFragments[0].sourceBlockId) : null;
    page.section = generatedTocPage ? 'front' : firstIndex == null ? 'blank' : matterSectionForBlockIndex(firstIndex, structure);
    const chapter = firstIndex == null ? null : chapterForBlockIndex(firstIndex, structure);
    page.chapterTitle = chapter?.title || '';
    page.hasChapterTitle = (page.fragments || []).some((fragment) => fragment.kind === 'chapter-title');
    page.hasGeneratedToc = generatedTocPage;
    page.showRunningHeader = Boolean(
      design.runningHeaders &&
      !page.intentionalBlank &&
      page.section === 'body' &&
      !(design.suppressHeaderOnChapterOpen && page.hasChapterTitle)
    );
    page.showFolio = Boolean(!page.intentionalBlank && design.pageNumbers !== 'none' && page.bookPageNumber != null);
  }
  return structure;
}

async function paginateProjectPass(project, { tocEntries = [] } = {}) {
  const design = currentDesign();
  const blocks = effectiveBlocks(project);
  const rig = createMeasureRig(design);
  const structure = analyzeMatter(blocks);
  const pages = [];
  let current = null;
  let blankVersos = 0;
  let chapterStarts = 0;
  let chaptersOnRight = 0;
  let firstChapterPhysicalPage = null;
  let previousNonEmptyKind = null;
  let tocInserted = false;

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
      sourceBlockId: block?.id || null,
      kind,
      text,
      continuation,
      measuredHeight: height,
      previewHeight: kind === 'blank' ? height * (PREVIEW_PX_PER_INCH / CSS_PX_PER_INCH) : null,
      startOffset: meta.startOffset ?? 0,
      endOffset: meta.endOffset ?? text.length,
      isFinalPiece: meta.isFinalPiece !== false,
      suppressIndent: Boolean(meta.suppressIndent),
      generated: Boolean(meta.generated),
      tocTitle: meta.tocTitle || null,
      tocPageNumber: meta.tocPageNumber ?? null,
      tocTargetId: meta.tocTargetId || null,
    });
    current.usedPx += height;
  };

  const placeGeneratedToc = () => {
    if (!tocEntries.length || tocInserted) return;
    if (!current) newPage();
    else if (current.fragments.length || current.intentionalBlank) newPage();
    const titleBlock = { id: null };
    const titleHeight = measureFragment(rig, design, 'generated-toc-title', design.tocTitle, false, true, true);
    addFragment(titleBlock, design.tocTitle, 'generated-toc-title', false, titleHeight, { generated: true, suppressIndent: true });
    for (const entry of tocEntries) {
      const height = measureTocEntry(rig, design, entry.title, entry.bookPageNumber);
      if (height > remaining() && current.fragments.length) newPage();
      addFragment(null, entry.title, 'generated-toc-entry', false, height, {
        generated: true,
        suppressIndent: true,
        tocTitle: entry.title,
        tocPageNumber: entry.bookPageNumber,
        tocTargetId: entry.id,
      });
    }
    tocInserted = true;
  };

  const placeTextBlock = (block) => {
    const kind = block.kind;
    const text = block.text;
    const suppressIndent = kind === 'chapter-opening' || previousNonEmptyKind === 'scene-break' || previousNonEmptyKind === 'chapter-title';
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
    for (let i = 0; i < blocks.length; i += 1) {
      const block = blocks[i];
      if (tocEntries.length && !tocInserted && structure.firstChapterIndex === i) placeGeneratedToc();
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
    generatedToc: { enabled: tocEntries.length > 0, entries: tocEntries.map((entry) => ({ ...entry })) },
  };
}

async function paginateProject(project) {
  const design = currentDesign();
  const lock = await verifyProjectStoryLock(project);
  if (!lock.ok) throw new Error('Story Lock failed. Print pagination was blocked.');

  const tocMode = shouldGeneratePrintToc(project, design);
  let preview = await paginateProjectPass(project);
  if (!tocMode.generate) {
    preview.generatedToc = { enabled: false, entries: [], reason: tocMode.reason, sourceToc: tocMode.sourceToc };
    return preview;
  }

  let entries = buildPrintTocEntries({ project, pages: preview.pages, design });
  preview = await paginateProjectPass(project, { tocEntries: entries });

  // Front matter can change physical parity, so verify the generated page map against the final pass.
  // Printed numbering begins at Chapter 1, which normally makes this stable in two passes; a third pass is allowed if needed.
  let finalEntries = buildPrintTocEntries({ project, pages: preview.pages, design });
  if (printTocSignature(finalEntries) !== printTocSignature(entries)) {
    entries = finalEntries;
    preview = await paginateProjectPass(project, { tocEntries: entries });
    finalEntries = buildPrintTocEntries({ project, pages: preview.pages, design });
  }
  preview.generatedToc = {
    enabled: true,
    entries: entries.map((entry) => ({ ...entry })),
    verified: printTocSignature(finalEntries) === printTocSignature(entries),
    reason: 'generated',
    sourceToc: tocMode.sourceToc,
  };
  const tocIntegrity = verifyGeneratedPrintToc({ project, preview, design });
  if (!tocIntegrity.ok) throw new Error('Automatic Table of Contents could not converge on final printed page numbers. Preview was blocked rather than exporting stale page numbers.');
  return preview;
}

async function buildPreview() {
  if (!state.project) return;
  if (effectiveStats(state.project).chapters === 0) {
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
  try { state.customThemes = loadCustomThemes(); } catch (error) { console.warn('Theme library unavailable', error); }
  try { state.projects = await listProjects(); } catch (error) { console.warn('Project library unavailable', error); }
  renderShell();
}

init();
