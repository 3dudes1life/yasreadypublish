import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEpubPackageData } from '../src/lib/epub-export.js';
import { auditEpubPackage } from '../src/lib/epub-audit.js';
import { runEpubPreflight } from '../src/lib/ebook-preflight.js';
import { migrateProject } from '../src/lib/project.js';
import {
  buildKindleReleaseGate,
  freezeKindleRelease,
  markKindleVisualProofComplete,
  setKindleExternalConfirmation,
} from '../src/lib/kindle-release-gate.js';

function block(id,index,kind,text,extra={}) {
  return { id,index,kind,text,style:{name:extra.style || 'Normal'},runs:extra.runs || [{text}],wordCount:text.trim()?text.trim().split(/\s+/).length:0,...extra };
}

function project(extra={}) {
  const blocks=[
    block('chapter-1',0,'chapter-title','Chapter 1: Home',{style:'Heading 1'}),
    block('opening-1',1,'chapter-opening','Morning found the house before any of them were ready for it.'),
    block('body-1',2,'body','Juan crossed the kitchen barefoot.'),
  ];
  return migrateProject({
    id:'v127',version:26,appVersion:'1.0.26',title:'Fault Lines',author:'D.C.W.',
    source:{fileName:'book.docx',manuscriptHash:'locked'},storyLock:{enabled:true,status:'verified',canonicalVersion:1},
    structureOverrides:{},presentationOverrides:{ebook:{},paperback:{},hardcover:{}},
    manuscript:{blocks,chapters:[],notes:[],media:[],stats:{chapters:1,words:20,paragraphs:3},metadata:{imageCount:0,tableCount:0,hyperlinkCount:0,...extra.metadata}},
    design:{ebook:{publisher:'3Dudes1Life Creative'}},
    editions:{ebook:{enabled:true,design:{publisher:'3Dudes1Life Creative',language:'en',visibleToc:true,tocScope:'chapters',frontMatterMode:'clean'},cover:{fileName:'cover.jpg',mimeType:'image/jpeg',fileSize:100,width:1600,height:2560,dataUrl:'data:image/jpeg;base64,/9j/2Q=='},reviewDecisions:{}}},
    ...extra.project,
  });
}

const quality=()=>({ready:true,score:100,issues:[],summary:{errors:0,warnings:0},overrideCount:0});
const intelligence=()=>({ready:true,anomalies:[],summary:{errors:0,review:0,autoFixable:0}});
const report=()=>({ready:true,summary:{passes:30,warnings:0,errors:0},checks:[]});
const flow=()=>({hardReady:true,blockers:[],reviews:[],acknowledged:[]});

test('1.0.27 Amazon Hard Mode leaves normal body typography reader-controlled', () => {
  const p=project();
  const data=buildEpubPackageData({project:p});
  const css=String(data.files.get('OEBPS/styles.css'));
  const body=css.match(/(?:^|\n)body\s*\{([^}]*)\}/i)?.[1] || '';
  assert.doesNotMatch(body,/font-family|font-size|line-height|color\s*:|background|text-align/i);
  const audit=auditEpubPackage({project:p});
  assert.equal(audit.checks.find((x)=>x.id==='audit-amazon-body-defaults').ok,true);
  assert.equal(audit.checks.find((x)=>x.id==='audit-amazon-percent-margins').ok,true);
});

test('1.0.27 audits the actual final XHTML count/size and contains zero hidden source text', () => {
  const p=project();
  const audit=auditEpubPackage({project:p});
  assert.equal(audit.amazonHardMode.htmlFileCount < 300,true);
  assert.equal(audit.amazonHardMode.oversizedXhtml.length,0);
  assert.equal(audit.amazonHardMode.hiddenChars,0);
  assert.equal(audit.ok,true);
});

test('1.0.27 exports simple Word numbering as semantic HTML lists', () => {
  const p=project();
  p.manuscript.blocks.push(block('list-1',3,'body','First thing',{numbering:{numId:'7',ilvl:'0',numFmt:'decimal',lvlText:'%1.'}}));
  p.manuscript.blocks.push(block('list-2',4,'body','Second thing',{numbering:{numId:'7',ilvl:'0',numFmt:'decimal',lvlText:'%1.'}}));
  p.manuscript.stats.paragraphs=5;
  const data=buildEpubPackageData({project:p});
  const chapter=String(data.files.get('OEBPS/text/chapter-001.xhtml'));
  assert.match(chapter,/<ol class="semantic-list">/);
  assert.equal((chapter.match(/class="semantic-list-item/g)||[]).length,2);
});

test('1.0.27 blocks source tables instead of silently flattening them', () => {
  const p=project({metadata:{tableCount:1}});
  const reportData=runEpubPreflight({project:p,storyLockOk:true});
  assert.equal(reportData.ready,false);
  assert.equal(reportData.checks.find((x)=>x.id==='word-tables').status,'error');
  assert.equal(reportData.checks.find((x)=>x.id==='audit-amazon-tables').status,'error');
});

test('1.0.27 external Amazon confirmations are token-bound and only advance after internal lock', () => {
  const p=project();
  markKindleVisualProofComplete(p);
  let gate=buildKindleReleaseGate({project:p,report:report(),quality:quality(),intelligence:intelligence(),flow:flow()});
  assert.equal(gate.freezeReady,true);
  freezeKindleRelease(p,gate);
  gate=buildKindleReleaseGate({project:p,report:report(),quality:quality(),intelligence:intelligence(),flow:flow()});
  assert.equal(gate.readyForPreviewer,true);
  assert.equal(gate.nextAction.type,'previewer');
  setKindleExternalConfirmation(p,'kindlePreviewerOpened',true);
  setKindleExternalConfirmation(p,'enhancedTypesetting',true);
  gate=buildKindleReleaseGate({project:p,report:report(),quality:quality(),intelligence:intelligence(),flow:flow()});
  assert.equal(gate.kdpUploadReady,true);
  p.editions.ebook.design.paragraphGapEm=1.11;
  gate=buildKindleReleaseGate({project:p,report:report(),quality:quality(),intelligence:intelligence(),flow:flow()});
  assert.equal(gate.external.kindlePreviewerOpened,false);
  assert.equal(gate.kdpUploadReady,false);
});
