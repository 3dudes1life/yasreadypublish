import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMatter, chapterForBlockIndex, matterSectionForBlockIndex, runningHeaderText } from '../src/lib/structure-model.js';

const blocks = [
  { id:'p-1', index:0, kind:'front-back-heading', text:'Copyright', style:{name:'Normal'} },
  { id:'p-2', index:1, kind:'body', text:'Copyright text', style:{name:'Normal'} },
  { id:'p-3', index:2, kind:'chapter-title', text:'Chapter 1: Home', style:{name:'Heading 1'} },
  { id:'p-4', index:3, kind:'chapter-opening', text:'Opening', style:{name:'Normal'} },
  { id:'p-5', index:4, kind:'chapter-title', text:'Chapter 2: Next', style:{name:'Heading 1'} },
  { id:'p-6', index:5, kind:'body', text:'Story', style:{name:'Normal'} },
  { id:'p-7', index:6, kind:'front-back-heading', text:'About the Authors:', style:{name:'Heading 1'} },
  { id:'p-8', index:7, kind:'body', text:'Bio', style:{name:'Normal'} },
];

test('matter map separates front, body and recognized back matter without moving blocks', () => {
  const map = analyzeMatter(blocks);
  assert.equal(map.firstChapterIndex, 2);
  assert.equal(map.backMatterStartIndex, 6);
  assert.deepEqual(map.counts, { frontMatterBlocks: 2, chapters: 2, backMatterBlocks: 2 });
  assert.equal(matterSectionForBlockIndex(1, map), 'front');
  assert.equal(matterSectionForBlockIndex(3, map), 'body');
  assert.equal(matterSectionForBlockIndex(7, map), 'back');
});

test('chapter lookup returns the current chapter only inside story body', () => {
  const map = analyzeMatter(blocks);
  assert.equal(chapterForBlockIndex(3, map)?.title, 'Chapter 1: Home');
  assert.equal(chapterForBlockIndex(5, map)?.title, 'Chapter 2: Next');
  assert.equal(chapterForBlockIndex(7, map), null);
});

test('running headers are generated from metadata, not manuscript edits', () => {
  assert.equal(runningHeaderText({ side:'left', projectTitle:'Tres Amigos', chapterTitle:'Chapter 8', mode:'book-chapter' }), 'Tres Amigos');
  assert.equal(runningHeaderText({ side:'right', projectTitle:'Tres Amigos', chapterTitle:'Chapter 8', mode:'book-chapter' }), 'Chapter 8');
  assert.equal(runningHeaderText({ side:'left', projectTitle:'Book', author:'D.C.W.', mode:'author-book' }), 'D.C.W.');
  assert.equal(runningHeaderText({ side:'right', projectTitle:'Book', author:'D.C.W.', mode:'author-book' }), 'Book');
});
