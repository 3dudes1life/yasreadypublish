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
  'public/vendor/jszip.min.js',
  'STORY-LOCK-SPEC.md',
];

for (const file of required) {
  if (!existsSync(file)) throw new Error(`Missing required file: ${file}`);
}

for (const file of ['src/main.js', 'src/lib/docx-parser.js', 'src/lib/hash.js', 'src/lib/project.js', 'src/lib/project-store.js', 'src/lib/print-model.js', 'src/lib/structure-model.js', 'src/lib/navigator-model.js', 'src/lib/theme-store.js', 'src/lib/preflight-model.js', 'src/lib/print-export.js']) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}

const index = readFileSync('index.html', 'utf8');
if (!index.includes('jszip.min.js') || !index.includes('src/main.js') || !index.includes('src/styles/app.css')) {
  throw new Error('index.html is not wired to the self-contained runtime.');
}

console.log('YasReady Publish v0.7.0 static verification passed.');
