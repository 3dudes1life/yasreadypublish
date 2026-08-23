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
  tocNeedsLeadingBlank,
  needsTerminalBlankPage,
  validatePrintDesign,
} from './lib/print-model.js';
import { analyzeMatter, chapterForBlockIndex, matterSectionForBlockIndex, runningHeaderText } from './lib/structure-model.js';
import { adjacentChapter, buildPreviewNavigation, currentNavigationEntry, spreadIndexForPhysicalPage, spreadPageNumbers } from './lib/navigator-model.js';
import { deleteCustomTheme, loadCustomThemes, parseThemeJson, saveCustomTheme, serializeTheme } from './lib/theme-store.js';
import { runKdpPreflight } from './lib/preflight-model.js';
import { buildPrintMasterHtml } from './lib/print-export.js';
import { normalizeEbookDesign } from './lib/ebook-model.js';
import { runEpubPreflight } from './lib/ebook-preflight.js';
import { buildEbookPreviewHtml, buildEpubBlob, buildDevicePreviewHtml } from './lib/epub-export.js';
import { effectiveBlocks, effectiveChapters, effectiveStats, setStructureOverride, structureOverrideSummary, STRUCTURE_OVERRIDE_KINDS } from './lib/structure-overrides.js';
import { buildPrintTocEntries, printTocSignature, shouldGeneratePrintToc, verifyGeneratedPrintToc } from './lib/print-toc.js';
import { serializeProjectBackup, parseProjectBackup } from './lib/project-backup.js';
import { buildPublishReadiness } from './lib/readiness-model.js';
import { blankRenderMode } from './lib/spacing-policy.js';
import { stampPreviewProof } from './lib/proof-integrity.js';
import {
  activePrintEdition, copyPaperbackDesignToHardcover, editionLabel, ensureEditions,
  getEbookEditionDesign, getPrintEditionDesign, setActivePrintEdition, setEditionEnabled,
  setEbookEditionDesign, setPrintEditionDesign, invalidateAllEditionProofs, invalidateEditionProof,
  getEbookCover, setEbookCover, clearEbookCover,
} from './lib/editions.js';
import {
  clearBlockPresentationOverride, countPresentationOverrides, ensurePresentationOverrides,
  getBlockPresentationOverride, setBlockPresentationOverride,
} from './lib/presentation-overrides.js';
import {
  KINDLE_DEVICE_PRESETS, KINDLE_FONT_FACES, KINDLE_FONT_SCALES, KINDLE_APPEARANCES,
  normalizeKindlePreview, kindlePreviewTokens,
} from './lib/kindle-preview-model.js';
import { scanKindleQuality, kindleTorturePresets } from './lib/kindle-quality.js';
import { EBOOK_SEMANTIC_LABELS, semanticRoleCounts, semanticRoleForBlock } from './lib/semantic-styles.js';
import { applyKindleIntelligenceFix, compareKindleChapters, scanKindleIntelligence } from './lib/kindle-intelligence.js';
import {
  buildKindleProductionFlow, clearKindleReviewDecision, ensureKindleReviewState,
  kindleReviewDecision, markKindleReviewIntentional,
} from './lib/kindle-production-flow.js';
import {
  EBOOK_THEME_FAMILIES, EBOOK_THEME_STUDIO_LABELS, EBOOK_THEME_STUDIO_ROLES,
  applyEbookThemeFamily, calculateBookDNA, ebookStyleUsage, inferSourceStyleRole,
  normalizeEbookThemeStudio, setChapterHeadingOverride, sourceStyleRecords,
} from './lib/ebook-theme-studio.js';
import {
  applySafeFixBatch, auditKindleAccessibility, buildKindleReleaseGate, freezeKindleRelease,
  kindleReleaseReport, markAllCurrentReviewsIntentional, markKindleVisualProofComplete,
} from './lib/kindle-release-gate.js';

const VERSION = '1.0.16';
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
  finalCheck: null,
  backupMessage: '',
  printEdition: 'paperback',
  editionMessage: '',
  selectedEbookBlockId: '',
  inspectorMessage: '',
  devicePreviewMessage: '',
  ebookFrameScrollY: 0,
  kindlePreview: normalizeKindlePreview(),
  ebookUndoStack: [],
  ebookRedoStack: [],
  ebookHistoryArmed: false,
  kindleQaMatrix: false,
  kindleQualityCache: null,
  kindleQualityKey: '',
  kindleIntelligenceCache: null,
  kindleIntelligenceKey: '',
  compareChapterA: 0,
  compareChapterB: 1,
  kindleIntelligenceMessage: '',
  ebookNavigatorSearch: '',
  polishQueueIndex: 0,
  kindleFocusPreview: false,
  themeUsageRole: 'text-message',
  themeSelectedChapterBlockId: '',
  themeStudioMessage: '',
  releaseGateMessage: '',
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

function currentPrintEditionType() {
  if (!state.project) return state.printEdition || 'paperback';
  ensureEditions(state.project);
  const preferred = state.printEdition || state.project.editions.activePrint || 'paperback';
  if (state.project.editions[preferred]?.enabled) return preferred;
  return state.project.editions.paperback?.enabled ? 'paperback' : state.project.editions.hardcover?.enabled ? 'hardcover' : preferred;
}

function currentDesign() {
  if (!state.project) return normalizePrintDesign({});
  const type = currentPrintEditionType();
  return getPrintEditionDesign(state.project, type);
}

function saveCurrentPrintDesign(design) {
  const type = currentPrintEditionType();
  setPrintEditionDesign(state.project, type, design);
  state.project.editions.activePrint = type;
  state.project.design.template = design.name || 'Custom';
}

function currentEbookDesign() {
  return state.project ? getEbookEditionDesign(state.project) : normalizeEbookDesign({});
}

function ebookHistorySnapshot() {
  if (!state.project) return null;
  ensurePresentationOverrides(state.project);
  return JSON.stringify({
    design: getEbookEditionDesign(state.project),
    overrides: state.project.presentationOverrides?.ebook || {},
  });
}

function armEbookHistory() {
  if (!state.project || state.ebookHistoryArmed) return;
  const snapshot = ebookHistorySnapshot();
  if (!snapshot) return;
  state.ebookUndoStack.push(snapshot);
  if (state.ebookUndoStack.length > 40) state.ebookUndoStack.shift();
  state.ebookRedoStack = [];
  state.ebookHistoryArmed = true;
}

function disarmEbookHistory() { state.ebookHistoryArmed = false; }

async function restoreEbookHistory(snapshot, targetStack) {
  if (!state.project || !snapshot) return;
  const current = ebookHistorySnapshot();
  if (current) targetStack.push(current);
  const parsed = JSON.parse(snapshot);
  setEbookEditionDesign(state.project, parsed.design || {});
  ensurePresentationOverrides(state.project);
  state.project.presentationOverrides.ebook = parsed.overrides || {};
  invalidateEditionProof(state.project, 'ebook', { clearPageCount: false });
  state.project.updatedAt = new Date().toISOString();
  state.finalCheck = null;
  state.inspectorMessage = 'Kindle formatting history restored. Story wording was not changed.';
  await saveProject(state.project);
  state.projects = await listProjects();
  disarmEbookHistory();
  updateMain();
}

async function undoEbookFormatting() {
  const snapshot = state.ebookUndoStack.pop();
  if (!snapshot) return;
  await restoreEbookHistory(snapshot, state.ebookRedoStack);
}

async function redoEbookFormatting() {
  const snapshot = state.ebookRedoStack.pop();
  if (!snapshot) return;
  await restoreEbookHistory(snapshot, state.ebookUndoStack);
}

function rerenderMainPreservingScroll() {
  const y = window.scrollY;
  updateMain();
  requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'auto' }));
}

function renderShell() {
  app.innerHTML = `
    <header class="topbar">
      <div class="topbar-inner">
        <div class="brand"><span class="brand-mark">Y</span><span>YasReady <span class="brand-product">Publish</span></span></div>
        <span class="version">PRIVATE · v${VERSION} STABLE</span>
      </div>
    </header>
    <main class="app-shell">
      <section class="hero compact-hero">
        <div>
          <div class="eyebrow">Private publishing studio</div>
          <h1>Publish beautifully.<br>Protect every word.</h1>
          <p>YasReady Publish turns one finished DOCX into whichever editions you choose—paperback, hardcover, ebook, or any combination—while Story Lock keeps the manuscript itself immutable.</p>
        </div>
        <div class="story-lock-pill"><span class="dot"></span> Story Lock is mandatory</div>
      </section>
      <div class="workspace">
        ${renderSidebar()}
        <section class="main" id="mainView">${renderMain()}</section>
      </div>
      <div class="footer-note">YasReady Publish v${VERSION} · Private local-first publishing · Story Lock verifies source integrity before production export.</div>
    </main>`;
  bindEvents();
}

function renderSidebar() {
  const hasProject = Boolean(state.project);
  if (hasProject) ensureEditions(state.project);
  const hasPrintEdition = hasProject && (state.project.editions.paperback.enabled || state.project.editions.hardcover.enabled);
  return `
    <aside class="sidebar">
      <div class="sidebar-head"><strong>${hasProject ? escapeHtml(state.project.title) : 'Publish workspace'}</strong><span>${hasProject ? 'Follow the path from manuscript → proof → export. Advanced tools stay available without cluttering the core workflow.' : 'Start with one finished DOCX. Publish handles structure and presentation; Story Lock protects the words.'}</span></div>
      <nav class="sidebar-nav">
        <div class="nav-group-label">Book</div>
        ${navButton('import', '⌂', hasProject ? 'Project Home' : 'Import')}
        ${navButton('chapters', '☷', 'Contents', !hasProject)}
        ${navButton('matter', '§', 'Book Matter', !hasProject)}
        ${navButton('repair', '⚙', 'Structure Repair', !hasProject)}
        ${navButton('editions', '◫', 'Editions', !hasProject)}
        <div class="nav-group-label">${hasProject ? (hasPrintEdition ? escapeHtml(editionLabel(currentPrintEditionType())) : 'Print disabled') : 'Print edition'}</div>
        ${navButton('design', 'Aa', 'Design', !hasProject || !hasPrintEdition)}
        ${navButton('print', '▣', 'Print Preview', !hasProject || !hasPrintEdition)}
        ${navButton('export', '⇩', 'Print Export', !hasProject || !hasPrintEdition)}
        <div class="nav-group-label">Digital</div>
        ${navButton('ebook', 'e', 'Ebook / Kindle', !hasProject || (hasProject && !state.project.editions?.ebook?.enabled))}
        <div class="nav-group-label">Inspect</div>
        ${navButton('navigator', '⌘', 'Navigator', !hasProject)}
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
  if (state.activeView === 'editions') return renderEditions();
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
      <div class="panel-head"><div><div class="eyebrow">1.0.5 production foundation</div><h2>One finished manuscript. Choose your editions.</h2><p>Import once, then enable paperback, hardcover, ebook, or any combination. Each edition gets its own presentation rules while Story Lock remains one source of truth.</p></div></div>
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
  const stats = effectiveStats(p);
  const design = currentDesign();
  const readiness = buildPublishReadiness({ project: p, preview: state.preview, storyLockOk: p.storyLock?.status === 'verified' });
  const completed = readiness.steps.filter((step) => step.status === 'complete').length;
  const percent = Math.round((completed / readiness.steps.length) * 100);
  const final = state.finalCheck;
  ensureEditions(p);
  const hasPrintEdition = p.editions.paperback.enabled || p.editions.hardcover.enabled;
  const nextView = hasPrintEdition ? (state.preview ? 'export' : 'design') : p.editions.ebook.enabled ? 'ebook' : 'editions';
  const nextTitle = hasPrintEdition ? (state.preview ? 'Go to Print Export' : `Continue to ${editionLabel(currentPrintEditionType())} Design`) : p.editions.ebook.enabled ? 'Continue to Ebook / Kindle' : 'Choose an Edition';
  const nextDetail = hasPrintEdition ? (state.preview ? 'Review print preflight and create the fixed-page master' : 'Choose the series template and page geometry') : p.editions.ebook.enabled ? 'Review reflowable settings and EPUB preflight' : 'Enable paperback, hardcover, or ebook';
  const statusIcon = (status) => status === 'complete' ? '✓' : status === 'blocked' ? '!' : '→';
  const statusLabel = (status) => status === 'complete' ? 'Ready' : status === 'blocked' ? 'Needs attention' : 'Next';
  return `
    <article class="panel project-home-panel">
      <div class="project-home-head">
        <div><span class="badge good">Story Lock ${p.storyLock?.status === 'verified' ? 'VERIFIED' : 'CHECK'}</span><h2>${escapeHtml(p.title)}</h2><p>${escapeHtml(p.source.fileName)} · ${formatBytes(p.source.fileSize)} · ${formatNumber(stats.words)} words</p></div>
        <div class="readiness-dial" aria-label="Publishing workflow ${percent}% complete"><b>${percent}%</b><span>workflow</span></div>
      </div>
      <div class="publish-path" aria-label="Publishing workflow">
        ${readiness.steps.map((step, index) => `<button class="publish-step ${step.status}" data-go-view="${step.view}" type="button"><span class="step-index">${statusIcon(step.status)}</span><div><strong>${escapeHtml(step.label)}</strong><small>${escapeHtml(step.detail)}</small></div><em>${statusLabel(step.status)}</em></button>${index < readiness.steps.length - 1 ? '<i></i>' : ''}`).join('')}
      </div>
      <div class="lock-card compact-lock-card">
        <div class="lock-shield">◆</div>
        <div><strong>Exact-story protection is active</strong><p>The canonical manuscript hash is checked before pagination, every enabled edition export, project backup restore, and Final Check.</p></div>
        <div class="lock-hash">SHA-256<br>${escapeHtml(shortHash(p.source.manuscriptHash, 18))}</div>
      </div>
      <div class="project-meta-grid">
        <label><span>Book title metadata</span><input id="projectTitle" value="${escapeHtml(p.title)}" aria-label="Book title"></label>
        <label><span>Author metadata</span><input id="projectAuthor" value="${escapeHtml(p.author || '')}" placeholder="Author / imprint name" aria-label="Author"></label>
        <div class="project-meta-actions"><button class="btn secondary" id="saveMetadata" type="button">Save metadata</button><button class="btn secondary" id="verifyLock" type="button">Verify Story Lock</button></div>
      </div>
      <div class="summary-grid">
        <div class="stat"><b>${formatNumber(stats.chapters)}</b><span>Chapters</span></div>
        <div class="stat"><b>${formatNumber(stats.words)}</b><span>Words</span></div>
        <div class="stat"><b>${state.preview?.pages?.length ? formatNumber(state.preview.pages.length) : '—'}</b><span>Print pages</span></div>
        <div class="stat"><b>${design.trimWidth}×${design.trimHeight}</b><span>Trim inches</span></div>
        <div class="stat"><b>${design.insideMargin.toFixed(2)}”</b><span>Inside margin</span></div>
      </div>
      ${stats.chapters === 0 ? `<div class="notice error"><strong>No chapter titles were auto-detected.</strong> Publish will not guess where chapters begin. Use Structure Repair or Source before pagination.</div>` : ''}
      ${state.backupMessage ? `<div class="notice success">${escapeHtml(state.backupMessage)}</div>` : ''}
      ${final ? `<div class="final-check-banner ${final.allReady ? 'ready' : 'attention'}"><div class="final-check-mark">${final.allReady ? '✓' : '!'}</div><div><strong>${final.allReady ? 'Superman Ready' : 'Final Check found work to do'}</strong><p>${final.allReady ? 'Story Lock and every enabled edition passed in the same final verification run.' : `${final.printErrors || 0} print blocker(s) · ${final.ebookErrors || 0} ebook blocker(s). Nothing was exported or altered.`}</p></div><button class="btn secondary" id="runFinalCheckAgain" type="button">Run again</button></div>` : ''}
      <div class="primary-actions">
        <button class="btn primary big-action" id="runFinalCheck" type="button"><span>⚡</span><div><strong>Run Final Check</strong><small>Verify Story Lock + all enabled editions</small></div></button>
        <button class="btn secondary big-action" data-go-view="${nextView}" type="button"><span>${hasPrintEdition ? (state.preview ? '⇩' : 'Aa') : p.editions.ebook.enabled ? 'e' : '◫'}</span><div><strong>${escapeHtml(nextTitle)}</strong><small>${escapeHtml(nextDetail)}</small></div></button>
      </div>
    </article>
    <article class="panel safety-backup-panel">
      <div class="panel-head"><div><div class="eyebrow">Recovery</div><h2>Your work should never depend on one browser.</h2><p>Projects autosave locally. A private backup gives you a second copy of structure, design, and the exact Story-Locked manuscript map.</p></div><button class="btn secondary" id="newImport" type="button">Import another DOCX</button></div>
      <div class="backup-actions"><button class="btn secondary" id="backupProject" type="button">Download Project Backup</button><button class="btn secondary" id="restoreBackupButton" type="button">Restore Project Backup</button><input id="restoreBackupInput" type="file" accept=".json,.yasready-project.json,application/json" hidden></div>
      <div class="notice info"><strong>Privacy note:</strong> a project backup contains the manuscript text because it is a true recovery file. It is downloaded only when you choose and is verified by Story Lock before restore.</div>
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
          <div class="eyebrow">Page geometry</div><h3>${escapeHtml(editionLabel(currentPrintEditionType()))}</h3>
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
            ${designNumberField('paragraphGap', 'Uniform paragraph spacing', d.paragraphGap, '0.01', '0', '0.75')}
            <label class="design-field"><span>Blank paragraph handling</span><select id="bodyBlankPolicy"><option value="normalize" ${d.bodyBlankPolicy === 'normalize' ? 'selected' : ''}>Normalize each blank run to one spacer</option><option value="preserve" ${d.bodyBlankPolicy === 'preserve' ? 'selected' : ''}>Preserve every source blank line</option><option value="collapse" ${d.bodyBlankPolicy === 'collapse' ? 'selected' : ''}>Collapse all body blank lines</option></select><small>Tres Amigos defaults to collapsing source blank lines and applying one uniform paragraph rhythm to every story paragraph from Chapter 1 through the final chapter.</small></label>${designNumberField('bodyBlankSpace', 'Normalized blank space', d.bodyBlankSpace, '0.01', '0', '0.5')}
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
      <div class="notice success preview-note"><strong>Print production path:</strong> this page map feeds KDP Preflight and the fixed single-page print master. Generated TOC numbers are verified against this final page map; intentional blank versos suppress both running headers and folios.${preview.normalizedBodyBlankRuns ? ` <strong>${formatNumber(preview.normalizedBodyBlankRuns)} source blank run${preview.normalizedBodyBlankRuns === 1 ? '' : 's'} normalized to one spacer</strong>` : ''}${preview.collapsedBodyBlanks ? ` and ${formatNumber(preview.collapsedBodyBlanks)} extra blank paragraph${preview.collapsedBodyBlanks === 1 ? '' : 's'} visually collapsed` : ''}. Story Lock text remains unchanged.</div>
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

  const blankReasonText = page.blankReason === 'terminal-even'
    ? 'Terminal blank keeps the physical interior even so KDP does not add an untracked page.'
    : page.blankReason === 'toc-left-spread'
      ? 'Front-matter alignment keeps the generated Contents opening on the left side of a spread.'
      : 'Kept blank so the next chapter opens on the right.';
  const fragments = page.intentionalBlank
    ? `<div class="intentional-blank">Intentional blank page<br><small>${escapeHtml(blankReasonText)}</small></div>`
    : page.fragments.map((fragment) => {
      if (fragment.kind === 'blank') return `<div class="print-fragment blank-space" style="height:${(fragment.previewHeight ?? 6) * (px / PREVIEW_PX_PER_INCH)}px"></div>`;
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
      const gapKinds = new Set(['body','chapter-opening','text-message']);
      const gap = fragment.isFinalPiece && design.paragraphGap && gapKinds.has(fragment.kind)
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
  return runKdpPreflight({ project: state.project, preview: state.preview, storyLockOk, editionType: currentPrintEditionType() });
}

function renderPreflightCheck(item) {
  const icon = item.status === 'pass' ? '✓' : item.status === 'warning' ? '!' : '×';
  return `<div class="preflight-row ${item.status}"><div class="preflight-icon">${icon}</div><div><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(item.message)}</p></div><span>${item.status.toUpperCase()}</span></div>`;
}

function renderExport() {
  if (!state.preview) {
    return `
      <article class="panel">
        <div class="panel-head"><div><span class="badge good">Story Lock required</span><h2>${escapeHtml(editionLabel(currentPrintEditionType()))} export</h2><p>YasReady needs one frozen pagination pass before it can validate this physical edition.</p></div></div>
        <div class="preview-empty">
          <div class="spread-icon"><span></span><span></span></div>
          <h3>Build your proof first</h3>
          <p>We’ll calculate the final page count, binding margin requirement, chapter parity, blank versos, generated Contents page numbers, and production geometry.</p>
          <button class="btn primary" id="buildPreviewForExport" type="button">Build Print Preview</button>
        </div>
      </article>`;
  }

  const report = currentPreflight(state.project?.storyLock?.status === 'verified');
  const readyClass = report.ready ? 'ready' : 'blocked';
  return `
    <article class="panel export-panel">
      <div class="panel-head"><div><span class="badge ${report.ready ? 'good' : 'bad'}">${report.ready ? `${editionLabel(currentPrintEditionType()).toUpperCase()} READY` : 'EXPORT BLOCKED'}</span><h2>${escapeHtml(editionLabel(currentPrintEditionType()))} export</h2><p>${report.pageCount} single pages · ${report.design.trimWidth} × ${report.design.trimHeight} in · no-bleed text interior</p></div><button class="btn secondary" id="buildPreviewForExport" type="button">Rebuild proof</button></div>
      <div class="preflight-hero ${readyClass}">
        <div class="preflight-ring"><b>${report.summary.passes}</b><span>passes</span></div>
        <div><h3>${report.ready ? 'The physical-book gate passed.' : `${report.summary.errors} blocking issue${report.summary.errors === 1 ? '' : 's'} found.`}</h3><p>${report.ready ? `Create ${editionLabel(currentPrintEditionType())} PDF opens a final fixed-page master, checks every page for overflow after fonts load, then opens the system print dialog for Save as PDF.` : 'Fix the blocking checks below and rebuild the proof. YasReady will not export around a failed gate.'}</p></div>
        <div class="preflight-counts"><span class="pass">${report.summary.passes} pass</span><span class="warning">${report.summary.warnings} warning</span><span class="error">${report.summary.errors} error</span></div>
      </div>
      <div class="export-primary-card ${report.ready ? 'ready' : 'blocked'}">
        <div><div class="eyebrow">Final ${escapeHtml(editionLabel(currentPrintEditionType()).toLowerCase())} file</div><h3>${report.ready ? 'Create the PDF you upload to KDP' : 'PDF creation is locked until preflight passes'}</h3><p>Page numbers, running headers, generated Contents, right-hand chapter starts, blank versos, mirrored margins, and Story-Locked text are all baked into the fixed-page master.</p></div>
        <button class="btn primary export-main-button" id="createPaperbackPdf" type="button" ${report.ready ? '' : 'disabled'}>Create ${escapeHtml(editionLabel(currentPrintEditionType()))} PDF</button>
      </div>
      <div class="preflight-list">${report.checks.map(renderPreflightCheck).join('')}</div>
      <div class="export-actions">
        <button class="btn secondary" id="openPrintMaster" type="button" ${report.ready ? '' : 'disabled'}>Open Print Master</button>
        <button class="btn secondary" id="downloadPrintMaster" type="button" ${report.ready ? '' : 'disabled'}>Download HTML Master</button>
        <button class="btn secondary" id="downloadPreflightReport" type="button">Download Preflight Report</button>
        <button class="btn secondary" id="runFinalCheck" type="button">Run Final Check</button>
      </div>
      <div class="notice info"><strong>Mac / Chrome PDF settings:</strong> choose <strong>Save as PDF</strong>, keep scale at <strong>100%</strong>, paper size at the book trim size, and browser headers/footers off. YasReady’s final master performs an overflow check before the print dialog is allowed to open.</div>
    </article>`;
}

function ebookSelectedBlock(project) {
  const id = state.selectedEbookBlockId;
  if (!id) return null;
  return project?.manuscript?.blocks?.find((block) => block.id === id) || null;
}

function ebookInspectorDefaults(block, design, override) {
  const kind = block?.kind || 'body';
  const base = {
    spaceBefore: '',
    spaceAfter: kind === 'chapter-title' ? design.chapterAfterEm : kind === 'scene-break' ? design.sceneBreakSpaceEm : design.paragraphGapEm,
    firstLineIndent: ['body'].includes(kind) ? design.firstLineIndentEm : 0,
    alignment: kind === 'chapter-title' ? design.chapterTitleAlignment : 'inherit',
    suppressIndent: kind === 'chapter-opening' || kind === 'text-message' || kind === 'scene-break',
    semanticRole: override?.semanticRole || 'auto',
  };
  return { ...base, ...(override || {}) };
}

function renderEbookInspector(project, design) {
  ensurePresentationOverrides(project);
  const count = countPresentationOverrides(project, 'ebook');
  const undoDisabled = state.ebookUndoStack.length ? '' : 'disabled';
  const redoDisabled = state.ebookRedoStack.length ? '' : 'disabled';
  const history = `<div class="inspector-history"><button class="btn ghost" id="undoEbookFormatting" type="button" ${undoDisabled}>↶ Undo</button><button class="btn ghost" id="redoEbookFormatting" type="button" ${redoDisabled}>↷ Redo</button></div>`;
  if (state.kindlePreview.mode !== 'adjust') {
    return `<aside class="ebook-format-inspector read-mode">
      <div class="inspector-head"><div><div class="eyebrow">Format Inspector</div><h3>Read Mode</h3></div><span class="mini-status good">Story Lock safe</span></div>
      ${history}
      <div class="inspector-empty-icon">Aa</div>
      <strong>Read first. Adjust only when needed.</strong>
      <p>The preview behaves like a normal reader here. Switch to <strong>Adjust Layout</strong> only when you find a spacing or alignment issue.</p>
      <button class="btn primary inspector-mode-button" type="button" data-kindle-mode="adjust">Adjust Layout</button>
      ${count ? `<button class="btn secondary inspector-reset-all" id="resetAllEbookOverrides" type="button">Reset ${count} custom fix${count === 1 ? '' : 'es'}</button>` : ''}
      <div class="inspector-safety">🔒 No text-editing controls exist in Preview Studio.</div>
    </aside>`;
  }
  const block = ebookSelectedBlock(project);
  if (!block) {
    return `<aside class="ebook-format-inspector empty">
      <div class="inspector-head"><div><div class="eyebrow">Format Inspector</div><h3>Select a block</h3></div><span class="mini-status good">Story Lock safe</span></div>
      ${history}
      <div class="inspector-empty-icon">↖</div>
      <strong>Click a paragraph or heading</strong>
      <p>The selected block will highlight in the live preview and its presentation controls will appear here. The words remain read-only.</p>
      <div class="inspector-safety">🔒 ${count} custom Kindle override${count === 1 ? '' : 's'} · manuscript text remains locked</div>
    </aside>`;
  }
  const override = getBlockPresentationOverride(project, 'ebook', block.id);
  const values = ebookInspectorDefaults(block, design, override);
  const snippet = block.text?.trim() || (block.mediaRefs?.length ? '[embedded image]' : '[blank source paragraph]');
  const isBodyLike = ['body','chapter-opening','text-message','heading'].includes(block.kind);
  const canSemantic = ['body','chapter-opening','text-message','scene-break','heading'].includes(block.kind) && !block.mediaRefs?.length;
  const autoRole = semanticRoleForBlock(project, block, 'chapter');
  const semanticOptions = Object.entries(EBOOK_SEMANTIC_LABELS).map(([role,label]) => `<option value="${role}" ${values.semanticRole === role ? 'selected' : ''}>${role === 'auto' ? `${label} (${autoRole})` : label}</option>`).join('');
  const themeBefore = block.kind === 'chapter-title' ? design.chapterTopEm : 0;
  const themeAfter = block.kind === 'chapter-title' ? design.chapterAfterEm : block.kind === 'scene-break' ? design.sceneBreakSpaceEm : design.paragraphGapEm;
  const themeIndent = block.kind === 'body' ? design.firstLineIndentEm : 0;
  return `<aside class="ebook-format-inspector selected">
    <div class="inspector-head"><div><div class="eyebrow">Format Inspector</div><h3>${override ? 'Custom formatting' : 'Theme formatting'}</h3></div><span class="mini-status ${override ? 'needs' : 'good'}">${override ? 'Modified' : 'Theme'}</span></div>
    ${history}
    ${state.inspectorMessage ? `<div class="inspector-message">${escapeHtml(state.inspectorMessage)}</div>` : ''}
    <div class="inspector-selected"><small>${escapeHtml(block.kind)} · ${escapeHtml(block.id)}</small><p>${escapeHtml(snippet.slice(0, 220))}${snippet.length > 220 ? '…' : ''}</p></div>
    <div class="inspector-autosave" id="ebookInspectorSaveState">Changes preview live · saved automatically</div>
    <div class="inspector-theme-delta"><span>Theme baseline</span><strong>Before ${themeBefore}em · After ${themeAfter}em${isBodyLike ? ` · Indent ${themeIndent}em` : ''}</strong></div>
    <div class="inspector-quick-rhythm"><span>Quick polish</span><div><button type="button" data-inspector-preset="tighter">Tighter</button><button type="button" data-inspector-preset="theme">Theme</button><button type="button" data-inspector-preset="airier">Airier</button></div><small>Fast visual rhythm presets. Fine controls stay below.</small></div>
    ${canSemantic ? `<label class="inspector-semantic-role"><span>Content style</span><select class="ebook-live-control" id="ebookOverrideSemanticRole">${semanticOptions}</select><small>Semantic presentation only. Source wording stays locked.</small></label>` : ''}
    <div class="inspector-grid inspector-grid-v110">
      <label><span>Space before</span><div><input class="ebook-live-control" id="ebookOverrideBefore" type="number" min="0" max="6" step="0.05" value="${values.spaceBefore === '' ? '' : values.spaceBefore}"><em>em</em></div></label>
      <label><span>Space after</span><div><input class="ebook-live-control" id="ebookOverrideAfter" type="number" min="0" max="6" step="0.05" value="${values.spaceAfter === '' ? '' : values.spaceAfter}"><em>em</em></div></label>
      ${isBodyLike ? `<label><span>First-line indent</span><div><input class="ebook-live-control" id="ebookOverrideIndent" type="number" min="0" max="4" step="0.05" value="${values.firstLineIndent}"><em>em</em></div></label>` : ''}
      <label><span>Alignment</span><select class="ebook-live-control" id="ebookOverrideAlignment"><option value="inherit" ${values.alignment === 'inherit' ? 'selected' : ''}>Theme / reader</option><option value="left" ${values.alignment === 'left' ? 'selected' : ''}>Left</option><option value="center" ${values.alignment === 'center' ? 'selected' : ''}>Center</option><option value="right" ${values.alignment === 'right' ? 'selected' : ''}>Right</option><option value="justify" ${values.alignment === 'justify' ? 'selected' : ''}>Justify</option></select></label>
    </div>
    ${isBodyLike ? `<label class="inspector-check"><input class="ebook-live-control" id="ebookOverrideSuppressIndent" type="checkbox" ${values.suppressIndent ? 'checked' : ''}><span><strong>Suppress first-line indent</strong><small>Presentation only; words stay locked.</small></span></label>` : ''}
    <div class="inspector-actions"><button class="btn secondary" id="resetEbookBlockOverride" type="button" ${override ? '' : 'disabled'}>Reset this block</button>${(['body','chapter-opening','chapter-title'].includes(block.kind)) ? `<button class="btn secondary" id="applyEbookOverrideAsDefault" type="button">${block.kind === 'chapter-title' ? 'Use for all chapter titles' : 'Use as body default'}</button>` : '<span></span>'}</div>
    ${count ? `<button class="btn ghost inspector-reset-all" id="resetAllEbookOverrides" type="button">Reset all Kindle format fixes</button>` : ''}
    <div class="inspector-safety">🔒 Formatting metadata only. No manuscript text can be edited here.</div>
  </aside>`;
}


function kindleSegmentButton(key, value, label, current) {
  return `<button type="button" data-kindle-pref-key="${escapeHtml(key)}" data-kindle-pref-value="${escapeHtml(value)}" class="${String(current) === String(value) ? 'active' : ''}">${escapeHtml(label)}</button>`;
}

function renderKindlePreviewToolbar(prefsInput, preview) {
  const prefs = normalizeKindlePreview(prefsInput);
  const flow = currentKindleProductionFlow();
  const unresolved = flow?.unresolved?.length || 0;
  const undoDisabled = state.ebookUndoStack.length ? '' : 'disabled';
  const redoDisabled = state.ebookRedoStack.length ? '' : 'disabled';
  return `<div class="kindle-toolbar-stack-v114">
    <div class="kindle-workflow-bar-v114">
      <div class="kindle-workflow-nav">
        <button class="btn small secondary" id="prevEbookSection" type="button" ${preview?.index <= 0 ? 'disabled' : ''}>← Previous</button>
        <button class="btn small secondary" id="nextEbookSection" type="button" ${preview?.index >= (preview?.sections?.length || 1) - 1 ? 'disabled' : ''}>Next →</button>
      </div>
      <div class="kindle-workflow-tools">
        <button type="button" data-kindle-command="next-issue" ${unresolved ? '' : 'disabled'}>Next issue${unresolved ? ` · ${unresolved}` : ''}</button>
        <button type="button" data-kindle-command="undo" ${undoDisabled}>↶ Undo</button>
        <button type="button" data-kindle-command="redo" ${redoDisabled}>↷ Redo</button>
        <button type="button" data-kindle-command="focus-preview">${state.kindleFocusPreview ? 'Show workbench' : 'Focus preview'}</button>
      </div>
      <div class="kindle-workflow-hints"><kbd>⌘K</kbd><span>Jump</span><kbd>E</kbd><span>Read/Edit</span><kbd>⌥← →</kbd><span>Navigate</span></div>
    </div>
    <div class="kindle-preview-toolbar-v110 kindle-preview-toolbar-v111 kindle-reader-controls-v114">
      <div class="kindle-toolbar-group mode"><span>Work mode</span><div class="kindle-segment">${kindleSegmentButton('mode','read','Read',prefs.mode)}${kindleSegmentButton('mode','adjust','Adjust',prefs.mode)}</div></div>
      <div class="kindle-toolbar-group"><span>Device</span><div class="kindle-segment">${kindleSegmentButton('device','ereader','Kindle',prefs.device)}${kindleSegmentButton('device','phone','Phone',prefs.device)}${kindleSegmentButton('device','tablet','Tablet',prefs.device)}</div></div>
      <div class="kindle-toolbar-group"><span>Text size</span><div class="kindle-segment compact">${kindleSegmentButton('fontScale','s','Small',prefs.fontScale)}${kindleSegmentButton('fontScale','m','Normal',prefs.fontScale)}${kindleSegmentButton('fontScale','l','Large',prefs.fontScale)}</div></div>
      <div class="kindle-toolbar-group"><span>11 pt reference</span><div class="kindle-segment compact">${kindleSegmentButton('referencePt','10.5','10.5',String(prefs.referencePt))}${kindleSegmentButton('referencePt','11','11',String(prefs.referencePt))}${kindleSegmentButton('referencePt','12','12',String(prefs.referencePt))}</div></div>
      <div class="kindle-toolbar-group"><span>Appearance</span><div class="kindle-segment">${kindleSegmentButton('appearance','white','Light',prefs.appearance)}${kindleSegmentButton('appearance','sepia','Sepia',prefs.appearance)}${kindleSegmentButton('appearance','dark','Dark',prefs.appearance)}</div></div>
      <div class="kindle-toolbar-group"><span>Orientation</span><div class="kindle-segment">${kindleSegmentButton('orientation','portrait','Portrait',prefs.orientation)}${kindleSegmentButton('orientation','landscape','Landscape',prefs.orientation)}</div></div>
      <div class="kindle-toolbar-group quality"><span>Stress test</span><button class="kindle-qa-button ${state.kindleQaMatrix ? 'active' : ''}" id="toggleKindleQaMatrix" type="button">${state.kindleQaMatrix ? 'Single Preview' : '3-View Torture Test'}</button></div>
    </div>
  </div>`;
}

function buildKindleFrameHtml(preview, prefsInput) {
  const tokens = kindlePreviewTokens(prefsInput);
  const { appearance, fontFace, grayscale, prefs, referencePx } = tokens;
  const isCover = preview.section?.type === 'cover';
  const adjust = prefs.mode === 'adjust';
  const bodyClass = isCover ? 'yrp-sim-cover' : 'yrp-sim-text';
  const inspectCss = adjust
    ? `.yrp-inspectable{cursor:pointer;transition:outline-color .12s ease,background .12s ease}.yrp-inspectable:hover{outline:1px solid rgba(108,92,231,.5);outline-offset:3px;background:rgba(108,92,231,.035)}.yrp-selected{outline:2px solid #6c5ce7!important;outline-offset:4px!important;background:rgba(108,92,231,.07)!important}`
    : `.yrp-inspectable{cursor:text}.yrp-selected{outline:none!important;background:transparent!important}`;
  const coverFilter = grayscale ? 'grayscale(100%) contrast(.98)' : 'none';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
${preview.css}
html{font-size:${referencePx.toFixed(2)}px;background:${appearance.background};color:${appearance.color}}
body{font-family:${fontFace.stack}!important;margin:0;box-sizing:border-box;background:${appearance.background};color:${appearance.color};min-height:100vh;width:100%}
body.yrp-sim-text{padding:2.2em 2em;max-width:none}
body.yrp-sim-cover{padding:1.1em;display:grid;place-items:center;overflow:hidden;background:${appearance.background}}
body.yrp-sim-cover .yrp-cover-preview{width:100%;height:calc(100vh - 2.2em);min-height:0;padding:0;margin:0;display:grid;place-items:center;background:transparent}
body.yrp-sim-cover .yrp-cover-preview img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;box-shadow:0 10px 28px rgba(0,0,0,.14);filter:${coverFilter};border-radius:2px}
a{color:inherit}${inspectCss}
@media(max-width:420px){body.yrp-sim-text{padding:1.55em 1.35em}}
</style></head><body class="${bodyClass}">${preview.html}</body></html>`;
}

function renderKindleSimulatorFrame(preview, prefsInput, frameId = 'ebookPreviewFrame') {
  const tokens = kindlePreviewTokens(prefsInput);
  const v = tokens.viewport;
  const frameHtml = buildKindleFrameHtml(preview, prefsInput);
  const label = tokens.prefs.device === 'ereader' ? 'Kindle preview' : tokens.prefs.device === 'phone' ? 'Phone preview' : 'Tablet preview';
  const tone = tokens.grayscale ? 'E-ink simulation' : 'Color preview';
  return `<section class="kindle-preview-pane">
    <div class="kindle-preview-pane-head"><div><strong>${label}</strong><small>${tone} · ${escapeHtml(tokens.prefs.orientation)} · ${tokens.referencePt} pt reference</small></div><span>Preview only · EPUB stays reader-controlled</span></div>
    <div class="kindle-simulator-wrap">
      <div class="kindle-device kindle-device-${escapeHtml(tokens.prefs.device)} ${tokens.prefs.orientation === 'landscape' ? 'landscape' : 'portrait'}" style="--kindle-w:${v.width};--kindle-h:${v.height};--kindle-radius:${v.radius}px;--kindle-bezel:${v.bezel}px;--kindle-chrome:${escapeHtml(tokens.appearance.chrome)}">
        <div class="kindle-screen"><iframe id="${escapeHtml(frameId)}" class="ebook-reader kindle-render-frame" title="Kindle reflowable preview" srcdoc="${escapeHtml(frameHtml)}"></iframe></div>
      </div>
    </div>
  </section>`;
}

function renderKindleQaMatrix(preview, prefsInput) {
  const presets = kindleTorturePresets(normalizeKindlePreview(prefsInput).referencePt);
  return `<section class="kindle-qa-matrix">
    <div class="kindle-qa-matrix-head"><div><div class="eyebrow">Responsive torture test</div><h3>Same section. Three reader stresses.</h3><p>If the selected chapter survives these three views, it is much less likely to surprise you in Kindle Previewer.</p></div><span>READ ONLY</span></div>
    <div class="kindle-qa-grid">${presets.map((preset, index) => {
      const qaPreview = buildEbookPreviewHtml({ project: state.project, sectionIndex: state.ebookSectionIndex, inspectMode: false });
      const tokens = kindlePreviewTokens(preset.prefs);
      const v = tokens.viewport;
      const html = buildKindleFrameHtml(qaPreview, preset.prefs);
      return `<div class="kindle-qa-card"><div class="kindle-qa-card-head"><strong>${escapeHtml(preset.label)}</strong><small>${escapeHtml(preset.detail)}</small></div><div class="kindle-qa-screen" style="--qa-ratio:${v.width}/${v.height}"><iframe id="kindleQaFrame${index}" title="${escapeHtml(preset.label)}" srcdoc="${escapeHtml(html)}"></iframe></div></div>`;
    }).join('')}</div>
  </section>`;
}


function refreshEbookInspectorOnly() {
  const slot = document.querySelector('#ebookInspectorSlot');
  if (!slot || !state.project) return;
  slot.innerHTML = renderEbookInspector(state.project, currentEbookDesign());
  bindEbookInspectorControls();
}

function currentInspectorOverrideValues() {
  const value = (id) => document.querySelector(`#${id}`)?.value ?? '';
  const suppress = document.querySelector('#ebookOverrideSuppressIndent');
  return {
    spaceBefore: value('ebookOverrideBefore'),
    spaceAfter: value('ebookOverrideAfter'),
    firstLineIndent: value('ebookOverrideIndent'),
    alignment: value('ebookOverrideAlignment') || 'inherit',
    suppressIndent: suppress ? suppress.checked : undefined,
    semanticRole: value('ebookOverrideSemanticRole') || 'auto',
  };
}

function applyInspectorValuesToLiveFrame() {
  if (!state.selectedEbookBlockId) return;
  const frame = document.querySelector('#ebookPreviewFrame');
  const doc = frame?.contentDocument;
  if (!doc) return;
  const element = doc.querySelector(`[data-yrp-block-id="${CSS.escape(state.selectedEbookBlockId)}"]`);
  if (!element) return;
  const values = currentInspectorOverrideValues();
  const before = values.spaceBefore === '' ? null : Number(values.spaceBefore);
  const after = values.spaceAfter === '' ? null : Number(values.spaceAfter);
  const indent = values.firstLineIndent === '' ? null : Number(values.firstLineIndent);
  element.style.marginTop = Number.isFinite(before) ? `${before}em` : '';
  element.style.marginBottom = Number.isFinite(after) ? `${after}em` : '';
  element.style.textAlign = values.alignment && values.alignment !== 'inherit' ? values.alignment : '';
  if (values.suppressIndent === true) element.style.textIndent = '0';
  else element.style.textIndent = Number.isFinite(indent) ? `${indent}em` : '';
  const block = ebookSelectedBlock(state.project);
  if (block) {
    const effectiveRole = values.semanticRole === 'auto' ? semanticRoleForBlock(state.project, block, 'chapter') : values.semanticRole;
    const semanticClasses = ['body','chapter-opening','subhead','block-quote','written-note','verse','text-message','scene-break'];
    semanticClasses.forEach((role) => element.classList.remove(role));
    if (effectiveRole === 'body') {
      element.classList.add('body');
      if (block.kind === 'chapter-opening') element.classList.add('chapter-opening');
    } else if (semanticClasses.includes(effectiveRole)) {
      element.classList.add(effectiveRole);
    }
    element.dataset.yrpSemanticRole = effectiveRole;
  }
}

async function commitLiveEbookOverride() {
  if (!state.project || !state.selectedEbookBlockId) return;
  setBlockPresentationOverride(state.project, 'ebook', state.selectedEbookBlockId, currentInspectorOverrideValues());
  clearKindleReviewDecisionsForBlock(state.project, state.selectedEbookBlockId);
  invalidateEditionProof(state.project, 'ebook', { clearPageCount: false });
  state.project.updatedAt = new Date().toISOString();
  state.finalCheck = null;
  state.kindleQualityCache = null;
  state.kindleQualityKey = '';
  state.kindleIntelligenceCache = null;
  state.kindleIntelligenceKey = '';
  await saveProject(state.project);
  state.projects = await listProjects();
  const status = document.querySelector('#ebookInspectorSaveState');
  if (status) status.textContent = 'Saved · Story Lock unchanged';
  disarmEbookHistory();
}

function clearKindleReviewDecisionsForBlock(project, blockId) {
  if (!project || !blockId) return;
  const decisions = ensureKindleReviewState(project);
  const quality = scanKindleQuality(project);
  const intelligence = scanKindleIntelligence(project);
  const related = [
    ...(quality.issues || []).filter((item) => item.blockId === blockId),
    ...(intelligence.anomalies || []).filter((item) => item.blockId === blockId),
  ];
  for (const item of related) if (decisions[item.id]) delete decisions[item.id];
}

async function applyInspectorQuickPreset(preset) {
  if (!state.project || !state.selectedEbookBlockId) return;
  if (preset === 'theme') {
    await resetEbookBlockOverride();
    return;
  }
  const block = ebookSelectedBlock(state.project);
  if (!block) return;
  const design = currentEbookDesign();
  const before = document.querySelector('#ebookOverrideBefore');
  const after = document.querySelector('#ebookOverrideAfter');
  const indent = document.querySelector('#ebookOverrideIndent');
  const direction = preset === 'airier' ? 1 : -1;
  armEbookHistory();
  if (block.kind === 'chapter-title') {
    if (before) before.value = String(Math.max(0, Number(design.chapterTopEm || 0) + direction * 0.4).toFixed(2)).replace(/0+$/,'').replace(/\.$/,'');
    if (after) after.value = String(Math.max(0, Number(design.chapterAfterEm || 0) + direction * 0.3).toFixed(2)).replace(/0+$/,'').replace(/\.$/,'');
  } else if (block.kind === 'scene-break') {
    if (after) after.value = String(Math.max(0, Number(design.sceneBreakSpaceEm || 0) + direction * 0.2).toFixed(2)).replace(/0+$/,'').replace(/\.$/,'');
  } else {
    if (after) after.value = String(Math.max(0, Number(design.paragraphGapEm || 0) + direction * 0.15).toFixed(2)).replace(/0+$/,'').replace(/\.$/,'');
    if (indent && block.kind === 'body') indent.value = String(Number(design.firstLineIndentEm || 0));
  }
  applyInspectorValuesToLiveFrame();
  const status = document.querySelector('#ebookInspectorSaveState');
  if (status) status.textContent = `Previewing ${preset} rhythm…`;
  await commitLiveEbookOverride();
}

function bindEbookInspectorControls() {
  document.querySelector('#applyEbookOverrideAsDefault')?.addEventListener('click', applyEbookOverrideAsDefault);
  document.querySelector('#resetEbookBlockOverride')?.addEventListener('click', resetEbookBlockOverride);
  document.querySelector('#resetAllEbookOverrides')?.addEventListener('click', resetAllEbookOverrides);
  document.querySelector('#undoEbookFormatting')?.addEventListener('click', undoEbookFormatting);
  document.querySelector('#redoEbookFormatting')?.addEventListener('click', redoEbookFormatting);
  document.querySelectorAll('[data-inspector-preset]').forEach((button) => button.addEventListener('click', () => applyInspectorQuickPreset(button.dataset.inspectorPreset)));
  document.querySelectorAll('.ebook-live-control').forEach((control) => {
    control.addEventListener('focus', armEbookHistory, { once:false });
    control.addEventListener('input', () => {
      armEbookHistory();
      applyInspectorValuesToLiveFrame();
      const status = document.querySelector('#ebookInspectorSaveState');
      if (status) status.textContent = 'Previewing change…';
    });
    control.addEventListener('change', async () => {
      armEbookHistory();
      applyInspectorValuesToLiveFrame();
      await commitLiveEbookOverride();
    });
  });
  bindKindleModeButtons(document.querySelector('#ebookInspectorSlot'));
}

function bindKindleModeButtons(root = document) {
  if (!root) return;
  root.querySelectorAll('[data-kindle-mode]').forEach((button) => {
    if (button.dataset.kindleModeBound === '1') return;
    button.dataset.kindleModeBound = '1';
    button.addEventListener('click', () => updateKindlePreviewPreference('mode', button.dataset.kindleMode));
  });
}

function bindKindlePreferenceButtons(root = document) {
  root.querySelectorAll('[data-kindle-pref-key]').forEach((button) => {
    if (button.dataset.kindlePrefBound === '1') return;
    button.dataset.kindlePrefBound = '1';
    button.addEventListener('click', () => {
      const key = button.dataset.kindlePrefKey;
      let value = button.dataset.kindlePrefValue;
      if (key === 'simulateEink') value = value === 'true';
      if (key === 'referencePt') value = Number(value);
      updateKindlePreviewPreference(key, value);
    });
  });
}

function toggleKindleFocusPreview() {
  if (!state.project || state.activeView !== 'ebook') return;
  state.kindleFocusPreview = !state.kindleFocusPreview;
  rerenderMainPreservingScroll();
  requestAnimationFrame(() => document.querySelector('#ebookPreviewStudio')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function runKindleCommand(command) {
  if (!state.project || state.activeView !== 'ebook') return;
  if (command === 'next-issue') { jumpToNextPolishIssue(); return; }
  if (command === 'undo') { undoEbookFormatting(); return; }
  if (command === 'redo') { redoEbookFormatting(); return; }
  if (command === 'focus-preview') { toggleKindleFocusPreview(); }
}

function bindKindleCommandButtons(root = document) {
  root.querySelectorAll('[data-kindle-command]').forEach((button) => {
    if (button.dataset.kindleCommandBound === '1') return;
    button.dataset.kindleCommandBound = '1';
    button.addEventListener('click', () => runKindleCommand(button.dataset.kindleCommand));
  });
}

function filterEbookNavigator(query = '') {
  const normalized = String(query || '').trim().toLowerCase();
  state.ebookNavigatorSearch = query;
  document.querySelectorAll('.ebook-toc-row[data-ebook-title]').forEach((row) => {
    const title = String(row.dataset.ebookTitle || '');
    row.hidden = Boolean(normalized && !title.includes(normalized));
  });
}

function bindKindleKeyboardShortcuts() {
  if (document.documentElement.dataset.yrpKindleShortcutsBound === '1') return;
  document.documentElement.dataset.yrpKindleShortcutsBound = '1';
  document.addEventListener('keydown', (event) => {
    if (state.activeView !== 'ebook' || !state.project) return;
    const target = event.target;
    const typing = target && (target.matches?.('input, textarea, select, [contenteditable="true"]'));
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      document.querySelector('#ebookNavigatorSearch')?.focus();
      document.querySelector('#ebookNavigatorSearch')?.select();
      return;
    }
    if (typing) return;
    if (event.altKey && event.key === 'ArrowLeft') {
      event.preventDefault();
      jumpEbookSection(state.ebookSectionIndex - 1);
      return;
    }
    if (event.altKey && event.key === 'ArrowRight') {
      event.preventDefault();
      jumpEbookSection(state.ebookSectionIndex + 1);
      return;
    }
    if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'e') {
      event.preventDefault();
      updateKindlePreviewPreference('mode', state.kindlePreview.mode === 'adjust' ? 'read' : 'adjust');
      return;
    }
    if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      jumpToNextPolishIssue();
    }
  });
}

function updateKindlePreviewPreference(key, value) {
  state.kindlePreview = normalizeKindlePreview({ ...state.kindlePreview, [key]: value });
  if (key === 'mode' && value === 'read') {
    state.selectedEbookBlockId = '';
    state.inspectorMessage = '';
  }
  rerenderMainPreservingScroll();
}


function currentKindleQuality(project) {
  const key = `${project?.updatedAt || ''}|${project?.storyLock?.status || ''}|${countPresentationOverrides(project, 'ebook')}`;
  if (state.kindleQualityCache && state.kindleQualityKey === key) return state.kindleQualityCache;
  state.kindleQualityCache = scanKindleQuality(project);
  state.kindleQualityKey = key;
  return state.kindleQualityCache;
}

function qualityIssueTargetIndex(issue, preview) {
  if (!issue || !preview?.sections?.length) return -1;
  if (issue.sectionId) return preview.sections.findIndex((section) => section.id === issue.sectionId);
  if (issue.blockId) return preview.sections.findIndex((section) => (section.blocks || []).some((block) => block.id === issue.blockId));
  return -1;
}

function renderKindleQualityPanel(quality, preview) {
  const topIssues = quality.issues.filter((item) => item.severity !== 'info').slice(0, 8);
  const informational = quality.issues.filter((item) => item.severity === 'info').slice(0, 3);
  const issues = [...topIssues, ...informational];
  const acknowledgedWarnings = quality.issues.filter((item) => item.severity === 'warning' && Boolean(kindleReviewDecision(state.project, item))).length;
  const activeWarnings = quality.issues.filter((item) => item.severity === 'warning' && !kindleReviewDecision(state.project, item)).length;
  const statusClass = quality.summary.errors ? 'bad' : activeWarnings ? 'needs' : 'good';
  const icon = (severity) => severity === 'error' ? '×' : severity === 'warning' ? '!' : 'i';
  return `<section class="kindle-quality-card ${statusClass}">
    <div class="kindle-quality-score"><strong>${quality.score}</strong><span>${escapeHtml(quality.grade)}</span></div>
    <div class="kindle-quality-main">
      <div class="kindle-quality-head"><div><div class="eyebrow">Kindle Pro consistency scan</div><h3>${quality.summary.errors ? 'Blocking quality issue found' : activeWarnings ? 'Production-ready with review items' : acknowledgedWarnings ? 'All quality warnings are reviewed or intentional' : 'Whole-book consistency looks clean'}</h3><p>Scans the finished EPUB structure, all chapter sections, local formatting overrides, navigation, and reflow safety—not just the chapter on screen.</p></div><div class="kindle-quality-counts"><span class="error">${quality.summary.errors} error</span><span class="warning">${activeWarnings} review</span><span>${acknowledgedWarnings} intentional</span><span>${quality.overrideCount} local fixes</span></div></div>
      <div class="kindle-quality-issues">${issues.length ? issues.map((item) => {
        const target = qualityIssueTargetIndex(item, preview);
        const reviewed = item.severity !== 'error' && Boolean(kindleReviewDecision(state.project, item));
        return `<div class="kindle-quality-issue ${item.severity} ${reviewed ? 'acknowledged' : ''}"><span>${reviewed ? '✓' : icon(item.severity)}</span><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.message)}</small>${reviewed ? '<em>Marked intentional for this exact finding.</em>' : ''}</div><div class="kindle-quality-actions">${target >= 0 ? `<button type="button" data-quality-section="${target}" data-quality-block="${escapeHtml(item.blockId || '')}">Go there</button>` : ''}${item.severity === 'warning' ? `<button type="button" data-kindle-review-source="quality" data-kindle-review-id="${escapeHtml(item.id)}">${reviewed ? 'Unmark' : 'Intentional'}</button>` : ''}</div></div>`;
      }).join('') : `<div class="kindle-quality-clean"><span>✓</span><div><strong>No whole-book formatting anomalies detected.</strong><small>Keep doing the visual early/middle/late chapter check before final export.</small></div></div>`}</div>
      <div class="kindle-quality-footer"><span>Enhanced Typesetting safety: ${quality.enhanced.errors ? 'BLOCKED' : quality.enhanced.warnings ? 'REVIEW' : 'PASS'}</span><span>${quality.chapters} chapters scanned</span><span>${quality.tocChapters} Kindle chapter links</span></div>
    </div>
  </section>`;
}


function jumpToKindleQualityIssue(index, blockId = '') {
  if (!state.project) return;
  const preview = buildEbookPreviewHtml({ project: state.project, sectionIndex: index, inspectMode: Boolean(blockId) });
  state.ebookSectionIndex = preview.index;
  state.kindleQaMatrix = false;
  state.kindlePreview = normalizeKindlePreview({ ...state.kindlePreview, mode: blockId ? 'adjust' : 'read' });
  state.selectedEbookBlockId = blockId || '';
  state.inspectorMessage = blockId ? 'Quality scan brought you directly to this source block.' : '';
  state.ebookFrameScrollY = 0;
  updateMain();
}

function currentKindleIntelligence(project) {
  const key = `${project?.updatedAt || ''}|${project?.storyLock?.status || ''}|${countPresentationOverrides(project, 'ebook')}`;
  if (state.kindleIntelligenceCache && state.kindleIntelligenceKey === key) return state.kindleIntelligenceCache;
  state.kindleIntelligenceCache = scanKindleIntelligence(project);
  state.kindleIntelligenceKey = key;
  return state.kindleIntelligenceCache;
}

function intelligenceIssueTargetIndex(issue, preview) {
  if (!issue || !preview?.sections?.length) return -1;
  if (issue.sectionId) return preview.sections.findIndex((section) => section.id === issue.sectionId);
  if (issue.blockId) return preview.sections.findIndex((section) => (section.blocks || []).some((block) => block.id === issue.blockId));
  return -1;
}

function formatComparisonValue(value) {
  if (value == null || value === '') return 'Theme default';
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return keys.length ? keys.map((key) => `${key}: ${String(value[key])}`).join(' · ') : 'Theme default';
  }
  return String(value);
}

function renderKindleIntelligencePanel(intelligence, preview) {
  const project = state.project;
  const chapterCount = intelligence.chapters.length;
  const leftIndex = Math.max(0, Math.min(chapterCount - 1, Number(state.compareChapterA) || 0));
  const rightIndex = Math.max(0, Math.min(chapterCount - 1, Number(state.compareChapterB) || Math.min(1, chapterCount - 1)));
  const comparison = compareKindleChapters(project, leftIndex, rightIndex);
  const leftOptions = intelligence.chapters.map((chapter, index) => `<option value="${index}" ${index === leftIndex ? 'selected' : ''}>${escapeHtml(chapter.title)}</option>`).join('');
  const rightOptions = intelligence.chapters.map((chapter, index) => `<option value="${index}" ${index === rightIndex ? 'selected' : ''}>${escapeHtml(chapter.title)}</option>`).join('');
  const reviewedCount = intelligence.anomalies.filter((item) => item.severity !== 'error' && Boolean(kindleReviewDecision(project, item))).length;
  const activeReviewCount = intelligence.anomalies.filter((item) => item.severity === 'review' && !kindleReviewDecision(project, item)).length;
  const actionable = intelligence.anomalies.filter((item) => item.severity !== 'info').slice(0, 10);
  const info = intelligence.anomalies.filter((item) => item.severity === 'info').slice(0, 4);
  const visible = [...actionable, ...info];
  const status = intelligence.summary.errors ? 'bad' : activeReviewCount ? 'needs' : 'good';
  const statusText = intelligence.summary.errors ? 'Structure mismatch detected' : activeReviewCount ? 'Review the highlighted outliers' : reviewedCount ? 'All formatting outliers are reviewed or intentional' : 'Chapter formatting fingerprints are consistent';
  return `<section class="kindle-intelligence-card ${status}">
    <div class="kindle-intelligence-head">
      <div><div class="eyebrow">Kindle Intelligence</div><h3>${statusText}</h3><p>Compares chapter presentation fingerprints across the entire manuscript, finds isolated formatting drift, and offers only fixes that touch presentation metadata—not Story-Locked prose.</p></div>
      <div class="kindle-intelligence-summary"><span>${chapterCount} chapters</span><span class="review">${activeReviewCount} review</span><span>${reviewedCount} intentional</span><span>${intelligence.summary.autoFixable} safe fix${intelligence.summary.autoFixable === 1 ? '' : 'es'}</span></div>
    </div>
    ${state.kindleIntelligenceMessage ? `<div class="kindle-intelligence-message">${escapeHtml(state.kindleIntelligenceMessage)}</div>` : ''}
    <div class="kindle-consistency-map" aria-label="Chapter consistency map">${intelligence.map.map((chapter) => {
      const target = preview.sections.findIndex((section) => section.id === chapter.sectionId);
      const chapterIssues = intelligence.anomalies.filter((item) => item.chapterIndex === chapter.chapterIndex && item.severity !== 'info');
      const reviewedChapter = chapterIssues.length > 0 && chapterIssues.every((item) => item.severity !== 'error' && Boolean(kindleReviewDecision(project, item)));
      return `<button type="button" class="chapter-health ${reviewedChapter ? 'acknowledged' : chapter.status}" data-intelligence-section="${target >= 0 ? target : 0}" title="${escapeHtml(chapter.title)} · ${chapter.score}% consistency${reviewedChapter ? ' · reviewed intentional' : ''}"><b>${chapter.chapterIndex + 1}</b><span>${reviewedChapter ? '✓' : chapter.score}</span></button>`;
    }).join('')}</div>
    <div class="kindle-intelligence-grid">
      <div class="kindle-anomaly-list">
        <div class="kindle-intelligence-subhead"><strong>Formatting outliers</strong><small>${visible.length ? 'Click Go there to inspect the exact chapter or block.' : 'No chapter-level drift detected.'}</small></div>
        ${visible.length ? visible.map((item) => {
          const target = intelligenceIssueTargetIndex(item, preview);
          const sev = item.severity === 'error' ? 'error' : item.severity === 'review' ? 'review' : 'info';
          const reviewed = Boolean(kindleReviewDecision(project, item));
          return `<div class="kindle-anomaly ${sev} ${reviewed ? 'acknowledged' : ''}"><span>${reviewed ? '✓' : item.severity === 'error' ? '×' : item.severity === 'review' ? '!' : 'i'}</span><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.message)}</small>${reviewed ? '<em>Marked intentional for this exact finding.</em>' : ''}</div><div class="kindle-anomaly-actions">${target >= 0 ? `<button type="button" data-intelligence-section="${target}" data-intelligence-block="${escapeHtml(item.blockId || '')}">Go there</button>` : ''}${item.fix ? `<button type="button" class="safe-fix" data-intelligence-fix="${escapeHtml(item.id)}">${escapeHtml(item.fix.label || 'Fix safely')}</button>` : ''}${item.severity === 'review' ? `<button type="button" class="review-intentional ${reviewed ? 'active' : ''}" data-kindle-review-source="intelligence" data-kindle-review-id="${escapeHtml(item.id)}">${reviewed ? 'Unmark' : 'Intentional'}</button>` : ''}</div></div>`;
        }).join('') : `<div class="kindle-intelligence-clean"><span>✓</span><div><strong>No isolated Kindle formatting drift found.</strong><small>Every chapter still gets a visual proof before the engine is frozen.</small></div></div>`}
      </div>
      <div class="kindle-chapter-compare">
        <div class="kindle-intelligence-subhead"><strong>Compare Chapters</strong><small>Compare presentation fingerprints without comparing story content.</small></div>
        <div class="chapter-compare-controls"><label><span>Chapter A</span><select id="compareChapterA">${leftOptions}</select></label><span class="compare-arrow">↔</span><label><span>Chapter B</span><select id="compareChapterB">${rightOptions}</select></label><button class="btn secondary" id="compareKindleChaptersButton" type="button">Compare</button></div>
        <div class="chapter-match-score"><strong>${comparison.match}%</strong><div><b>presentation match</b><small>${comparison.left ? escapeHtml(comparison.left.title) : '—'} ↔ ${comparison.right ? escapeHtml(comparison.right.title) : '—'}</small></div></div>
        <div class="chapter-compare-results">${comparison.differences.length ? comparison.differences.map((difference) => `<div><strong>${escapeHtml(difference.label)}</strong><small><b>A:</b> ${escapeHtml(formatComparisonValue(difference.left))}<br><b>B:</b> ${escapeHtml(formatComparisonValue(difference.right))}${difference.note ? `<br>${escapeHtml(difference.note)}` : ''}</small></div>`).join('') : `<div class="comparison-clean"><strong>Presentation fingerprints match.</strong><small>No chapter-formatting differences were detected between these two chapters.</small></div>`}</div>
      </div>
    </div>
  </section>`;
}

function jumpToKindleIntelligenceIssue(index, blockId = '') {
  if (!state.project) return;
  state.ebookSectionIndex = index;
  state.kindleQaMatrix = false;
  state.kindlePreview = normalizeKindlePreview({ ...state.kindlePreview, mode: blockId ? 'adjust' : 'read' });
  state.selectedEbookBlockId = blockId || '';
  state.inspectorMessage = blockId ? 'Kindle Intelligence brought you directly to this formatting outlier.' : '';
  state.ebookFrameScrollY = 0;
  updateMain();
  document.querySelector('#ebookPreviewStudio')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function applyKindleIntelligenceFixById(issueId) {
  if (!state.project || !issueId) return;
  const intelligence = scanKindleIntelligence(state.project);
  const item = intelligence.anomalies.find((candidate) => candidate.id === issueId);
  if (!item?.fix) return;
  armEbookHistory();
  applyKindleIntelligenceFix(state.project, item.fix);
  clearKindleReviewDecision(state.project, item.id);
  disarmEbookHistory();
  invalidateEditionProof(state.project, 'ebook', { clearPageCount: false });
  state.project.updatedAt = new Date().toISOString();
  state.finalCheck = null;
  state.kindleQualityCache = null;
  state.kindleQualityKey = '';
  state.kindleIntelligenceCache = null;
  state.kindleIntelligenceKey = '';
  state.kindleIntelligenceMessage = `${item.fix.label || 'Safe fix applied'} · presentation metadata only · Story Lock text unchanged.`;
  await saveProject(state.project);
  state.projects = await listProjects();
  updateMain();
}

function kindleIssueTargetIndex(issue, preview) {
  if (!issue || !preview?.sections?.length) return -1;
  if (issue.sectionId) return preview.sections.findIndex((section) => section.id === issue.sectionId);
  if (issue.blockId) return preview.sections.findIndex((section) => (section.blocks || []).some((block) => block.id === issue.blockId));
  return -1;
}

function currentKindleProductionFlow(project = state.project) {
  if (!project) return null;
  ensureKindleReviewState(project);
  const report = runEpubPreflight({ project, storyLockOk: project.storyLock?.status === 'verified' });
  const quality = currentKindleQuality(project);
  const intelligence = currentKindleIntelligence(project);
  return buildKindleProductionFlow({ project, report, quality, intelligence });
}

function renderKindleProductionConsole(flow, preview, kindleReady) {
  const setupIncomplete = flow.stats.setupReady < flow.stats.setupTotal;
  const status = flow.blockers.length ? 'blocked' : setupIncomplete ? 'setup' : flow.reviews.length ? 'review' : kindleReady ? 'ready' : 'setup';
  const next = flow.nextAction || { label: 'Open Preview Studio', detail: 'Continue the visual proof.' };
  const queue = flow.unresolved.slice(0, 5);
  const setup = flow.setup.map((item) => `<div class="kindle-flow-step ${item.ready ? 'done' : ''}"><span>${item.ready ? '✓' : '•'}</span><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail)}</small></div></div>`).join('');
  const rows = queue.length ? queue.map((item) => {
    const target = kindleIssueTargetIndex(item, preview);
    const severity = item.severity === 'error' ? 'error' : 'review';
    return `<div class="kindle-polish-row ${severity}"><span>${item.severity === 'error' ? '×' : '!'}</span><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.message)}</small></div><div class="kindle-polish-actions">${target >= 0 ? `<button type="button" data-polish-section="${target}" data-polish-block="${escapeHtml(item.blockId || '')}" data-polish-source="${escapeHtml(item.source)}">Go</button>` : ''}${item.fix && item.source === 'intelligence' ? `<button type="button" class="safe" data-intelligence-fix="${escapeHtml(item.id)}">Fix</button>` : ''}${['warning','review'].includes(item.severity) ? `<button type="button" data-kindle-review-source="${escapeHtml(item.source)}" data-kindle-review-id="${escapeHtml(item.id)}">Intentional</button>` : ''}</div></div>`;
  }).join('') : `<div class="kindle-polish-clear"><span>✓</span><div><strong>Polish queue is clear.</strong><small>No unresolved blockers or review items are waiting.</small></div></div>`;
  return `<section class="kindle-production-console ${status}" id="kindleProductionConsole">
    <div class="kindle-production-score"><strong>${flow.score}</strong><span>production</span></div>
    <div class="kindle-production-main">
      <div class="kindle-production-head"><div><div class="eyebrow">Kindle Production Console · v1.0.14</div><h3>${kindleReady && !flow.reviews.length ? 'Kindle package is ready for final visual proof' : flow.blockers.length ? 'Fix the blockers first' : setupIncomplete ? 'Finish Kindle setup' : flow.reviews.length ? 'Production is structurally ready — review the polish queue' : 'Finish Kindle setup'}</h3><p>One place for setup, whole-book intelligence, visual proof, and the exact next action. No hunting through the page.</p></div><div class="kindle-production-stats"><span class="error">${flow.stats.blockers} blocker</span><span class="review">${flow.stats.reviews} review</span><span>${flow.stats.acknowledged} intentional</span><span>${flow.stats.localFixes} local fix</span></div></div>
      <div class="kindle-flow-steps">${setup}</div>
      <div class="kindle-next-action"><div><small>NEXT BEST ACTION</small><strong>${escapeHtml(next.label)}</strong><span>${escapeHtml(next.detail || '')}</span></div><div class="kindle-next-buttons"><button class="btn ${kindleReady ? 'secondary' : 'primary'}" id="kindleNextBestAction" type="button">${escapeHtml(next.label)}</button><button class="btn secondary" id="jumpEbookPreviewStudio" type="button">Open Preview Studio</button><button class="btn ${state.kindleFocusPreview ? 'primary' : 'secondary'}" id="toggleKindleFocusPreview" type="button">${state.kindleFocusPreview ? 'Show Workbench' : 'Focus Preview'}</button><button class="btn primary kindle-download-hero" id="downloadEpub" type="button" ${kindleReady ? '' : 'disabled'}>Download KDP EPUB</button></div></div>
      <details class="kindle-polish-queue" ${queue.length ? 'open' : ''}><summary><span><strong>Polish Queue</strong><small>${flow.unresolved.length} unresolved · ${flow.acknowledged.length} marked intentional</small></span><b>⌄</b></summary><div class="kindle-polish-list">${rows}</div></details>
    </div>
  </section>`;
}


function currentKindleReleaseGate(project = state.project) {
  if (!project) return null;
  const report = runEpubPreflight({ project, storyLockOk: project.storyLock?.status === 'verified' });
  const quality = currentKindleQuality(project);
  const intelligence = currentKindleIntelligence(project);
  const flow = buildKindleProductionFlow({ project, report, quality, intelligence });
  return buildKindleReleaseGate({ project, report, quality, intelligence, flow });
}

function renderKindleReleaseGate(gate, flow) {
  const a11y = gate.accessibility;
  const proof = gate.visualProof;
  const status = gate.frozen ? 'frozen' : gate.freezeReady ? 'ready' : gate.blockersClear ? 'review' : 'blocked';
  const checks = [
    ['Technical package', gate.technicalReady],
    ['Polish queue', gate.reviewsClear && gate.blockersClear],
    ['Accessibility', a11y.ready],
    ['Visual proof', proof.current],
    ['Release freeze', gate.frozen],
  ].map(([label, ok]) => `<div class="release-gate-step ${ok ? 'done' : ''}"><span>${ok ? '✓' : '•'}</span><strong>${escapeHtml(label)}</strong></div>`).join('');
  const a11yRows = a11y.checks.map((item) => `<div class="release-a11y-row ${item.status}"><span>${item.status === 'pass' ? '✓' : item.status === 'warning' ? '!' : '×'}</span><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.message)}</small></div></div>`).join('');
  return `<section class="kindle-release-gate ${status}" id="kindleReleaseGate">
    <div class="kindle-release-head">
      <div><div class="eyebrow">Kindle Release Gate · v1.0.16</div><h3>${gate.frozen ? 'Kindle release is frozen' : gate.freezeReady ? 'Every release gate is complete' : 'Finish the last production proof'}</h3><p>Batch review, safe presentation cleanup, accessibility, final visual proof, and an invalidating release token in one place.</p></div>
      <div class="kindle-release-score"><strong>${a11y.score}</strong><span>accessibility</span></div>
    </div>
    ${state.releaseGateMessage ? `<div class="notice info">${escapeHtml(state.releaseGateMessage)}</div>` : ''}
    <div class="release-gate-steps">${checks}</div>
    <div class="release-gate-summary">
      <div><strong>${gate.safeFixes.length}</strong><span>safe fixes available</span></div>
      <div><strong>${flow.reviews.length}</strong><span>active review</span></div>
      <div><strong>${a11y.warnings}</strong><span>a11y review</span></div>
      <div><strong>${proof.current ? 'Current' : 'Needed'}</strong><span>visual proof</span></div>
    </div>
    <div class="release-gate-actions">
      <button class="btn secondary" id="applyKindleSafeFixBatch" type="button" ${gate.safeFixes.length ? '' : 'disabled'}>Apply all safe fixes</button>
      <button class="btn secondary" id="markKindleBatchIntentional" type="button" ${flow.reviews.length ? '' : 'disabled'}>Mark current reviews intentional</button>
      <button class="btn secondary" id="markKindleVisualProof" type="button">${proof.current ? 'Visual proof complete ✓' : 'Mark visual proof complete'}</button>
      <button class="btn ${gate.freezeReady && !gate.frozen ? 'primary' : 'secondary'}" id="freezeKindleRelease" type="button" ${gate.freezeReady && !gate.frozen ? '' : 'disabled'}>${gate.frozen ? 'Kindle frozen ✓' : 'Freeze Kindle release'}</button>
      <button class="btn secondary" id="downloadKindleReleaseReport" type="button">Download release report</button>
    </div>
    <div class="release-next-action"><small>FINAL NEXT ACTION</small><strong>${escapeHtml(gate.nextAction.label)}</strong><span>${escapeHtml(gate.nextAction.detail)}</span><code>${escapeHtml(gate.releaseToken)}</code></div>
    <details class="release-accessibility"><summary><span><strong>Accessibility & EPUB semantics</strong><small>${a11y.passes} pass · ${a11y.warnings} review · ${a11y.errors} error</small></span><b>⌄</b></summary><div>${a11yRows}</div></details>
  </section>`;
}

async function applyKindleSafeFixesBatch() {
  if (!state.project) return;
  armEbookHistory();
  const intelligence = scanKindleIntelligence(state.project);
  const result = applySafeFixBatch(state.project, intelligence);
  disarmEbookHistory();
  invalidateEditionProof(state.project, 'ebook', { clearPageCount: false });
  state.project.updatedAt = new Date().toISOString();
  state.finalCheck = null;
  state.kindleQualityCache = null;
  state.kindleQualityKey = '';
  state.kindleIntelligenceCache = null;
  state.kindleIntelligenceKey = '';
  state.releaseGateMessage = result.applied.length
    ? `${result.applied.length} safe presentation fix${result.applied.length === 1 ? '' : 'es'} applied in one batch. Story Lock manuscript text was unchanged.`
    : 'No safe presentation fixes were available.';
  await saveProject(state.project);
  state.projects = await listProjects();
  updateMain();
}

async function markKindleReviewsIntentionalBatch() {
  if (!state.project) return;
  const quality = scanKindleQuality(state.project);
  const intelligence = scanKindleIntelligence(state.project);
  const records = markAllCurrentReviewsIntentional(state.project, quality, intelligence);
  state.project.updatedAt = new Date().toISOString();
  state.finalCheck = null;
  state.releaseGateMessage = records.length
    ? `${records.length} current exact review finding${records.length === 1 ? '' : 's'} marked intentional. Any changed fingerprint will reappear automatically.`
    : 'There were no current review findings to mark intentional.';
  await saveProject(state.project);
  state.projects = await listProjects();
  updateMain();
}

async function completeKindleVisualProof() {
  if (!state.project) return;
  markKindleVisualProofComplete(state.project);
  state.project.updatedAt = new Date().toISOString();
  state.releaseGateMessage = 'Final visual proof stamped for this exact source, design, cover, and review state. Any later change invalidates the stamp.';
  await saveProject(state.project);
  state.projects = await listProjects();
  updateMain();
}

async function freezeCurrentKindleRelease() {
  if (!state.project) return;
  const gate = currentKindleReleaseGate();
  freezeKindleRelease(state.project, gate);
  state.project.updatedAt = new Date().toISOString();
  state.releaseGateMessage = `Kindle release frozen at ${gate.releaseToken}. Any source, design, cover, local override, or review change automatically invalidates this freeze.`;
  await saveProject(state.project);
  state.projects = await listProjects();
  updateMain();
}

function downloadKindleReleaseReport() {
  if (!state.project) return;
  const report = runEpubPreflight({ project: state.project, storyLockOk: state.project.storyLock?.status === 'verified' });
  const quality = currentKindleQuality(state.project);
  const intelligence = currentKindleIntelligence(state.project);
  const flow = buildKindleProductionFlow({ project: state.project, report, quality, intelligence });
  const gate = buildKindleReleaseGate({ project: state.project, report, quality, intelligence, flow });
  const payload = kindleReleaseReport({ project: state.project, report, quality, intelligence, flow, gate });
  downloadTextFile(`${safeExportBaseName()}-kindle-release-report.json`, JSON.stringify(payload, null, 2));
}

async function toggleKindleReviewDecision(source, issueId) {
  if (!state.project || !issueId) return;
  const quality = scanKindleQuality(state.project);
  const intelligence = scanKindleIntelligence(state.project);
  const item = source === 'quality'
    ? quality.issues.find((candidate) => candidate.id === issueId)
    : intelligence.anomalies.find((candidate) => candidate.id === issueId);
  if (!item || !['warning', 'review'].includes(item.severity)) return;
  if (kindleReviewDecision(state.project, item)) {
    clearKindleReviewDecision(state.project, item.id);
    state.kindleIntelligenceMessage = 'Review item returned to the active polish queue.';
  } else {
    markKindleReviewIntentional(state.project, item);
    state.kindleIntelligenceMessage = 'Marked intentional for this exact finding. If the finding changes, YasReady will surface it again.';
  }
  state.project.updatedAt = new Date().toISOString();
  await saveProject(state.project);
  state.projects = await listProjects();
  updateMain();
}

function jumpToPolishIssue(issue) {
  if (!state.project || !issue) return;
  const preview = buildEbookPreviewHtml({ project: state.project, sectionIndex: state.ebookSectionIndex, inspectMode: false });
  const target = kindleIssueTargetIndex(issue, preview);
  if (target >= 0) {
    if (issue.source === 'intelligence') jumpToKindleIntelligenceIssue(target, issue.blockId || '');
    else jumpToKindleQualityIssue(target, issue.blockId || '');
    requestAnimationFrame(() => document.querySelector('#ebookPreviewStudio')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return;
  }
  document.querySelector('#kindleHealthDetails')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function performKindleNextBestAction() {
  if (!state.project) return;
  const flow = currentKindleProductionFlow();
  const action = flow?.nextAction;
  if (!action) return;
  if (action.type === 'metadata') {
    state.activeView = 'import';
    updateMain();
    return;
  }
  if (action.type === 'cover') {
    document.querySelector('#kindleCoverSetup')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (action.type === 'verify-lock') {
    await verifyLock(false);
    updateMain();
    return;
  }
  if (action.type === 'issue') {
    jumpToPolishIssue(action.issue);
    return;
  }
  if (action.type === 'preview') {
    state.kindleQaMatrix = true;
    state.kindlePreview = normalizeKindlePreview({ ...state.kindlePreview, mode: 'read' });
    updateMain();
    requestAnimationFrame(() => document.querySelector('#ebookPreviewStudio')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return;
  }
  document.querySelector('#kindlePreflight')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function jumpToNextPolishIssue() {
  const flow = currentKindleProductionFlow();
  if (!flow?.unresolved?.length) return;
  state.polishQueueIndex = Math.max(0, Math.min(flow.unresolved.length - 1, state.polishQueueIndex % flow.unresolved.length));
  const issue = flow.unresolved[state.polishQueueIndex];
  state.polishQueueIndex = (state.polishQueueIndex + 1) % flow.unresolved.length;
  jumpToPolishIssue(issue);
}

function themeStudioSelect(id, label, value, options) {
  return `<label class="design-field"><span>${escapeHtml(label)}</span><select id="${id}">${options.map((option) => {
    const item = typeof option === 'string' ? { value: option, label: option } : option;
    return `<option value="${escapeHtml(item.value)}" ${String(value) === String(item.value) ? 'selected' : ''}>${escapeHtml(item.label)}</option>`;
  }).join('')}</select></label>`;
}

function themeStudioNumber(id, label, value, { min = 0, max = 10, step = 0.05, unit = 'em' } = {}) {
  return `<label class="design-field"><span>${escapeHtml(label)}</span><div class="number-wrap"><input id="${id}" type="number" min="${min}" max="${max}" step="${step}" value="${escapeHtml(value)}"><em>${escapeHtml(unit)}</em></div></label>`;
}

function renderThemeStudioSample(design, studio) {
  const transform = studio.chapterTitleTransform === 'none' ? 'none' : studio.chapterTitleTransform;
  const divider = studio.chapterDivider === 'none' ? '' : studio.chapterDivider === 'line'
    ? '<span class="theme-sample-divider line"></span>'
    : `<span class="theme-sample-divider">${studio.chapterDivider === 'dots' ? '• • •' : studio.chapterDivider === 'diamond' ? '◆' : '✦'}</span>`;
  const scene = design.sceneBreakTreatment === 'whitespace' ? '&nbsp;'
    : design.sceneBreakTreatment === 'dots' ? '• • •'
      : design.sceneBreakTreatment === 'diamond' ? '◆'
        : design.sceneBreakTreatment === 'flourish' ? '✦'
          : design.sceneBreakTreatment === 'custom-text' ? escapeHtml(studio.sceneBreakCustomText || '✦')
            : design.sceneBreakTreatment === 'asterisks' ? '* * *' : '***';
  const firstClass = `theme-sample-first ${studio.firstParagraphTreatment}`;
  const messageClass = `theme-sample-message ${design.textMessageStyle}`;
  return `<div class="theme-sample-book" id="themeStudioLiveSample" data-message-style="${escapeHtml(design.textMessageStyle)}">
    <div class="theme-sample-chapter" id="themeSampleChapter" style="text-align:${escapeHtml(design.chapterTitleAlignment)};padding-top:${design.chapterTopEm}em;margin-bottom:${design.chapterAfterEm}em;font-size:${studio.chapterTitleSizeEm}em;font-weight:${studio.chapterTitleWeight};letter-spacing:${studio.chapterTitleLetterSpacingEm}em;text-transform:${escapeHtml(transform)}">Chapter 12: The Shape of Home</div>
    ${divider}
    <p class="${firstClass}" id="themeSampleFirst" style="line-height:${design.lineHeight};margin-bottom:${design.paragraphGapEm}em">Morning found the house before any of them were ready for it, pouring warm light across the floorboards and the two beagles asleep in the safest patch of sun.</p>
    <p class="theme-sample-body" id="themeSampleBody" style="line-height:${design.lineHeight};text-indent:${design.firstLineIndentEm}em;margin-bottom:${design.paragraphGapEm}em">Juan crossed the kitchen barefoot, coffee in one hand, his phone in the other, and smiled before he even read the whole message.</p>
    <div class="theme-sample-scene" id="themeSampleScene">${scene}</div>
    <p class="theme-sample-after" style="line-height:${design.lineHeight};margin-bottom:${design.paragraphGapEm}em">Later, the quiet between them felt less like distance and more like room to breathe.</p>
    <p class="${messageClass}" id="themeSampleMessage">[Juan]: te amo. also i’m starving.</p>
    <blockquote class="theme-sample-quote">Some homes are built twice: once with walls, and again with the people who choose to stay.</blockquote>
  </div>`;
}

function renderThemeStudio(project, design, preview, intelligence) {
  const studio = normalizeEbookThemeStudio(design.themeStudio || {});
  const dna = calculateBookDNA(project, intelligence);
  const paragraphOverrides = countPresentationOverrides(project, 'ebook');
  const chapterOverrideCount = Object.keys(studio.chapterOverrides || {}).length;
  const sourceStyles = sourceStyleRecords(project);
  const usageRole = EBOOK_THEME_STUDIO_ROLES.includes(state.themeUsageRole) ? state.themeUsageRole : 'text-message';
  const usage = ebookStyleUsage(project, usageRole).map((item) => {
    const sectionIndex = preview.sections.findIndex((section) => (section.blocks || []).some((block) => block.id === item.blockId));
    return { ...item, sectionIndex };
  });
  const chapterSections = preview.sourceSections.filter((section) => section.type === 'chapter');
  const requestedChapterBlock = state.themeSelectedChapterBlockId
    ? chapterSections.flatMap((section) => section.blocks || []).find((block) => block.id === state.themeSelectedChapterBlockId && block.kind === 'chapter-title')
    : null;
  const selectedChapterBlock = requestedChapterBlock || chapterSections.flatMap((section) => section.blocks || []).find((block) => block.kind === 'chapter-title');
  if (selectedChapterBlock && state.themeSelectedChapterBlockId !== selectedChapterBlock.id) state.themeSelectedChapterBlockId = selectedChapterBlock.id;
  const chapterOverride = selectedChapterBlock ? studio.chapterOverrides?.[selectedChapterBlock.id] || {} : {};
  const mappedOptions = [
    { value:'auto', label:'Auto / source inference' },
    { value:'body', label:'Body paragraph' },
    { value:'subhead', label:'Subhead' },
    { value:'block-quote', label:'Block quote' },
    { value:'written-note', label:'Written note / letter' },
    { value:'verse', label:'Verse / poetry' },
    { value:'text-message', label:'Text conversation' },
    { value:'scene-break', label:'Scene break' },
    { value:'review', label:'Review manually' },
  ];

  return `<details class="theme-studio-v115" id="themeStudio" open>
    <summary><span><strong>Theme Studio · v1.0.15</strong><small>${escapeHtml(studio.themeName)} · ${dna.adherence}% theme match · Story Lock safe</small></span><b>⌄</b></summary>
    <div class="theme-studio-body">
      ${state.themeStudioMessage ? `<div class="notice info">${escapeHtml(state.themeStudioMessage)}</div>` : ''}
      <div class="theme-studio-intro">
        <div><div class="eyebrow">Professional visual design system</div><h3>Make the whole novel feel designed.</h3><p>Theme style → chapter override → paragraph override. Every visual decision stays outside the manuscript and inside the ebook presentation layer.</p></div>
        <div><div class="eyebrow">Book DNA</div><div class="theme-dna-compact">
          <div><b>${dna.adherence}%</b><span>Theme match</span></div>
          <div><b>${dna.semanticFeatures}</b><span>Semantic features</span></div>
          <div><b>${chapterOverrideCount}</b><span>Chapter overrides</span></div>
          <div><b>${paragraphOverrides}</b><span>Paragraph overrides</span></div>
          <div><b>${dna.outliers}</b><span>Formatting outliers</span></div>
        </div></div>
      </div>

      <div class="theme-scope-strip">
        <div class="active"><span>1</span><p><strong>Theme style</strong><small>${escapeHtml(studio.themeName)} · global baseline</small></p></div>
        <div class="${chapterOverrideCount ? 'modified' : ''}"><span>2</span><p><strong>Chapter override</strong><small>${chapterOverrideCount} intentional heading override${chapterOverrideCount === 1 ? '' : 's'}</small></p></div>
        <div class="${paragraphOverrides ? 'modified' : ''}"><span>3</span><p><strong>Paragraph override</strong><small>${paragraphOverrides} Preview Studio fix${paragraphOverrides === 1 ? '' : 'es'}</small></p></div>
      </div>

      <section class="theme-gallery-section">
        <div class="theme-section-head"><div><span class="eyebrow">Style Gallery</span><h4>Book families, not gimmick templates</h4></div><span class="mini-status good">8 families</span></div>
        <div class="theme-gallery-grid">${EBOOK_THEME_FAMILIES.map((theme) => `<article class="theme-family-card ${studio.themeId === theme.id ? 'selected' : ''}">
          <div><strong>${escapeHtml(theme.name)}${theme.private ? ' · PRIVATE' : ''}</strong><p>${escapeHtml(theme.description)}</p></div>
          <button class="btn ${studio.themeId === theme.id ? 'primary' : 'secondary'}" data-apply-ebook-theme="${escapeHtml(theme.id)}" type="button">${studio.themeId === theme.id ? 'Current theme' : 'Use family'}</button>
        </article>`).join('')}</div>
      </section>

      <div class="theme-builder-layout">
        <section class="theme-builder-controls">
          <div class="theme-section-head"><div><span class="eyebrow">Book Theme Builder</span><h4>Global visual language</h4></div><span class="mini-status good">Live sample</span></div>
          <div class="theme-control-group"><h5>Chapter Heading</h5><div class="semantic-style-controls">
            ${themeStudioSelect('themeChapterAlignment','Alignment',design.chapterTitleAlignment,['left','center','right'])}
            ${themeStudioNumber('themeChapterTop','Space before',design.chapterTopEm,{min:0,max:8,step:.1})}
            ${themeStudioNumber('themeChapterAfter','Space after',design.chapterAfterEm,{min:0,max:6,step:.1})}
            ${themeStudioNumber('themeChapterSize','Heading size',studio.chapterTitleSizeEm,{min:1.1,max:2.8,step:.05})}
            ${themeStudioNumber('themeChapterWeight','Weight',studio.chapterTitleWeight,{min:400,max:900,step:50,unit:''})}
            ${themeStudioNumber('themeChapterTracking','Letter spacing',studio.chapterTitleLetterSpacingEm,{min:0,max:.16,step:.005})}
            ${themeStudioSelect('themeChapterTransform','Capitalization',studio.chapterTitleTransform,[{value:'none',label:'As written'},{value:'uppercase',label:'UPPERCASE'},{value:'lowercase',label:'lowercase'}])}
            ${themeStudioSelect('themeChapterDivider','Divider / ornament',studio.chapterDivider,[{value:'none',label:'None'},{value:'line',label:'Fine line'},{value:'dots',label:'• • •'},{value:'diamond',label:'◆'},{value:'flourish',label:'✦'}])}
          </div><div class="theme-artwork-row"><input id="themeChapterArtworkInput" type="file" accept="image/jpeg,image/png,image/gif,image/svg+xml,image/webp" hidden><button class="btn secondary" id="chooseThemeChapterArtwork" type="button">${studio.chapterArtwork ? 'Replace heading artwork' : 'Add heading artwork'}</button>${studio.chapterArtwork ? `<button class="btn danger" data-remove-theme-artwork="chapter" type="button">Remove artwork</button><span>${escapeHtml(studio.chapterArtwork.fileName)}</span>` : '<span>Optional · packaged inside the EPUB</span>'}${themeStudioSelect('themeChapterArtworkPosition','Artwork position',studio.chapterArtworkPosition,[{value:'above',label:'Above heading'},{value:'below',label:'Below divider'}])}</div></div>

          <div class="theme-control-group"><h5>First Paragraph + Body</h5><div class="semantic-style-controls">
            ${themeStudioSelect('themeFirstParagraph','First paragraph',studio.firstParagraphTreatment,[{value:'flush',label:'Flush / clean'},{value:'small-caps',label:'Small-caps opening line'},{value:'drop-cap',label:'Drop cap'}])}
            ${themeStudioSelect('themeBodyFont','Body font behavior',design.fontFamily,[{value:'reader',label:'Reader controlled'},{value:'serif',label:'Serif preference'},{value:'sans',label:'Sans preference'}])}
            ${themeStudioNumber('themeLineHeight','Line height',design.lineHeight,{min:1,max:2.2,step:.02,unit:'×'})}
            ${themeStudioNumber('themeFirstIndent','Body first-line indent',design.firstLineIndentEm,{min:0,max:3,step:.05})}
            ${themeStudioNumber('themeParagraphGap','Paragraph spacing',design.paragraphGapEm,{min:0,max:2,step:.05})}
          </div></div>

          <div class="theme-control-group"><h5>Subhead + Quote + Note + Verse</h5><div class="semantic-style-controls">
            ${themeStudioSelect('themeSubheadAlignment','Subhead alignment',design.subheadAlignment,['left','center','right'])}
            ${themeStudioNumber('themeSubheadSize','Subhead size',design.subheadSizeEm,{min:.9,max:1.8,step:.05})}
            ${themeStudioSelect('themeBlockQuoteStyle','Block quote',design.blockQuoteStyle,[{value:'plain',label:'Clean indent'},{value:'italic',label:'Indented italic'}])}
            ${themeStudioNumber('themeBlockQuoteIndent','Quote indent',design.blockQuoteIndentEm,{min:0,max:3,step:.05})}
            ${themeStudioSelect('themeWrittenNoteStyle','Written note',design.writtenNoteStyle,[{value:'plain',label:'Plain text'},{value:'inset',label:'Inset note'}])}
            ${themeStudioNumber('themeVerseIndent','Verse indent',design.verseIndentEm,{min:0,max:3,step:.05})}
          </div></div>

          <div class="theme-control-group"><h5>Scene Break</h5><div class="semantic-style-controls">
            ${themeStudioSelect('themeSceneTreatment','Treatment',design.sceneBreakTreatment,[{value:'source',label:'Use source marks'},{value:'whitespace',label:'Whitespace only'},{value:'asterisks',label:'* * *'},{value:'dots',label:'• • •'},{value:'diamond',label:'◆'},{value:'flourish',label:'✦'},{value:'custom-text',label:'Custom glyph/text'},{value:'custom-image',label:'Custom artwork'}])}
            <label class="design-field"><span>Custom glyph / text</span><input id="themeSceneCustomText" maxlength="24" value="${escapeHtml(studio.sceneBreakCustomText)}" placeholder="✦"></label>
            ${themeStudioNumber('themeSceneSpace','Vertical spacing',design.sceneBreakSpaceEm,{min:0,max:4,step:.05})}
            ${themeStudioNumber('themeSceneArtworkWidth','Artwork width',studio.sceneBreakArtworkWidthEm,{min:1,max:10,step:.1})}
          </div><div class="theme-artwork-row"><input id="themeSceneArtworkInput" type="file" accept="image/jpeg,image/png,image/gif,image/svg+xml,image/webp" hidden><button class="btn secondary" id="chooseThemeSceneArtwork" type="button">${studio.sceneBreakArtwork ? 'Replace scene artwork' : 'Add scene artwork'}</button>${studio.sceneBreakArtwork ? `<button class="btn danger" data-remove-theme-artwork="scene-break" type="button">Remove artwork</button><span>${escapeHtml(studio.sceneBreakArtwork.fileName)}</span>` : '<span>Optional · used when Custom artwork is selected</span>'}</div></div>

          <div class="theme-control-group"><h5>Text Conversation + Contents</h5><div class="semantic-style-controls">
            ${themeStudioSelect('themeTextMessageStyle','Text conversation',design.textMessageStyle,[{value:'transcript',label:'Clean transcript'},{value:'bubbles',label:'Subtle bubbles'},{value:'left-right',label:'Left / right conversation'},{value:'compact',label:'Compact'},{value:'inset',label:'Readable inset'}])}
            ${themeStudioNumber('themeTextMessageIndent','Conversation indent',design.textMessageIndentEm,{min:0,max:4,step:.05})}
            ${themeStudioSelect('themeContentsStyle','Contents style',studio.contentsStyle,[{value:'clean',label:'Clean'},{value:'classic',label:'Classic'},{value:'dramatic',label:'Dramatic'}])}
            ${themeStudioSelect('themeContentsAlignment','Contents alignment',studio.contentsAlignment,[{value:'left',label:'Left'},{value:'center',label:'Centered'}])}
          </div></div>
          <div class="theme-save-row"><button class="btn primary" id="saveThemeStudio" type="button">Save Theme Studio</button><span>Updates presentation metadata only. Story Lock source text is untouched.</span></div>
        </section>

        <aside class="theme-builder-preview"><div class="theme-preview-head"><span>Representative chapter</span><b>${escapeHtml(studio.themeName)}</b></div>${renderThemeStudioSample(design, studio)}</aside>
      </div>

      <section class="theme-chapter-override-section">
        <div class="theme-section-head"><div><span class="eyebrow">Global → Chapter override</span><h4>Fine-tune one chapter without losing the theme</h4></div><span class="mini-status ${chapterOverrideCount ? 'needs' : 'good'}">${chapterOverrideCount} override${chapterOverrideCount === 1 ? '' : 's'}</span></div>
        ${selectedChapterBlock ? `<div class="theme-chapter-override-grid">
          <label class="design-field"><span>Chapter</span><select id="themeChapterOverrideSelect">${chapterSections.map((section, index) => {
            const titleBlock = (section.blocks || []).find((block) => block.kind === 'chapter-title');
            return titleBlock ? `<option value="${escapeHtml(titleBlock.id)}" ${titleBlock.id === selectedChapterBlock.id ? 'selected' : ''}>${escapeHtml(section.title || `Chapter ${index + 1}`)}</option>` : '';
          }).join('')}</select></label>
          ${themeStudioSelect('themeChapterOverrideAlignment','Alignment',chapterOverride.alignment || 'theme',[{value:'theme',label:'Theme'},{value:'left',label:'Left'},{value:'center',label:'Center'},{value:'right',label:'Right'}])}
          ${themeStudioNumber('themeChapterOverrideBefore','Space before',chapterOverride.spaceBefore ?? '',{min:0,max:8,step:.1})}
          ${themeStudioNumber('themeChapterOverrideAfter','Space after',chapterOverride.spaceAfter ?? '',{min:0,max:6,step:.1})}
          ${themeStudioNumber('themeChapterOverrideSize','Heading size',chapterOverride.sizeEm ?? '',{min:1.1,max:2.8,step:.05})}
          <div class="theme-chapter-actions"><button class="btn secondary" id="saveThemeChapterOverride" type="button">Save chapter override</button><button class="btn ghost" id="resetThemeChapterOverride" type="button" ${chapterOverrideCount ? '' : 'disabled'}>Reset chapter</button></div>
        </div>` : '<div class="notice info">No chapter headings were detected in this project.</div>'}
      </section>

      <section class="theme-mapper-section">
        <div class="theme-section-head"><div><span class="eyebrow">Smart Word Style Mapper</span><h4>See what YasReady inferred before it becomes presentation</h4></div><span class="mini-status good">${sourceStyles.length} source styles</span></div>
        <div class="theme-mapper-table">${sourceStyles.slice(0, 36).map((record) => {
          const inferred = inferSourceStyleRole(record.name, record.sample);
          const stored = studio.sourceStyleMap?.[record.name];
          const effective = stored || (['body','subhead','block-quote','written-note','verse','text-message','scene-break'].includes(inferred) ? inferred : 'auto');
          return `<div class="theme-mapper-row"><div><strong>${escapeHtml(record.name)}</strong><small>${record.count} block${record.count === 1 ? '' : 's'} · ${escapeHtml(record.sample || 'No text sample')}</small></div><span class="theme-inference">${escapeHtml(inferred === 'chapter-heading' ? 'Chapter structure' : inferred === 'review' ? 'Review' : EBOOK_THEME_STUDIO_LABELS[inferred] || inferred)}</span><select data-theme-word-style="${escapeHtml(record.name)}">${mappedOptions.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === effective ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></div>`;
        }).join('') || '<div class="notice info">No named Word styles were found. YasReady will continue using source structure and semantic pattern detection.</div>'}</div>
        <div class="theme-save-row"><button class="btn secondary" id="saveThemeWordMap" type="button">Save Word style map</button><span>Unknown or unusual styles stay visible instead of being silently guessed.</span></div>
      </section>

      <section class="theme-usage-section">
        <div class="theme-section-head"><div><span class="eyebrow">Show me every place using this style</span><h4>Whole-book semantic review</h4></div>${themeStudioSelect('themeUsageRole','Style',usageRole,EBOOK_THEME_STUDIO_ROLES.map((role) => ({ value:role, label:EBOOK_THEME_STUDIO_LABELS[role] })))}</div>
        <div class="theme-usage-list">${usage.length ? usage.slice(0, 120).map((item) => `<button type="button" class="theme-usage-row" data-theme-usage-section="${item.sectionIndex}" data-theme-usage-block="${escapeHtml(item.blockId)}"><span>${item.chapter ? `CH ${item.chapter}` : 'BOOK'}</span><div><strong>${escapeHtml(EBOOK_THEME_STUDIO_LABELS[item.role] || item.role)}</strong><small>${escapeHtml(item.snippet || '[blank]')}</small></div><b>Open →</b></button>`).join('') : `<div class="theme-usage-empty">No ${escapeHtml(EBOOK_THEME_STUDIO_LABELS[usageRole] || usageRole)} blocks are currently detected.</div>`}</div>
      </section>
    </div>
  </details>`;
}

function renderEbook() {
  const project = state.project;
  ensurePresentationOverrides(project);
  const design = currentEbookDesign();
  const report = runEpubPreflight({ project, storyLockOk: project.storyLock?.status === 'verified' });
  const quality = currentKindleQuality(project);
  const intelligence = currentKindleIntelligence(project);
  const kindleReady = report.ready && quality.ready && intelligence.ready;
  const flow = buildKindleProductionFlow({ project, report, quality, intelligence });
  const releaseGate = buildKindleReleaseGate({ project, report, quality, intelligence, flow });
  const preview = buildEbookPreviewHtml({ project, sectionIndex: state.ebookSectionIndex, inspectMode: state.kindlePreview.mode === 'adjust' });
  state.ebookSectionIndex = preview.index;
  const cover = getEbookCover(project);
  const sectionRows = preview.sections.map((section, index) => {
    const badge = section.type === 'cover' ? 'CV' : section.type === 'chapter' ? 'CH' : section.type === 'front' ? 'FR' : section.type === 'back' ? 'BK' : 'TOC';
    const detail = section.type === 'cover'
      ? 'Live preview · packaged as EPUB cover-image'
      : section.synthetic
        ? 'Generated linked Contents · no page numbers'
        : `${formatNumber(section.wordCount)} words · source ${section.startBlockIndex + 1}–${section.endBlockIndex + 1}`;
    return `
    <button class="ebook-toc-row ${index === preview.index ? 'active' : ''}" data-ebook-section="${index}" data-ebook-title="${escapeHtml(String(section.title || '').toLowerCase())}">
      <span>${badge}</span>
      <div><strong>${escapeHtml(section.title)}</strong><small>${escapeHtml(detail)}</small></div>
    </button>`;
  }).join('');

  const coverSummary = cover
    ? `<div class="ebook-cover-current"><img src="${escapeHtml(cover.dataUrl)}" alt="Ebook cover preview"><div><strong>${escapeHtml(cover.fileName)}</strong><small>${cover.width} × ${cover.height}px · ${formatBytes(cover.fileSize)}</small></div></div>`
    : `<div class="ebook-cover-empty"><div class="ebook-cover-placeholder">e</div><div><strong>Add the Kindle cover</strong><small>Front cover only · JPEG or PNG · stored outside Story Lock</small></div></div>`;

  const checkById = (id) => report.checks.find((item) => item.id === id);
  const coverReady = checkById('cover')?.status === 'pass';
  const printParked = !project.editions?.paperback?.enabled && !project.editions?.hardcover?.enabled;
  const overrideCount = countPresentationOverrides(project, 'ebook');
  const semanticCounts = semanticRoleCounts(project, preview.sourceSections);
  const noteCount = (project.manuscript?.notes || []).length;
  const mediaCount = (project.manuscript?.media || []).length;

  return `
    <article class="panel ebook-panel ebook-studio">
      <div class="ebook-studio-top">
        <div class="ebook-studio-title">
          <span class="badge ${kindleReady ? 'good' : 'bad'}">${kindleReady ? 'KDP EPUB READY' : 'KINDLE SETUP'}</span>
          <h2>Kindle / eBook</h2>
          <div class="ebook-platform-line">Amazon KDP · Reflowable EPUB 3</div>
          <p>One Story-Locked manuscript → one clean reflowable EPUB for Amazon KDP. Preview it, tune presentation safely, then export.</p>
        </div>
        <div class="ebook-top-actions">
          <button class="btn secondary" id="focusEbookOnly" type="button" ${printParked ? 'disabled' : ''}>${printParked ? 'Print editions parked' : 'Focus on ebook'}</button>
          <button class="btn secondary" data-go-view="import" type="button">Book metadata</button>
        </div>
      </div>

      ${state.ebookMessage ? `<div class="notice info ebook-message">${escapeHtml(state.ebookMessage)}</div>` : ''}
      ${report.placeholders?.length ? `<div class="notice error ebook-message"><strong>Source cleanup needed before final EPUB:</strong> ${escapeHtml(report.placeholders.map((item) => item.text).join(', '))}. YasReady will preview these words but will not silently remove them from the Story-Locked manuscript.</div>` : ''}

      ${renderKindleProductionConsole(flow, preview, kindleReady)}

      ${renderKindleReleaseGate(releaseGate, flow)}

      ${renderThemeStudio(project, design, preview, intelligence)}

      <details class="kindle-health-details" id="kindleHealthDetails" ${flow.blockers.length || flow.reviews.length ? 'open' : ''}>
        <summary><span><strong>Book Health & Intelligence</strong><small>${quality.score}/100 quality · ${flow.stats.reviews} active review · ${flow.stats.acknowledged} intentional · ${intelligence.summary.autoFixable} safe fixes</small></span><b>⌄</b></summary>
        <div class="kindle-health-body">
          ${renderKindleQualityPanel(quality, preview)}
          ${renderKindleIntelligencePanel(intelligence, preview)}
        </div>
      </details>

      <div class="ebook-setup-grid-v107">
        <section class="ebook-setup-card ebook-cover-card" id="kindleCoverSetup">
          <div class="ebook-card-head"><div><div class="eyebrow">Cover</div><h3>Kindle cover</h3></div><span class="mini-status ${coverReady ? 'good' : 'needs'}">${coverReady ? 'Ready' : 'Needed'}</span></div>
          ${coverSummary}
          <div class="ebook-cover-actions"><input id="ebookCoverInput" type="file" accept="image/jpeg,image/png" hidden><button class="btn secondary" id="chooseEbookCover" type="button">${cover ? 'Replace cover' : 'Choose cover'}</button>${cover ? '<button class="btn danger" id="removeEbookCover" type="button">Remove</button>' : ''}</div>
          <p class="ebook-helper">The cover now appears as item 1 in Preview Studio, while the EPUB still packages it correctly as one cover-image without a duplicate HTML cover page.</p>
        </section>

        <section class="ebook-setup-card ebook-core-card">
          <div class="ebook-card-head"><div><div class="eyebrow">Essentials</div><h3>Kindle setup</h3></div><span class="mini-status good">Smart defaults</span></div>
          <div class="ebook-core-fields">
            <label class="design-field"><span>Language</span><input id="ebookLanguage" value="${escapeHtml(design.language)}" placeholder="en"></label>
            <label class="design-field"><span>Publisher / imprint</span><input id="ebookPublisher" value="${escapeHtml(design.publisher)}" placeholder="3Dudes1Life Creative"></label>
          </div>
          <div class="ebook-smart-defaults">
            <div><span>✓</span><p><strong>Visible Contents</strong><small>Placed before Chapter 1</small></p></div>
            <div><span>✓</span><p><strong>Kindle Go To TOC</strong><small>All ${report.chapterEntries} chapters linked</small></p></div>
            <div><span>✓</span><p><strong>Clean front matter</strong><small>Print-only blank spacing removed</small></p></div>
            <div><span>✓</span><p><strong>Reader-controlled text</strong><small>No forced body size or line height</small></p></div>
          </div>
          <button class="btn primary" id="saveEbookSettings" type="button">Save & Refresh Preview</button>
        </section>
      </div>

      <section class="kindle-style-palette">
        <div class="kindle-style-palette-head">
          <div><div class="eyebrow">Kindle feature parity</div><h3>Semantic Style Palette</h3><p>YasReady recognizes fiction-specific elements and gives them Kindle-safe structure without changing a single source word. Auto uses Word styles and source patterns; Preview Studio can override one block safely.</p></div>
          <span class="mini-status good">Story Lock safe</span>
        </div>
        <div class="semantic-count-grid">
          <div><b>${semanticCounts.subhead}</b><span>Subheads</span></div>
          <div><b>${semanticCounts['block-quote']}</b><span>Block quotes</span></div>
          <div><b>${semanticCounts['written-note']}</b><span>Notes / letters</span></div>
          <div><b>${semanticCounts.verse}</b><span>Verse</span></div>
          <div><b>${semanticCounts['text-message']}</b><span>Text messages</span></div>
          <div><b>${semanticCounts['scene-break']}</b><span>Scene breaks</span></div>
          <div><b>${noteCount}</b><span>Foot/endnotes</span></div>
          <div><b>${mediaCount}</b><span>Inline images</span></div>
        </div>
        <div class="semantic-style-controls">
          <label class="design-field"><span>Subhead alignment</span><select id="ebookSubheadAlignment"><option value="left" ${design.subheadAlignment === 'left' ? 'selected' : ''}>Left</option><option value="center" ${design.subheadAlignment === 'center' ? 'selected' : ''}>Center</option><option value="right" ${design.subheadAlignment === 'right' ? 'selected' : ''}>Right</option></select></label>
          <label class="design-field"><span>Subhead size</span><div class="number-wrap"><input id="ebookSubheadSize" type="number" min="0.9" max="1.8" step="0.05" value="${design.subheadSizeEm}"><em>em</em></div></label>
          <label class="design-field"><span>Block quotes</span><select id="ebookBlockQuoteStyle"><option value="plain" ${design.blockQuoteStyle === 'plain' ? 'selected' : ''}>Clean indent</option><option value="italic" ${design.blockQuoteStyle === 'italic' ? 'selected' : ''}>Indented italic</option></select></label>
          <label class="design-field"><span>Block quote indent</span><div class="number-wrap"><input id="ebookBlockQuoteIndent" type="number" min="0" max="3" step="0.05" value="${design.blockQuoteIndentEm}"><em>em</em></div></label>
          <label class="design-field"><span>Written notes</span><select id="ebookWrittenNoteStyle"><option value="inset" ${design.writtenNoteStyle === 'inset' ? 'selected' : ''}>Inset note</option><option value="plain" ${design.writtenNoteStyle === 'plain' ? 'selected' : ''}>Plain text</option></select></label>
          <label class="design-field"><span>Text conversations</span><select id="ebookTextMessageStyle"><option value="transcript" ${design.textMessageStyle === 'transcript' ? 'selected' : ''}>Clean transcript</option><option value="bubbles" ${design.textMessageStyle === 'bubbles' ? 'selected' : ''}>Subtle bubbles</option><option value="left-right" ${design.textMessageStyle === 'left-right' ? 'selected' : ''}>Left / right</option><option value="inset" ${design.textMessageStyle === 'inset' ? 'selected' : ''}>Readable inset</option><option value="compact" ${design.textMessageStyle === 'compact' ? 'selected' : ''}>Compact</option></select></label>
          <label class="design-field"><span>Text conversation indent</span><div class="number-wrap"><input id="ebookTextMessageIndent" type="number" min="0" max="4" step="0.05" value="${design.textMessageIndentEm}"><em>em</em></div></label>
          <label class="design-field"><span>Scene-break ornament</span><select id="ebookSceneBreakTreatment"><option value="source" ${design.sceneBreakTreatment === 'source' ? 'selected' : ''}>Use source marks</option><option value="whitespace" ${design.sceneBreakTreatment === 'whitespace' ? 'selected' : ''}>Whitespace only</option><option value="asterisks" ${design.sceneBreakTreatment === 'asterisks' ? 'selected' : ''}>* * *</option><option value="dots" ${design.sceneBreakTreatment === 'dots' ? 'selected' : ''}>• • •</option><option value="diamond" ${design.sceneBreakTreatment === 'diamond' ? 'selected' : ''}>◆</option><option value="flourish" ${design.sceneBreakTreatment === 'flourish' ? 'selected' : ''}>✦</option><option value="custom-text" ${design.sceneBreakTreatment === 'custom-text' ? 'selected' : ''}>Custom glyph / text</option><option value="custom-image" ${design.sceneBreakTreatment === 'custom-image' ? 'selected' : ''}>Custom artwork</option></select></label>
          <label class="design-field"><span>Verse indent</span><div class="number-wrap"><input id="ebookVerseIndent" type="number" min="0" max="3" step="0.05" value="${design.verseIndentEm}"><em>em</em></div></label>
        </div>
        <div class="semantic-style-foot"><p><strong>Tip:</strong> In Adjust Layout, select a paragraph and change <strong>Content style</strong> to Subhead, Block Quote, Written Note, Verse, Text Conversation, or Scene Break. That choice is edition presentation metadata only.</p><button class="btn primary" id="saveEbookSemanticStyles" type="button">Save Style Palette</button></div>
      </section>

      <div class="ebook-device-card">
        <div><div class="eyebrow">Device proof</div><h3>Read it on your iPhone or iPad before export</h3><p>Creates a standalone, read-only Kindle-style proof with the cover, Contents, front matter, and every chapter. Nothing is uploaded by YasReady.</p>${state.devicePreviewMessage ? `<small>${escapeHtml(state.devicePreviewMessage)}</small>` : ''}</div>
        <div class="ebook-device-actions"><button class="btn primary" id="shareDevicePreview" type="button">Preview on iPhone / iPad</button><button class="btn secondary" id="downloadDevicePreview" type="button">Download device proof</button></div>
      </div>

      <details class="ebook-advanced">
        <summary><span><strong>Advanced typography</strong><small>Tres Amigos defaults are already loaded. Change these only if the preview needs it.</small></span><b>⌄</b></summary>
        <div class="ebook-settings-grid ebook-settings-advanced">
          <label class="design-field"><span>First-line indent</span><div class="number-wrap"><input id="ebookFirstIndent" type="number" min="0" max="3" step="0.05" value="${design.firstLineIndentEm}"><em>em</em></div></label>
          <label class="design-field"><span>Paragraph spacing</span><div class="number-wrap"><input id="ebookParagraphGap" type="number" min="0" max="2" step="0.05" value="${design.paragraphGapEm}"><em>em</em></div></label>
          <label class="design-field"><span>Chapter blank lines</span><select id="ebookBodyBlankPolicy"><option value="collapse" ${design.bodyBlankPolicy === 'collapse' ? 'selected' : ''}>Collapse source blank lines</option><option value="normalize" ${design.bodyBlankPolicy === 'normalize' ? 'selected' : ''}>One spacer per blank run</option><option value="preserve" ${design.bodyBlankPolicy === 'preserve' ? 'selected' : ''}>Preserve every source blank line</option></select></label>
          <label class="design-field"><span>Normalized blank space</span><div class="number-wrap"><input id="ebookBodyBlankSpace" type="number" min="0" max="2" step="0.05" value="${design.bodyBlankSpaceEm}"><em>em</em></div></label>
          <label class="design-field"><span>Chapter title alignment</span><select id="ebookChapterAlignment"><option value="left" ${design.chapterTitleAlignment === 'left' ? 'selected' : ''}>Left</option><option value="center" ${design.chapterTitleAlignment === 'center' ? 'selected' : ''}>Center</option><option value="right" ${design.chapterTitleAlignment === 'right' ? 'selected' : ''}>Right</option></select></label>
        </div>
      </details>

      <div class="ebook-summary-grid">
        <div><b>${preview.sections.length}</b><span>Preview items</span></div>
        <div><b>${report.chapterEntries}</b><span>Chapter links</span></div>
        <div><b>${report.tocEntries}</b><span>TOC links</span></div>
        <div><b>${overrideCount}</b><span>Custom format fixes</span></div>
      </div>
    </article>

    <article class="panel ebook-workbench-panel kindle-preview-studio-v110" id="ebookPreviewStudio">
      <div class="kindle-studio-head">
        <div><div class="eyebrow">Kindle Preview Studio · Production Workbench</div><h2>${escapeHtml(preview.section.title)}</h2><p>Read, inspect, and polish the same reflowable XHTML/CSS source used by the final EPUB. Use ⌘K to jump chapters, E to toggle Edit/Read, and Option+←/→ to move through the book.</p></div>
        <span class="kindle-studio-position">${preview.index + 1} / ${preview.sections.length}</span>
      </div>
      ${renderKindlePreviewToolbar(state.kindlePreview, preview)}
      <div class="kindle-studio-status ${state.kindlePreview.mode === 'adjust' ? 'adjust' : 'read'}"><strong>${state.kindlePreview.mode === 'adjust' ? 'Adjust Layout' : 'Read Mode'}</strong><span>${state.kindlePreview.mode === 'adjust' ? 'Click a paragraph or heading. Changes preview instantly and save as presentation metadata only.' : 'No selection boxes. Read the book like a customer, then switch to Adjust Layout only when something needs work.'}</span></div>
      <div class="preview-studio-grid-v110 ${state.kindlePreview.mode === 'adjust' ? 'is-adjusting' : 'is-reading'} ${state.kindleFocusPreview ? 'focus-preview' : ''}">
        <aside class="ebook-toc preview-pane-column"><div class="ebook-toc-head ebook-toc-head-v114"><div><strong>Reading Order</strong><span>${preview.sections.length} items</span></div><label><span class="sr-only">Search reading order</span><input id="ebookNavigatorSearch" type="search" placeholder="Jump to chapter… ⌘K" value="${escapeHtml(state.ebookNavigatorSearch)}"></label></div><div class="ebook-toc-list">${sectionRows}</div></aside>
        ${state.kindleQaMatrix ? renderKindleQaMatrix(preview, state.kindlePreview) : renderKindleSimulatorFrame(preview, state.kindlePreview)}
        <div id="ebookInspectorSlot" class="preview-pane-column inspector-column">${state.kindleQaMatrix ? `<aside class="ebook-format-inspector read-mode"><div class="inspector-head"><div><div class="eyebrow">QA Matrix</div><h3>Read-only stress test</h3></div><span class="mini-status good">3 views</span></div><div class="inspector-empty-icon">3×</div><strong>Compare before you adjust.</strong><p>Small phone, normal Kindle, and large tablet views render the same section at once. Return to Single Preview to make formatting changes.</p><button class="btn primary" id="exitKindleQaMatrix" type="button">Return to Single Preview</button></aside>` : renderEbookInspector(project, design)}</div>
      </div>
    </article>

    <article class="panel ebook-preflight-panel" id="kindlePreflight">
      <div class="panel-head"><div><span class="badge ${report.ready ? 'good' : 'bad'}">${report.ready ? 'KDP CHECK PASSED' : 'KDP CHECK NEEDS WORK'}</span><h2>Kindle preflight</h2><p>${escapeHtml(report.kdp.message)} This is the technical gate before the EPUB download is enabled.</p></div><button class="btn secondary" id="downloadEpubPreflight" type="button">Download Preflight Report</button></div>
      <div class="preflight-list ebook-preflight">${report.checks.map(renderPreflightCheck).join('')}</div>
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



async function updateEditionEnabled(type, enabled) {
  if (!state.project) return;
  ensureEditions(state.project);
  setEditionEnabled(state.project, type, enabled);
  if (type === 'paperback' || type === 'hardcover') {
    const anyPrint = state.project.editions.paperback.enabled || state.project.editions.hardcover.enabled;
    if (enabled) {
      state.printEdition = type;
      setActivePrintEdition(state.project, type);
    } else if (anyPrint) {
      state.printEdition = state.project.editions.activePrint;
    }
    state.preview = null;
    state.spreadIndex = 0;
  }
  state.finalCheck = null;
  state.project.updatedAt = new Date().toISOString();
  state.editionMessage = `${editionLabel(type)} ${enabled ? 'enabled' : 'disabled'}. The master manuscript and Story Lock were not changed.`;
  await saveProject(state.project);
  state.projects = await listProjects();
  updateMain();
}

async function workOnPrintEdition(type) {
  if (!state.project) return;
  ensureEditions(state.project);
  if (!state.project.editions[type]?.enabled) return;
  setActivePrintEdition(state.project, type);
  state.printEdition = type;
  state.preview = null;
  state.spreadIndex = 0;
  state.finalCheck = null;
  state.editionMessage = `Now working on ${editionLabel(type)}. Its page count, TOC numbers, gutters, and PDF are independent.`;
  state.project.updatedAt = new Date().toISOString();
  await saveProject(state.project);
  state.activeView = 'design';
  updateMain();
}

async function copyPaperbackIntoHardcover() {
  if (!state.project) return;
  ensureEditions(state.project);
  copyPaperbackDesignToHardcover(state.project);
  state.project.updatedAt = new Date().toISOString();
  state.preview = null;
  state.finalCheck = null;
  state.editionMessage = 'Hardcover enabled and given a copy of the paperback design. Pagination remains independent.';
  await saveProject(state.project);
  state.projects = await listProjects();
  updateMain();
}

function renderEditions() {
  ensureEditions(state.project);
  const editions = state.project.editions;
  const active = currentPrintEditionType();
  const card = (type, icon, copy) => {
    const edition = editions[type];
    const print = type !== 'ebook';
    const pageCount = print ? edition.lastPageCount : null;
    const activeClass = print && active === type ? ' active' : '';
    return `<section class="edition-card${activeClass}">
      <div class="edition-card-head"><span class="edition-icon">${icon}</span><div><h3>${escapeHtml(editionLabel(type))}</h3><p>${escapeHtml(copy)}</p></div><label class="edition-toggle"><input type="checkbox" data-edition-enabled="${type}" ${edition.enabled ? 'checked' : ''}><span>${edition.enabled ? 'ON' : 'OFF'}</span></label></div>
      <div class="edition-card-meta">${print ? `<span>${edition.design.trimWidth}×${edition.design.trimHeight} in</span><span>${pageCount ? `${formatNumber(pageCount)} last proof pages` : 'No current proof'}</span><span>${edition.lastPreflight?.ready ? '✓ Last final check passed' : edition.lastPreflight ? '⚠ Last final check needs work' : 'Not final-checked'}</span>` : `<span>Reflowable EPUB 3</span><span>No fixed print pages</span><span>${edition.lastPreflight?.ready ? '✓ Last final check passed' : edition.lastPreflight ? '⚠ Last final check needs work' : 'Not final-checked'}</span>`}</div>
      <div class="edition-card-actions">${print ? `<button class="btn ${active === type ? 'primary' : 'secondary'}" data-work-edition="${type}" ${edition.enabled ? '' : 'disabled'}>${active === type ? 'Working on this edition' : `Work on ${escapeHtml(editionLabel(type))}`}</button>` : `<button class="btn secondary" data-go-view="ebook" ${edition.enabled ? '' : 'disabled'}>Open Ebook / Kindle</button>`}</div>
    </section>`;
  };
  return `
    <article class="panel">
      <div class="panel-head"><div><span class="badge good">One Story Lock · separate outputs</span><h2>Editions</h2><p>Create only the formats you need. Paperback, hardcover, and ebook share one locked manuscript but keep independent production settings and pagination.</p></div></div>
      ${state.editionMessage ? `<div class="notice success">${escapeHtml(state.editionMessage)}</div>` : ''}
      <div class="edition-grid">
        ${card('paperback', 'P', 'Independent paperback trim, gutter, Contents page numbers, folios, and final PDF.')}
        ${card('hardcover', 'H', 'Independent hardcover geometry and pagination. It never reuses paperback page numbers.')}
        ${card('ebook', 'e', 'Reflowable Kindle/EPUB output with clickable navigation and no fixed print folios.')}
      </div>
      <div class="edition-tools">
        <div><strong>Make hardcover look like paperback without sharing pagination</strong><p>Copies only the current paperback design choices into Hardcover, then Hardcover repaginates independently.</p></div>
        <button class="btn secondary" id="copyPaperbackToHardcover" type="button">Create / Reset Hardcover from Paperback</button>
      </div>
      <div class="notice info"><strong>Important:</strong> edition settings live beside the manuscript, not inside it. Switching formats can change trim, gutter, blank pages, TOC page numbers, and final page count without changing one character of Story Lock.</div>
    </article>`;
}

function renderLibrary() {
  return `
    <article class="panel">
      <div class="panel-head"><div><div class="eyebrow">Local projects</div><h2>Library</h2><p>Projects autosave in this browser. Version 1.0 also supports portable recovery backups that are Story-Lock verified before restore.</p></div><div class="library-actions"><button class="btn secondary" id="restoreBackupButton" type="button">Restore Backup</button><button class="btn primary" id="libraryImport" type="button">New project</button><input id="restoreBackupInput" type="file" accept=".json,.yasready-project.json,application/json" hidden></div></div>
      ${state.backupMessage ? `<div class="notice ${state.backupMessage.includes('blocked') || state.backupMessage.includes('not a') ? 'error' : 'success'}">${escapeHtml(state.backupMessage)}</div>` : ''}
      ${state.projects.length ? `<div class="project-list">${state.projects.map((raw) => { const p = migrateProject(raw); return `
        <div class="project-row">
          <div><strong>${escapeHtml(p.title)}</strong><span>${escapeHtml(p.source.fileName)} · ${effectiveStats(p).chapters} chapters · ${formatNumber(effectiveStats(p).words)} words · Updated ${new Date(p.updatedAt).toLocaleString()}</span></div>
          <div class="project-actions"><button class="btn secondary" data-open-project="${p.id}" type="button">Open</button><button class="btn danger" data-delete-project="${p.id}" type="button">Delete</button></div>
        </div>`; }).join('')}</div>` : `<div class="empty-project"><h3>No saved projects yet</h3><p>Import a DOCX or restore a private YasReady project backup.</p></div>`}
    </article>`;
}

function updateMain() {
  const main = document.querySelector('#mainView');
  if (main) main.innerHTML = renderMain();
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.outerHTML = renderSidebar();
  bindEvents();
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
    state.project = null; state.preview = null; state.ebookSectionIndex = 0; state.selectedEbookBlockId = ''; state.inspectorMessage = ''; state.ebookMessage = ''; state.ebookUndoStack = []; state.ebookRedoStack = []; state.ebookHistoryArmed = false; state.kindleQaMatrix = false; state.kindleQualityCache = null; state.kindleQualityKey = ''; state.kindleIntelligenceCache = null; state.kindleIntelligenceKey = ''; state.kindleIntelligenceMessage = ''; state.compareChapterA = 0; state.compareChapterB = 1; state.ebookNavigatorSearch = ''; state.polishQueueIndex = 0; state.kindleFocusPreview = false; state.finalCheck = null; state.backupMessage = ''; state.activeView = 'import'; state.error = ''; renderShell();
  });
  document.querySelector('#libraryImport')?.addEventListener('click', () => {
    state.project = null; state.preview = null; state.ebookSectionIndex = 0; state.selectedEbookBlockId = ''; state.inspectorMessage = ''; state.ebookMessage = ''; state.ebookUndoStack = []; state.ebookRedoStack = []; state.ebookHistoryArmed = false; state.kindleQaMatrix = false; state.kindleQualityCache = null; state.kindleQualityKey = ''; state.kindleIntelligenceCache = null; state.kindleIntelligenceKey = ''; state.kindleIntelligenceMessage = ''; state.compareChapterA = 0; state.compareChapterB = 1; state.ebookNavigatorSearch = ''; state.polishQueueIndex = 0; state.kindleFocusPreview = false; state.finalCheck = null; state.backupMessage = ''; state.activeView = 'import'; state.error = ''; renderShell();
  });
  document.querySelector('#saveMetadata')?.addEventListener('click', saveProjectMetadata);
  document.querySelector('#verifyLock')?.addEventListener('click', verifyLock);
  document.querySelector('#runFinalCheck')?.addEventListener('click', runFinalCheck);
  document.querySelector('#runFinalCheckAgain')?.addEventListener('click', runFinalCheck);
  document.querySelector('#backupProject')?.addEventListener('click', backupCurrentProject);
  document.querySelector('#restoreBackupButton')?.addEventListener('click', () => document.querySelector('#restoreBackupInput')?.click());
  document.querySelector('#restoreBackupInput')?.addEventListener('change', (event) => event.target.files?.[0] && restoreProjectBackup(event.target.files[0]));
  document.querySelector('#saveDesign')?.addEventListener('click', saveDesign);
  document.querySelector('#copyPaperbackToHardcover')?.addEventListener('click', copyPaperbackIntoHardcover);
  document.querySelectorAll('[data-edition-enabled]').forEach((input) => input.addEventListener('change', () => updateEditionEnabled(input.dataset.editionEnabled, input.checked)));
  document.querySelectorAll('[data-work-edition]').forEach((button) => button.addEventListener('click', () => workOnPrintEdition(button.dataset.workEdition)));
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
  document.querySelector('#createPaperbackPdf')?.addEventListener('click', createPaperbackPdf);
  document.querySelector('#openPrintMaster')?.addEventListener('click', openPrintMaster);
  document.querySelector('#downloadPrintMaster')?.addEventListener('click', downloadPrintMaster);
  document.querySelector('#downloadPreflightReport')?.addEventListener('click', downloadPreflightReport);
  document.querySelector('#saveEbookSettings')?.addEventListener('click', saveEbookSettings);
  document.querySelector('#saveEbookSemanticStyles')?.addEventListener('click', saveEbookSettings);
  document.querySelector('#saveThemeStudio')?.addEventListener('click', saveThemeStudio);
  document.querySelectorAll('[data-apply-ebook-theme]').forEach((button) => button.addEventListener('click', () => applyEbookTheme(button.dataset.applyEbookTheme)));
  document.querySelector('#saveThemeWordMap')?.addEventListener('click', saveThemeWordMap);
  document.querySelector('#saveThemeChapterOverride')?.addEventListener('click', saveThemeChapterOverride);
  document.querySelector('#resetThemeChapterOverride')?.addEventListener('click', resetThemeChapterOverride);
  document.querySelector('#themeChapterOverrideSelect')?.addEventListener('change', (event) => { state.themeSelectedChapterBlockId = event.target.value || ''; updateMain(); });
  document.querySelector('#chooseThemeChapterArtwork')?.addEventListener('click', () => document.querySelector('#themeChapterArtworkInput')?.click());
  document.querySelector('#themeChapterArtworkInput')?.addEventListener('change', (event) => event.target.files?.[0] && importThemeArtwork(event.target.files[0], 'chapter'));
  document.querySelector('#chooseThemeSceneArtwork')?.addEventListener('click', () => document.querySelector('#themeSceneArtworkInput')?.click());
  document.querySelector('#themeSceneArtworkInput')?.addEventListener('change', (event) => event.target.files?.[0] && importThemeArtwork(event.target.files[0], 'scene-break'));
  document.querySelectorAll('[data-remove-theme-artwork]').forEach((button) => button.addEventListener('click', () => removeThemeArtwork(button.dataset.removeThemeArtwork)));
  document.querySelector('#themeUsageRole')?.addEventListener('change', (event) => { state.themeUsageRole = event.target.value || 'text-message'; updateMain(); });
  document.querySelectorAll('[data-theme-usage-section]').forEach((button) => button.addEventListener('click', () => {
    const index = Number(button.dataset.themeUsageSection);
    if (!Number.isFinite(index) || index < 0) return;
    state.ebookSectionIndex = index;
    state.selectedEbookBlockId = button.dataset.themeUsageBlock || '';
    state.kindlePreview = normalizeKindlePreview({ ...state.kindlePreview, mode:'adjust' });
    updateMain();
    requestAnimationFrame(() => document.querySelector('#ebookPreviewStudio')?.scrollIntoView({ behavior:'smooth', block:'start' }));
  }));
  document.querySelector('#themeStudio')?.addEventListener('input', (event) => { if (!event.target.matches('[data-theme-word-style]')) refreshThemeStudioLiveSample(); });
  document.querySelector('#themeStudio')?.addEventListener('change', (event) => { if (!event.target.matches('#themeUsageRole,#themeChapterOverrideSelect,[data-theme-word-style]')) refreshThemeStudioLiveSample(); });
  document.querySelector('#jumpEbookPreviewStudio')?.addEventListener('click', () => document.querySelector('#ebookPreviewStudio')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  document.querySelector('#kindleNextBestAction')?.addEventListener('click', performKindleNextBestAction);
  document.querySelector('#applyKindleSafeFixBatch')?.addEventListener('click', applyKindleSafeFixesBatch);
  document.querySelector('#markKindleBatchIntentional')?.addEventListener('click', markKindleReviewsIntentionalBatch);
  document.querySelector('#markKindleVisualProof')?.addEventListener('click', completeKindleVisualProof);
  document.querySelector('#freezeKindleRelease')?.addEventListener('click', freezeCurrentKindleRelease);
  document.querySelector('#downloadKindleReleaseReport')?.addEventListener('click', downloadKindleReleaseReport);
  document.querySelector('#toggleKindleFocusPreview')?.addEventListener('click', toggleKindleFocusPreview);
  document.querySelector('#focusEbookOnly')?.addEventListener('click', focusEbookOnly);
  document.querySelector('#chooseEbookCover')?.addEventListener('click', () => document.querySelector('#ebookCoverInput')?.click());
  document.querySelector('#ebookCoverInput')?.addEventListener('change', (event) => event.target.files?.[0] && importEbookCover(event.target.files[0]));
  document.querySelector('#removeEbookCover')?.addEventListener('click', removeEbookCover);
  document.querySelector('#downloadEpub')?.addEventListener('click', downloadEpub);
  document.querySelector('#downloadEpubPreflight')?.addEventListener('click', downloadEpubPreflight);
  document.querySelector('#shareDevicePreview')?.addEventListener('click', shareDevicePreview);
  document.querySelector('#downloadDevicePreview')?.addEventListener('click', downloadDevicePreview);
  document.querySelector('#toggleKindleQaMatrix')?.addEventListener('click', () => { state.kindleQaMatrix = !state.kindleQaMatrix; if (state.kindleQaMatrix) state.kindlePreview = normalizeKindlePreview({ ...state.kindlePreview, mode: 'read' }); updateMain(); });
  document.querySelector('#exitKindleQaMatrix')?.addEventListener('click', () => { state.kindleQaMatrix = false; updateMain(); });
  document.querySelectorAll('[data-quality-section]').forEach((button) => button.addEventListener('click', () => { const index = Number(button.dataset.qualitySection); if (Number.isFinite(index)) jumpToKindleQualityIssue(index, button.dataset.qualityBlock || ''); }));
  document.querySelectorAll('[data-intelligence-section]').forEach((button) => button.addEventListener('click', () => { const index = Number(button.dataset.intelligenceSection); if (Number.isFinite(index)) jumpToKindleIntelligenceIssue(index, button.dataset.intelligenceBlock || ''); }));
  document.querySelectorAll('[data-intelligence-fix]').forEach((button) => button.addEventListener('click', () => applyKindleIntelligenceFixById(button.dataset.intelligenceFix)));
  document.querySelectorAll('[data-kindle-review-source]').forEach((button) => button.addEventListener('click', () => toggleKindleReviewDecision(button.dataset.kindleReviewSource, button.dataset.kindleReviewId)));
  document.querySelectorAll('[data-polish-section]').forEach((button) => button.addEventListener('click', () => {
    const issue = { source: button.dataset.polishSource || 'quality', blockId: button.dataset.polishBlock || '', sectionId: null };
    const index = Number(button.dataset.polishSection);
    if (!Number.isFinite(index)) return;
    if (issue.source === 'intelligence') jumpToKindleIntelligenceIssue(index, issue.blockId);
    else jumpToKindleQualityIssue(index, issue.blockId);
  }));
  document.querySelector('#compareKindleChaptersButton')?.addEventListener('click', () => { state.compareChapterA = Number(document.querySelector('#compareChapterA')?.value || 0); state.compareChapterB = Number(document.querySelector('#compareChapterB')?.value || 1); updateMain(); });
  bindEbookInspectorControls();
  bindKindleCommandButtons(document);
  document.querySelector('#prevEbookSection')?.addEventListener('click', () => jumpEbookSection(state.ebookSectionIndex - 1));
  document.querySelector('#nextEbookSection')?.addEventListener('click', () => jumpEbookSection(state.ebookSectionIndex + 1));
  document.querySelectorAll('[data-ebook-section]').forEach((button) => button.addEventListener('click', () => jumpEbookSection(Number(button.dataset.ebookSection))));
  const ebookNavigatorSearch = document.querySelector('#ebookNavigatorSearch');
  ebookNavigatorSearch?.addEventListener('input', (event) => filterEbookNavigator(event.target.value));
  if (state.ebookNavigatorSearch) filterEbookNavigator(state.ebookNavigatorSearch);
  document.querySelector('#kindlePreviewDevice')?.addEventListener('change', (event) => updateKindlePreviewPreference('device', event.target.value));
  document.querySelector('#kindlePreviewOrientation')?.addEventListener('change', (event) => updateKindlePreviewPreference('orientation', event.target.value));
  document.querySelector('#kindlePreviewFontFace')?.addEventListener('change', (event) => updateKindlePreviewPreference('fontFace', event.target.value));
  document.querySelector('#kindlePreviewFontScale')?.addEventListener('change', (event) => updateKindlePreviewPreference('fontScale', event.target.value));
  document.querySelector('#kindlePreviewAppearance')?.addEventListener('change', (event) => updateKindlePreviewPreference('appearance', event.target.value));
  bindKindleModeButtons(document);
  bindKindlePreferenceButtons(document);

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
    ensureEditions(state.project);
    state.printEdition = activePrintEdition(state.project);
    await saveProject(state.project);
    state.preview = null;
    state.spreadIndex = 0;
    state.ebookSectionIndex = 0;
    state.selectedEbookBlockId = '';
    state.inspectorMessage = '';
    state.ebookMessage = '';
    state.ebookUndoStack = [];
    state.ebookRedoStack = [];
    state.ebookHistoryArmed = false;
    state.ebookNavigatorSearch = '';
    state.polishQueueIndex = 0;
    state.kindleFocusPreview = false;
    state.finalCheck = null;
    state.backupMessage = '';
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
  bindKindleKeyboardShortcuts();
  bindEbookFrameInspector();
}


async function runFinalCheck() {
  if (!state.project) return;
  ensureEditions(state.project);
  const originalPrint = currentPrintEditionType();
  const enabledPrintTypes = ['paperback', 'hardcover'].filter((type) => state.project.editions[type].enabled);
  invalidateAllEditionProofs(state.project, { clearPageCounts: false });
  if (effectiveStats(state.project).chapters === 0) {
    state.finalCheck = { allReady: false, printErrors: enabledPrintTypes.length ? 1 : 0, ebookErrors: state.project.editions.ebook.enabled ? 1 : 0, message: 'No chapter starts are available for production.' };
    state.activeView = 'import';
    updateMain();
    return;
  }
  state.busy = true;
  state.busyMessage = 'Running Final Check across Story Lock and every enabled edition…';
  updateMain();
  try {
    const lock = await verifyProjectStoryLock(state.project);
    state.project.storyLock.status = lock.ok ? 'verified' : 'failed';
    state.project.storyLock.verifiedAt = lock.ok ? new Date().toISOString() : state.project.storyLock.verifiedAt;
    if (!lock.ok) {
      state.finalCheck = { allReady: false, printErrors: enabledPrintTypes.length ? 1 : 0, ebookErrors: state.project.editions.ebook.enabled ? 1 : 0, storyLockOk: false, message: 'Story Lock failed. Production was blocked.' };
      await saveProject(state.project);
      return;
    }

    const printTypes = enabledPrintTypes;
    const printReports = {};
    const previews = {};
    let printErrors = 0;
    let printWarnings = 0;
    for (const type of printTypes) {
      setActivePrintEdition(state.project, type);
      state.printEdition = type;
      const preview = await paginateProject(state.project);
      previews[type] = preview;
      state.project.editions[type].lastPageCount = preview.pages.length;
      state.project.editions[type].lastBuiltAt = new Date().toISOString();
      const report = runKdpPreflight({ project: state.project, preview, storyLockOk: true, editionType: type });
      printReports[type] = report;
      state.project.editions[type].lastPreflight = {
        ready: report.ready,
        pageCount: report.pageCount,
        errors: report.summary.errors,
        warnings: report.summary.warnings,
        checkedAt: new Date().toISOString(),
      };
      printErrors += report.summary.errors;
      printWarnings += report.summary.warnings;
    }

    const restoreType = state.project.editions[originalPrint]?.enabled ? originalPrint : printTypes[0] || 'paperback';
    if (state.project.editions[restoreType]?.enabled) {
      setActivePrintEdition(state.project, restoreType);
      state.printEdition = restoreType;
      state.preview = previews[restoreType] || null;
    } else {
      state.preview = null;
    }

    let ebookReport = null;
    let ebookErrors = 0;
    let ebookWarnings = 0;
    if (state.project.editions.ebook.enabled) {
      ebookReport = runEpubPreflight({ project: state.project, storyLockOk: true });
      const ebookQuality = scanKindleQuality(state.project);
      const ebookIntelligence = scanKindleIntelligence(state.project);
      const ebookCombinedReady = ebookReport.ready && ebookQuality.ready && ebookIntelligence.ready;
      state.project.editions.ebook.lastPreflight = {
        ready: ebookCombinedReady,
        errors: ebookReport.summary.errors + ebookQuality.summary.errors + ebookIntelligence.summary.errors,
        warnings: ebookReport.summary.warnings + ebookQuality.summary.warnings + ebookIntelligence.summary.review,
        checkedAt: new Date().toISOString(),
      };
      ebookErrors = ebookReport.summary.errors + ebookQuality.summary.errors + ebookIntelligence.summary.errors;
      ebookWarnings = ebookReport.summary.warnings + ebookQuality.summary.warnings + ebookIntelligence.summary.review;
    }

    const enabledCount = printTypes.length + (state.project.editions.ebook.enabled ? 1 : 0);
    const allReady = enabledCount > 0
      && Object.values(printReports).every((report) => report.ready)
      && (!state.project.editions.ebook.enabled || state.project.editions.ebook.lastPreflight?.ready);
    state.finalCheck = {
      allReady: Boolean(allReady),
      storyLockOk: true,
      printErrors,
      printWarnings,
      ebookErrors,
      ebookWarnings,
      editionReports: Object.fromEntries(Object.entries(printReports).map(([type, report]) => [type, { ready: report.ready, pageCount: report.pageCount, errors: report.summary.errors, warnings: report.summary.warnings }])),
      ebookReady: state.project.editions.ebook.enabled ? Boolean(state.project.editions.ebook.lastPreflight?.ready) : null,
      checkedAt: new Date().toISOString(),
    };
    await saveProject(state.project);
  } catch (error) {
    console.error(error);
    state.finalCheck = { allReady: false, printErrors: enabledPrintTypes.length ? 1 : 0, ebookErrors: state.project.editions.ebook.enabled ? 1 : 0, message: error?.message || 'Final Check failed safely.' };
  } finally {
    // Final Check may temporarily switch between paperback and hardcover. Always
    // return the author to the edition they were working on, even if one edition
    // throws during pagination/preflight.
    if (state.project) {
      ensureEditions(state.project);
      const fallback = state.project.editions[originalPrint]?.enabled
        ? originalPrint
        : enabledPrintTypes.find((type) => state.project.editions[type]?.enabled);
      if (fallback) {
        setActivePrintEdition(state.project, fallback);
        state.printEdition = fallback;
      }
    }
    state.busy = false;
    state.busyMessage = '';
    state.activeView = 'import';
    updateMain();
  }
}

function backupCurrentProject() {
  if (!state.project) return;
  try {
    const json = serializeProjectBackup(state.project);
    downloadTextFile(`${safeExportBaseName()}-yasready-project.json`, json, 'application/json;charset=utf-8');
    state.backupMessage = 'Project backup downloaded. It contains the exact manuscript map plus design and structure metadata.';
    updateMain();
  } catch (error) {
    console.error(error);
    state.backupMessage = error?.message || 'Project backup could not be created safely.';
    updateMain();
  }
}

async function restoreProjectBackup(file) {
  if (!file) return;
  state.busy = true;
  state.busyMessage = 'Verifying project backup with Story Lock…';
  updateMain();
  try {
    const restored = await parseProjectBackup(await file.text());
    await saveProject(restored);
    state.project = migrateProject(restored);
    ensureEditions(state.project);
    state.printEdition = activePrintEdition(state.project);
    state.projects = await listProjects();
    state.preview = null;
    state.spreadIndex = 0;
    state.finalCheck = null;
    state.backupMessage = `Restored “${restored.title}” as a new local project after Story Lock verification.`;
    state.activeView = 'import';
  } catch (error) {
    console.error(error);
    state.backupMessage = error?.message || 'Project backup restore was blocked safely.';
    state.activeView = state.project ? 'import' : 'library';
  } finally {
    state.busy = false;
    state.busyMessage = '';
    renderShell();
  }
}


async function applyStructureRepair(blockId, kind) {
  if (!state.project) return;
  try {
    setStructureOverride(state.project, blockId, kind || null);
    state.project.updatedAt = new Date().toISOString();
    invalidateAllEditionProofs(state.project);
    state.preview = null;
    state.spreadIndex = 0;
    state.ebookSectionIndex = 0;
    state.selectedEbookBlockId = '';
    state.inspectorMessage = '';
    state.finalCheck = null;
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
  const isDocx = /\.docx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (!isDocx) {
    state.error = 'YasReady Publish accepts Microsoft Word .docx manuscripts only. No conversion was attempted.';
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
    ensureEditions(state.project);
    state.printEdition = activePrintEdition(state.project);
    state.projects = await listProjects();
    state.preview = null;
    state.spreadIndex = 0;
    state.ebookSectionIndex = 0;
    state.selectedEbookBlockId = '';
    state.inspectorMessage = '';
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
  invalidateAllEditionProofs(state.project, { clearPageCounts: false });
  state.preview = null;
  state.finalCheck = null;
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
  invalidateAllEditionProofs(state.project, { clearPageCounts: false });
  state.finalCheck = null;
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
    invalidateAllEditionProofs(state.project, { clearPageCounts: false });
    state.finalCheck = null;
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

async function createPaperbackPdf() {
  const popup = window.open('', '_blank');
  const result = await ensureExportReady();
  if (!result.ok) {
    popup?.close();
    state.activeView = 'export';
    updateMain();
    return;
  }
  if (!popup) {
    alert('Your browser blocked the PDF window. Allow popups for YasReady Publish and try again.');
    return;
  }
  const html = buildPrintMasterHtml({ project: state.project, preview: state.preview, manuscriptHash: state.project.source.manuscriptHash, autoPrint: true });
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
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
  downloadTextFile(`${safeExportBaseName()}-${currentPrintEditionType()}-print-master.html`, html, 'text/html;charset=utf-8');
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
  downloadTextFile(`${safeExportBaseName()}-${currentPrintEditionType()}-preflight.json`, JSON.stringify(payload, null, 2));
}


function readThemeStudioForm() {
  const value = (id) => document.querySelector(`#${id}`)?.value;
  const base = currentEbookDesign();
  const studio = normalizeEbookThemeStudio(base.themeStudio || {});
  const nextStudio = normalizeEbookThemeStudio({
    ...studio,
    firstParagraphTreatment:value('themeFirstParagraph') ?? studio.firstParagraphTreatment,
    chapterTitleSizeEm:value('themeChapterSize') ?? studio.chapterTitleSizeEm,
    chapterTitleWeight:value('themeChapterWeight') ?? studio.chapterTitleWeight,
    chapterTitleLetterSpacingEm:value('themeChapterTracking') ?? studio.chapterTitleLetterSpacingEm,
    chapterTitleTransform:value('themeChapterTransform') ?? studio.chapterTitleTransform,
    chapterDivider:value('themeChapterDivider') ?? studio.chapterDivider,
    chapterArtworkPosition:value('themeChapterArtworkPosition') ?? studio.chapterArtworkPosition,
    sceneBreakCustomText:value('themeSceneCustomText') ?? studio.sceneBreakCustomText,
    sceneBreakArtworkWidthEm:value('themeSceneArtworkWidth') ?? studio.sceneBreakArtworkWidthEm,
    contentsStyle:value('themeContentsStyle') ?? studio.contentsStyle,
    contentsAlignment:value('themeContentsAlignment') ?? studio.contentsAlignment,
  });
  return normalizeEbookDesign({
    ...base,
    fontFamily:value('themeBodyFont') ?? base.fontFamily,
    lineHeight:value('themeLineHeight') ?? base.lineHeight,
    firstLineIndentEm:value('themeFirstIndent') ?? base.firstLineIndentEm,
    paragraphGapEm:value('themeParagraphGap') ?? base.paragraphGapEm,
    chapterTitleAlignment:value('themeChapterAlignment') ?? base.chapterTitleAlignment,
    chapterTopEm:value('themeChapterTop') ?? base.chapterTopEm,
    chapterAfterEm:value('themeChapterAfter') ?? base.chapterAfterEm,
    subheadAlignment:value('themeSubheadAlignment') ?? base.subheadAlignment,
    subheadSizeEm:value('themeSubheadSize') ?? base.subheadSizeEm,
    blockQuoteStyle:value('themeBlockQuoteStyle') ?? base.blockQuoteStyle,
    blockQuoteIndentEm:value('themeBlockQuoteIndent') ?? base.blockQuoteIndentEm,
    writtenNoteStyle:value('themeWrittenNoteStyle') ?? base.writtenNoteStyle,
    verseIndentEm:value('themeVerseIndent') ?? base.verseIndentEm,
    sceneBreakTreatment:value('themeSceneTreatment') ?? base.sceneBreakTreatment,
    sceneBreakSpaceEm:value('themeSceneSpace') ?? base.sceneBreakSpaceEm,
    textMessageStyle:value('themeTextMessageStyle') ?? base.textMessageStyle,
    textMessageIndentEm:value('themeTextMessageIndent') ?? base.textMessageIndentEm,
    themeStudio:nextStudio,
  });
}

function refreshThemeStudioLiveSample() {
  const current = document.querySelector('#themeStudioLiveSample');
  if (!current) return;
  try {
    const design = readThemeStudioForm();
    current.outerHTML = renderThemeStudioSample(design, normalizeEbookThemeStudio(design.themeStudio || {}));
  } catch {}
}

async function saveThemeStudio() {
  if (!state.project) return;
  armEbookHistory();
  const before = JSON.stringify(state.project.manuscript?.blocks || []);
  const design = readThemeStudioForm();
  setEbookEditionDesign(state.project, design);
  const after = JSON.stringify(state.project.manuscript?.blocks || []);
  if (before !== after) throw new Error('Story Lock blocked Theme Studio because manuscript blocks changed.');
  state.project.updatedAt = new Date().toISOString();
  state.finalCheck = null;
  state.themeStudioMessage = `Theme Studio saved: ${design.themeStudio.themeName}. Global presentation updated; story wording was not changed.`;
  await saveProject(state.project);
  state.projects = await listProjects();
  disarmEbookHistory();
  updateMain();
}

async function applyEbookTheme(themeId) {
  if (!state.project) return;
  armEbookHistory();
  const before = JSON.stringify(state.project.manuscript?.blocks || []);
  const next = normalizeEbookDesign(applyEbookThemeFamily(currentEbookDesign(), themeId));
  setEbookEditionDesign(state.project, next);
  if (before !== JSON.stringify(state.project.manuscript?.blocks || [])) throw new Error('Story Lock blocked theme application because manuscript blocks changed.');
  state.project.updatedAt = new Date().toISOString();
  state.finalCheck = null;
  state.themeStudioMessage = `${next.themeStudio.themeName} applied across the Kindle edition. Existing artwork, Word mappings, and intentional chapter overrides were preserved.`;
  await saveProject(state.project);
  state.projects = await listProjects();
  disarmEbookHistory();
  updateMain();
}

async function saveThemeWordMap() {
  if (!state.project) return;
  armEbookHistory();
  const design = currentEbookDesign();
  const studio = normalizeEbookThemeStudio(design.themeStudio || {});
  const nextMap = {};
  document.querySelectorAll('[data-theme-word-style]').forEach((select) => {
    const styleName = select.dataset.themeWordStyle;
    const role = select.value;
    if (styleName && role && role !== 'auto') nextMap[styleName] = role;
  });
  studio.sourceStyleMap = nextMap;
  setEbookEditionDesign(state.project, { ...design, themeStudio:studio });
  state.project.updatedAt = new Date().toISOString();
  state.finalCheck = null;
  state.themeStudioMessage = `Word style map saved with ${Object.keys(nextMap).length} explicit mapping${Object.keys(nextMap).length === 1 ? '' : 's'}. Source styles remain visible and the manuscript remains unchanged.`;
  await saveProject(state.project);
  state.projects = await listProjects();
  disarmEbookHistory();
  updateMain();
}

async function saveThemeChapterOverride() {
  if (!state.project || !state.themeSelectedChapterBlockId) return;
  armEbookHistory();
  const value = (id) => document.querySelector(`#${id}`)?.value ?? '';
  const alignment = value('themeChapterOverrideAlignment');
  const studio = setChapterHeadingOverride(state.project, state.themeSelectedChapterBlockId, {
    alignment:alignment === 'theme' ? undefined : alignment,
    spaceBefore:value('themeChapterOverrideBefore'),
    spaceAfter:value('themeChapterOverrideAfter'),
    sizeEm:value('themeChapterOverrideSize'),
  });
  const design = currentEbookDesign();
  setEbookEditionDesign(state.project, { ...design, themeStudio:studio });
  state.project.updatedAt = new Date().toISOString();
  state.finalCheck = null;
  state.themeStudioMessage = 'Chapter heading override saved. The theme still controls every unspecified property.';
  await saveProject(state.project);
  state.projects = await listProjects();
  disarmEbookHistory();
  updateMain();
}

async function resetThemeChapterOverride() {
  if (!state.project || !state.themeSelectedChapterBlockId) return;
  armEbookHistory();
  const studio = setChapterHeadingOverride(state.project, state.themeSelectedChapterBlockId, null);
  const design = currentEbookDesign();
  setEbookEditionDesign(state.project, { ...design, themeStudio:studio });
  state.project.updatedAt = new Date().toISOString();
  state.finalCheck = null;
  state.themeStudioMessage = 'Chapter override cleared. This chapter is back on the global theme.';
  await saveProject(state.project);
  state.projects = await listProjects();
  disarmEbookHistory();
  updateMain();
}

async function importThemeArtwork(file, kind) {
  if (!state.project || !file) return;
  const allowed = ['image/jpeg','image/png','image/gif','image/svg+xml','image/webp'];
  if (!allowed.includes(file.type)) {
    alert('Choose JPEG, PNG, GIF, SVG, or WebP artwork.');
    return;
  }
  try {
    const dataUrl = await fileToDataUrl(file);
    const dims = file.type === 'image/svg+xml' ? { width:0, height:0 } : await imageDimensions(dataUrl);
    const design = currentEbookDesign();
    const studio = normalizeEbookThemeStudio(design.themeStudio || {});
    const asset = { fileName:file.name, mimeType:file.type, fileSize:file.size, width:dims.width, height:dims.height, dataUrl, altText:'' };
    if (kind === 'chapter') studio.chapterArtwork = asset;
    else studio.sceneBreakArtwork = asset;
    const next = { ...design, themeStudio:studio };
    if (kind === 'scene-break') next.sceneBreakTreatment = 'custom-image';
    setEbookEditionDesign(state.project, next);
    state.project.updatedAt = new Date().toISOString();
    state.finalCheck = null;
    state.themeStudioMessage = `${kind === 'chapter' ? 'Chapter-heading' : 'Scene-break'} artwork attached and will be packaged inside the EPUB.`;
    await saveProject(state.project);
    state.projects = await listProjects();
    updateMain();
  } catch (error) {
    console.error(error);
    alert(error?.message || 'Theme artwork could not be attached safely.');
  }
}

async function removeThemeArtwork(kind) {
  if (!state.project) return;
  const design = currentEbookDesign();
  const studio = normalizeEbookThemeStudio(design.themeStudio || {});
  if (kind === 'chapter') studio.chapterArtwork = null;
  else studio.sceneBreakArtwork = null;
  const next = { ...design, themeStudio:studio };
  if (kind === 'scene-break' && next.sceneBreakTreatment === 'custom-image') next.sceneBreakTreatment = 'flourish';
  setEbookEditionDesign(state.project, next);
  state.project.updatedAt = new Date().toISOString();
  state.finalCheck = null;
  state.themeStudioMessage = `${kind === 'chapter' ? 'Chapter-heading' : 'Scene-break'} artwork removed.`;
  await saveProject(state.project);
  state.projects = await listProjects();
  updateMain();
}

function readEbookForm() {
  const value = (id) => document.querySelector(`#${id}`)?.value;
  const base = currentEbookDesign();
  return normalizeEbookDesign({
    ...base,
    language: value('ebookLanguage') ?? base.language,
    publisher: value('ebookPublisher') ?? base.publisher,
    fontFamily: value('ebookFontFamily') ?? base.fontFamily,
    bodyAlignment: value('ebookBodyAlignment') ?? base.bodyAlignment,
    lineHeight: value('ebookLineHeight') ?? base.lineHeight,
    firstLineIndentEm: value('ebookFirstIndent') ?? base.firstLineIndentEm,
    paragraphGapEm: value('ebookParagraphGap') ?? base.paragraphGapEm,
    bodyBlankPolicy: value('ebookBodyBlankPolicy') ?? base.bodyBlankPolicy,
    bodyBlankSpaceEm: value('ebookBodyBlankSpace') ?? base.bodyBlankSpaceEm,
    chapterTitleAlignment: value('ebookChapterAlignment') ?? base.chapterTitleAlignment,
    subheadAlignment: value('ebookSubheadAlignment') ?? base.subheadAlignment,
    subheadSizeEm: value('ebookSubheadSize') ?? base.subheadSizeEm,
    blockQuoteIndentEm: value('ebookBlockQuoteIndent') ?? base.blockQuoteIndentEm,
    blockQuoteStyle: value('ebookBlockQuoteStyle') ?? base.blockQuoteStyle,
    writtenNoteStyle: value('ebookWrittenNoteStyle') ?? base.writtenNoteStyle,
    textMessageStyle: value('ebookTextMessageStyle') ?? base.textMessageStyle,
    textMessageIndentEm: value('ebookTextMessageIndent') ?? base.textMessageIndentEm,
    sceneBreakTreatment: value('ebookSceneBreakTreatment') ?? base.sceneBreakTreatment,
    verseIndentEm: value('ebookVerseIndent') ?? base.verseIndentEm,
    visibleToc: (value('ebookVisibleToc') ?? (base.visibleToc ? 'yes' : 'no')) === 'yes',
    tocScope: value('ebookTocScope') ?? base.tocScope,
    frontMatterMode: value('ebookFrontMatterMode') ?? base.frontMatterMode,
  });
}


async function focusEbookOnly() {
  if (!state.project) return;
  ensureEditions(state.project);
  setEditionEnabled(state.project, 'ebook', true);
  setEditionEnabled(state.project, 'paperback', false);
  setEditionEnabled(state.project, 'hardcover', false);
  state.preview = null;
  state.finalCheck = null;
  state.project.updatedAt = new Date().toISOString();
  state.ebookMessage = 'Ebook Focus is active. Paperback and hardcover are parked, not deleted; you can re-enable them later from Editions.';
  await saveProject(state.project);
  state.projects = await listProjects();
  updateMain();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Cover image could not be read.'));
    reader.readAsDataURL(file);
  });
}

function imageDimensions(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
    image.onerror = () => reject(new Error('Cover image dimensions could not be read.'));
    image.src = dataUrl;
  });
}

async function importEbookCover(file) {
  if (!state.project) return;
  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    alert('Choose a JPEG or PNG front cover for the ebook edition.');
    return;
  }
  try {
    const dataUrl = await fileToDataUrl(file);
    const { width, height } = await imageDimensions(dataUrl);
    setEbookCover(state.project, {
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      width,
      height,
      dataUrl,
      updatedAt: new Date().toISOString(),
    });
    state.project.updatedAt = new Date().toISOString();
    state.finalCheck = null;
    state.ebookSectionIndex = 0;
    state.selectedEbookBlockId = '';
    state.ebookMessage = `Ebook cover attached: ${file.name} (${width} × ${height}px). Cover artwork lives outside Story Lock.`;
    await saveProject(state.project);
    state.projects = await listProjects();
    updateMain();
  } catch (error) {
    console.error(error);
    alert(error?.message || 'The ebook cover could not be attached safely.');
  }
}

async function removeEbookCover() {
  if (!state.project) return;
  clearEbookCover(state.project);
  state.project.updatedAt = new Date().toISOString();
  state.finalCheck = null;
  state.ebookMessage = 'Ebook cover removed. Story Lock and manuscript text were not changed.';
  await saveProject(state.project);
  state.projects = await listProjects();
  updateMain();
}

async function saveEbookSettings() {
  if (!state.project) return;
  state.project.design = state.project.design || {};
  setEbookEditionDesign(state.project, readEbookForm());
  state.project.updatedAt = new Date().toISOString();
  state.finalCheck = null;
  state.ebookMessage = 'Ebook settings saved. Story wording and Story Lock hash were not changed.';
  await saveProject(state.project);
  state.projects = await listProjects();
  updateMain();
}

function jumpEbookSection(index) {
  if (!state.project) return;
  const preview = buildEbookPreviewHtml({ project: state.project, sectionIndex: index });
  state.ebookSectionIndex = preview.index;
  state.selectedEbookBlockId = '';
  state.inspectorMessage = '';
  state.ebookFrameScrollY = 0;
  updateMain();
}

function bindEbookFrameInspector() {
  const frame = document.querySelector('#ebookPreviewFrame');
  if (!frame) return;
  const attach = () => {
    const doc = frame.contentDocument;
    if (!doc) return;
    const inspectMode = state.kindlePreview.mode === 'adjust';
    const selectedId = state.selectedEbookBlockId;
    try { frame.contentWindow?.scrollTo(0, state.ebookFrameScrollY || 0); } catch {}
    // Contents navigation must work in both Read and Adjust modes.
    doc.querySelectorAll('[data-yrp-toc-href]').forEach((anchor) => anchor.addEventListener('click', (event) => {
      event.preventDefault();
      const href = anchor.dataset.yrpTocHref;
      const preview = buildEbookPreviewHtml({ project: state.project, sectionIndex: state.ebookSectionIndex, inspectMode });
      const target = preview.sections.findIndex((item) => item.href === href);
      if (target >= 0) jumpEbookSection(target);
    }));
    if (!inspectMode) return;
    const clearSelection = () => doc.querySelectorAll('.yrp-selected').forEach((el) => el.classList.remove('yrp-selected'));
    doc.querySelectorAll('[data-yrp-block-id]').forEach((element) => {
      if (element.dataset.yrpBlockId === selectedId) element.classList.add('yrp-selected');
      const select = (event) => {
        event.preventDefault();
        event.stopPropagation();
        try { state.ebookFrameScrollY = frame.contentWindow?.scrollY || 0; } catch { state.ebookFrameScrollY = 0; }
        clearSelection();
        element.classList.add('yrp-selected');
        state.selectedEbookBlockId = element.dataset.yrpBlockId || '';
        state.inspectorMessage = '';
        refreshEbookInspectorOnly();
      };
      element.addEventListener('click', select);
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') select(event);
      });
    });
  };
  frame.addEventListener('load', attach, { once: true });
  try { if (frame.contentDocument?.readyState === 'complete') attach(); } catch {}
}

async function applyEbookBlockOverride() {
  if (!state.project || !state.selectedEbookBlockId) return;
  const value = (id) => document.querySelector(`#${id}`)?.value ?? '';
  const suppress = document.querySelector('#ebookOverrideSuppressIndent');
  setBlockPresentationOverride(state.project, 'ebook', state.selectedEbookBlockId, {
    spaceBefore: value('ebookOverrideBefore'),
    spaceAfter: value('ebookOverrideAfter'),
    firstLineIndent: value('ebookOverrideIndent'),
    alignment: value('ebookOverrideAlignment') || 'inherit',
    suppressIndent: suppress ? suppress.checked : undefined,
  });
  invalidateEditionProof(state.project, 'ebook', { clearPageCount: false });
  state.project.updatedAt = new Date().toISOString();
  state.finalCheck = null;
  state.inspectorMessage = 'Presentation override saved. Story wording was not changed.';
  await saveProject(state.project);
  state.projects = await listProjects();
  updateMain();
}

async function applyEbookOverrideAsDefault() {
  if (!state.project || !state.selectedEbookBlockId) return;
  armEbookHistory();
  const block = ebookSelectedBlock(state.project);
  if (!block) return;
  const value = (id) => document.querySelector(`#${id}`)?.value ?? '';
  const current = currentEbookDesign();
  const next = { ...current };
  const numeric = (id) => { const raw = value(id); if (raw === '') return null; const n = Number(raw); return Number.isFinite(n) ? n : null; };
  const before = numeric('ebookOverrideBefore');
  const after = numeric('ebookOverrideAfter');
  const indent = numeric('ebookOverrideIndent');
  const alignment = value('ebookOverrideAlignment');
  if (block.kind === 'chapter-title') {
    if (before != null) next.chapterTopEm = before;
    if (after != null) next.chapterAfterEm = after;
    if (['left','center','right'].includes(alignment)) next.chapterTitleAlignment = alignment;
    state.inspectorMessage = 'Chapter-title defaults updated for the entire Kindle edition.';
  } else if (['body','chapter-opening'].includes(block.kind)) {
    if (after != null) next.paragraphGapEm = after;
    if (indent != null) next.firstLineIndentEm = indent;
    if (['left','justify'].includes(alignment)) next.bodyAlignment = alignment;
    state.inspectorMessage = 'Body defaults updated for the entire Kindle edition.';
  } else return;
  setEbookEditionDesign(state.project, next);
  clearBlockPresentationOverride(state.project, 'ebook', state.selectedEbookBlockId);
  state.project.updatedAt = new Date().toISOString();
  state.finalCheck = null;
  await saveProject(state.project);
  state.projects = await listProjects();
  disarmEbookHistory();
  updateMain();
}

async function resetEbookBlockOverride() {
  if (!state.project || !state.selectedEbookBlockId) return;
  armEbookHistory();
  clearBlockPresentationOverride(state.project, 'ebook', state.selectedEbookBlockId);
  invalidateEditionProof(state.project, 'ebook', { clearPageCount: false });
  state.project.updatedAt = new Date().toISOString();
  state.finalCheck = null;
  state.inspectorMessage = 'This block is back on the Tres Amigos ebook theme.';
  await saveProject(state.project);
  state.projects = await listProjects();
  disarmEbookHistory();
  updateMain();
}

async function resetAllEbookOverrides() {
  if (!state.project) return;
  ensurePresentationOverrides(state.project);
  const count = countPresentationOverrides(state.project, 'ebook');
  if (!count) return;
  if (!confirm(`Reset all ${count} custom Kindle format fix${count === 1 ? '' : 'es'} back to the ebook theme? Story wording will not change.`)) return;
  armEbookHistory();
  state.project.presentationOverrides.ebook = {};
  invalidateEditionProof(state.project, 'ebook', { clearPageCount: false });
  state.selectedEbookBlockId = '';
  state.inspectorMessage = 'All custom Kindle formatting fixes were reset to the ebook theme.';
  state.project.updatedAt = new Date().toISOString();
  state.finalCheck = null;
  await saveProject(state.project);
  state.projects = await listProjects();
  disarmEbookHistory();
  updateMain();
}

async function devicePreviewHtmlVerified() {
  if (!state.project) throw new Error('Open a publishing project first.');
  const lock = await verifyProjectStoryLock(state.project);
  if (!lock.ok) throw new Error('Story Lock failed. Device preview was blocked.');
  return buildDevicePreviewHtml({ project: state.project });
}

async function downloadDevicePreview() {
  try {
    const html = await devicePreviewHtmlVerified();
    downloadTextFile(`${safeExportBaseName()}-kindle-device-preview.html`, html, 'text/html;charset=utf-8');
    state.devicePreviewMessage = 'Device proof downloaded. AirDrop or open that HTML file on your iPhone/iPad for a reader-only proof.';
    updateMain();
  } catch (error) {
    console.error(error);
    alert(error?.message || 'Device preview could not be created safely.');
  }
}

async function shareDevicePreview() {
  try {
    const html = await devicePreviewHtmlVerified();
    const file = new File([html], `${safeExportBaseName()}-kindle-preview.html`, { type: 'text/html' });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      try {
        await navigator.share({
          files: [file],
          title: `${state.project.title} · Kindle Preview`,
          text: 'Private YasReady reader proof. Open the HTML file in Safari on the device.',
        });
        state.devicePreviewMessage = 'Shared a private reader proof through the Mac Share Sheet. YasReady did not upload the manuscript.';
      } catch (error) {
        if (error?.name === 'AbortError') return;
        downloadTextFile(file.name, html, 'text/html;charset=utf-8');
        state.devicePreviewMessage = 'The Share Sheet could not send this HTML file, so YasReady downloaded the same private device proof instead. AirDrop it to your iPhone/iPad.';
      }
    } else {
      downloadTextFile(file.name, html, 'text/html;charset=utf-8');
      state.devicePreviewMessage = 'This browser cannot share files directly, so YasReady downloaded the device proof instead. AirDrop that file to your iPhone/iPad.';
    }
    updateMain();
  } catch (error) {
    console.error(error);
    alert(error?.message || 'Device preview could not be shared safely.');
  }
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
  const quality = scanKindleQuality(state.project);
  const intelligence = scanKindleIntelligence(state.project);
  state.kindleQualityCache = quality;
  state.kindleQualityKey = `${state.project.updatedAt || ''}|${state.project.storyLock?.status || ''}|${countPresentationOverrides(state.project, 'ebook')}`;
  state.kindleIntelligenceCache = intelligence;
  state.kindleIntelligenceKey = state.kindleQualityKey;
  return { ok: Boolean(report.ready && quality.ready && intelligence.ready), report, quality, intelligence };
}

async function downloadEpub() {
  if (!state.project) return;
  state.finalCheck = null;
  state.project.design = state.project.design || {};
  setEbookEditionDesign(state.project, readEbookForm());
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
  setEbookEditionDesign(state.project, readEbookForm());
  const lock = await verifyProjectStoryLock(state.project);
  const report = runEpubPreflight({ project: state.project, storyLockOk: lock.ok });
  const quality = scanKindleQuality(state.project);
  const intelligence = scanKindleIntelligence(state.project);
  const payload = {
    yasreadyPublishVersion: VERSION,
    format: 'EPUB 3 reflowable',
    bookTitle: state.project.title,
    author: state.project.author || '',
    sourceFile: state.project.source.fileName,
    manuscriptSha256: state.project.source.manuscriptHash,
    generatedAt: new Date().toISOString(),
    ...report,
    kindleProQuality: quality,
    kindleIntelligence: intelligence,
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
  saveCurrentPrintDesign(design);
  state.project.design.template = name;
  state.project.updatedAt = new Date().toISOString();
  state.preview = null;
  state.spreadIndex = 0;
  state.finalCheck = null;
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
    bodyBlankPolicy: value('bodyBlankPolicy') ?? base.bodyBlankPolicy,
    bodyBlankSpace: value('bodyBlankSpace') ?? base.bodyBlankSpace,
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
  const savedDesign = readDesignForm();
  saveCurrentPrintDesign(savedDesign);
  state.project.design.template = savedDesign.name || 'Custom';
  state.project.updatedAt = new Date().toISOString();
  state.preview = null;
  state.spreadIndex = 0;
  state.finalCheck = null;
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

  if (isFinalPiece && design.paragraphGap && ['body','chapter-opening','text-message'].includes(kind)) {
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
  let collapsedBodyBlanks = 0;
  let normalizedBodyBlankRuns = 0;
  let chapterStarts = 0;
  let chaptersOnRight = 0;
  let firstChapterPhysicalPage = null;
  let previousNonEmptyKind = null;
  let tocInserted = false;

  const newPage = ({ intentionalBlank = false, blankReason = '' } = {}) => {
    const number = pages.length + 1;
    current = { number, side: pageSide(number), fragments: [], usedPx: 0, intentionalBlank, blankReason, bookPageNumber: null };
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
      collapsedBlank: Boolean(meta.collapsedBlank),
      normalizedBlank: Boolean(meta.normalizedBlank),
    });
    current.usedPx += height;
  };

  const placeGeneratedToc = () => {
    if (!tocEntries.length || tocInserted) return;
    if (!current) newPage();
    else if (current.fragments.length || current.intentionalBlank) newPage();
    // Tres Amigos uses the Contents as a true two-page spread: begin on a left page.
    // If the next physical page is right-hand, reserve it as an intentionally blank
    // front-matter alignment page. This is presentation metadata only; Story Lock text is untouched.
    if (tocNeedsLeadingBlank(current.number, design.tocStartSide)) {
      current.intentionalBlank = true;
      current.blankReason = 'toc-left-spread';
      blankVersos += 1;
      newPage();
    }
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

  const placeTextBlock = (block, blockPosition) => {
    const kind = block.kind;
    const text = block.text;
    const suppressIndent = kind === 'chapter-opening' || previousNonEmptyKind === 'scene-break' || previousNonEmptyKind === 'chapter-title';
    if (kind === 'blank') {
      ensurePage();
      const sectionType = matterSectionForBlockIndex(block.index, structure);
      const blankMode = blankRenderMode({ blocks, index: blockPosition, sectionType, policy: design.bodyBlankPolicy });
      const height = blankMode === 'collapse'
        ? 0
        : blankMode === 'normalize'
          ? design.bodyBlankSpace * CSS_PX_PER_INCH
          : measureFragment(rig, design, kind, '', false, true, true);
      if (blankMode === 'collapse') collapsedBodyBlanks += 1;
      if (blankMode === 'normalize') normalizedBodyBlankRuns += 1;
      if (height > remaining() && current.fragments.length) newPage();
      addFragment(block, '', kind, false, height, {
        startOffset: 0, endOffset: 0, isFinalPiece: true, suppressIndent: true,
        collapsedBlank: blankMode === 'collapse', normalizedBlank: blankMode === 'normalize',
      });
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
          current.blankReason = 'chapter-right';
          blankVersos += 1;
          newPage();
        }
        if (firstChapterPhysicalPage == null) firstChapterPhysicalPage = current.number;
        if (current.side === 'right') chaptersOnRight += 1;
      }
      placeTextBlock(block, i);
      if (block.kind !== 'blank') previousNonEmptyKind = block.kind;
      if (i && i % 250 === 0) await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  } finally {
    rig.root.remove();
  }

  // KDP counts physical front/back pages. Keep the final interior even ourselves so
  // Amazon does not silently add an untracked terminal page that changes spine/page-count math.
  let terminalBlankPages = 0;
  if (needsTerminalBlankPage(pages.length)) {
    newPage({ intentionalBlank: true, blankReason: 'terminal-even' });
    terminalBlankPages = 1;
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
    terminalBlankPages,
    collapsedBodyBlanks,
    normalizedBodyBlankRuns,
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
    return stampPreviewProof(preview, { project, design: preview.design, editionType: currentPrintEditionType() });
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
  return stampPreviewProof(preview, { project, design: preview.design, editionType: currentPrintEditionType() });
}

async function buildPreview() {
  if (!state.project) return;
  state.finalCheck = null;
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
    ensureEditions(state.project);
    const editionType = currentPrintEditionType();
    state.project.editions[editionType].lastPageCount = state.preview.pages.length;
    state.project.editions[editionType].lastBuiltAt = new Date().toISOString();
    state.project.editions[editionType].lastPreflight = null;
    await saveProject(state.project);
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
