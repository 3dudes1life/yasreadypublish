import { normalizePrintDesign } from './print-model.js';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

export function buildProofSignature({ project, design, editionType = 'paperback' } = {}) {
  const payload = {
    editionType,
    manuscriptHash: project?.source?.manuscriptHash || '',
    title: project?.title || '',
    author: project?.author || '',
    structureOverrides: stable(project?.structureOverrides || {}),
    design: stable(normalizePrintDesign(design || project?.design?.print || {})),
  };
  return JSON.stringify(payload);
}

export function stampPreviewProof(preview, { project, design, editionType = 'paperback' } = {}) {
  if (!preview) return preview;
  preview.editionType = editionType;
  preview.proofSignature = buildProofSignature({ project, design: design || preview.design, editionType });
  return preview;
}

export function verifyPreviewProof({ project, preview, editionType = 'paperback' } = {}) {
  if (!preview?.pages?.length) {
    return { ok: false, reason: 'missing-preview', expected: null, actual: preview?.proofSignature || null };
  }
  if (preview.editionType && preview.editionType !== editionType) {
    return { ok: false, reason: 'wrong-edition', expected: editionType, actual: preview.editionType };
  }
  const expected = buildProofSignature({ project, design: preview.design, editionType });
  const current = buildProofSignature({ project, design: project?.editions?.[editionType]?.design || project?.design?.print || {}, editionType });
  if (expected !== current) {
    return { ok: false, reason: 'project-changed', expected: current, actual: expected };
  }
  if (!preview.proofSignature) {
    return { ok: false, reason: 'unsigned-preview', expected: current, actual: null };
  }
  if (preview.proofSignature !== current) {
    return { ok: false, reason: 'signature-mismatch', expected: current, actual: preview.proofSignature };
  }
  return { ok: true, reason: 'verified', expected: current, actual: preview.proofSignature };
}
