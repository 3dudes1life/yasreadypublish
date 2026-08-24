import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planSeamlessSpineExpansion } from '../src/lib/full-wrap-art.js';
import { migrateProject } from '../src/lib/project.js';

test('1.0.37 spine hotfix reconstructs added width without copying source artwork into extension zones', () => {
  const plan = planSeamlessSpineExpansion({ sourceSpinePx:285, targetSpinePx:547.5, sourceToTargetScale:1 });
  assert.equal(plan.mode, 'text-safe-expand');
  assert.equal(plan.backgroundMode, 'robust-row-median');
  assert.equal(plan.rawArtworkCopiedIntoExtension, false);
  assert.ok(plan.edgeInsetSourcePx >= 2 && plan.edgeInsetSourcePx <= 18, 'edge inset out of expected range');
  assert.ok(plan.coreSourceWidthPx < 285);
  assert.ok(plan.coreSourceWidthPx > 250, 'preserved spine core became too narrow');
  assert.ok(Math.abs(plan.leftExtraPx - plan.rightExtraPx) < 0.001);
});

test('1.0.37 spine hotfix contains no mirrored source-strip tiling path', () => {
  const source = readFileSync(new URL('../src/lib/full-wrap-art.js', import.meta.url), 'utf8');
  assert.ok(source.includes('buildRobustSpineBackground'));
  assert.ok(source.includes('drawOriginalSpineArtworkOnce'));
  assert.ok(source.includes('wrap-art-text-duplication-guard'));
  assert.ok(source.includes('extensionArtworkCopies:0'));
  assert.ok(!source.includes('function drawMirroredTextureBand'));
});

test('1.0.37 exact spine geometry does not synthesize or crop artwork', () => {
  const plan = planSeamlessSpineExpansion({ sourceSpinePx:547.5, targetSpinePx:547.5, sourceToTargetScale:1 });
  assert.equal(plan.mode, 'exact');
  assert.equal(plan.edgeInsetSourcePx, 0);
  assert.equal(plan.leftExtraPx, 0);
  assert.equal(plan.rightExtraPx, 0);
  assert.equal(plan.rawArtworkCopiedIntoExtension, false);
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
