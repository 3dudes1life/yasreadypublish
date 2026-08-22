import test from 'node:test';
import assert from 'node:assert/strict';
import { requiredInsideMargin, runKdpPreflight } from '../src/lib/preflight-model.js';
import { TRES_AMIGOS_TEMPLATE } from '../src/lib/print-model.js';
import { stampPreviewProof } from '../src/lib/proof-integrity.js';

function sampleProject(overrides = {}) {
  return {
    title: 'Test Book',
    author: 'D.C.W.',
    source: { manuscriptHash: 'story-hash' },
    storyLock: { status: 'verified' },
    structureOverrides: {},
    manuscript: { blocks: [{ id: 'p-1', text: 'Hello' }], metadata: { imageCount: 0 }, ...overrides.manuscript },
    design: { print: { ...TRES_AMIGOS_TEMPLATE, printToc: false, ...overrides.design } },
  };
}

function samplePreview(project, pageCount = 572, overrides = {}, editionType = 'paperback') {
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
  const preview = {
    pages,
    blankVersos: 0,
    integrity: { ok: true, checkedBlocks: 1 },
    design: { ...TRES_AMIGOS_TEMPLATE, printToc: false, ...overrides.design },
    ...overrides,
  };
  return stampPreviewProof(preview, { project, design: preview.design, editionType });
}

test('KDP inside margin bands match long paperback requirements', () => {
  assert.equal(requiredInsideMargin(150), 0.375);
  assert.equal(requiredInsideMargin(151), 0.5);
  assert.equal(requiredInsideMargin(500), 0.625);
  assert.equal(requiredInsideMargin(572), 0.75);
  assert.equal(requiredInsideMargin(701), 0.875);
});

test('572-page Tres Amigos profile passes blocking KDP layout checks', () => {
  const project = sampleProject();
  const report = runKdpPreflight({ project, preview: samplePreview(project, 572), storyLockOk: true });
  assert.equal(report.ready, true);
  assert.equal(report.summary.errors, 0);
  assert.equal(report.requiredInsideMargin, 0.75);
  assert.ok(report.summary.warnings >= 1); // font embedding is post-export verification
});

test('odd physical page count is blocked so KDP cannot silently add a page', () => {
  const project = sampleProject();
  const report = runKdpPreflight({ project, preview: samplePreview(project, 571), storyLockOk: true });
  assert.equal(report.ready, false);
  assert.equal(report.checks.find((item) => item.id === 'even-page-count').status, 'error');
});

test('insufficient binding margin blocks export', () => {
  const project = sampleProject({ design: { insideMargin: 0.5 } });
  const preview = samplePreview(project, 572, { design: { insideMargin: 0.5 } });
  const report = runKdpPreflight({ project, preview, storyLockOk: true });
  assert.equal(report.ready, false);
  assert.equal(report.checks.find((item) => item.id === 'inside-margin').status, 'error');
});

test('image assets block text-first no-bleed export instead of being silently dropped', () => {
  const project = sampleProject({ manuscript: { blocks: [{ id: 'p-1', text: 'Hello' }], metadata: { imageCount: 2 } } });
  const report = runKdpPreflight({ project, preview: samplePreview(project, 572), storyLockOk: true });
  assert.equal(report.ready, false);
  assert.equal(report.checks.find((item) => item.id === 'images').status, 'error');
});

test('hardcover preflight uses independent KDP 75–550 page limit', () => {
  const project = sampleProject();
  const tooLong = runKdpPreflight({ project, preview: samplePreview(project, 552, {}, 'hardcover'), storyLockOk: true, editionType: 'hardcover' });
  assert.equal(tooLong.ready, false);
  assert.equal(tooLong.checks.find((item) => item.id === 'page-count').status, 'error');
  const valid = runKdpPreflight({ project, preview: samplePreview(project, 550, {}, 'hardcover'), storyLockOk: true, editionType: 'hardcover' });
  assert.equal(valid.checks.find((item) => item.id === 'page-count').status, 'pass');
});

test('hardcover trim is blocked outside KDP hardcover sizes', () => {
  const project = sampleProject({ design: { trimWidth: 7, trimHeight: 10 } });
  const report = runKdpPreflight({ project, preview: samplePreview(project, 300, { design: { trimWidth: 7, trimHeight: 10 } }, 'hardcover'), storyLockOk: true, editionType: 'hardcover' });
  assert.equal(report.ready, false);
  assert.equal(report.checks.find((item) => item.id === 'trim').status, 'error');
});

test('stale proof is blocked when current design changes after pagination', () => {
  const project = sampleProject();
  const preview = samplePreview(project, 572);
  project.design.print.insideMargin = 1.4;
  const report = runKdpPreflight({ project, preview, storyLockOk: true });
  assert.equal(report.ready, false);
  assert.equal(report.checks.find((item) => item.id === 'proof-ownership').status, 'error');
});
