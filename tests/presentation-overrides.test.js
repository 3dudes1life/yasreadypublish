import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensurePresentationOverrides,
  setBlockPresentationOverride,
  getBlockPresentationOverride,
  clearBlockPresentationOverride,
  countPresentationOverrides,
} from '../src/lib/presentation-overrides.js';

test('presentation overrides are metadata only and edition scoped', () => {
  const project = { manuscript: { blocks: [{ id: 'p1', text: 'Exact story text.' }] } };
  const before = JSON.stringify(project.manuscript.blocks);
  ensurePresentationOverrides(project);
  setBlockPresentationOverride(project, 'ebook', 'p1', { spaceAfter: 0.9, alignment: 'center' });
  assert.deepEqual(getBlockPresentationOverride(project, 'ebook', 'p1'), { spaceAfter: 0.9, alignment: 'center' });
  assert.equal(getBlockPresentationOverride(project, 'paperback', 'p1'), null);
  assert.equal(countPresentationOverrides(project, 'ebook'), 1);
  assert.equal(JSON.stringify(project.manuscript.blocks), before);
  clearBlockPresentationOverride(project, 'ebook', 'p1');
  assert.equal(countPresentationOverrides(project, 'ebook'), 0);
});

test('presentation override sanitizer clamps unsafe values', () => {
  const project = {};
  setBlockPresentationOverride(project, 'ebook', 'p1', { spaceBefore: 999, spaceAfter: -4, firstLineIndent: 99, alignment: 'bogus', suppressIndent: true });
  assert.deepEqual(getBlockPresentationOverride(project, 'ebook', 'p1'), {
    spaceBefore: 6,
    spaceAfter: 0,
    firstLineIndent: 4,
    suppressIndent: true,
  });
});
