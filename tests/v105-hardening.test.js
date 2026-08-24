import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateProject } from '../src/lib/project.js';

function legacyProject() {
  return {
    id: 'book-v104',
    version: 14,
    appVersion: '1.0.4',
    title: 'Fault Lines',
    author: 'D.C.W.',
    structureOverrides: {},
    source: { manuscriptHash: 'locked-hash' },
    storyLock: { enabled: true, status: 'verified' },
    manuscript: {
      blocks: [
        { id: 'p1', index: 0, kind: 'chapter-title', text: 'Chapter 1: Home', wordCount: 3, style: { name: 'Heading 1' } },
        { id: 'p2', index: 1, kind: 'body', text: 'Exact story text — punctuation stays.', wordCount: 6, style: { name: 'Normal' } },
        { id: 'p3', index: 2, kind: 'blank', text: '', wordCount: 0, style: { name: 'Normal' } },
      ],
      chapters: [],
      stats: { chapters: 1, words: 9, paragraphs: 3 },
      metadata: {},
    },
    design: {
      template: 'Tres Amigos Series · Book 1',
      print: { templateId: 'tres-amigos-book1', paragraphGap: 0.12, bodyBlankPolicy: 'collapse' },
      ebook: { themeId: 'tres-amigos-ebook', paragraphGapEm: 0.7, bodyBlankPolicy: 'collapse' },
    },
    editions: {
      activePrint: 'paperback',
      paperback: { enabled: true, type: 'paperback', design: { templateId: 'tres-amigos-book1', paragraphGap: 0.12, bodyBlankPolicy: 'collapse' }, lastPageCount: 572, lastBuiltAt: '2026-08-21T20:00:00Z', lastPreflight: { ready: true } },
      hardcover: { enabled: true, type: 'hardcover', design: { templateId: 'tres-amigos-hardcover', paragraphGap: 0.12, bodyBlankPolicy: 'collapse' }, lastPageCount: 540, lastBuiltAt: '2026-08-21T20:00:00Z', lastPreflight: { ready: true } },
      ebook: { enabled: true, type: 'ebook', design: { themeId: 'tres-amigos-ebook', paragraphGapEm: 0.7, bodyBlankPolicy: 'collapse' }, lastPreflight: { ready: true } },
    },
  };
}

test('1.0.5 migration preserves exact manuscript blocks while invalidating old proof state', () => {
  const project = legacyProject();
  const before = JSON.stringify(project.manuscript.blocks);
  migrateProject(project);
  assert.equal(JSON.stringify(project.manuscript.blocks), before);
  assert.equal(project.version, 36);
  assert.equal(project.appVersion, '1.0.36');
  assert.equal(project.editions.paperback.lastPageCount, null);
  assert.equal(project.editions.paperback.lastBuiltAt, null);
  assert.equal(project.editions.paperback.lastPreflight, null);
  assert.equal(project.editions.hardcover.lastPageCount, null);
  assert.equal(project.editions.hardcover.lastPreflight, null);
  assert.equal(project.editions.ebook.lastPreflight, null);
});

test('1.0.5 migration retains the uniform Tres Amigos rhythm across enabled editions', () => {
  const project = legacyProject();
  migrateProject(project);
  assert.equal(project.editions.paperback.design.paragraphGap, 0.12);
  assert.equal(project.editions.paperback.design.bodyBlankPolicy, 'collapse');
  assert.equal(project.editions.hardcover.design.paragraphGap, 0.12);
  assert.equal(project.editions.hardcover.design.bodyBlankPolicy, 'collapse');
  assert.equal(project.editions.ebook.design.paragraphGapEm, 0.7);
  assert.equal(project.editions.ebook.design.bodyBlankPolicy, 'collapse');
});
