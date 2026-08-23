import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const VERSION = '1.0.21';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

const srcJs = walk(join(ROOT, 'src')).filter((p) => p.endsWith('.js'));
const scriptJs = walk(join(ROOT, 'scripts')).filter((p) => p.endsWith('.mjs'));
for (const file of [...srcJs, ...scriptJs]) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });

for (const file of srcJs) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g)) {
    const target = normalize(join(dirname(file), match[1]));
    if (!existsSync(target)) throw new Error(`Broken import in ${file}: ${match[1]}`);
  }
}

const main = readFileSync(join(ROOT, 'src/main.js'), 'utf8');
const project = readFileSync(join(ROOT, 'src/lib/project.js'), 'utf8');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
if (pkg.version !== VERSION) throw new Error(`package.json version is ${pkg.version}, expected ${VERSION}`);
if (!main.includes(`const VERSION = '${VERSION}'`)) throw new Error('main.js version mismatch');
if (!project.includes(`appVersion: '${VERSION}'`) || !project.includes(`project.appVersion = '${VERSION}'`) || !project.includes('version: 25')) throw new Error('project schema appVersion/schema mismatch');

const buttonIds = [...main.matchAll(/<button\b[^>]*\s+id="([^"]+)"/g)].map((m) => m[1]);
const boundIds = new Set([...main.matchAll(/querySelector\(['"]#([^'"]+)['"]\)/g)].map((m) => m[1]));
const unbound = [...new Set(buttonIds)].filter((id) => !boundIds.has(id));
if (unbound.length) throw new Error(`Unbound button IDs: ${unbound.join(', ')}`);
const dynamic = [
  'data-go-view','data-open-project','data-delete-project','data-nav-page','data-ebook-section','data-repair-block',
  'data-apply-theme','data-export-theme','data-delete-theme','data-edition-enabled','data-work-edition','data-kindle-mode',
  'data-kindle-pref-key','data-quality-section','data-intelligence-section','data-intelligence-fix','data-kindle-command',
  'data-polish-section','data-kindle-review-source','data-inspector-preset','data-simple-step','data-simple-target','data-bug-status','data-bug-delete',
];
for (const attr of dynamic) {
  if (main.includes(attr) && !main.includes(`querySelectorAll('[${attr}]')`) && !main.includes(`querySelectorAll("[${attr}]")`)) {
    throw new Error(`Dynamic control family lacks a binding: ${attr}`);
  }
}

for (const file of srcJs) {
  const text = readFileSync(file, 'utf8');
  const forbidden = [/\bfetch\s*\(/, /XMLHttpRequest\b/, /new\s+WebSocket\b/, /navigator\.sendBeacon\b/];
  for (const pattern of forbidden) if (pattern.test(text)) throw new Error(`Network egress primitive found in ${file}: ${pattern}`);
}

for (const marker of [
  'verifyProjectStoryLock','stampPreviewProof','needsTerminalBlankPage','invalidateAllEditionProofs','runFinalCheck',
  'Create / Reset Hardcover from Paperback','focusEbookOnly','ebookCoverInput','shareDevicePreview','applyEbookBlockOverride',
  'updateKindlePreviewPreference','bindKindlePreferenceButtons','refreshEbookInspectorOnly','undoEbookFormatting','redoEbookFormatting',
  'commitLiveEbookOverride','saveEbookSemanticStyles','ebookOverrideSemanticRole','applyKindleIntelligenceFixById',
  'compareKindleChaptersButton','performKindleNextBestAction','toggleKindleReviewDecision','bindKindleKeyboardShortcuts',
  'applyInspectorQuickPreset','toggleKindleFocusPreview','buildKindleProductionFlow','kindleNextBestAction','ebookNavigatorSearch',
]) {
  if (!main.includes(marker)) throw new Error(`Missing release safety marker: ${marker}`);
}

const preflight = readFileSync(join(ROOT, 'src/lib/preflight-model.js'), 'utf8');
for (const marker of ['proof-ownership','even-page-count','top-bottom-margins','cream-paper-limit','KDP trim-size support']) {
  if (!preflight.includes(marker)) throw new Error(`Missing preflight hardening: ${marker}`);
}

const epub = readFileSync(join(ROOT, 'src/lib/epub-export.js'), 'utf8');
for (const marker of ['epub:type="landmarks"','properties="cover-image"','itemref idref="nav"']) {
  if (!epub.includes(marker)) throw new Error(`Missing Kindle EPUB marker: ${marker}`);
}
const epubAudit = readFileSync(join(ROOT, 'src/lib/epub-audit.js'), 'utf8');
for (const marker of ['auditEpubPackage','audit-preview-leak','audit-cover','detectEbookPlaceholders']) {
  if (!epubAudit.includes(marker)) throw new Error(`Missing finished EPUB audit marker: ${marker}`);
}
const ebookModel = readFileSync(join(ROOT, 'src/lib/ebook-model.js'), 'utf8');
if (!ebookModel.includes('matterSectionHeading') || !ebookModel.includes('detectEbookPlaceholders')) throw new Error('Kindle front-matter/placeholder hardening is missing.');
const kindleQuality = readFileSync(join(ROOT, 'src/lib/kindle-quality.js'), 'utf8');
for (const marker of ['scanKindleQuality','enhancedTypesettingAudit','kindleTorturePresets','semanticRoleCounts']) if (!kindleQuality.includes(marker)) throw new Error(`Missing Kindle Pro quality marker: ${marker}`);
for (const marker of ['Kindle Pro consistency scan','3-View Torture Test','referencePt','toggleKindleQaMatrix','Semantic Style Palette','Content style','Kindle Intelligence','Compare Chapters','Kindle Production Console · v1.0.14','Theme Studio · v1.0.15','Style Gallery','Book DNA','Smart Word Style Mapper','Show me every place using this style','Polish Queue','NEXT BEST ACTION','Focus Preview','Kindle Release Gate · v1.0.16','Apply all safe fixes','Freeze Kindle release','FINAL NEXT ACTION','Step 1 · Book','Step 2 · Style','Step 3 · Preview','Step 4 · Export','Advanced Tools','simpleKindleExport']) if (!main.includes(marker)) throw new Error(`Missing Kindle Pro UI marker: ${marker}`);
const themeStudio = readFileSync(join(ROOT, 'src/lib/ebook-theme-studio.js'), 'utf8');
for (const marker of ['EBOOK_THEME_FAMILIES','normalizeEbookThemeStudio','applyEbookThemeFamily','calculateBookDNA','ebookStyleUsage','sourceStyleRecords']) if (!themeStudio.includes(marker)) throw new Error(`Missing Theme Studio marker: ${marker}`);
for (const marker of ['theme-artwork','paragraph-after-break','scene-source-hidden',"design.textMessageStyle === 'left-right'"]) if (!epub.includes(marker)) throw new Error(`Missing Theme Studio EPUB marker: ${marker}`);
const intelligence = readFileSync(join(ROOT, 'src/lib/kindle-intelligence.js'), 'utf8');
for (const marker of ['scanKindleIntelligence','compareKindleChapters','applyKindleIntelligenceFix']) if (!intelligence.includes(marker)) throw new Error(`Missing Kindle Intelligence marker: ${marker}`);
const production = readFileSync(join(ROOT, 'src/lib/kindle-production-flow.js'), 'utf8');
for (const marker of ['buildKindleProductionFlow','buildKindlePolishQueue','markKindleReviewIntentional','kindleReviewDecision']) if (!production.includes(marker)) throw new Error(`Missing Kindle Production Flow marker: ${marker}`);
const editions = readFileSync(join(ROOT, 'src/lib/editions.js'), 'utf8');
if (!editions.includes('reviewDecisions:')) throw new Error('Edition normalization can drop review decisions.');
const releaseGate = readFileSync(join(ROOT, 'src/lib/kindle-release-gate.js'), 'utf8');
for (const marker of ['buildKindleReleaseGate','auditKindleAccessibility','applySafeFixBatch','markAllCurrentReviewsIntentional','markKindleVisualProofComplete','freezeKindleRelease','kindleReleaseReport']) if (!releaseGate.includes(marker)) throw new Error(`Missing Kindle Release Gate marker: ${marker}`);
const semanticStyles = readFileSync(join(ROOT, 'src/lib/semantic-styles.js'), 'utf8');
for (const marker of ['EBOOK_SEMANTIC_ROLES','semanticRoleForBlock','semanticRoleCounts']) if (!semanticStyles.includes(marker)) throw new Error(`Missing semantic style marker: ${marker}`);
const docxParser = readFileSync(join(ROOT, 'src/lib/docx-parser.js'), 'utf8');
for (const marker of ['footnotes.xml','endnotes.xml','loadMediaAssets','mediaRefs','canonicalizeManuscriptV2']) if (!docxParser.includes(marker)) throw new Error(`Missing semantic import marker: ${marker}`);
if (!main.includes('const ebookIntelligence = scanKindleIntelligence(state.project);') || !main.includes('ebookReport.ready && ebookQuality.ready && ebookIntelligence.ready')) throw new Error('Final Check omits Kindle Intelligence.');

console.log(`SUPERMAN AUDIT PASSED · ${VERSION}`);
console.log(`- ${srcJs.length} application JS files syntax/import checked`);
console.log(`- ${new Set(buttonIds).size} literal button IDs audited`);
console.log(`- ${dynamic.length} dynamic control families audited`);
console.log('- no fetch/XHR/WebSocket/sendBeacon manuscript egress paths found');
if (!main.includes('🐞 Bug Log')) throw new Error('Bug Log UI missing.');
console.log('- Simple Mode four-step UX + hidden advanced systems + local Bug Log present');
console.log('- proof ownership, edition invalidation, semantic Kindle styles, Theme Studio families/mapping/artwork, exact-token review decisions, keyboard/search/focus workflow, safe note/media import, finished EPUB audit, calibrated preview, chapter anomaly mapping, safe presentation fixes, accessibility audit, batch review/fix workflow, invalidating visual-proof/release freeze tokens, Final Check intelligence, and whole-book QA guards present');
