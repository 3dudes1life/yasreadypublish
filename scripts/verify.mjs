import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const required = [
  'index.html', 'src/main.js', 'src/styles/app.css', 'src/lib/docx-parser.js', 'src/lib/hash.js',
  'src/lib/project.js', 'src/lib/project-store.js', 'src/lib/print-model.js', 'src/lib/structure-model.js',
  'src/lib/navigator-model.js', 'src/lib/theme-store.js', 'src/lib/preflight-model.js', 'src/lib/print-export.js',
  'src/lib/ebook-model.js', 'src/lib/ebook-preflight.js', 'src/lib/epub-export.js', 'src/lib/structure-overrides.js',
  'src/lib/print-toc.js', 'src/lib/project-backup.js', 'src/lib/readiness-model.js', 'src/lib/spacing-policy.js',
  'src/lib/editions.js', 'src/lib/proof-integrity.js', 'src/lib/presentation-overrides.js', 'src/lib/semantic-styles.js', 'src/lib/kindle-preview-model.js', 'src/lib/kindle-quality.js', 'src/lib/kindle-intelligence.js', 'src/lib/epub-audit.js', 'public/vendor/jszip.min.js',
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
for (const marker of ["const VERSION = '1.0.13'", 'Run Final Check', 'Download Project Backup', 'Kindle / eBook', 'Download KDP EPUB', 'Amazon KDP · Reflowable EPUB 3', 'Kindle Preview Studio', 'Adjust Layout', 'preview-studio-grid-v110', 'Kindle Pro consistency scan', '3-View Torture Test', '11 pt reference', 'Semantic Style Palette', 'Content style', 'saveEbookSemanticStyles', 'Kindle Intelligence · v1.0.13', 'Compare Chapters', 'compareKindleChaptersButton', 'Undo', 'Redo', 'Structure Repair', 'generated-toc-entry', 'One Story Lock · separate outputs', 'bodyBlankPolicy']) {
  if (!main.includes(marker)) throw new Error(`1.0.13 production workspace is missing: ${marker}`);
}
const printModel = readFileSync('src/lib/print-model.js', 'utf8');
if (!printModel.includes("tocTitle: 'Table of Contents'") || !printModel.includes('printToc: true') || !printModel.includes("tocStartSide: 'left'") || !printModel.includes('paragraphGap: 0.12,') || !printModel.includes("bodyBlankPolicy: 'collapse'")) {
  throw new Error('Book 1 print/TOC/spacing defaults are missing.');
}
const buttonIds = [...main.matchAll(/<button\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
const boundIds = new Set([...main.matchAll(/querySelector\(['"]#([^'"]+)['"]\)/g)].map((match) => match[1]));
const unboundButtons = [...new Set(buttonIds)].filter((id) => !boundIds.has(id));
if (unboundButtons.length) throw new Error(`Unbound literal button(s): ${unboundButtons.join(', ')}`);
for (const dynamicBinding of ['[data-go-view]','[data-open-project]','[data-delete-project]','[data-nav-page]','[data-ebook-section]','[data-repair-block]','[data-apply-theme]','[data-export-theme]','[data-delete-theme]','[data-edition-enabled]','[data-work-edition]','[data-kindle-mode]','[data-kindle-pref-key]','[data-quality-section]','[data-intelligence-section]','[data-intelligence-fix]']) {
  if (!main.includes(`querySelectorAll('${dynamicBinding}')`) && !main.includes(`querySelectorAll("${dynamicBinding}")`)) throw new Error(`Missing dynamic control binding: ${dynamicBinding}`);
}

const project = readFileSync('src/lib/project.js', 'utf8');
if (!project.includes("appVersion: '1.0.13'") || !project.includes('version: 22') || !project.includes('ensureEditions(project)') || !project.includes('ensurePresentationOverrides(project)')) {
  throw new Error('Project schema/app version was not migrated to 1.0.13 Kindle Intelligence safety state.');
}
const epub = readFileSync('src/lib/epub-export.js', 'utf8');
for (const marker of ['epub:type=\"landmarks\"','properties=\"cover-image\"','itemref idref=\"nav\"','Table of Contents']) {
  if (!epub.includes(marker)) throw new Error(`Kindle EPUB hardening is missing: ${marker}`);
}
const audit = readFileSync('src/lib/epub-audit.js', 'utf8');
for (const marker of ['auditEpubPackage','audit-preview-leak','audit-cover','detectEbookPlaceholders']) if (!audit.includes(marker)) throw new Error(`Finished EPUB audit is missing: ${marker}`);
const quality = readFileSync('src/lib/kindle-quality.js', 'utf8');
for (const marker of ['scanKindleQuality','enhancedTypesettingAudit','kindleTorturePresets','semanticRoleCounts']) if (!quality.includes(marker)) throw new Error(`Kindle Pro QA is missing: ${marker}`);
const semantic = readFileSync('src/lib/semantic-styles.js', 'utf8');
for (const marker of ['EBOOK_SEMANTIC_ROLES','semanticRoleForBlock','semanticRoleCounts']) if (!semantic.includes(marker)) throw new Error(`Kindle semantic style engine is missing: ${marker}`);
const intelligence = readFileSync('src/lib/kindle-intelligence.js', 'utf8');
for (const marker of ['scanKindleIntelligence','compareKindleChapters','applyKindleIntelligenceFix']) if (!intelligence.includes(marker)) throw new Error(`Kindle Intelligence engine is missing: ${marker}`);
console.log('YasReady Publish v1.0.13 static verification passed.');
