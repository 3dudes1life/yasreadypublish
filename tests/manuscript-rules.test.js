import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeBlocks, classifyParagraph, countWords, detectChapters } from '../src/lib/manuscript-rules.js';

test('Story Lock canonicalization preserves exact wording and paragraph boundaries', () => {
  const blocks = [{ text: 'Hello  world.' }, { text: '' }, { text: '[Juan]: te amo.' }];
  assert.equal(canonicalizeBlocks(blocks), 'Hello  world.\u2029\u2029[Juan]: te amo.');
});

test('chapter recognition does not alter chapter wording', () => {
  const source = 'Chapter 12: Fault Lines';
  assert.equal(classifyParagraph({ text: source, styleName: 'Normal' }), 'chapter-title');
  assert.equal(source, 'Chapter 12: Fault Lines');
});

test('text-message recognition preserves bracketed speaker and message', () => {
  const source = '[Michael]: on gravy. also bring tequila.';
  assert.equal(classifyParagraph({ text: source, styleName: 'Normal' }), 'text-message');
  assert.equal(source, '[Michael]: on gravy. also bring tequila.');
});

test('ordinary prose remains body text', () => {
  assert.equal(classifyParagraph({ text: 'Michael walked into the kitchen.', styleName: 'Normal' }), 'body');
});

test('chapter detection tracks boundaries without mutating blocks', () => {
  const blocks = [
    { id: 'p-1', index: 0, kind: 'chapter-title', text: 'Chapter 1: Home' },
    { id: 'p-2', index: 1, kind: 'body', text: 'Exact first sentence.' },
    { id: 'p-3', index: 2, kind: 'chapter-title', text: 'Chapter 2: Morning Light' },
    { id: 'p-4', index: 3, kind: 'body', text: 'Exact second sentence.' },
  ];
  const chapters = detectChapters(blocks);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].title, 'Chapter 1: Home');
  assert.equal(blocks[1].text, 'Exact first sentence.');
});

test('word count does not normalize stored content', () => {
  const source = 'Two   spaces stay.';
  assert.equal(countWords(source), 3);
  assert.equal(source, 'Two   spaces stay.');
});
