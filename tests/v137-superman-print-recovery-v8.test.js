import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isExpectedStructuralEmptyPage } from '../src/lib/preflight-model.js';
import { FULL_WRAP_ART_VERSION } from '../src/lib/full-wrap-art.js';

test('1.0.37 Superman recovery recognizes Barcode Brain parity spacer as expected infrastructure', () => {
  assert.equal(isExpectedStructuralEmptyPage({intentionalBlank:false,barcodeSpacer:true,blankReason:'barcode-left-alignment',fragments:[]}),true);
  assert.equal(isExpectedStructuralEmptyPage({intentionalBlank:true,fragments:[]}),true);
  assert.equal(isExpectedStructuralEmptyPage({intentionalBlank:false,blankReason:'',fragments:[]}),false);
});

test('1.0.37 Superman recovery advances manufactured artwork to Cover Engine v11', () => {
  assert.equal(FULL_WRAP_ART_VERSION,11);
  const source=readFileSync(new URL('../src/lib/full-wrap-art.js',import.meta.url),'utf8');
  for (const marker of ['protectedContentMask:true','protectedPixelFraction','neutralHighDetail','gradientThreshold','selectArtworkLockedSpineCandidate']) {
    assert.ok(source.includes(marker), 'missing v8 cover marker: ' + marker);
  }
});

test('1.0.37 Superman recovery keeps generated barcode spacer out of unexplained-empty errors', () => {
  const source=readFileSync(new URL('../src/lib/preflight-model.js',import.meta.url),'utf8');
  assert.ok(source.includes('isExpectedStructuralEmptyPage(page)'));
  assert.ok(source.includes('generated structural spacer page(s) are intentionally content-free for final-page parity'));
});

test('1.0.37 Superman recovery keeps accept/save inside Simple Mode and forces interior-before-cover order', () => {
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.ok(main.includes("state.activeView = state.simpleStep === 'export' ? 'export-simple' : state.simpleStep === 'preview' ? 'preview-simple' : 'style-simple';"));
  assert.ok(main.includes('const interiorCurrentForCover = Boolean('));
  assert.ok(main.includes('Build the current interior PDF first.'));
});
