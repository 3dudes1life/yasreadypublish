import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  auditPrintFrontMatterManifest,
  runsForLocalRange,
} from '../src/lib/print-pdf.js';

import { migrateProject } from '../src/lib/project.js';

const matterPage = (number, role, kind, text) => ({
  number,
  side:number % 2 ? 'right' : 'left',
  intentionalBlank:false,
  fragments:[{
    kind,
    text,
    displayText:text,
    matterRole:role,
  }],
});

test('1.0.38 empty source-run list falls back to visible text instead of creating a fake empty run', () => {
  assert.deepEqual(runsForLocalRange([], 0, 12), []);
  assert.deepEqual(runsForLocalRange(null, 0, 12), []);
});

test('1.0.38 semantic print front matter certifies physical 1 title / 2 copyright / 3 dedication before Contents', () => {
  const preview = {
    pages:[
      matterPage(1,'title','matter-title-primary','Tres Amigos, Una Vida'),
      matterPage(2,'copyright','matter-copyright-body','Copyright 2026'),
      matterPage(3,'dedication','matter-dedication-body','This one is for you.'),
      {
        number:4,
        side:'left',
        intentionalBlank:false,
        fragments:[
          { kind:'generated-toc-title', text:'Table of Contents' },
          { kind:'generated-toc-entry', text:'Chapter 1' },
        ],
      },
    ],
  };

  const audit = auditPrintFrontMatterManifest(preview);
  assert.equal(audit.ready, true);
  assert.deepEqual(audit.rolePages, {
    title:1,
    copyright:2,
    dedication:3,
  });
  assert.equal(audit.tocPage, 4);
});

test('1.0.38 front matter fails if a content-bearing physical page is mislabeled blank', () => {
  const preview = {
    pages:[
      {
        ...matterPage(1,'title','matter-title-primary','Tres Amigos, Una Vida'),
        intentionalBlank:true,
      },
      matterPage(2,'copyright','matter-copyright-body','Copyright 2026'),
      matterPage(3,'dedication','matter-dedication-body','This one is for you.'),
    ],
  };

  const audit = auditPrintFrontMatterManifest(preview);
  assert.equal(audit.ready, false);
  assert.equal(
    audit.checks.find((item) => item.id === 'intentional-blank-content')?.status,
    'error',
  );
});

test('1.0.38 front matter fails if title/copyright/dedication physical order changes', () => {
  const preview = {
    pages:[
      matterPage(1,'copyright','matter-copyright-body','Copyright 2026'),
      matterPage(2,'title','matter-title-primary','Tres Amigos, Una Vida'),
      matterPage(3,'dedication','matter-dedication-body','This one is for you.'),
    ],
  };

  const audit = auditPrintFrontMatterManifest(preview);
  assert.equal(audit.ready, false);
  assert.equal(
    audit.checks.find((item) => item.id === 'front-matter-sequence')?.status,
    'error',
  );
});

test('1.0.38 cover manufacture trusts the certified interior instead of calling currentPreflight(false)', () => {
  const main = readFileSync(
    new URL('../src/main.js', import.meta.url),
    'utf8',
  );

  assert.ok(main.includes('certifiedProofSignature'));
  assert.ok(main.includes('liveProofSignature'));
  assert.ok(main.includes('interiorCurrentForCover'));
  assert.ok(!main.includes('const preflightForCover = currentPreflight(false);'));
});

test('1.0.38 Amazon Hard Mode treats an unbuilt cover as pending while retaining the real release blocker', () => {
  const source = readFileSync(
    new URL('../src/lib/amazon-print-hard-mode.js', import.meta.url),
    'utf8',
  );

  assert.ok(source.includes('amazon-interior-content-fidelity'));
  assert.ok(source.includes('Pending final one-page cover manufacture.'));
});

test('1.0.38 migration invalidates bad v1.0.37 print production proof but preserves Kindle release proof', () => {
  const old = {
    id:'v138',
    version:37,
    appVersion:'1.0.37',
    title:'Fault Lines',
    author:'D.C.W.',
    source:{
      fileName:'book.docx',
      manuscriptHash:'story',
    },
    storyLock:{
      enabled:true,
      status:'verified',
    },
    manuscript:{
      blocks:[],
      chapters:[],
      notes:[],
      media:[],
      stats:{},
      metadata:{},
    },
    design:{
      print:{},
      ebook:{},
    },
    structureOverrides:{},
    presentationOverrides:{
      ebook:{},
      paperback:{},
      hardcover:{},
    },
    editions:{
      paperback:{
        enabled:true,
        lastPageCount:730,
        lastPreflight:{ ready:true },
        lastPdfAudit:{ ready:true, sha256:'bad-v137-pdf' },
        lastCoverAudit:{ ready:true, sha256:'old-cover' },
        uploadedCoverArt:{
          fileName:'wrap.jpg',
          mimeType:'image/jpeg',
          dataUrl:'data:image/jpeg;base64,AA==',
        },
        printGate:{
          visualProof:{ token:'p' },
          freeze:{ token:'p' },
          external:{
            kdpPrintPreviewApproved:{
              value:true,
              token:'p',
            },
          },
        },
      },
      hardcover:{
        enabled:false,
      },
      ebook:{
        enabled:true,
        releaseGate:{
          visualProof:{ token:'kindle' },
          freeze:{ token:'kindle' },
          external:{
            kindlePreviewerOpened:{ value:true, token:'kindle' },
            enhancedTypesetting:{ value:true, token:'kindle' },
          },
        },
      },
      activePrint:'paperback',
    },
  };

  const kindleBefore = JSON.stringify(old.editions.ebook.releaseGate);
  const migrated = migrateProject(old);

  assert.equal(migrated.version, 37);
  assert.equal(migrated.appVersion, '1.0.41');

  // v1.0.38 preserved page-count knowledge, but the current migration chain
  // continues through v1.0.39 Barcode Recovery. Because barcode restoration
  // can change final pagination/spine geometry, stale page-count knowledge must
  // now be cleared before a fresh production preview is certified.
  assert.equal(migrated.editions.paperback.lastPageCount, null);
  assert.equal(migrated.editions.paperback.lastPreflight, null);
  assert.equal(migrated.editions.paperback.lastPdfAudit, null);
  assert.equal(migrated.editions.paperback.lastCoverAudit, null);
  assert.ok(migrated.editions.paperback.uploadedCoverArt);

  assert.equal(
    JSON.stringify(migrated.editions.ebook.releaseGate),
    kindleBefore,
  );
});
