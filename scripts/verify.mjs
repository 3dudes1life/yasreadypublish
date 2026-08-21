import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const required = [
  'index.html',
  'src/main.js',
  'src/styles/app.css',
  'src/lib/docx-parser.js',
  'src/lib/hash.js',
  'src/lib/project.js',
  'src/lib/project-store.js',
  'src/lib/print-model.js',
  'src/lib/structure-model.js',
  'src/lib/navigator-model.js',
  'src/lib/theme-store.js',
  'src/lib/preflight-model.js',
  'src/lib/print-export.js',
  'src/lib/ebook-model.js',
  'src/lib/ebook-preflight.js',
  'src/lib/epub-export.js',
  'public/vendor/jszip.min.js',
  'STORY-LOCK-SPEC.md',
  'KDP-PREFLIGHT.md',
  'EPUB-PREFLIGHT.md',
];

for (const file of required) {
  if (!existsSync(file)) throw new Error(`Missing required file: ${file}`);
}

const jsFiles = [
  'src/main.js',
  'src/lib/docx-parser.js',
  'src/lib/hash.js',
  'src/lib/project.js',
  'src/lib/project-store.js',
  'src/lib/print-model.js',
  'src/lib/structure-model.js',
  'src/lib/navigator-model.js',
  'src/lib/theme-store.js',
  'src/lib/preflight-model.js',
  'src/lib/print-export.js',
  'src/lib/ebook-model.js',
  'src/lib/ebook-preflight.js',
  'src/lib/epub-export.js',
];

for (const file of jsFiles) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });

const index = readFileSync('index.html', 'utf8');
if (!index.includes('jszip.min.js') || !index.includes('src/main.js') || !index.includes('src/styles/app.css')) {
  throw new Error('index.html is not wired to the self-contained runtime.');
}

const main = readFileSync('src/main.js', 'utf8');
if (!main.includes("const VERSION = '0.8.0'") || !main.includes('Ebook / Kindle') || !main.includes('downloadEpub')) {
  throw new Error('v0.8 ebook workspace is not wired into main.js.');
}

console.log('YasReady Publish v0.8.0 static verification passed.');
