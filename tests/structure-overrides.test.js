import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveBlocks, effectiveChapters, effectiveStats, setStructureOverride, structureOverrideSummary } from '../src/lib/structure-overrides.js';

function project() {
  const blocks = [
    { id:'p-1', index:0, kind:'body', text:'Chapter One — Home', style:{name:'Normal'}, wordCount:3 },
    { id:'p-2', index:1, kind:'body', text:'Exact opening sentence.', style:{name:'Normal'}, wordCount:3 },
    { id:'p-3', index:2, kind:'scene-break', text:'* * *', style:{name:'Normal'}, wordCount:3 },
  ];
  return { manuscript:{ blocks }, structureOverrides:{} };
}

test('structure repair changes classification metadata without changing source text', () => {
  const p = project();
  const before = p.manuscript.blocks.map((b) => b.text).join('\u2029');
  setStructureOverride(p, 'p-1', 'chapter-title');
  const blocks = effectiveBlocks(p);
  assert.equal(blocks[0].kind, 'chapter-title');
  assert.equal(blocks[0].text, 'Chapter One — Home');
  assert.equal(blocks[1].kind, 'chapter-opening');
  assert.equal(p.manuscript.blocks[0].kind, 'body');
  assert.equal(p.manuscript.blocks.map((b) => b.text).join('\u2029'), before);
  assert.equal(effectiveChapters(p).length, 1);
});

test('structure override can be cleared back to source detection', () => {
  const p = project();
  setStructureOverride(p, 'p-3', 'body');
  assert.equal(effectiveBlocks(p)[2].kind, 'body');
  setStructureOverride(p, 'p-3', null);
  assert.equal(effectiveBlocks(p)[2].kind, 'scene-break');
  assert.equal(structureOverrideSummary(p).length, 0);
});

test('structure stats report overrides separately from immutable words', () => {
  const p = project();
  setStructureOverride(p, 'p-1', 'chapter-title');
  const stats = effectiveStats(p);
  assert.equal(stats.structureOverrides, 1);
  assert.equal(stats.chapters, 1);
  assert.equal(stats.words, 10);
});

test('unsupported structure labels are rejected instead of guessed', () => {
  const p = project();
  assert.throws(() => setStructureOverride(p, 'p-1', 'rewrite-the-book'), /Unsupported structure kind/);
});
