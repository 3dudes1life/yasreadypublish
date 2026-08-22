import test from 'node:test';
import assert from 'node:assert/strict';
import { TRES_AMIGOS_TEMPLATE } from '../src/lib/print-model.js';
import { buildProofSignature, stampPreviewProof, verifyPreviewProof } from '../src/lib/proof-integrity.js';

function project() {
  return {
    title:'Fault Lines', author:'D.C.W.', source:{manuscriptHash:'abc123'}, structureOverrides:{},
    design:{print:{...TRES_AMIGOS_TEMPLATE}},
    editions:{paperback:{enabled:true,design:{...TRES_AMIGOS_TEMPLATE}},hardcover:{enabled:false,design:{...TRES_AMIGOS_TEMPLATE}},ebook:{enabled:true,design:{}},activePrint:'paperback'},
  };
}

function preview(p) {
  return stampPreviewProof({pages:[{number:1}],design:{...TRES_AMIGOS_TEMPLATE}}, {project:p,design:TRES_AMIGOS_TEMPLATE,editionType:'paperback'});
}

test('proof signature is stable for identical project/design state', () => {
  const p = project();
  assert.equal(buildProofSignature({project:p,design:TRES_AMIGOS_TEMPLATE,editionType:'paperback'}), buildProofSignature({project:p,design:{...TRES_AMIGOS_TEMPLATE},editionType:'paperback'}));
});

test('fresh preview verifies against current edition', () => {
  const p = project();
  assert.equal(verifyPreviewProof({project:p,preview:preview(p),editionType:'paperback'}).ok,true);
});

test('design change invalidates a frozen proof', () => {
  const p = project();
  const frozen = preview(p);
  p.editions.paperback.design = {...p.editions.paperback.design,insideMargin:1.4};
  p.design.print = {...p.editions.paperback.design};
  assert.equal(verifyPreviewProof({project:p,preview:frozen,editionType:'paperback'}).ok,false);
});

test('structure override invalidates a frozen proof without touching source text', () => {
  const p = project();
  const frozen = preview(p);
  p.structureOverrides['p-9']='chapter-title';
  assert.equal(verifyPreviewProof({project:p,preview:frozen,editionType:'paperback'}).ok,false);
});

test('preview cannot be reused for another edition', () => {
  const p = project();
  const frozen = preview(p);
  assert.equal(verifyPreviewProof({project:p,preview:frozen,editionType:'hardcover'}).reason,'wrong-edition');
});
