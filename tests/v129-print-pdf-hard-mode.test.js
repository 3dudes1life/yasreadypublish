import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPrintPdfBytes, buildRasterPdf, PRINT_PDF_DPI } from '../src/lib/print-pdf.js';
import { migrateProject } from '../src/lib/project.js';
import { invalidateEditionProof } from '../src/lib/editions.js';

function fakePage(widthPx=1800,heightPx=2700) {
  return { jpegBytes:new Uint8Array([0xff,0xd8,0xff,0xdb,0,1,0xff,0xd9]), widthPx, heightPx };
}

function baseProject() {
  return {
    version:28, appVersion:'1.0.28', title:'Test', author:'Author',
    source:{ manuscriptHash:'hash', fileName:'test.docx' },
    storyLock:{ enabled:true, status:'verified' },
    manuscript:{ blocks:[], chapters:[], notes:[], media:[], stats:{}, metadata:{} },
    design:{ print:{}, ebook:{} }, structureOverrides:{}, presentationOverrides:{ ebook:{}, paperback:{}, hardcover:{} },
    editions:{ paperback:{ enabled:true, lastPdfAudit:{ ready:true, sha256:'old' } }, hardcover:{ enabled:false }, ebook:{ enabled:false }, activePrint:'paperback' },
  };
}

test('1.0.29 builds an exact-size PDF with one 300 DPI raster page per physical page', () => {
  const built = buildRasterPdf({ pages:[fakePage(),fakePage()], pageWidthIn:6, pageHeightIn:9, dpi:PRINT_PDF_DPI });
  const audit = auditPrintPdfBytes(built.bytes,{ pageCount:2,pageWidthIn:6,pageHeightIn:9,dpi:300 });
  assert.equal(audit.ready,true);
  assert.equal(audit.summary.errors,0);
  assert.match(new TextDecoder().decode(built.bytes.slice(0,80)),/%PDF-1.4/);
  assert.equal(audit.checks.find((c)=>c.id==='page-count').status,'pass');
  assert.equal(audit.checks.find((c)=>c.id==='page-size').status,'pass');
  assert.equal(audit.checks.find((c)=>c.id==='fonts').status,'pass');
});

test('1.0.29 PDF audit blocks encryption and wrong physical page size', () => {
  const built = buildRasterPdf({ pages:[fakePage()], pageWidthIn:6, pageHeightIn:9 });
  const badSize = auditPrintPdfBytes(built.bytes,{ pageCount:1,pageWidthIn:5.5,pageHeightIn:8.5,dpi:300 });
  assert.equal(badSize.ready,false);
  assert.equal(badSize.checks.find((c)=>c.id==='page-size').status,'error');
  const tampered = new Uint8Array([...built.bytes,...new TextEncoder().encode('/Encrypt')]);
  const encrypted = auditPrintPdfBytes(tampered,{ pageCount:1,pageWidthIn:6,pageHeightIn:9,dpi:300 });
  assert.equal(encrypted.ready,false);
  assert.equal(encrypted.checks.find((c)=>c.id==='encryption').status,'error');
});

test('1.0.29 migration clears stale pre-Hard-Mode PDF audit without touching manuscript text', () => {
  const project=baseProject();
  const before=JSON.stringify(project.manuscript);
  const migrated=migrateProject(project);
  assert.equal(migrated.version, 33);
  assert.equal(migrated.appVersion,'1.0.33');
  assert.equal(migrated.editions.paperback.lastPdfAudit,null);
  assert.equal(JSON.stringify(migrated.manuscript),before);
});

test('1.0.29 print proof invalidation also invalidates the finished PDF audit', () => {
  const project=baseProject();
  project.version=29; project.appVersion='1.0.29';
  const migrated=migrateProject(project);
  migrated.editions.paperback.lastPdfAudit={ ready:true, sha256:'current' };
  invalidateEditionProof(migrated,'paperback',{ clearPageCount:false });
  assert.equal(migrated.editions.paperback.lastPdfAudit,null);
});
