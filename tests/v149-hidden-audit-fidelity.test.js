import test from 'node:test';
import assert from 'node:assert/strict';
import { hasHiddenProductionMarkup } from '../src/lib/epub-audit.js';

test('1.0.49 detector does not flag the literal prose word hidden', () => {
  assert.equal(hasHiddenProductionMarkup('<p>Fog hissed from hidden machines.</p>'), false);
});

test('1.0.49 detector does not flag all known Fault Lines hidden phrases', () => {
  const samples = [
    '<p>drags all the hidden feelings out</p>',
    '<p>fake snow drifting down from hidden machines.</p>',
    '<p>music drifting from hidden speakers.</p>',
    '<p>opened a hidden browser tab.</p>',
    '<p>Hurt, quickly hidden.</p>'
  ];
  for (const sample of samples) assert.equal(hasHiddenProductionMarkup(sample), false);
});

test('1.0.49 detector still catches real hidden attributes', () => {
  assert.equal(hasHiddenProductionMarkup('<p hidden>Text</p>'), true);
  assert.equal(hasHiddenProductionMarkup('<p hidden="hidden">Text</p>'), true);
  assert.equal(hasHiddenProductionMarkup("<p hidden='hidden'>Text</p>"), true);
});

test('1.0.49 detector still catches actual hidden inline CSS', () => {
  assert.equal(hasHiddenProductionMarkup('<p style="display:none">Text</p>'), true);
  assert.equal(hasHiddenProductionMarkup('<p style="visibility:hidden">Text</p>'), true);
  assert.equal(hasHiddenProductionMarkup("<p style='font-style:italic; display:none'>Text</p>"), true);
});

test('1.0.49 detector ignores harmless attribute values containing hidden', () => {
  assert.equal(hasHiddenProductionMarkup('<p title="hidden machines">Visible</p>'), false);
  assert.equal(hasHiddenProductionMarkup('<p class="hidden-feelings">Visible</p>'), false);
});
