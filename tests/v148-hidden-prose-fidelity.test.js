import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeKindleProductionXhtml } from '../src/lib/epub-export.js';

test('1.0.48 preserves the literal prose word hidden in ordinary text nodes', () => {
  const source = '<p>Fog hissed from hidden machines.</p>';
  assert.equal(sanitizeKindleProductionXhtml(source), source);
});

test('1.0.48 preserves every known Fault Lines standalone hidden phrase', () => {
  const samples = [
    '<p>drags all the hidden feelings out</p>',
    '<p>fake snow drifting down from hidden machines.</p>',
    '<p>music drifting from hidden speakers.</p>',
    '<p>opened a hidden browser tab.</p>',
    '<p>Hurt, quickly hidden.</p>',
  ];
  for (const sample of samples) assert.equal(sanitizeKindleProductionXhtml(sample), sample);
});

test('1.0.48 still strips an actual HTML hidden attribute', () => {
  assert.equal(
    sanitizeKindleProductionXhtml('<p hidden="hidden">Visible prose</p>'),
    '<p>Visible prose</p>'
  );
  assert.equal(
    sanitizeKindleProductionXhtml('<span hidden>Visible</span>'),
    '<span>Visible</span>'
  );
});

test('1.0.48 still removes dangerous display/visibility declarations but preserves safe styles', () => {
  const input = '<p style="font-style:italic; display:none; visibility:hidden; margin-left:1em">Text</p>';
  const output = sanitizeKindleProductionXhtml(input);
  assert.match(output, /font-style:italic/);
  assert.match(output, /margin-left:1em/);
  assert.doesNotMatch(output, /display\s*:\s*none/i);
  assert.doesNotMatch(output, /visibility\s*:\s*hidden/i);
  assert.match(output, />Text<\/p>/);
});

test('1.0.48 does not treat words surrounding markup as attributes', () => {
  const input = '<p>The hidden <em>truth</em> stayed hidden.</p>';
  assert.equal(sanitizeKindleProductionXhtml(input), input);
});
