import { buildEpubPackageData } from './epub-export.js';
import { applyKindleIntelligenceFix } from './kindle-intelligence.js';
import { kindleReviewDecision, markKindleReviewIntentional } from './kindle-production-flow.js';

export const KINDLE_RELEASE_GATE_VERSION = 2;

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

export function ensureKindleReleaseState(project) {
  if (!project) return {};
  project.editions = project.editions || {};
  project.editions.ebook = project.editions.ebook || {};
  const current = project.editions.ebook.releaseGate;
  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    project.editions.ebook.releaseGate = {
      version: KINDLE_RELEASE_GATE_VERSION,
      visualProof: null,
      freeze: null,
      safeFixRuns: [],
      reviewRuns: [],
      external: {},
    };
  }
  const state = project.editions.ebook.releaseGate;
  state.version = KINDLE_RELEASE_GATE_VERSION;
  if (!Array.isArray(state.safeFixRuns)) state.safeFixRuns = [];
  if (!Array.isArray(state.reviewRuns)) state.reviewRuns = [];
  if (!state.external || typeof state.external !== 'object' || Array.isArray(state.external)) state.external = {};
  return state;
}

export function kindleReleaseToken(project) {
  const ebook = project?.editions?.ebook || {};
  const payload = {
    source: project?.source?.manuscriptHash || '',
    title: project?.title || '',
    author: project?.author || '',
    design: ebook.design || project?.design?.ebook || {},
    cover: ebook.cover ? {
      mimeType: ebook.cover.mimeType || '',
      width: ebook.cover.width || 0,
      height: ebook.cover.height || 0,
      fileName: ebook.cover.fileName || '',
      // Data URL is intentionally represented by a stable lightweight digest.
      dataDigest: fnv1a(String(ebook.cover.dataUrl || '')),
    } : null,
    presentationOverrides: project?.presentationOverrides?.ebook || {},
    reviewDecisions: ebook.reviewDecisions || {},
  };
  return `k27-${fnv1a(stableStringify(payload))}`;
}

export const KINDLE_EXTERNAL_CHECKS = Object.freeze(['kindlePreviewerOpened','enhancedTypesetting','kdpOnlinePreviewApproved']);

export function kindleExternalStatus(project) {
  const state = ensureKindleReleaseState(project);
  const token = kindleReleaseToken(project);
  const current = {};
  for (const key of KINDLE_EXTERNAL_CHECKS) {
    const record = state.external?.[key];
    current[key] = Boolean(record && record.value === true && record.token === token);
  }
  return { token, ...current, records:state.external || {} };
}

export function setKindleExternalConfirmation(project, key, value = true) {
  if (!KINDLE_EXTERNAL_CHECKS.includes(key)) throw new Error('Unknown Kindle external confirmation.');
  const state = ensureKindleReleaseState(project);
  const token = kindleReleaseToken(project);
  state.external[key] = { value:Boolean(value), token, checkedAt:new Date().toISOString() };
  return kindleExternalStatus(project);
}

export function visualProofStatus(project) {
  const state = ensureKindleReleaseState(project);
  const token = kindleReleaseToken(project);
  const current = Boolean(state.visualProof?.token && state.visualProof.token === token);
  return { current, token, record: state.visualProof || null };
}

export function markKindleVisualProofComplete(project) {
  const state = ensureKindleReleaseState(project);
  const token = kindleReleaseToken(project);
  state.visualProof = {
    token,
    status: 'complete',
    checkedAt: new Date().toISOString(),
    note: 'Manual early/middle/late visual proof completed in Preview Studio.',
  };
  state.freeze = null;
  return state.visualProof;
}

export function clearKindleVisualProof(project) {
  const state = ensureKindleReleaseState(project);
  state.visualProof = null;
  state.freeze = null;
}

function countMatches(text, regex) {
  return [...String(text || '').matchAll(regex)].length;
}

export function auditKindleAccessibility(project) {
  let data;
  try {
    data = buildEpubPackageData({ project });
  } catch (error) {
    return {
      ready: false,
      score: 0,
      errors: 1,
      warnings: 0,
      checks: [{ id: 'package', status: 'error', label: 'EPUB package builds', message: error?.message || 'EPUB package could not be built.' }],
    };
  }

  const files = data.files;
  const opf = String(files.get('OEBPS/package.opf') || '');
  const nav = String(files.get('OEBPS/nav.xhtml') || '');
  const xhtml = [...files.entries()].filter(([path, content]) => /\.xhtml$/i.test(path) && typeof content === 'string');
  const chapters = xhtml.filter(([path]) => /\/chapter-\d+\.xhtml$/i.test(path));
  const checks = [];
  const add = (id, ok, label, passMessage, failMessage, severity = 'error') => checks.push({
    id,
    status: ok ? 'pass' : severity,
    label,
    message: ok ? passMessage : failMessage,
  });

  const language = String(data.design?.language || '').trim();
  const allHtmlLang = xhtml.every(([, content]) => new RegExp(`<html[^>]+(?:xml:lang|lang)=["']${language.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(content));
  add('language', Boolean(language) && allHtmlLang, 'Language is declared throughout', `Package and ${xhtml.length} XHTML file(s) declare ${language}.`, 'One or more reading documents are missing the edition language.');

  const tocSemantic = /<nav[^>]*epub:type="toc"[^>]*role="doc-toc"/i.test(nav) && /aria-label="Table of Contents"/i.test(nav);
  add('toc-semantic', tocSemantic, 'Contents navigation is semantic', 'The visible TOC exposes EPUB and ARIA navigation semantics.', 'The visible TOC is missing EPUB/ARIA navigation semantics.');

  const landmarks = /<nav[^>]*epub:type="landmarks"/i.test(nav) && /epub:type="bodymatter"/i.test(nav);
  add('landmarks', landmarks, 'Reader landmarks are present', 'Landmarks identify Contents and Begin Reading.', 'EPUB landmarks or the Begin Reading target are missing.');

  const chapterHeadingOk = chapters.every(([, content]) => countMatches(content, /<h1\b[^>]*class="[^"]*chapter-title[^"]*"/gi) === 1);
  add('chapter-headings', chapterHeadingOk, 'Chapter heading hierarchy is consistent', `${chapters.length} chapter file(s) expose exactly one primary chapter heading.`, 'One or more chapter files do not expose exactly one primary chapter heading.');

  const allImages = xhtml.flatMap(([path, content]) => [...content.matchAll(/<img\b([^>]*)\/?\s*>/gi)].map((match) => ({ path, attrs: match[1] })));
  const imageAltFailures = allImages.filter(({ attrs }) => !/\balt="[^"]*"/i.test(attrs));
  const decorativeFailures = allImages.filter(({ attrs }) => /\balt=""/i.test(attrs) && !/\brole="presentation"/i.test(attrs));
  add('image-alt-attribute', imageAltFailures.length === 0, 'Every image has an alt attribute', allImages.length ? `All ${allImages.length} packaged image placement(s) have an alt attribute.` : 'No reading-order images require alt handling.', `${imageAltFailures.length} image placement(s) are missing an alt attribute.`);
  add('decorative-images', decorativeFailures.length === 0, 'Decorative images are identified', decorativeFailures.length === 0 ? 'Empty-alt images are explicitly marked as presentational.' : '', `${decorativeFailures.length} empty-alt image placement(s) are not marked presentational.`);

  const notes = xhtml.flatMap(([path, content]) => [...content.matchAll(/epub:type="noteref"/gi)].map(() => path));
  const noteBackrefsOk = notes.length === 0 || xhtml.every(([, content]) => !/epub:type="noteref"/i.test(content) || /aria-label="Back to note reference"/i.test(content));
  add('notes', noteBackrefsOk, 'Notes have navigable return paths', notes.length ? `${notes.length} note reference(s) include accessible back-navigation.` : 'No notes require accessibility back-navigation.', 'A note reference is missing an accessible return path.');

  const accessMode = /property="schema:accessMode">textual</i.test(opf);
  const tocFeature = /property="schema:accessibilityFeature">tableOfContents</i.test(opf);
  const orderFeature = /property="schema:accessibilityFeature">readingOrder</i.test(opf);
  add('opf-accessibility', accessMode && tocFeature && orderFeature, 'Accessibility metadata is embedded', 'OPF metadata declares textual access, table of contents, and reading order.', 'Required accessibility metadata is incomplete.');

  const missingMeaningfulAlt = (project?.manuscript?.blocks || [])
    .flatMap((block) => block.mediaRefs || [])
    .filter((ref) => !String(ref.altText || '').trim());
  add('source-alt-review', missingMeaningfulAlt.length === 0, 'Source image descriptions reviewed', missingMeaningfulAlt.length ? '' : 'All imported manuscript image placements include source alt text.', `${missingMeaningfulAlt.length} manuscript image placement(s) have no source alt text. Confirm they are decorative or add descriptions in the source DOCX.`, 'warning');

  const errors = checks.filter((item) => item.status === 'error').length;
  const warnings = checks.filter((item) => item.status === 'warning').length;
  const passes = checks.filter((item) => item.status === 'pass').length;
  const score = Math.max(0, Math.round((passes / Math.max(1, checks.length)) * 100 - warnings * 3 - errors * 20));
  return { ready: errors === 0, score, errors, warnings, passes, checks, images: allImages.length, chapters: chapters.length };
}

export function buildSafeFixBatch(project, intelligence) {
  return (intelligence?.anomalies || [])
    .filter((item) => item.fix && item.severity !== 'info' && !kindleReviewDecision(project, item))
    .map((item) => ({ id: item.id, label: item.label, blockId: item.blockId || null, fix: item.fix }));
}

export function applySafeFixBatch(project, intelligence) {
  const state = ensureKindleReleaseState(project);
  const before = JSON.stringify(project?.manuscript?.blocks || []);
  const plan = buildSafeFixBatch(project, intelligence);
  const applied = [];
  const skipped = [];
  for (const item of plan) {
    try {
      const result = applyKindleIntelligenceFix(project, item.fix);
      applied.push({ ...item, result });
    } catch (error) {
      skipped.push({ ...item, error: error?.message || 'Safe fix could not be applied.' });
    }
  }
  const after = JSON.stringify(project?.manuscript?.blocks || []);
  if (before !== after) throw new Error('Story Lock blocked Batch Safe Fix because manuscript blocks changed.');
  state.safeFixRuns.push({ at: new Date().toISOString(), applied: applied.length, skipped: skipped.length, ids: applied.map((item) => item.id) });
  state.safeFixRuns = state.safeFixRuns.slice(-20);
  state.visualProof = null;
  state.freeze = null;
  return { applied, skipped, storyLockPreserved: true };
}

export function markAllCurrentReviewsIntentional(project, quality, intelligence) {
  const state = ensureKindleReleaseState(project);
  const items = [
    ...(quality?.issues || []).filter((item) => item.severity === 'warning'),
    ...(intelligence?.anomalies || []).filter((item) => item.severity === 'review'),
  ].filter((item) => !kindleReviewDecision(project, item));
  const records = [];
  for (const item of items) {
    const record = markKindleReviewIntentional(project, item);
    if (record) records.push({ id: item.id, label: item.label });
  }
  state.reviewRuns.push({ at: new Date().toISOString(), count: records.length, ids: records.map((item) => item.id) });
  state.reviewRuns = state.reviewRuns.slice(-20);
  state.visualProof = null;
  state.freeze = null;
  return records;
}

export function buildKindleReleaseGate({ project, report, quality, intelligence, flow } = {}) {
  const accessibility = auditKindleAccessibility(project);
  const proof = visualProofStatus(project);
  const external = kindleExternalStatus(project);
  const safeFixes = buildSafeFixBatch(project, intelligence);
  const technicalReady = Boolean(report?.ready && quality?.ready && intelligence?.ready && flow?.hardReady);
  const reviewsClear = Number(flow?.reviews?.length || 0) === 0;
  const blockersClear = Number(flow?.blockers?.length || 0) === 0;
  const accessibilityReady = accessibility.ready;
  const freezeReady = technicalReady && reviewsClear && blockersClear && accessibilityReady && proof.current;
  const state = ensureKindleReleaseState(project);
  const frozen = Boolean(state.freeze?.token && state.freeze.token === proof.token && state.freeze.status === 'frozen');
  const readyForPreviewer = frozen;
  const previewerConfirmed = readyForPreviewer && external.kindlePreviewerOpened;
  const enhancedConfirmed = previewerConfirmed && external.enhancedTypesetting;
  const kdpUploadReady = enhancedConfirmed;
  const amazonFinalReady = kdpUploadReady && external.kdpOnlinePreviewApproved;

  let nextAction = { type: 'visual-proof', label: 'Complete visual proof', detail: 'Review early, middle, and late chapters in Preview Studio.' };
  if (!technicalReady || !blockersClear) nextAction = { type: 'production', label: 'Resolve Amazon Hard Mode blockers', detail: 'Clear technical, package, and whole-book blockers first.' };
  else if (safeFixes.length) nextAction = { type: 'safe-fixes', label: `Apply ${safeFixes.length} safe fix${safeFixes.length === 1 ? '' : 'es'}`, detail: 'Batch only presentation-only fixes that preserve Story Lock.' };
  else if (!reviewsClear) nextAction = { type: 'batch-review', label: `Review ${flow.reviews.length} item${flow.reviews.length === 1 ? '' : 's'}`, detail: 'Visit them individually or mark the current exact findings intentional.' };
  else if (!accessibilityReady) nextAction = { type: 'accessibility', label: 'Fix accessibility blockers', detail: 'Resolve EPUB semantic/accessibility errors before export.' };
  else if (!proof.current) nextAction = { type: 'visual-proof', label: 'Complete visual proof', detail: 'Run the final early/middle/late reader check, then stamp it complete.' };
  else if (!frozen) nextAction = { type: 'freeze', label: 'Lock this EPUB build', detail: 'Lock this exact source + design + cover + review state for external testing.' };
  else if (!external.kindlePreviewerOpened) nextAction = { type: 'previewer', label: 'Open in Kindle Previewer', detail: 'Export the EPUB and confirm the current build converts successfully in the latest Kindle Previewer.' };
  else if (!external.enhancedTypesetting) nextAction = { type: 'enhanced-typesetting', label: 'Confirm Enhanced Typesetting', detail: 'In Kindle Previewer, confirm Enhanced Typesetting is supported for this build.' };
  else if (!external.kdpOnlinePreviewApproved) nextAction = { type: 'kdp-upload', label: 'Upload to KDP', detail: 'The current build is ready for KDP upload; approve it in KDP Online Previewer afterward.' };
  else nextAction = { type: 'amazon-final', label: 'Amazon pipeline complete', detail: 'Kindle Previewer, Enhanced Typesetting, and KDP Online Previewer are confirmed for this exact release token.' };

  return {
    freezeReady, frozen, readyForPreviewer, previewerConfirmed, enhancedConfirmed, kdpUploadReady, amazonFinalReady,
    technicalReady, reviewsClear, blockersClear, accessibility, visualProof:proof, external, safeFixes, nextAction,
    releaseToken: proof.token,
    status: amazonFinalReady ? 'amazon-ready' : kdpUploadReady ? 'kdp-ready' : readyForPreviewer ? 'previewer-ready' : freezeReady ? 'ready' : 'working',
  };
}

export function freezeKindleRelease(project, gate) {
  const state = ensureKindleReleaseState(project);
  if (!gate?.freezeReady) throw new Error('Kindle release cannot be frozen until every release gate is complete.');
  const token = kindleReleaseToken(project);
  state.freeze = {
    token,
    status: 'frozen',
    frozenAt: new Date().toISOString(),
    appVersion: project?.appVersion || '',
    storyLockSha256: project?.source?.manuscriptHash || '',
    accessibilityScore: gate?.accessibility?.score ?? null,
  };
  return state.freeze;
}

export function kindleReleaseReport({ project, report, quality, intelligence, flow, gate } = {}) {
  return {
    product: 'YasReady Publish',
    appVersion: project?.appVersion || '',
    generatedAt: new Date().toISOString(),
    title: project?.title || '',
    author: project?.author || '',
    storyLockSha256: project?.source?.manuscriptHash || '',
    releaseToken: gate?.releaseToken || kindleReleaseToken(project),
    frozen: Boolean(gate?.frozen),
    freezeReady: Boolean(gate?.freezeReady),
    technical: {
      ready: Boolean(report?.ready),
      passes: report?.summary?.passes || 0,
      warnings: report?.summary?.warnings || 0,
      errors: report?.summary?.errors || 0,
    },
    quality: {
      ready: Boolean(quality?.ready),
      score: quality?.score || 0,
      errors: quality?.summary?.errors || 0,
      warnings: quality?.summary?.warnings || 0,
    },
    intelligence: {
      ready: Boolean(intelligence?.ready),
      anomalies: intelligence?.anomalies?.length || 0,
      autoFixable: intelligence?.summary?.autoFixable || 0,
    },
    reviews: {
      blockers: flow?.blockers?.length || 0,
      active: flow?.reviews?.length || 0,
      intentional: flow?.acknowledged?.length || 0,
    },
    accessibility: gate?.accessibility || auditKindleAccessibility(project),
    visualProof: gate?.visualProof || visualProofStatus(project),
    external: gate?.external || kindleExternalStatus(project),
    amazonPipeline: {
      readyForPreviewer:Boolean(gate?.readyForPreviewer),
      previewerConfirmed:Boolean(gate?.previewerConfirmed),
      enhancedTypesettingConfirmed:Boolean(gate?.enhancedConfirmed),
      kdpUploadReady:Boolean(gate?.kdpUploadReady),
      kdpOnlinePreviewApproved:Boolean(gate?.amazonFinalReady),
    },
    kdpMetadata: {
      title:project?.title || '', author:project?.author || '',
      language:project?.editions?.ebook?.design?.language || project?.design?.ebook?.language || '',
      publisher:project?.editions?.ebook?.design?.publisher || project?.design?.ebook?.publisher || '',
      subtitle:'', series:'', isbn:'',
    },
    nextAction: gate?.nextAction || null,
  };
}
