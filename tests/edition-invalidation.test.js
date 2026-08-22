import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureEditions, invalidateAllEditionProofs, setPrintEditionDesign, setEbookEditionDesign } from '../src/lib/editions.js';
import { TRES_AMIGOS_TEMPLATE } from '../src/lib/print-model.js';
import { DEFAULT_EBOOK_DESIGN } from '../src/lib/ebook-model.js';

function project() {
  const p={design:{print:{...TRES_AMIGOS_TEMPLATE},ebook:{...DEFAULT_EBOOK_DESIGN}},editions:{}};
  ensureEditions(p);
  p.editions.paperback.lastPageCount=600; p.editions.paperback.lastBuiltAt='now'; p.editions.paperback.lastPreflight={ready:true};
  p.editions.hardcover.lastPageCount=500; p.editions.hardcover.lastBuiltAt='now'; p.editions.hardcover.lastPreflight={ready:true};
  p.editions.ebook.lastPreflight={ready:true};
  return p;
}

test('changing paperback design invalidates only paperback proof metadata', () => {
  const p=project();
  setPrintEditionDesign(p,'paperback',{...p.editions.paperback.design,insideMargin:1.4});
  assert.equal(p.editions.paperback.lastPageCount,null);
  assert.equal(p.editions.paperback.lastPreflight,null);
  assert.equal(p.editions.hardcover.lastPageCount,500);
});

test('changing ebook design invalidates ebook final-check state without touching print counts', () => {
  const p=project();
  setEbookEditionDesign(p,{...p.editions.ebook.design,lineHeight:1.5});
  assert.equal(p.editions.ebook.lastPreflight,null);
  assert.equal(p.editions.paperback.lastPageCount,600);
});

test('structure-level invalidation clears all edition proof state', () => {
  const p=project();
  invalidateAllEditionProofs(p);
  assert.equal(p.editions.paperback.lastPageCount,null);
  assert.equal(p.editions.hardcover.lastPageCount,null);
  assert.equal(p.editions.ebook.lastPreflight,null);
});
