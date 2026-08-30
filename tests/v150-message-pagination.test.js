import test from 'node:test';
import assert from 'node:assert/strict';
import { isStructuredMessageTranscript, structuredMessageSegments } from '../src/lib/message-pagination.js';

const sorryNeighbors = [
  '[Dani]: On my way. If nobody has limes I’m leaving.',
  '[Kelly]: Kids almost ready. Respect it.',
  '[Tonya]: Bringing kids. Pray for your furniture.',
  '[Drew]: Packing the car and the trauma.',
  '[Evan]: Bringing opinions and no boundaries.',
  '[Juan]: Gorgeous energy all around.'
].join('\n');

test('1.0.50 recognizes the exact Sorry Neighbors group chat as a pageable transcript', () => {
  assert.equal(isStructuredMessageTranscript({ kind:'text-message', text:sorryNeighbors }), true);
});

test('1.0.50 splits the exact Sorry Neighbors chat into six independent message lines', () => {
  const parts = structuredMessageSegments(sorryNeighbors);
  assert.equal(parts.length, 6);
  assert.deepEqual(parts.map((x) => x.renderText), sorryNeighbors.split('\n'));
  assert.equal(parts.slice(0,-1).every((x) => x.text.endsWith('\n')), true);
  assert.equal(parts.at(-1).text.endsWith('\n'), false);
});

test('1.0.50 segmentation is Story-Lock lossless', () => {
  const parts = structuredMessageSegments(sorryNeighbors);
  assert.equal(parts.map((x) => x.text).join(''), sorryNeighbors);
  for (let i = 1; i < parts.length; i += 1) assert.equal(parts[i-1].end, parts[i].start);
});

test('1.0.50 does not split ordinary prose merely because it contains a hard break', () => {
  assert.equal(isStructuredMessageTranscript({ kind:'body', text:'First line\nSecond line' }), false);
  assert.equal(isStructuredMessageTranscript({ kind:'text-message', text:'Narrative line\n[Juan]: Message' }), false);
});

test('1.0.50 keeps a one-line message as a normal text-message block', () => {
  assert.equal(isStructuredMessageTranscript({ kind:'text-message', text:'[Juan]: One line' }), false);
  assert.equal(structuredMessageSegments('[Juan]: One line').length, 1);
});
