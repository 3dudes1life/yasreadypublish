import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const required = [
  'index.html', 'src/main.js', 'src/styles/app.css', 'src/lib/docx-parser.js', 'src/lib/hash.js',
  'src/lib/project.js', 'src/lib/project-store.js', 'src/lib/print-model.js', 'src/lib/structure-model.js',
  'src/lib/navigator-model.js', 'src/lib/theme-store.js', 'src/lib/preflight-model.js', 'src/lib/print-export.js',
  'src/lib/ebook-model.js', 'src/lib/ebook-preflight.js', 'src/lib/epub-export.js', 'src/lib/structure-overrides.js',
  'src/lib/print-toc.js', 'src/lib/project-backup.js', 'src/lib/readiness-model.js', 'src/lib/spacing-policy.js',
  'src/lib/editions.js', 'src/lib/proof-integrity.js', 'public/vendor/jszip.min.js',
  'STORY-LOCK-SPEC.md', 'KDP-PREFLIGHT.md', 'EPUB-PREFLIGHT.md', 'RELEASE-QA.md',
];
for (const file of required) if (!existsSync(file)) throw new Error(`Missing required file: ${file}`);

const jsFiles = required.filter((file) => file.endsWith('.js'));
for (const file of jsFiles) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });

const index = readFileSync('index.html', 'utf8');
if (!index.includes('jszip.min.js') || !index.includes('src/main.js') || !index.includes('src/styles/app.css')) {
  throw new Error('index.html is not wired to the self-contained static runtime.');
}
const main = readFileSync('src/main.js', 'utf8');
for (const marker of ["const VERSION = '1.0.6'", 'Run Final Check', 'Download Project Backup', 'Ebook / Kindle', 'Structure Repair', 'generated-toc-entry', 'One Story Lock · separate outputs', 'bodyBlankPolicy']) {
  if (!main.includes(marker)) throw new Error(`1.0.6 production workspace is missing: ${marker}`);
}
const printModel = readFileSync('src/lib/print-model.js', 'utf8');
if (!printModel.includes("tocTitle: 'Table of Contents'") || !printModel.includes('printToc: true') || !printModel.includes("tocStartSide: 'left'") || !printModel.includes('paragraphGap: 0.12,') || !printModel.includes("bodyBlankPolicy: 'collapse'")) {
  throw new Error('Book 1 print/TOC/spacing defaults are missing.');
}
const buttonIds = [...main.matchAll(/<button\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
const boundIds = new Set([...main.matchAll(/querySelector\(['"]#([^'"]+)['"]\)/g)].map((match) => match[1]));
const unboundButtons = [...new Set(buttonIds)].filter((id) => !boundIds.has(id));
if (unboundButtons.length) throw new Error(`Unbound literal button(s): ${unboundButtons.join(', ')}`);
for (const dynamicBinding of ['[data-go-view]','[data-open-project]','[data-delete-project]','[data-nav-page]','[data-ebook-section]','[data-repair-block]','[data-apply-theme]','[data-export-theme]','[data-delete-theme]','[data-edition-enabled]','[data-work-edition]']) {
  if (!main.includes(`querySelectorAll('${dynamicBinding}')`) && !main.includes(`querySelectorAll("${dynamicBinding}")`)) throw new Error(`Missing dynamic control binding: ${dynamicBinding}`);
}

const project = readFileSync('src/lib/project.js', 'utf8');
if (!project.includes("appVersion: '1.0.6'") || !project.includes('version: 16') || !project.includes('ensureEditions(project)')) {
  throw new Error('Project schema was not migrated to 1.0.6 safety state.');
}
const epub = readFileSync('src/lib/epub-export.js', 'utf8');
for (const marker of ['epub:type=\"landmarks\"','properties=\"cover-image\"','itemref idref=\"nav\"','Table of Contents']) {
  if (!epub.includes(marker)) throw new Error(`Universal EPUB hardening is missing: ${marker}`);
}
console.log('YasReady Publish v1.0.6 static verification passed.');
