import { normalizePrintProduction } from './print-brain.js';
import { normalizeCoverBrain } from './cover-brain.js';
import { barcodeBrainChecks, barcodeFingerprint, normalizeBarcodeBrain, normalizePrintIsbn } from './barcode-brain.js';
import { runAmazonPrintHardMode } from './amazon-print-hard-mode.js';

export const PRINT_RELEASE_GATE_VERSION = 2;
export const PRINT_EXTERNAL_CHECKS = Object.freeze(['kdpPrintPreviewApproved']);

function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function fnv1a(text = '') {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function normalizePrintKdpMetadata(input = {}, fallback = {}) {
  const isbnMode = input?.isbnMode === 'own' ? 'own' : 'kdp-free';
  return {
    subtitle:String(input?.subtitle || '').trim().slice(0, 240),
    series:String(input?.series || '').trim().slice(0, 240),
    language:String(input?.language || fallback?.language || 'en').trim().slice(0, 32) || 'en',
    publisher:String(input?.publisher || fallback?.publisher || '').trim().slice(0, 180),
    isbnMode,
    isbn:isbnMode === 'own' ? String(input?.isbn || '').replace(/[^0-9Xx]/g, '').slice(0, 13) : '',
  };
}

export function ensurePrintReleaseState(project, type = 'paperback') {
  if (!project?.editions?.[type]) return {};
  const edition = project.editions[type];
  const fallback = {
    language:project?.editions?.ebook?.design?.language || project?.design?.ebook?.language || 'en',
    publisher:edition?.coverBrain?.publisher || project?.editions?.ebook?.design?.publisher || project?.design?.ebook?.publisher || '',
  };
  edition.kdpMetadata = normalizePrintKdpMetadata(edition.kdpMetadata || {}, fallback);
  if (!edition.printGate || typeof edition.printGate !== 'object' || Array.isArray(edition.printGate)) {
    edition.printGate = { version:PRINT_RELEASE_GATE_VERSION, visualProof:null, freeze:null, external:{} };
  }
  edition.printGate.version = PRINT_RELEASE_GATE_VERSION;
  if (!edition.printGate.external || typeof edition.printGate.external !== 'object' || Array.isArray(edition.printGate.external)) edition.printGate.external = {};
  return edition.printGate;
}

export function printReleaseToken(project, type = 'paperback') {
  const edition = project?.editions?.[type] || {};
  ensurePrintReleaseState(project, type);
  const payload = {
    source:project?.source?.manuscriptHash || '',
    type,
    title:project?.title || '',
    author:project?.author || '',
    design:edition.design || {},
    production:normalizePrintProduction(edition.production || {}, type),
    cover:normalizeCoverBrain(edition.coverBrain || {}, type),
    pageCount:Number(edition.lastPageCount) || 0,
    interiorSha:edition.lastPdfAudit?.sha256 || '',
    coverSha:edition.lastCoverAudit?.sha256 || '',
    metadata:edition.kdpMetadata || {},
    barcode:normalizeBarcodeBrain(edition.barcodeBrain || {}),
    barcodeFingerprint:barcodeFingerprint({ isbn:edition.kdpMetadata?.isbn || '', pageCount:Number(edition.lastPageCount)||0, brain:edition.barcodeBrain || {} }),
  };
  return `p35-${fnv1a(stableStringify(payload))}`;
}

export function printExternalStatus(project, type = 'paperback') {
  const state = ensurePrintReleaseState(project, type);
  const token = printReleaseToken(project, type);
  const out = { token, records:state.external || {} };
  for (const key of PRINT_EXTERNAL_CHECKS) {
    const record = state.external?.[key];
    out[key] = Boolean(record && record.value === true && record.token === token);
  }
  return out;
}

export function setPrintExternalConfirmation(project, type, key, value = true) {
  if (!PRINT_EXTERNAL_CHECKS.includes(key)) throw new Error('Unknown print external confirmation.');
  const state = ensurePrintReleaseState(project, type);
  const token = printReleaseToken(project, type);
  state.external[key] = { value:Boolean(value), token, checkedAt:new Date().toISOString() };
  return printExternalStatus(project, type);
}

export function printVisualProofStatus(project, type = 'paperback') {
  const state = ensurePrintReleaseState(project, type);
  const token = printReleaseToken(project, type);
  return { current:Boolean(state.visualProof?.token === token && state.visualProof?.status === 'complete'), token, record:state.visualProof || null };
}

export function markPrintVisualProofComplete(project, type = 'paperback') {
  const state = ensurePrintReleaseState(project, type);
  const token = printReleaseToken(project, type);
  state.visualProof = { token, status:'complete', checkedAt:new Date().toISOString(), note:'Final print spread proof reviewed in YasReady.' };
  state.freeze = null;
  return state.visualProof;
}

export function savePrintKdpMetadata(project, type, values = {}) {
  if (!project?.editions?.[type]) throw new Error('Unknown print edition.');
  const state = ensurePrintReleaseState(project, type);
  const edition = project.editions[type];
  edition.kdpMetadata = normalizePrintKdpMetadata(values, edition.kdpMetadata || {});
  state.freeze = null;
  return edition.kdpMetadata;
}

function metadataChecks(project, type) {
  const edition = project?.editions?.[type] || {};
  const meta = normalizePrintKdpMetadata(edition.kdpMetadata || {});
  const normalized = meta.isbnMode === 'own' ? normalizePrintIsbn(meta.isbn) : null;
  const ownIsbnOk = meta.isbnMode !== 'own' || Boolean(normalized?.valid);
  return [
    { id:'print-meta-title', status:String(project?.title || '').trim() ? 'pass' : 'error', label:'KDP title', message:String(project?.title || '').trim() ? project.title : 'Book title is required.' },
    { id:'print-meta-author', status:String(project?.author || '').trim() ? 'pass' : 'error', label:'KDP author', message:String(project?.author || '').trim() ? project.author : 'Author is required.' },
    { id:'print-meta-language', status:meta.language ? 'pass' : 'error', label:'KDP language', message:meta.language || 'Language is required.' },
    { id:'print-meta-isbn', status:ownIsbnOk ? 'pass' : 'error', label:'Print ISBN', message:meta.isbnMode === 'kdp-free' ? 'Use a free KDP ISBN for this physical edition.' : ownIsbnOk ? `Use your ISBN ${normalized.digits}.` : `Own-ISBN mode needs a valid ISBN. ${normalized?.reason || ''}`.trim() },
  ];
}

export function buildPrintReleaseGate({ project, type = 'paperback', preflight = null, preview = null } = {}) {
  ensurePrintReleaseState(project, type);
  const edition = project?.editions?.[type] || {};
  const pageCount = Number(edition.lastPageCount || preview?.pages?.length || 0);
  const interior = edition.lastPdfAudit || null;
  const cover = edition.lastCoverAudit || null;
  const proofSignature = preview?.proofSignature || '';
  const interiorCurrent = Boolean(interior?.ready && interior?.sha256 && (!proofSignature || interior.proofSignature === proofSignature) && Number(interior?.pageCount || interior?.metadata?.pageCount || 0) === pageCount);
  const coverCurrent = Boolean(cover?.ready && cover?.sha256 && Number(cover?.pageCount || 0) === pageCount && (!proofSignature || cover.proofSignature === proofSignature));
  const metadata = metadataChecks(project, type);
  const metadataReady = metadata.every((item) => item.status !== 'error');
  const storedBarcodeBrain = edition.barcodeBrain && typeof edition.barcodeBrain === 'object' ? edition.barcodeBrain : null;
  const barcode = barcodeBrainChecks({
    isbn:edition.kdpMetadata?.isbn || '',
    isbnMode:edition.kdpMetadata?.isbnMode || 'kdp-free',
    pageCount,
    basePageCount:Number(preview?.barcodePlan?.basePageCount || Math.max(0,pageCount-1)),
    brain:storedBarcodeBrain || { enabled:false, includeInterior:false, coverPlacement:'amazon' },
    coverMode:edition.coverMode || 'build',
  });
  const barcodeRequired = Boolean(storedBarcodeBrain && normalizeBarcodeBrain(storedBarcodeBrain).enabled);
  const barcodeReady = !barcodeRequired || barcode.ready;
  const hardMode = runAmazonPrintHardMode({ project, type, preview, interiorAudit:interior, coverAudit:cover });
  const technicalReady = Boolean(preflight?.ready && interiorCurrent && coverCurrent && metadataReady && barcodeReady && hardMode.ready);
  const visualProof = printVisualProofStatus(project, type);
  const state = ensurePrintReleaseState(project, type);
  const frozen = Boolean(state.freeze?.token === visualProof.token && state.freeze?.status === 'frozen');
  const external = printExternalStatus(project, type);
  const readyForKdpPreviewer = technicalReady && visualProof.current && frozen;
  const kdpPublishReady = readyForKdpPreviewer && external.kdpPrintPreviewApproved;
  const proofCertified = kdpPublishReady;

  const checks = [
    { id:'print-gate-preflight', status:preflight?.ready ? 'pass' : 'error', label:'Print Brain / KDP preflight', message:preflight?.ready ? `${pageCount} pages passed the physical-book gate.` : 'Resolve print preflight blockers first.' },
    { id:'print-gate-interior', status:interiorCurrent ? 'pass' : 'error', label:'Finished interior PDF', message:interiorCurrent ? `Current PDF ${String(interior.sha256).slice(0,12)}… matches this proof.` : 'Build the interior PDF again for the current proof.' },
    { id:'print-gate-cover', status:coverCurrent ? 'pass' : 'error', label:'Finished cover PDF', message:coverCurrent ? `Current cover ${String(cover.sha256).slice(0,12)}… matches ${pageCount} interior pages.` : 'Build the cover PDF again after the final interior page count is known.' },
    ...metadata,
    ...barcode.checks,
    ...hardMode.checks,
  ];

  let nextAction = { type:'preflight', label:'Resolve print blockers', detail:'Clear Print Brain/KDP preflight errors first.' };
  if (preflight?.ready && !interiorCurrent) nextAction = { type:'interior', label:`Build ${type} interior PDF`, detail:'Create and audit the exact finished interior PDF.' };
  else if (preflight?.ready && interiorCurrent && !coverCurrent) nextAction = edition.coverMode === 'upload-pdf'
    ? { type:'cover', label:`Update ${type} full-wrap cover PDF`, detail:'Attach a true production PDF whose canvas matches the final interior page count.' }
    : edition.coverMode === 'upload-art'
      ? { type:'cover', label:`Manufacture ${type} cover PDF`, detail:'Use the attached full-wrap artwork to create the exact final KDP canvas and barcode.' }
      : { type:'cover', label:`Build ${type} cover PDF`, detail:'Cover geometry must match the final interior page count.' };
  else if (preflight?.ready && interiorCurrent && coverCurrent && (!metadataReady || !barcodeReady)) nextAction = { type:'metadata', label:'Finish ISBN / Barcode Brain', detail:'Complete the physical-edition ISBN and barcode certification before external review.' };
  else if (technicalReady && !visualProof.current) nextAction = { type:'visual-proof', label:'Complete final print proof', detail:'Review early, middle, late, blank, TOC, and chapter-opening spreads.' };
  else if (technicalReady && visualProof.current && !frozen) nextAction = { type:'freeze', label:'Lock this print package', detail:'Lock the exact interior + cover + metadata package for Amazon testing.' };
  else if (readyForKdpPreviewer && !external.kdpPrintPreviewApproved) nextAction = { type:'kdp-previewer', label:'Upload to KDP Print Previewer', detail:'Upload this exact interior PDF and cover PDF, review Amazon’s automated checks, and confirm there are no blocking errors.' };
  else if (proofCertified) nextAction = { type:'complete', label:'Amazon print package complete', detail:'KDP Print Previewer is confirmed for this exact package. Physical proof inspection is intentionally left to the author.' };

  return { type, pageCount, technicalReady, interiorCurrent, coverCurrent, metadataReady, barcodeReady, barcode, hardMode, hardModeReady:hardMode.ready, checks, visualProof, frozen, external, readyForKdpPreviewer, kdpPublishReady, proofCertified, nextAction, releaseToken:visualProof.token };
}

export function freezePrintRelease(project, type, gate) {
  const state = ensurePrintReleaseState(project, type);
  if (!gate?.technicalReady || !gate?.visualProof?.current) throw new Error('Print release cannot be locked until technical checks and visual proof pass.');
  const token = printReleaseToken(project, type);
  state.freeze = { token, status:'frozen', frozenAt:new Date().toISOString(), appVersion:project?.appVersion || '', interiorSha:project?.editions?.[type]?.lastPdfAudit?.sha256 || '', coverSha:project?.editions?.[type]?.lastCoverAudit?.sha256 || '' };
  return state.freeze;
}

export function printReleaseReport({ project, type = 'paperback', preflight = null, preview = null, gate = null } = {}) {
  const g = gate || buildPrintReleaseGate({ project, type, preflight, preview });
  const edition = project?.editions?.[type] || {};
  return {
    product:'YasReady Publish', appVersion:project?.appVersion || '', generatedAt:new Date().toISOString(),
    edition:type, title:project?.title || '', author:project?.author || '', storyLockSha256:project?.source?.manuscriptHash || '',
    releaseToken:g.releaseToken, pageCount:g.pageCount,
    interiorPdf:{ ready:g.interiorCurrent, sha256:edition.lastPdfAudit?.sha256 || '', fileSize:edition.lastPdfAudit?.fileSize || 0 },
    coverPdf:{ ready:g.coverCurrent, sha256:edition.lastCoverAudit?.sha256 || '', fileSize:edition.lastCoverAudit?.fileSize || 0 },
    production:normalizePrintProduction(edition.production || {}, type),
    metadata:edition.kdpMetadata || {},
    barcode:normalizeBarcodeBrain(edition.barcodeBrain || {}),
    barcodeFingerprint:barcodeFingerprint({ isbn:edition.kdpMetadata?.isbn || '', pageCount:Number(edition.lastPageCount)||0, brain:edition.barcodeBrain || {} }),
    amazonPipeline:{ readyForKdpPrintPreviewer:g.readyForKdpPreviewer, kdpPrintPreviewApproved:Boolean(g.external?.kdpPrintPreviewApproved), kdpPublishReady:g.kdpPublishReady, physicalProofResponsibility:'author', yasreadyAmazonPackageCertified:g.proofCertified },
    amazonPrintHardMode:g.hardMode || null,
    checks:g.checks, nextAction:g.nextAction,
  };
}
