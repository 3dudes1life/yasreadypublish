import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEpubPackageData } from '../src/lib/epub-export.js';
import { runEpubPreflight } from '../src/lib/ebook-preflight.js';

function block(index, kind, text, styleName = 'Normal', runs = null) {
  return { id: `p-${index + 1}`, index, kind, text, style: { name: styleName }, runs: runs || [{ text }], wordCount: text.trim() ? text.trim().split(/\s+/).length : 0 };
}

function sampleProject({ images = 0, author = 'D.C.W.' } = {}) {
  const blocks = [
    block(0, 'front-back-heading', 'Copyright', 'Title'),
    block(1, 'body', 'Front exact & safe.'),
    block(2, 'chapter-title', 'Chapter 1: Home', 'Heading 1'),
    block(3, 'chapter-opening', 'One < two & three.'),
    block(4, 'text-message', '[Michael]: Keep every word.'),
    block(5, 'scene-break', '* * *'),
    block(6, 'body', 'After the break.'),
    block(7, 'chapter-title', 'Chapter 2: Us', 'Heading 1'),
    block(8, 'chapter-opening', 'Final exact line.'),
  ];
  return {
    id: '11111111-2222-3333-4444-555555555555',
    title: 'Tres Amigos Test',
    author,
    source: { fileName: 'book.docx', manuscriptHash: 'abc123' },
    storyLock: { status: 'verified' },
    manuscript: {
      blocks,
      stats: { chapters: 2, words: blocks.reduce((sum, b) => sum + b.wordCount, 0) },
      metadata: { imageCount: images },
    },
    design: { ebook: { language: 'en', publisher: '3Dudes1Life Creative' } },
    editions: { ebook: { enabled: true, design: { language: 'en', publisher: '3Dudes1Life Creative' }, cover: { fileName:'cover.jpg', mimeType:'image/jpeg', fileSize:1234, width:1600, height:2560, dataUrl:'data:image/jpeg;base64,/9j/2Q==' } } },
  };
}

test('EPUB package contains required EPUB 3 container files', () => {
  const data = buildEpubPackageData({ project: sampleProject() });
  for (const path of ['mimetype', 'META-INF/container.xml', 'OEBPS/package.opf', 'OEBPS/nav.xhtml', 'OEBPS/toc.ncx', 'OEBPS/styles.css']) {
    assert.equal(data.files.has(path), true, `missing ${path}`);
  }
  assert.equal(data.files.get('mimetype'), 'application/epub+zip');
});

test('EPUB navigation contains clickable chapter labels', () => {
  const data = buildEpubPackageData({ project: sampleProject() });
  const nav = data.files.get('OEBPS/nav.xhtml');
  assert.match(nav, /Chapter 1: Home/);
  assert.match(nav, /Chapter 2: Us/);
  assert.match(nav, /epub:type="toc"/);
});

test('EPUB XHTML escapes markup without changing source characters semantically', () => {
  const data = buildEpubPackageData({ project: sampleProject() });
  const chapter = [...data.files.entries()].find(([path]) => /chapter-001\.xhtml$/.test(path))?.[1];
  assert.ok(chapter);
  assert.match(chapter, /One &lt; two &amp; three\./);
  assert.match(chapter, /\[Michael\]: Keep every word\./);
});

test('EPUB package embeds Story Lock hash in package metadata', () => {
  const opf = buildEpubPackageData({ project: sampleProject() }).files.get('OEBPS/package.opf');
  assert.match(opf, /yasready:storyLockSha256/);
  assert.match(opf, /abc123/);
});

test('EPUB preflight blocks image omission and failed Story Lock', () => {
  const imageReport = runEpubPreflight({ project: sampleProject({ images: 2 }), storyLockOk: true });
  assert.equal(imageReport.ready, false);
  assert.equal(imageReport.checks.find((item) => item.id === 'images').status, 'error');

  const lockReport = runEpubPreflight({ project: sampleProject(), storyLockOk: false });
  assert.equal(lockReport.ready, false);
  assert.equal(lockReport.checks.find((item) => item.id === 'story-lock').status, 'error');
});

test('blank author is warning, not silent metadata fabrication', () => {
  const report = runEpubPreflight({ project: sampleProject({ author: '' }), storyLockOk: true });
  assert.equal(report.checks.find((item) => item.id === 'author').status, 'warning');
  assert.equal(report.ready, true);
});

test('generated EPUB starts with uncompressed mimetype entry as required by EPUB containers', async () => {
  const fs = await import('node:fs');
  const vm = await import('node:vm');
  const { createRequire } = await import('node:module');
  const { buildEpubBlob } = await import('../src/lib/epub-export.js');
  const require = createRequire(import.meta.url);
  const code = fs.readFileSync(new URL('../public/vendor/jszip.min.js', import.meta.url), 'utf8');
  const context = {
    module: { exports: {} }, exports: {}, require, globalThis: {}, Buffer, process,
    setTimeout, clearTimeout, setImmediate, clearImmediate, Blob, Uint8Array, ArrayBuffer, TextEncoder, TextDecoder,
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  const previous = globalThis.JSZip;
  globalThis.JSZip = context.module.exports;
  try {
    const { blob } = await buildEpubBlob({ project: sampleProject() });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);
    const compressionMethod = bytes[8] | (bytes[9] << 8);
    assert.equal(compressionMethod, 0);
    const nameLength = bytes[26] | (bytes[27] << 8);
    const name = new TextDecoder().decode(bytes.slice(30, 30 + nameLength));
    assert.equal(name, 'mimetype');
  } finally {
    if (previous === undefined) delete globalThis.JSZip;
    else globalThis.JSZip = previous;
  }
});
