import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { capturePrintSetupState, planPrintSetupInvalidation, printProductionFingerprint } from '../src/lib/print-state-invalidation.js';

const edition=(overrides={})=>({
  production:{configured:true,trimId:'6x9',ink:'black',paper:'cream',bleed:false},
  design:{insideMargin:1.25,outsideMargin:0.5,topMargin:0.5,bottomMargin:0.75},
  coverMode:'upload-art',
  coverBrain:{amazonBarcode:true},
  uploadedCoverArt:{sha256:'a'},
  uploadedCoverPdf:null,
  kdpMetadata:{isbnMode:'own',isbn:'9798998826948'},
  barcodeBrain:{enabled:true,includeInterior:true,coverPlacement:'amazon'},
  ...overrides,
});

test('1.0.37 accepting a different cover is cover-only and preserves interior certification',()=>{
  const before=capturePrintSetupState(edition(),'paperback');
  const after=capturePrintSetupState(edition({uploadedCoverArt:{sha256:'b'}}),'paperback');
  const plan=planPrintSetupInvalidation(before,after);
  assert.equal(plan.interiorChanged,false);
  assert.equal(plan.coverChanged,true);
});

test('1.0.37 normalized Print Brain production fingerprints are stable',()=>{
  const a=printProductionFingerprint({configured:true,trimId:'6x9',ink:'black',paper:'cream',bleed:false},'paperback');
  const b=printProductionFingerprint({paper:'cream',ink:'black',bleed:false,trimId:'6x9',configured:true},'paperback');
  assert.equal(a,b);
});

test('1.0.37 main does not re-style or clear preflight during cover-only acceptance',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.ok(main.includes('const productionChangedByForm = setupBefore.production !== printProductionFingerprint(production, type);'));
  assert.ok(main.includes('if (productionChangedByForm || useRecommended)'));
  assert.ok(main.includes('if (setupInvalidation.interiorChanged) {'));
  assert.ok(main.includes("state.simpleStep = state.preview ? 'export' : 'preview';"));
  const coverBranch=main.slice(main.indexOf('else if (setupInvalidation.coverChanged)'),main.indexOf('state.finalCheck = null;',main.indexOf('else if (setupInvalidation.coverChanged)')));
  assert.ok(!coverBranch.includes('lastPdfAudit = null'));
  assert.ok(!coverBranch.includes('lastPageCount = null'));
  assert.ok(!coverBranch.includes('lastPreflight = null'));
});

test('1.0.37 Amazon Hard Mode presents missing-file dependents as pending instead of fake failures',()=>{
  const hard=readFileSync(new URL('../src/lib/amazon-print-hard-mode.js',import.meta.url),'utf8');
  assert.ok(hard.includes("interiorAudit ? 'error' : 'warning'"));
  assert.ok(hard.includes("coverAudit ? 'error' : 'warning'"));
  assert.ok(hard.includes("Spine text is embedded in the uploaded full-wrap artwork"));
});
