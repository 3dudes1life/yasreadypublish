import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planSeamlessSpineExpansion } from '../src/lib/full-wrap-art.js';
import { migrateProject } from '../src/lib/project.js';

test('1.0.37 texture hotfix preserves real 2D spine texture while expanding Book 2 geometry', () => {
  const plan = planSeamlessSpineExpansion({ sourceSpinePx:285, targetSpinePx:547.5, sourceToTargetScale:1 });
  assert.equal(plan.mode, 'texture-safe-expand');
  assert.equal(plan.backgroundMode, 'verified-2d-edge-texture');
  assert.equal(plan.preserves2dTexture, true);
  assert.equal(plan.rawArtworkCopiedIntoExtension, false);
  assert.ok(plan.edgeInsetSourcePx >= 2 && plan.edgeInsetSourcePx <= 8, 'edge inset should remove fold pixels only');
  assert.ok(plan.coreSourceWidthPx > 268, 'too much of the original spine was discarded');
  assert.ok(plan.textureSliceSourcePx >= 6 && plan.textureSliceSourcePx <= 16, 'texture seed became wide enough to risk centered text');
  assert.ok(Math.abs(plan.leftExtraPx - plan.rightExtraPx) < 0.001);
});

test('1.0.37 texture hotfix has no row-median flattening path', () => {
  const source = readFileSync(new URL('../src/lib/full-wrap-art.js', import.meta.url), 'utf8');
  assert.ok(source.includes('selectCleanTextureSeed'));
  assert.ok(source.includes('drawVerifiedTextureBand'));
  assert.ok(source.includes('drawFeatheredOriginalSpine'));
  assert.ok(source.includes('wrap-art-texture-preservation'));
  assert.ok(source.includes('verified-2d-edge-texture'));
  assert.ok(!source.includes('buildRobustSpineBackground'));
  assert.ok(!source.includes('robust-row-median'));
});

test('1.0.37 texture hotfix never samples a wide centered spine strip as extension texture', () => {
  const plan = planSeamlessSpineExpansion({ sourceSpinePx:147.4, targetSpinePx:282.9, sourceToTargetScale:1 });
  assert.ok(plan.textureSliceSourcePx < plan.sourceSpinePx * 0.08);
  assert.equal(plan.rawArtworkCopiedIntoExtension, false);
});

test('1.0.37 exact spine geometry does not synthesize or crop artwork', () => {
  const plan = planSeamlessSpineExpansion({ sourceSpinePx:547.5, targetSpinePx:547.5, sourceToTargetScale:1 });
  assert.equal(plan.mode, 'exact');
  assert.equal(plan.edgeInsetSourcePx, 0);
  assert.equal(plan.leftExtraPx, 0);
  assert.equal(plan.rightExtraPx, 0);
  assert.equal(plan.rawArtworkCopiedIntoExtension, false);
  assert.equal(plan.preserves2dTexture, true);
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
