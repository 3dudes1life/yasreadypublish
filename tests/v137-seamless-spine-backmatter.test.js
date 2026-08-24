import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planSeamlessSpineExpansion } from '../src/lib/full-wrap-art.js';
import { migrateProject } from '../src/lib/project.js';

test('1.0.37 Book 2 stale spine drops old fold-edge pixels before expansion', () => {
  const plan = planSeamlessSpineExpansion({ sourceSpinePx:285, targetSpinePx:547.5, sourceToTargetScale:1 });
  assert.equal(plan.mode, 'seamless-expand');
  assert.ok(plan.edgeInsetSourcePx >= 8 && plan.edgeInsetSourcePx <= 18, 'edge inset out of expected range');
  assert.ok(plan.coreSourceWidthPx < 285);
  assert.ok(plan.coreSourceWidthPx > 250, 'preserved spine core became too narrow');
  assert.ok(Math.abs(plan.leftExtraPx - plan.rightExtraPx) < 0.001);
  assert.ok(plan.textureSliceSourcePx > 30);
  assert.ok(plan.featherPx >= 10);
});

test('1.0.37 exact spine geometry does not synthesize or crop artwork', () => {
  const plan = planSeamlessSpineExpansion({ sourceSpinePx:547.5, targetSpinePx:547.5, sourceToTargetScale:1 });
  assert.equal(plan.mode, 'exact');
  assert.equal(plan.edgeInsetSourcePx, 0);
  assert.equal(plan.leftExtraPx, 0);
  assert.equal(plan.rightExtraPx, 0);
});

test('1.0.37 refuses a target that would crop a wider source spine', () => {
  assert.throws(() => planSeamlessSpineExpansion({ sourceSpinePx:600, targetSpinePx:547.5 }), /would crop/);
});

test('1.0.37 print preview preserves hard line breaks for back-matter body copy', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(main.includes("const matterWhiteSpace = ['matter-back-heading','matter-back-body'].includes(fragment.kind) ? 'pre-wrap' : 'normal';"));
  assert.ok(main.includes('white-space:' + '$' + '{matterWhiteSpace}'));
});

test('1.0.37 migration invalidates print cover proof but preserves Kindle release proof', () => {
  const old = {
    id:'m37', version:36, appVersion:'1.0.36', title:'Fault Lines', author:'D.C.W.',
    source:{fileName:'book.docx',manuscriptHash:'story'}, storyLock:{enabled:true,status:'verified'},
    manuscript:{blocks:[],chapters:[],notes:[],media:[],stats:{},metadata:{}}, design:{print:{},ebook:{}},
    structureOverrides:{}, presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    editions:{
      paperback:{enabled:true,coverMode:'upload-art',uploadedCoverArt:{fileName:'wrap.jpg',mimeType:'image/jpeg',dataUrl:'data:image/jpeg;base64,AA=='},lastPageCount:730,lastPdfAudit:{sha256:'i'},lastCoverAudit:{sha256:'c'},printGate:{visualProof:{token:'p'},freeze:{token:'p'},external:{kdpPrintPreviewApproved:{value:true,token:'p'}}}},
      hardcover:{enabled:false},
      ebook:{enabled:true,releaseGate:{visualProof:{token:'k'},freeze:{token:'k'},external:{kindlePreviewerOpened:{value:true,token:'k'},enhancedTypesetting:{value:true,token:'k'}}}},
      activePrint:'paperback'
    }
  };
  const kindle = JSON.stringify(old.editions.ebook.releaseGate);
  const migrated = migrateProject(old);
  assert.equal(migrated.version, 37);
  assert.equal(migrated.appVersion, '1.0.37');
  assert.equal(migrated.editions.paperback.lastPageCount, null);
  assert.equal(migrated.editions.paperback.lastPdfAudit, null);
  assert.equal(migrated.editions.paperback.lastCoverAudit, null);
  assert.equal(migrated.editions.paperback.printGate.visualProof, null);
  assert.equal(migrated.editions.paperback.printGate.freeze, null);
  assert.equal(migrated.editions.paperback.printGate.external.kdpPrintPreviewApproved, false);
  assert.equal(JSON.stringify(migrated.editions.ebook.releaseGate), kindle);
});
