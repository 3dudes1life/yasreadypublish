import { normalizeBarcodeBrain } from './barcode-brain.js';
import { normalizePrintProduction } from './print-brain.js';

function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function capturePrintSetupState(edition = {}, type = 'paperback') {
  const barcode = normalizeBarcodeBrain(edition.barcodeBrain || {});
  const metadata = edition.kdpMetadata || {};
  return {
    type,
    production:stableStringify(normalizePrintProduction(edition.production || {}, type)),
    design:stableStringify(edition.design || {}),
    coverMode:String(edition.coverMode || 'choose'),
    coverBrain:stableStringify(edition.coverBrain || {}),
    uploadedCoverArtSha:String(edition.uploadedCoverArt?.sha256 || ''),
    uploadedCoverPdfSha:String(edition.uploadedCoverPdf?.sha256 || ''),
    isbnMode:String(metadata.isbnMode || 'kdp-free'),
    isbn:String(metadata.isbn || ''),
    includeInterior:Boolean(barcode.includeInterior),
    coverPlacement:String(barcode.coverPlacement || 'amazon'),
  };
}

export function planPrintSetupInvalidation(before = {}, after = {}) {
  const productionChanged = before.production !== after.production;
  const designChanged = before.design !== after.design;
  const interiorBarcodeChanged = before.includeInterior !== after.includeInterior;
  const isbnChanged = before.isbnMode !== after.isbnMode || before.isbn !== after.isbn;
  const interiorUsesIsbn = Boolean(before.includeInterior || after.includeInterior);

  const interiorChanged = Boolean(
    productionChanged ||
    designChanged ||
    interiorBarcodeChanged ||
    (isbnChanged && interiorUsesIsbn)
  );

  const coverInputsChanged = Boolean(
    productionChanged ||
    before.coverMode !== after.coverMode ||
    before.coverBrain !== after.coverBrain ||
    before.uploadedCoverArtSha !== after.uploadedCoverArtSha ||
    before.uploadedCoverPdfSha !== after.uploadedCoverPdfSha ||
    before.coverPlacement !== after.coverPlacement ||
    isbnChanged
  );

  return {
    interiorChanged,
    coverChanged:Boolean(coverInputsChanged || interiorChanged),
    productionChanged,
    designChanged,
    interiorBarcodeChanged,
    isbnChanged,
    coverInputsChanged,
  };
}
