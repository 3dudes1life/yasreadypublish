import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  analyzeSpineRasterQuality,
  buildContentAwareStretchMap,
  compositeNativeSpineCore,
  planSeamlessSpineExpansion,
} from '../src/lib/full-wrap-art.js';
import { migrateProject } from '../src/lib/project.js';

function makeRgba(width, height, paint) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r,g,b] = paint(x,y);
      const i = (y * width + x) * 4;
      out[i] = r; out[i+1] = g; out[i+2] = b; out[i+3] = 255;
    }
  }
  return out;
}

test('1.0.37 cover-engine rebuild uses content-aware elastic retargeting for Book 2 geometry', () => {
  const plan = planSeamlessSpineExpansion({ sourceSpinePx:285, targetSpinePx:547.5, sourceToTargetScale:1 });
  assert.equal(plan.mode, 'content-aware-elastic');
  assert.equal(plan.backgroundMode, 'content-aware-underlay+native-core');
  assert.equal(plan.usesTiling, false);
  assert.equal(plan.usesRowFlattening, false);
  assert.equal(plan.contentAware, true);
  assert.equal(plan.preserves2dTexture, true);
  assert.equal(plan.sourceTargetWidthPx, 285);
  assert.equal(plan.targetWidthPx, 548);
  assert.equal(plan.extraTargetPx, 263);
});

test('1.0.37 cover-engine v6 keeps elastic underlay bounded while background absorbs width', () => {
  const energy = new Float64Array(120);
  energy.fill(2);
  for (let x = 42; x < 78; x += 1) energy[x] = 100;
  const map = buildContentAwareStretchMap(energy, 200);
  assert.ok(map.protectedP90Stretch <= 1.28, `protected art stretched ${map.protectedP90Stretch}`);
  assert.ok(map.protectedMedianStretch <= 1.28);
  assert.ok(map.maxAssignedStretch > 1.2, 'low-detail background did not absorb expansion');
  assert.ok(map.maxAssignedStretch <= 4.5);
});


test('1.0.37 cover-engine v6 restores the original spine core at exact 1:1 raster scale', () => {
  const sourceWidth = 120, targetWidth = 220, height = 48;
  const source = makeRgba(sourceWidth,height,(x,y) => {
    const textBand = x >= 44 && x <= 76 && ((y % 17) < 8);
    return textBand ? [244,236,194] : [12 + (x % 9), 92 + (y % 11), 84 + ((x+y) % 7)];
  });
  const underlay = makeRgba(targetWidth,height,(x,y) => [20 + (x % 5), 98 + (y % 7), 90]);
  const native = compositeNativeSpineCore(underlay,targetWidth,source,sourceWidth,height);
  assert.equal(native.metrics.nativeScaleX,1);
  assert.equal(native.metrics.nativeScaleY,1);
  assert.ok(native.metrics.protectedCoreFraction >= 0.94);
  assert.equal(native.metrics.nativeCoreMeanAbsError,0);

  const quality = analyzeSpineRasterQuality(native.rgba,targetWidth,height,{
    protectedMedianStretch:1.03,
    protectedP90Stretch:1.03,
    maxAssignedStretch:4.2,
    nativeCore:native.metrics,
  });
  assert.equal(quality.checks.find((item)=>item.id==='wrap-art-native-core-preservation')?.status,'pass');
});

test('1.0.37 cover-engine visual QA rejects horizontal stripe/banding manufacture', () => {
  const width = 180, height = 180;
  const raster = makeRgba(width,height,(_x,y) => {
    const v = Math.floor(y/4) % 2 ? 80 : 180;
    return [v,v,v];
  });
  const quality = analyzeSpineRasterQuality(raster,width,height);
  assert.equal(quality.ready,false);
  assert.ok(quality.metrics.worstBand > 4, `banding score ${quality.metrics.worstBand} should fail`);
  assert.equal(quality.checks.find((item)=>item.id==='wrap-art-horizontal-banding')?.status,'error');
});

test('1.0.37 cover-engine visual QA rejects short-period repeated texture', () => {
  const width = 180, height = 180;
  const raster = makeRgba(width,height,(x,y) => {
    const v = (x % 8) < 4 ? 80 + ((y*7)%23) : 170 + ((y*5)%19);
    return [v,Math.min(255,v+5),Math.min(255,v+10)];
  });
  const quality = analyzeSpineRasterQuality(raster,width,height);
  assert.equal(quality.ready,false);
  assert.ok(quality.metrics.worstRepeat > 1.9, `repetition score ${quality.metrics.worstRepeat} should fail`);
  assert.equal(quality.checks.find((item)=>item.id==='wrap-art-periodic-repetition')?.status,'error');
});

test('1.0.37 cover-engine visual QA allows non-periodic two-dimensional texture', () => {
  const width = 180, height = 180;
  const raster = makeRgba(width,height,(x,y) => {
    const v = 110 + 20*Math.sin(x*0.073+y*0.031) + 10*Math.cos(x*0.019-y*0.067);
    return [v,Math.min(255,v+20),Math.max(0,v-10)];
  });
  const quality = analyzeSpineRasterQuality(raster,width,height);
  assert.equal(quality.ready,true);
  assert.ok(quality.metrics.worstBand <= 4);
  assert.ok(quality.metrics.worstRepeat <= 1.9);
});

test('1.0.37 cover-engine source contains no strip tiler or row-flattening generator', () => {
  const source = readFileSync(new URL('../src/lib/full-wrap-art.js', import.meta.url), 'utf8');
  assert.ok(source.includes('computeSpineColumnEnergy'));
  assert.ok(source.includes('buildContentAwareStretchMap'));
  assert.ok(source.includes('retargetSpineRgba'));
  assert.ok(source.includes('compositeNativeSpineCore'));
  assert.ok(source.includes('wrap-art-native-core-preservation'));
  assert.ok(source.includes('analyzeSpineRasterQuality'));
  assert.ok(source.includes('wrap-art-horizontal-banding'));
  assert.ok(source.includes('wrap-art-periodic-repetition'));
  assert.ok(!source.includes('drawVerifiedTextureBand'));
  assert.ok(!source.includes('selectCleanTextureSeed'));
  assert.ok(!source.includes('buildRobustSpineBackground'));
  assert.ok(!source.includes('robust-row-median'));
});

test('1.0.37 exact spine geometry stays exact and wider source is never auto-cropped', () => {
  const exact = planSeamlessSpineExpansion({ sourceSpinePx:547.5, targetSpinePx:547.5, sourceToTargetScale:1 });
  assert.equal(exact.mode,'exact');
  assert.equal(exact.extraTargetPx,0);
  assert.throws(() => planSeamlessSpineExpansion({ sourceSpinePx:600, targetSpinePx:547.5 }), /would crop/);
});

test('1.0.37 print preview preserves hard line breaks for back-matter body copy', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(main.includes("const matterWhiteSpace = ['matter-back-heading','matter-back-body'].includes(fragment.kind) ? 'pre-wrap' : 'normal';"));
  assert.ok(main.includes('white-space:' + '$' + '{matterWhiteSpace}'));
});

test('1.0.37 manufacturing flow persists renderer visual QA and generator version', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(main.includes('FULL_WRAP_ART_VERSION'));
  assert.ok(main.includes('packaged.audit?.checks'));
  assert.ok(main.includes('generatorVersion:packaged.generatorVersion'));
  assert.ok(main.includes('visualQuality:packaged.visualQuality'));
  assert.ok(main.includes('spineAdaptation:packaged.spineAdaptation'));
});

test('1.0.37 print release gate rejects stale or visually unsafe manufactured cover engines', () => {
  const gate = readFileSync(new URL('../src/lib/print-release-gate.js', import.meta.url), 'utf8');
  assert.ok(gate.includes('FULL_WRAP_ART_VERSION'));
  assert.ok(gate.includes('manufacturedCoverCurrent'));
  assert.ok(gate.includes('cover?.visualQuality?.ready === true'));
  assert.ok(gate.includes('coverGeneratorVersion'));
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
  assert.equal(migrated.version,37);
  assert.equal(migrated.appVersion,'1.0.37');
  assert.equal(migrated.editions.paperback.lastPageCount,null);
  assert.equal(migrated.editions.paperback.lastPdfAudit,null);
  assert.equal(migrated.editions.paperback.lastCoverAudit,null);
  assert.equal(migrated.editions.paperback.printGate.visualProof,null);
  assert.equal(migrated.editions.paperback.printGate.freeze,null);
  assert.equal(migrated.editions.paperback.printGate.external.kdpPrintPreviewApproved,false);
  assert.equal(JSON.stringify(migrated.editions.ebook.releaseGate),kindle);
});
