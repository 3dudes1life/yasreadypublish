import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const required = [
  'index.html', 'src/main.js', 'src/styles/app.css', 'src/lib/docx-parser.js', 'src/lib/hash.js',
  'src/lib/project.js', 'src/lib/project-store.js', 'src/lib/print-model.js', 'src/lib/structure-model.js',
  'src/lib/navigator-model.js', 'src/lib/theme-store.js', 'src/lib/preflight-model.js', 'src/lib/print-export.js',
  'src/lib/ebook-model.js', 'src/lib/ebook-preflight.js', 'src/lib/epub-export.js', 'src/lib/structure-overrides.js',
  'src/lib/print-toc.js', 'src/lib/project-backup.js', 'src/lib/readiness-model.js', 'src/lib/spacing-policy.js',
  'src/lib/editions.js', 'src/lib/proof-integrity.js', 'src/lib/presentation-overrides.js', 'src/lib/semantic-styles.js',
  'src/lib/kindle-preview-model.js', 'src/lib/kindle-quality.js', 'src/lib/kindle-intelligence.js',
  'src/lib/kindle-production-flow.js', 'src/lib/epub-audit.js', 'src/lib/ebook-theme-studio.js', 'src/lib/kindle-release-gate.js', 'src/lib/bug-log.js', 'src/lib/book-brain.js', 'public/vendor/jszip.min.js',
  'STORY-LOCK-SPEC.md', 'KDP-PREFLIGHT.md', 'EPUB-PREFLIGHT.md', 'KINDLE-STANDARDS.md', 'RELEASE-QA.md',
];
for (const file of required) if (!existsSync(file)) throw new Error(`Missing required file: ${file}`);

const jsFiles = required.filter((file) => file.endsWith('.js'));
for (const file of jsFiles) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });

const index = readFileSync('index.html', 'utf8');
if (!index.includes('jszip.min.js') || !index.includes('src/main.js') || !index.includes('src/styles/app.css')) {
  throw new Error('index.html is not wired to the self-contained static runtime.');
}
const main = readFileSync('src/main.js', 'utf8');
for (const marker of [
  "const VERSION = '1.0.26'", 'Run Final Check', 'Download Project Backup', 'Kindle / eBook', 'Download KDP EPUB',
  'Amazon KDP · Reflowable EPUB 3', 'Kindle Preview Studio', 'Adjust Layout', 'preview-studio-grid-v110',
  'Kindle Pro consistency scan', '3-View Torture Test', '11 pt reference', 'Semantic Style Palette', 'Content style',
  'saveEbookSemanticStyles', 'Kindle Intelligence', 'Compare Chapters', 'compareKindleChaptersButton', 'Undo', 'Redo',
  'Structure Repair', 'generated-toc-entry', 'One Story Lock · separate outputs', 'bodyBlankPolicy',
  'Kindle Production Console · v1.0.14', 'Polish Queue', 'NEXT BEST ACTION', 'ebookNavigatorSearch',
  'data-kindle-command', 'data-kindle-review-source', 'data-inspector-preset', 'Focus Preview',
]) {
  if (!main.includes(marker)) throw new Error(`1.0.26 production workspace is missing: ${marker}`);
}
const printModel = readFileSync('src/lib/print-model.js', 'utf8');
if (!printModel.includes("tocTitle: 'Table of Contents'") || !printModel.includes('printToc: true') || !printModel.includes("tocStartSide: 'left'") || !printModel.includes('paragraphGap: 0.12,') || !printModel.includes("bodyBlankPolicy: 'collapse'")) {
  throw new Error('Book 1 print/TOC/spacing defaults are missing.');
}
const buttonIds = [...main.matchAll(/<button\b[^>]*\s+id="([^"]+)"/g)].map((match) => match[1]);
const boundIds = new Set([...main.matchAll(/querySelector\(['"]#([^'"]+)['"]\)/g)].map((match) => match[1]));
const unboundButtons = [...new Set(buttonIds)].filter((id) => !boundIds.has(id));
if (unboundButtons.length) throw new Error(`Unbound literal button(s): ${unboundButtons.join(', ')}`);
for (const dynamicBinding of [
  '[data-go-view]','[data-open-project]','[data-delete-project]','[data-nav-page]','[data-ebook-section]','[data-repair-block]',
  '[data-apply-theme]','[data-export-theme]','[data-delete-theme]','[data-edition-enabled]','[data-work-edition]',
  '[data-kindle-mode]','[data-kindle-pref-key]','[data-quality-section]','[data-intelligence-section]','[data-intelligence-fix]',
  '[data-kindle-command]','[data-polish-section]','[data-kindle-review-source]','[data-inspector-preset]',
  '[data-simple-step]','[data-simple-target]','[data-continue-print]','[data-bug-status]','[data-bug-delete]','[data-book-brain-decision]',
]) {
  if (!main.includes(`querySelectorAll('${dynamicBinding}')`) && !main.includes(`querySelectorAll("${dynamicBinding}")`)) throw new Error(`Missing dynamic control binding: ${dynamicBinding}`);
}

const project = readFileSync('src/lib/project.js', 'utf8');
if (!project.includes("appVersion: '1.0.26'") || !project.includes('version: 26') || !project.includes('ensureEditions(project)') || !project.includes('ensurePresentationOverrides(project)')) {
  throw new Error('Project app version was not migrated to 1.0.26 with Book Brain schema 26 state.');
}
const editions = readFileSync('src/lib/editions.js', 'utf8');
if (!editions.includes('reviewDecisions:')) throw new Error('Edition normalization does not preserve Kindle review decisions.');
const productionFlow = readFileSync('src/lib/kindle-production-flow.js', 'utf8');
for (const marker of ['buildKindleProductionFlow','markKindleReviewIntentional','kindleReviewDecision','buildKindlePolishQueue']) {
  if (!productionFlow.includes(marker)) throw new Error(`Kindle Production Flow is missing: ${marker}`);
}
const epub = readFileSync('src/lib/epub-export.js', 'utf8');
for (const marker of ['epub:type="landmarks"','properties="cover-image"','itemref idref="visible-toc"','text/contents.xhtml','<guide>','Table of Contents']) {
  if (!epub.includes(marker)) throw new Error(`Kindle EPUB hardening is missing: ${marker}`);
}
for (const marker of ['chapter-layout-${layout}','chapter-label','chapter-name','splitChapterHeading']) {
  if (!epub.includes(marker)) throw new Error(`1.0.22 Kindle chapter renderer is missing: ${marker}`);
}
const audit = readFileSync('src/lib/epub-audit.js', 'utf8');
for (const marker of ['auditEpubPackage','audit-preview-leak','audit-cover','detectEbookPlaceholders']) if (!audit.includes(marker)) throw new Error(`Finished EPUB audit is missing: ${marker}`);
const quality = readFileSync('src/lib/kindle-quality.js', 'utf8');
for (const marker of ['scanKindleQuality','enhancedTypesettingAudit','kindleTorturePresets','semanticRoleCounts']) if (!quality.includes(marker)) throw new Error(`Kindle Pro QA is missing: ${marker}`);
const semantic = readFileSync('src/lib/semantic-styles.js', 'utf8');
for (const marker of ['EBOOK_SEMANTIC_ROLES','semanticRoleForBlock','semanticRoleCounts']) if (!semantic.includes(marker)) throw new Error(`Kindle semantic style engine is missing: ${marker}`);
const intelligence = readFileSync('src/lib/kindle-intelligence.js', 'utf8');
for (const marker of ['scanKindleIntelligence','compareKindleChapters','applyKindleIntelligenceFix']) if (!intelligence.includes(marker)) throw new Error(`Kindle Intelligence engine is missing: ${marker}`);
if (!main.includes('const ebookIntelligence = scanKindleIntelligence(state.project);') || !main.includes('ebookReport.ready && ebookQuality.ready && ebookIntelligence.ready')) {
  throw new Error('Final Check does not include Kindle Intelligence in the release gate.');
}
const themeStudio = readFileSync('src/lib/ebook-theme-studio.js', 'utf8');
for (const marker of ['EBOOK_THEME_FAMILIES','normalizeEbookThemeStudio','applyEbookThemeFamily','calculateBookDNA','ebookStyleUsage','sourceStyleRecords']) {
  if (!themeStudio.includes(marker)) throw new Error(`Theme Studio engine is missing: ${marker}`);
}
for (const marker of ['Theme Studio · v1.0.15','Style Gallery','Smart Word Style Mapper','Show me every place using this style','Book DNA']) {
  if (!main.includes(marker)) throw new Error(`Theme Studio UI is missing: ${marker}`);
}
for (const marker of ['theme-artwork','paragraph-after-break','scene-source-hidden',"design.textMessageStyle === 'left-right'"]) {
  if (!epub.includes(marker)) throw new Error(`Theme Studio EPUB renderer is missing: ${marker}`);
}
for (const marker of ['Step 1 · Book','Step 2 · Style','Step 3 · Preview','Step 4 · Export','Advanced Tools','simpleKindleExport','simpleBookStyle']) {
  if (!main.includes(marker)) throw new Error(`1.0.26 Simple Mode is missing: ${marker}`);
}
for (const marker of ['chapterTopEm: 8.0','chapterAfterEm: 5.5']) {
  if (!readFileSync('src/lib/ebook-model.js', 'utf8').includes(marker)) throw new Error(`1.0.22 Book 1 Kindle rhythm is missing: ${marker}`);
}
if (!themeStudio.includes("chapterTitleAlignment:'center', chapterTopEm:8.0, chapterAfterEm:5.5,")) throw new Error('1.0.22 Tres Amigos preset is not tuned to the Book 1 Kindle rhythm.');

const releaseGate = readFileSync('src/lib/kindle-release-gate.js', 'utf8');
for (const marker of ['buildKindleReleaseGate','auditKindleAccessibility','applySafeFixBatch','markKindleVisualProofComplete','freezeKindleRelease','kindleReleaseReport']) {
  if (!releaseGate.includes(marker)) throw new Error(`Kindle Release Gate is missing: ${marker}`);
}
for (const marker of ['Kindle Release Gate · v1.0.16','Apply all safe fixes','Mark current reviews intentional','Mark visual proof complete','Freeze Kindle release','Download release report','FINAL NEXT ACTION']) {
  if (!main.includes(marker)) throw new Error(`1.0.16 Release Gate UI is missing: ${marker}`);
}
if (!main.includes('🐞 Bug Log') || !main.includes('data-bug-status') || !project.includes("studio.chapterDivider = 'none'")) throw new Error('1.0.22 bug log or Tres Amigos divider hotfix is missing.');
for (const marker of ['usesTresAmigosMatterMatch','matter-book1-title','matter-book1-copyright','matter-book1-dedication']) {
  if (!epub.includes(marker)) throw new Error(`1.0.22 Book 1 front-matter match is missing: ${marker}`);
}
for (const marker of ['What are you making?','Nothing is assumed after upload','Continue with Paperback','Continue with Hardcover','lastExportedEdition']) {
  if (!main.includes(marker)) throw new Error(`1.0.24 format-first workflow is missing: ${marker}`);
}
for (const marker of ['margin:0 0 1.75em','margin-bottom:2em']) {
  if (!epub.includes(marker)) throw new Error(`1.0.24 dedication spacing is missing: ${marker}`);
}
if (!project.includes('paperback: { enabled: false }') || !project.includes('ebook: { enabled: false }')) throw new Error('1.0.24 new-project edition defaults are not opt-in.');
const brain = readFileSync('src/lib/book-brain.js', 'utf8');
for (const marker of ['analyzeBookBrain','applyBookBrain','bookBrainReviewItems','decideBookBrainInterpretation','BOOK_BRAIN_AUTO_THRESHOLD']) if (!brain.includes(marker)) throw new Error(`Book Brain engine is missing: ${marker}`);
for (const marker of ['BOOK BRAIN','YasReady understood the book.','Review ${reviews.length}','Analyze again']) if (!main.includes(marker)) throw new Error(`Book Brain Simple Mode UI is missing: ${marker}`);
if (!project.includes('applyBookBrain(project)') || !readFileSync('src/lib/ebook-model.js','utf8').includes('bookBrainMatterStart')) throw new Error('Book Brain is not wired into import/migration and ebook sections.');
console.log('YasReady Publish v1.0.26 static verification passed.');
