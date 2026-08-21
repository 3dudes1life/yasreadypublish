import test from 'node:test';
import assert from 'node:assert/strict';
import { requiredInsideMargin, runKdpPreflight } from '../src/lib/preflight-model.js';
import { TRES_AMIGOS_TEMPLATE } from '../src/lib/print-model.js';

function sampleProject(overrides = {}) {
  return {
    title: 'Test Book',
    author: 'D.C.W.',
    storyLock: { status: 'verified' },
    manuscript: { blocks: [{ id: 'p-1', text: 'Hello' }], metadata: { imageCount: 0 }, ...overrides.manuscript },
    design: { print: { ...TRES_AMIGOS_TEMPLATE, printToc: false, ...overrides.design } },
  };
}

function samplePreview(pageCount = 571, overrides = {}) {
  const pages = Array.from({ length: pageCount }, (_, i) => ({
    number: i + 1,
    side: (i + 1) % 2 ? 'right' : 'left',
    hasChapterTitle: false,
    intentionalBlank: false,
    showRunningHeader: false,
    showFolio: true,
    fragments: [{ sourceBlockId: 'p-1', kind: 'body', text: 'Hello' }],
  }));
  pages[0].hasChapterTitle = true;
  return {
    pages,
    blankVersos: 0,
    integrity: { ok: true, checkedBlocks: 1 },
    design: { ...TRES_AMIGOS_TEMPLATE, printToc: false, ...overrides.design },
    ...overrides,
  };
}

test('KDP inside margin bands match long paperback requirements', () => {
  assert.equal(requiredInsideMargin(150), 0.375);
  assert.equal(requiredInsideMargin(151), 0.5);
  assert.equal(requiredInsideMargin(500), 0.625);
  assert.equal(requiredInsideMargin(571), 0.75);
  assert.equal(requiredInsideMargin(701), 0.875);
});

test('571-page Tres Amigos profile passes blocking KDP layout checks', () => {
  const report = runKdpPreflight({ project: sampleProject(), preview: samplePreview(571), storyLockOk: true });
  assert.equal(report.ready, true);
  assert.equal(report.summary.errors, 0);
  assert.equal(report.requiredInsideMargin, 0.75);
  assert.ok(report.summary.warnings >= 1); // font embedding is post-export verification
});

test('insufficient binding margin blocks export', () => {
  const project = sampleProject({ design: { insideMargin: 0.5 } });
  const preview = samplePreview(571, { design: { insideMargin: 0.5 } });
  const report = runKdpPreflight({ project, preview, storyLockOk: true });
  assert.equal(report.ready, false);
  assert.equal(report.checks.find((item) => item.id === 'inside-margin').status, 'error');
});

test('image assets block text-first no-bleed export instead of being silently dropped', () => {
  const project = sampleProject({ manuscript: { blocks: [{ id: 'p-1', text: 'Hello' }], metadata: { imageCount: 2 } } });
  const report = runKdpPreflight({ project, preview: samplePreview(571), storyLockOk: true });
  assert.equal(report.ready, false);
  assert.equal(report.checks.find((item) => item.id === 'images').status, 'error');
});
