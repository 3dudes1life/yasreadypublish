import './styles/app.css';
import { parseDocx } from './lib/docx-parser.js';
import { createProjectFromImport, verifyProjectStoryLock } from './lib/project.js';
import { deleteProject, listProjects, loadProject, saveProject } from './lib/project-store.js';
import { shortHash } from './lib/hash.js';

const state = {
  project: null,
  projects: [],
  activeView: 'import',
  search: '',
  busy: false,
  error: '',
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

function renderShell() {
  app.innerHTML = `
    <header class="topbar">
      <div class="topbar-inner">
        <div class="brand"><span class="brand-mark">Y</span><span>YasReady <span class="brand-product">Publish</span></span></div>
        <span class="version">PRIVATE ALPHA · v0.1.0</span>
      </div>
    </header>
    <main class="app-shell">
      <section class="hero">
        <div>
          <div class="eyebrow">Publisher-grade formatting, without touching your words</div>
          <h1>Format the book.<br>Never rewrite the story.</h1>
          <p>Version 0.1 establishes the safest possible foundation: local DOCX import, structural chapter detection, a read-only manuscript map, and cryptographic Story Lock verification.</p>
        </div>
        <div class="story-lock-pill"><span class="dot"></span> Story Lock is mandatory</div>
      </section>
      <div class="workspace">
        ${renderSidebar()}
        <section class="main" id="mainView">${renderMain()}</section>
      </div>
      <div class="footer-note">YasReady Publish v0.1.0 · Manuscripts are processed in your browser in this build.</div>
    </main>`;
  bindEvents();
}

function renderSidebar() {
  const hasProject = Boolean(state.project);
  return `
    <aside class="sidebar">
      <div class="sidebar-head"><strong>Publish workspace</strong><span>Build 0.1 is intentionally read-only. Design and export arrive in later milestones.</span></div>
      <nav class="sidebar-nav">
        ${navButton('import', '＋', hasProject ? 'Project' : 'Import')}
        ${navButton('chapters', '☷', 'Contents', !hasProject)}
        ${navButton('source', '≡', 'Source', !hasProject)}
        ${navButton('library', '▦', 'Library')}
      </nav>
      <div class="sidebar-foot"><p><strong>Story Lock rule:</strong> presentation metadata may change later. Source wording may not.</p></div>
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
  if (state.activeView === 'source') return renderSource();
  return renderProject();
}

function renderImport() {
  return `
    <article class="panel">
      <div class="panel-head"><div><span class="badge good">Story Lock ON</span><h2>Create a publishing project</h2><p>Your original DOCX is read locally. Version 0.1 does not send the manuscript to a server.</p></div></div>
      ${state.error ? `<div class="notice error">${escapeHtml(state.error)}</div>` : ''}
      <div class="empty-project" id="dropzone">
        <div class="drop-icon">⇧</div>
        <h3>Drop your final DOCX here</h3>
        <p>Publish will map the manuscript into paragraphs and chapters without providing any editing controls. Your exact source text gets a SHA-256 Story Lock fingerprint.</p>
        <button class="btn primary" id="chooseFile">Choose DOCX</button>
        <input type="file" id="fileInput" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden>
        <div class="privacy-note">🔒 Local processing · no AI rewriting · no silent corrections</div>
      </div>
    </article>
    <article class="panel">
      <div class="panel-head"><div><div class="eyebrow">v0.1 safety contract</div><h2>What this build is allowed to do</h2><p>Import, classify, count, fingerprint, and save a local project. Nothing else.</p></div></div>
      <div class="summary-grid">
        <div class="stat"><b>✓</b><span>Read DOCX</span></div>
        <div class="stat"><b>✓</b><span>Detect chapters</span></div>
        <div class="stat"><b>✓</b><span>Map messages</span></div>
        <div class="stat"><b>✓</b><span>Story Lock</span></div>
        <div class="stat"><b>×</b><span>Edit wording</span></div>
      </div>
    </article>`;
}

function renderBusy() {
  return `<article class="panel importing"><div><div class="spinner"></div><strong>Reading manuscript safely…</strong><p style="color:var(--muted);font-size:12px">Extracting DOCX XML, mapping paragraphs, detecting chapters, and creating Story Lock.</p></div></article>`;
}

function renderProject() {
  const p = state.project;
  const s = p.manuscript.stats;
  return `
    <article class="panel">
      <div class="panel-head"><div><span class="badge good">Imported safely</span><h2>${escapeHtml(p.title)}</h2><p>${escapeHtml(p.source.fileName)} · ${formatBytes(p.source.fileSize)}</p></div><button class="btn secondary" id="newImport">Import another</button></div>
      <div class="lock-card">
        <div class="lock-shield">◆</div>
        <div><strong>Story Lock verified</strong><p>The manuscript wording was fingerprinted at import. YasReady Publish has no content editing controls in v0.1.</p></div>
        <div class="lock-hash">MANUSCRIPT SHA-256<br>${escapeHtml(shortHash(p.source.manuscriptHash, 18))}</div>
      </div>
      <div class="project-title-row"><input id="projectTitle" value="${escapeHtml(p.title)}" aria-label="Project title"><button class="btn secondary" id="saveTitle">Save project name</button><button class="btn secondary" id="verifyLock">Verify Story Lock</button></div>
      <div class="summary-grid">
        <div class="stat"><b>${formatNumber(s.chapters)}</b><span>Chapters</span></div>
        <div class="stat"><b>${formatNumber(s.words)}</b><span>Words</span></div>
        <div class="stat"><b>${formatNumber(s.paragraphs)}</b><span>Paragraphs</span></div>
        <div class="stat"><b>${formatNumber(s.textMessages)}</b><span>Text messages</span></div>
        <div class="stat"><b>${formatNumber(s.sceneBreaks)}</b><span>Scene breaks</span></div>
      </div>
      ${s.chapters === 0 ? `<div class="notice info"><strong>No chapter titles were auto-detected.</strong> Nothing was changed. In 0.2 we will add a safe structure-mapping control; for now the Source view lets us inspect exactly what Word styles came through.</div>` : ''}
    </article>
    <article class="panel">
      <div class="panel-head"><div><div class="eyebrow">Next milestone</div><h2>0.2: print structure</h2><p>6×9 page model, mirrored margins, gutter logic, and right-hand chapter starts — all applied outside the locked content layer.</p></div></div>
      <div class="notice info">The important foundation is now real: <strong>content and design are separate.</strong> The next build can paginate aggressively without being allowed to rewrite a sentence.</div>
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

function renderSource() {
  const allBlocks = state.project.manuscript.blocks;
  const query = state.search.trim().toLowerCase();
  const blocks = query
    ? allBlocks.filter((block) => block.text.toLowerCase().includes(query) || block.kind.includes(query) || block.style.name.toLowerCase().includes(query))
    : allBlocks;

  return `
    <article class="panel">
      <div class="panel-head"><div><div class="eyebrow">Read-only manuscript map</div><h2>Source inspector</h2><p>Inspect what Publish imported. There is intentionally no editor.</p></div><span class="badge good">Read only</span></div>
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
      <div class="panel-head"><div><div class="eyebrow">Local projects</div><h2>Library</h2><p>Projects in v0.1 live in this browser's IndexedDB. Cloud sync comes later.</p></div><button class="btn primary" id="libraryImport">New project</button></div>
      ${state.projects.length ? `<div class="project-list">${state.projects.map((p) => `
        <div class="project-row">
          <div><strong>${escapeHtml(p.title)}</strong><span>${escapeHtml(p.source.fileName)} · ${p.manuscript.stats.chapters} chapters · ${formatNumber(p.manuscript.stats.words)} words · Updated ${new Date(p.updatedAt).toLocaleString()}</span></div>
          <div class="project-actions"><button class="btn secondary" data-open-project="${p.id}">Open</button><button class="btn danger" data-delete-project="${p.id}">Delete</button></div>
        </div>`).join('')}</div>` : `<div class="empty-project"><h3>No saved projects yet</h3><p>Import a DOCX and it will appear here automatically.</p></div>`}
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
    state.project = null; state.activeView = 'import'; state.error = ''; renderShell();
  });
  document.querySelector('#libraryImport')?.addEventListener('click', () => {
    state.project = null; state.activeView = 'import'; state.error = ''; renderShell();
  });
  document.querySelector('#saveTitle')?.addEventListener('click', saveProjectTitle);
  document.querySelector('#verifyLock')?.addEventListener('click', verifyLock);

  const search = document.querySelector('#sourceSearch');
  search?.addEventListener('input', (event) => {
    state.search = event.target.value;
    clearTimeout(search._timer);
    search._timer = setTimeout(updateMain, 180);
  });

  document.querySelectorAll('[data-open-project]').forEach((button) => button.addEventListener('click', async () => {
    state.project = await loadProject(button.dataset.openProject);
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

async function importFile(file) {
  state.error = '';
  if (!/\.docx$/i.test(file.name)) {
    state.error = 'Version 0.1 only accepts .docx files. No conversion was attempted.';
    updateMain();
    return;
  }
  state.busy = true;
  updateMain();
  try {
    const arrayBuffer = await file.arrayBuffer();
    const parsed = await parseDocx(arrayBuffer);
    const project = await createProjectFromImport({ file, arrayBuffer, parsed });
    await saveProject(project);
    state.project = project;
    state.projects = await listProjects();
    state.activeView = 'import';
  } catch (error) {
    console.error(error);
    state.error = error?.message || 'The manuscript could not be imported safely.';
    state.project = null;
  } finally {
    state.busy = false;
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

async function verifyLock() {
  if (!state.project) return;
  const result = await verifyProjectStoryLock(state.project);
  if (result.ok) {
    state.project.storyLock.verifiedAt = new Date().toISOString();
    state.project.storyLock.status = 'verified';
    await saveProject(state.project);
    alert('Story Lock VERIFIED. The stored manuscript text matches the import fingerprint exactly.');
  } else {
    state.project.storyLock.status = 'failed';
    alert('STORY LOCK FAILED. Export must remain blocked until the source mismatch is resolved.');
  }
}

async function init() {
  try { state.projects = await listProjects(); } catch (error) { console.warn('Project library unavailable', error); }
  renderShell();
}

init();
