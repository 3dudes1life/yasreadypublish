import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chapterNeedsBlankVerso,
  contentBoxInches,
  applyTemplate,
  BUILT_IN_PRINT_THEMES,
  compareDesignToTemplate,
  normalizePrintDesign,
  pageSide,
  validatePrintDesign,
} from '../src/lib/print-model.js';

test('odd pages are right-hand pages', () => {
  assert.equal(pageSide(1), 'right');
  assert.equal(pageSide(2), 'left');
  assert.equal(pageSide(55), 'right');
});

test('right-hand chapter starts require a blank when next page is even', () => {
  assert.equal(chapterNeedsBlankVerso(2, 'right'), true);
  assert.equal(chapterNeedsBlankVerso(3, 'right'), false);
  assert.equal(chapterNeedsBlankVerso(2, 'next'), false);
});

test('6x9 default produces expected text box', () => {
  const box = contentBoxInches({});
  assert.equal(box.width, 4.25);
  assert.ok(Math.abs(box.height - 7.75) < 1e-9);
});

test('print design normalization clamps unsafe values without mutating story data', () => {
  const design = normalizePrintDesign({ insideMargin: -4, bodyFontSize: 99, chapterStarts: 'weird' });
  assert.equal(design.insideMargin, 0.25);
  assert.equal(design.bodyFontSize, 18);
  assert.equal(design.chapterStarts, 'right');
});

test('validation warns below the long-book working gutter target', () => {
  const result = validatePrintDesign({ insideMargin: 0.5 });
  assert.equal(result.ok, false);
  assert.match(result.warnings.join(' '), /0\.75/);
});


test('Tres Amigos template matches Book 1 calibrated core values', () => {
  const design = applyTemplate('tres-amigos-book1');
  assert.equal(design.trimWidth, 6);
  assert.equal(design.trimHeight, 9);
  assert.equal(design.bodyFont, 'Arial');
  assert.equal(design.bodyFontSize, 12);
  assert.equal(design.firstLineIndent, 0.5);
  assert.equal(design.insideMargin, 1.25);
  assert.equal(design.outsideMargin, 0.5);
  assert.equal(design.chapterStarts, 'right');
});


test('page furniture defaults preserve the Book 1 look', () => {
  const design = applyTemplate('tres-amigos-book1');
  assert.equal(design.pageNumbers, 'outside-bottom');
  assert.equal(design.numberFromFirstChapter, true);
  assert.equal(design.runningHeaders, false);
  assert.equal(design.runningHeaderMode, 'book-chapter');
  assert.equal(design.suppressHeaderOnChapterOpen, true);
});


test('0.6 ships multiple reusable built-in print themes', () => {
  assert.ok(BUILT_IN_PRINT_THEMES.length >= 3);
  assert.ok(BUILT_IN_PRINT_THEMES.some((theme) => theme.templateId === 'tres-amigos-book1'));
  assert.ok(BUILT_IN_PRINT_THEMES.some((theme) => theme.templateId === 'classic-novel'));
});

test('Book 1 calibration reports an exact match for its own profile', () => {
  const design = applyTemplate('tres-amigos-book1');
  const result = compareDesignToTemplate(design);
  assert.equal(result.exact, true);
  assert.equal(result.percent, 100);
});

test('Book 1 calibration flags changed presentation metadata', () => {
  const design = applyTemplate('tres-amigos-book1');
  design.bodyFontSize = 11;
  const result = compareDesignToTemplate(design);
  assert.equal(result.exact, false);
  assert.ok(result.rows.some((row) => row.key === 'bodyFontSize' && !row.match));
});
