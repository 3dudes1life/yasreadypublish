import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjacentChapter,
  buildPreviewNavigation,
  currentNavigationEntry,
  spreadIndexForPhysicalPage,
  spreadPageNumbers,
} from '../src/lib/navigator-model.js';

test('physical pages map to the correct spread index', () => {
  assert.equal(spreadIndexForPhysicalPage(1), 0);
  assert.equal(spreadIndexForPhysicalPage(2), 1);
  assert.equal(spreadIndexForPhysicalPage(3), 1);
  assert.equal(spreadIndexForPhysicalPage(55), 27);
});

test('spread index maps to visible physical pages', () => {
  assert.deepEqual(spreadPageNumbers(0), { left: null, right: 1 });
  assert.deepEqual(spreadPageNumbers(1), { left: 2, right: 3 });
  assert.deepEqual(spreadPageNumbers(4), { left: 8, right: 9 });
});

test('preview navigation indexes front matter, chapter starts, and back matter', () => {
  const pages = [
    { number:1, section:'front', bookPageNumber:null, hasChapterTitle:false, chapterTitle:'' },
    { number:2, section:'front', bookPageNumber:null, hasChapterTitle:false, chapterTitle:'' },
    { number:3, section:'body', bookPageNumber:1, hasChapterTitle:true, chapterTitle:'Chapter 1: Home' },
    { number:4, section:'body', bookPageNumber:2, hasChapterTitle:false, chapterTitle:'Chapter 1: Home' },
    { number:5, section:'body', bookPageNumber:3, hasChapterTitle:true, chapterTitle:'Chapter 2: Morning' },
    { number:6, section:'back', bookPageNumber:4, hasChapterTitle:false, chapterTitle:'' },
  ];
  const nav = buildPreviewNavigation(pages);
  assert.deepEqual(nav.map((entry) => entry.type), ['front','chapter','chapter','back']);
  assert.equal(nav[1].physicalPage, 3);
  assert.equal(nav[2].spreadIndex, 2);
  assert.equal(nav[3].title, 'Back Matter');
});

test('current and adjacent chapter navigation use physical page position', () => {
  const entries = [
    { type:'front', title:'Front Matter', physicalPage:1 },
    { type:'chapter', title:'Chapter 1', physicalPage:3 },
    { type:'chapter', title:'Chapter 2', physicalPage:9 },
    { type:'chapter', title:'Chapter 3', physicalPage:17 },
  ];
  assert.equal(currentNavigationEntry(entries, 10).title, 'Chapter 2');
  assert.equal(adjacentChapter(entries, 10, -1).title, 'Chapter 2');
  assert.equal(adjacentChapter(entries, 10, 1).title, 'Chapter 3');
});
