import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldPreserveStructuredSourceSpacing,
  sourceStructuredExtraGapIn,
  sourceStructuredGapEm,
} from '../src/lib/source-spacing.js';

test('1.0.45 preserves explicit DOCX spacing after text-message paragraphs', () => {
  const block = { kind:'text-message', text:'[Juan]: HE BOOKED A FLIGHT', layout:{ spaceAfterTwips:240 } };
  assert.equal(shouldPreserveStructuredSourceSpacing(block, 'text-message'), true);
  assert.equal(sourceStructuredGapEm(block, 0.2, 'text-message'), 1);
  assert.ok(Math.abs(sourceStructuredExtraGapIn(block, 0.12, 'text-message') - (240/1440 - 0.12)) < 1e-9);
});

test('1.0.45 does not import ordinary body spacing into the book theme', () => {
  const block = { kind:'body', text:'Normal prose.', layout:{ spaceAfterTwips:240 } };
  assert.equal(shouldPreserveStructuredSourceSpacing(block, 'body'), false);
  assert.equal(sourceStructuredGapEm(block, 0.2, 'body'), 0.2);
  assert.equal(sourceStructuredExtraGapIn(block, 0.12, 'body'), 0);
});

test('1.0.45 ignores tiny micro-spacing but preserves meaningful structured gaps', () => {
  const small = { kind:'text-message', layout:{ spaceAfterTwips:80 } };
  const large = { kind:'text-message', layout:{ spaceAfterTwips:360 } };
  assert.equal(shouldPreserveStructuredSourceSpacing(small, 'text-message'), false);
  assert.equal(sourceStructuredGapEm(small, 0.25, 'text-message'), 0.25);
  assert.equal(shouldPreserveStructuredSourceSpacing(large, 'text-message'), true);
  assert.equal(sourceStructuredGapEm(large, 0.25, 'text-message'), 1.5);
});
