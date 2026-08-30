import test from 'node:test';
import assert from 'node:assert/strict';
import { blankRenderMode } from '../src/lib/spacing-policy.js';

const b = (kind, text='') => ({ kind, text });

test('1.0.46 collapse theme preserves a real blank between two text messages', () => {
  const blocks = [b('text-message','[Juan]: HE BOOKED A FLIGHT'), b('blank'), b('text-message','[Juan]: CHRISTOPHER IS LEAVING TODAY')];
  assert.equal(blankRenderMode({ blocks, index:1, sectionType:'chapter', policy:'collapse' }), 'normalize');
});

test('1.0.46 collapse theme preserves a real blank between message and narration', () => {
  const beforeNarration = [b('text-message','[Juan]: I CAN’T FIX THIS'), b('blank'), b('body','The typing bubbles appeared instantly.')];
  const afterNarration = [b('body','The typing bubbles appeared instantly.'), b('blank'), b('text-message','[Dani]: NO! ABSOLUTELY NOT.')];
  assert.equal(blankRenderMode({ blocks:beforeNarration, index:1, sectionType:'chapter', policy:'collapse' }), 'normalize');
  assert.equal(blankRenderMode({ blocks:afterNarration, index:1, sectionType:'chapter', policy:'collapse' }), 'normalize');
});

test('1.0.46 ordinary prose blanks still collapse under the Tres Amigos collapse theme', () => {
  const blocks = [b('body','Paragraph one.'), b('blank'), b('body','Paragraph two.')];
  assert.equal(blankRenderMode({ blocks, index:1, sectionType:'chapter', policy:'collapse' }), 'collapse');
});

test('1.0.46 multiple message blank lines render only one spacer', () => {
  const blocks = [b('text-message','[Juan]: One'), b('blank'), b('blank'), b('text-message','[Juan]: Two')];
  assert.equal(blankRenderMode({ blocks, index:1, sectionType:'chapter', policy:'collapse' }), 'normalize');
  assert.equal(blankRenderMode({ blocks, index:2, sectionType:'chapter', policy:'collapse' }), 'collapse');
});
