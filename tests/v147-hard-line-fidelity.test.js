import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceStructuredLineHeight } from '../src/lib/source-spacing.js';

test('1.0.47 reproduces the exact Fault Lines DOCX signal: 480-twip auto line spacing on hard-break text messages', () => {
  const block = {
    kind:'text-message',
    text:'[Juan]: HE BOOKED A FLIGHT\n[Juan]: CHRISTOPHER IS LEAVING TODAY\n[Juan]: SUITCASE BY THE DOOR\n[Juan]: I CAN\'T FIX THIS',
    layout:{ lineTwips:480, lineRule:'auto' }
  };
  assert.equal(sourceStructuredLineHeight(block, 1.2, 'text-message'), 2);
});

test('1.0.47 preserves 480-twip hard-line spacing for the Dani/Iggy/Michael message paragraph', () => {
  const block = {
    kind:'text-message',
    text:'[Dani]: NO! ABSOLUTELY NOT.\n[Iggy]: I’m calling you right now.\n[Michael]: I’m on my way home.',
    layout:{ lineTwips:480, lineRule:'auto' }
  };
  assert.equal(sourceStructuredLineHeight(block, 1.2, 'text-message'), 2);
});

test('1.0.47 does not force source line spacing on ordinary prose', () => {
  const block = { kind:'body', text:'Normal paragraph\nwith a hard break.', layout:{ lineTwips:480, lineRule:'auto' } };
  assert.equal(sourceStructuredLineHeight(block, 1.25, 'body'), 1.25);
});

test('1.0.47 does not inflate a one-line text message', () => {
  const block = { kind:'text-message', text:'[Juan]: One line only', layout:{ lineTwips:480, lineRule:'auto' } };
  assert.equal(sourceStructuredLineHeight(block, 1.25, 'text-message'), 1.25);
});
