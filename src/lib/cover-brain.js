import { normalizePrintProduction } from './print-brain.js';

export const COVER_BRAIN_VERSION = 1;
export const COVER_DPI = 300;
export const COVER_FILE_LIMIT_BYTES = 650 * 1024 * 1024;

const clamp = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function defaultCoverBrain(type = 'paperback') {
  return {
    version:COVER_BRAIN_VERSION,
    configured:false,
    source:'ebook-cover',
    finish:'matte',
    background:'#111111',
    textColor:'#ffffff',
    backCopy:'',
    spineTitle:'',
    spineAuthor:'',
    publisher:'',
    amazonBarcode:true,
    frontArt:null,
    backArt:null,
    logo:null,
    // Amazon publishes hardcover wrap/hinge/safe-zone rules but points authors
    // to its Cover Calculator for the exact case-laminate spine/canvas. YasReady
    // never guesses that production-critical number: a confirmed calculator
    // spine can be stored here before hardcover PDF export is unlocked.
    hardcoverSpineWidthIn:null,
    hardcoverGeometryConfirmed:false,
    type,
  };
}

export function normalizeCoverBrain(input = {}, type = 'paperback') {
  const base = defaultCoverBrain(type);
  const out = { ...base, ...(input || {}) };
  out.version = COVER_BRAIN_VERSION;
  out.type = type === 'hardcover' ? 'hardcover' : 'paperback';
  out.configured = Boolean(out.configured);
  out.source = ['ebook-cover','uploaded-front','generated'].includes(out.source) ? out.source : 'ebook-cover';
  out.finish = ['matte','glossy'].includes(out.finish) ? out.finish : 'matte';
  out.background = /^#[0-9a-f]{6}$/i.test(String(out.background || '')) ? String(out.background) : '#111111';
  out.textColor = /^#[0-9a-f]{6}$/i.test(String(out.textColor || '')) ? String(out.textColor) : '#ffffff';
  out.backCopy = String(out.backCopy || '').slice(0, 5000);
  out.spineTitle = String(out.spineTitle || '').slice(0, 240);
  out.spineAuthor = String(out.spineAuthor || '').slice(0, 180);
  out.publisher = String(out.publisher || '').slice(0, 180);
  out.amazonBarcode = out.amazonBarcode !== false;
  out.frontArt = normalizeCoverAsset(out.frontArt);
  out.backArt = normalizeCoverAsset(out.backArt);
  out.logo = normalizeCoverAsset(out.logo);
  const hc = Number(out.hardcoverSpineWidthIn);
  out.hardcoverSpineWidthIn = Number.isFinite(hc) && hc > 0 ? clamp(hc, null, 0.1, 3) : null;
  out.hardcoverGeometryConfirmed = Boolean(out.hardcoverGeometryConfirmed && out.hardcoverSpineWidthIn);
  return out;
}

function normalizeCoverAsset(asset) {
  if (!asset || typeof asset !== 'object' || !asset.dataUrl) return null;
  const mimeType = ['image/jpeg','image/png'].includes(asset.mimeType) ? asset.mimeType : '';
  if (!mimeType) return null;
  return {
    fileName:String(asset.fileName || 'cover-art').slice(0, 180),
    mimeType,
    fileSize:Number(asset.fileSize) || 0,
    width:Number(asset.width) || 0,
    height:Number(asset.height) || 0,
    dataUrl:String(asset.dataUrl),
    updatedAt:asset.updatedAt || null,
  };
}

export function paperbackSpineFactor(productionInput = {}) {
  const p = normalizePrintProduction(productionInput, 'paperback');
  if (p.ink === 'standard') return 0.002252;
  if (p.ink === 'premium') return 0.002347;
  if (p.paper === 'cream') return 0.0025;
  if (p.paper === 'groundwood') return 0.00235;
  return 0.002252;
}

export function paperbackSpineWidth(pageCount = 0, productionInput = {}) {
  const pages = Math.max(0, Number(pageCount) || 0);
  return pages * paperbackSpineFactor(productionInput);
}

export function estimatedHardcoverSpineWidth(pageCount = 0, productionInput = {}) {
  // ESTIMATE ONLY. KDP's public hardcover page directs authors to its Cover
  // Calculator for the final case-laminate dimensions. This estimate is used
  // only to draw a planning preview and can never unlock production export.
  const pages = Math.max(0, Number(pageCount) || 0);
  const p = normalizePrintProduction(productionInput, 'hardcover');
  const factor = p.paper === 'cream' ? 0.0025 : 0.002252;
  return pages * factor;
}

export function coverGeometry({ type = 'paperback', production:productionInput = {}, pageCount = 0, cover:coverInput = {} } = {}) {
  const resolvedType = type === 'hardcover' ? 'hardcover' : 'paperback';
  const production = normalizePrintProduction(productionInput, resolvedType);
  const cover = normalizeCoverBrain(coverInput, resolvedType);
  const pages = Math.max(0, Number(pageCount) || 0);
  const trimWidth = Number(production.trimWidth) || 6;
  const trimHeight = Number(production.trimHeight) || 9;

  if (resolvedType === 'paperback') {
    const bleed = 0.125;
    const spineWidth = paperbackSpineWidth(pages, production);
    const width = trimWidth * 2 + spineWidth + bleed * 2;
    const height = trimHeight + bleed * 2;
    const backX = bleed;
    const spineX = backX + trimWidth;
    const frontX = spineX + spineWidth;
    const safeInset = 0.25; // exceeds KDP's minimum front/back text inset.
    const barcode = { width:2, height:1.2, x:backX + trimWidth - safeInset - 2, y:bleed + trimHeight - safeInset - 1.2 };
    return {
      type:resolvedType, exact:true, production, cover, pageCount:pages, trimWidth, trimHeight,
      bleed, wrap:0, hinge:0, width, height, spineWidth,
      spineTextAllowed:pages > 79 && spineWidth > 0.125,
      spineSafeInset:0.0625,
      safeInset,
      panels:{
        back:{ x:backX, y:bleed, width:trimWidth, height:trimHeight },
        spine:{ x:spineX, y:bleed, width:spineWidth, height:trimHeight },
        front:{ x:frontX, y:bleed, width:trimWidth, height:trimHeight },
      },
      barcode,
      note:'Exact KDP paperback geometry from the selected trim, final page count, paper, and ink profile.',
    };
  }

  const wrap = 0.51;
  const hinge = 0.4;
  const safeInset = 0.635;
  const spineWidth = cover.hardcoverSpineWidthIn || estimatedHardcoverSpineWidth(pages, production);
  const exact = Boolean(cover.hardcoverGeometryConfirmed && cover.hardcoverSpineWidthIn);
  const width = trimWidth * 2 + spineWidth + wrap * 2;
  const height = trimHeight + wrap * 2;
  const backX = wrap;
  const spineX = backX + trimWidth;
  const frontX = spineX + spineWidth;
  const barcode = { width:2, height:1.2, x:backX + trimWidth - hinge - 0.25 - 2, y:wrap + trimHeight - 0.76 - 1.2 };
  return {
    type:resolvedType, exact, production, cover, pageCount:pages, trimWidth, trimHeight,
    bleed:0, wrap, hinge, width, height, spineWidth,
    spineTextAllowed:pages >= 75 && spineWidth > 0.125,
    spineSafeInset:0.0625,
    safeInset,
    panels:{
      back:{ x:backX, y:wrap, width:trimWidth, height:trimHeight },
      spine:{ x:spineX, y:wrap, width:spineWidth, height:trimHeight },
      front:{ x:frontX, y:wrap, width:trimWidth, height:trimHeight },
    },
    barcode,
    note:exact
      ? 'Hardcover spine width was confirmed against Amazon Cover Calculator; wrap/hinge/safe zones use KDP case-laminate rules.'
      : 'Hardcover preview uses an estimate only. Enter the exact Amazon Cover Calculator spine width to unlock production cover PDF export.',
  };
}

export function coverBrainChecks({ type = 'paperback', production = {}, pageCount = 0, cover = {}, ebookCover = null } = {}) {
  const geometry = coverGeometry({ type, production, pageCount, cover });
  const c = geometry.cover;
  const front = c.frontArt || (c.source === 'ebook-cover' ? ebookCover : null);
  const frontDpi = front?.width && geometry.trimWidth ? front.width / geometry.trimWidth : 0;
  const checks = [
    { id:'page-count', status:pageCount > 0 ? 'pass' : 'error', label:'Final page count', message:pageCount > 0 ? `${pageCount} finished interior pages drive the cover geometry.` : 'Build/freeze the interior first so Cover Brain knows the final page count.' },
    { id:'front-art', status:front ? 'pass' : 'warning', label:'Front cover artwork', message:front ? `${front.fileName || 'Front cover'} is attached.` : 'No front-cover art is attached; Cover Brain can still build a generated text cover.' },
    { id:'front-resolution', status:!front ? 'warning' : frontDpi >= 300 ? 'pass' : 'error', label:'Front cover resolution', message:!front ? 'Attach artwork to verify 300 DPI at final trim size.' : `${Math.round(frontDpi)} effective PPI at ${geometry.trimWidth} in width; KDP minimum is 300 DPI.` },
    { id:'spine-text', status:geometry.spineTextAllowed || !c.spineTitle ? 'pass' : 'error', label:'Spine text eligibility', message:geometry.spineTextAllowed ? 'Final page count is high enough for spine text.' : c.spineTitle ? 'Spine title must be removed for this page count.' : 'No spine text will be printed.' },
    { id:'barcode', status:c.amazonBarcode ? 'pass' : 'warning', label:'Barcode handling', message:c.amazonBarcode ? 'Amazon-placed barcode is recommended; Cover Brain reserves a 2 × 1.2 in clear zone on the back cover.' : 'Custom barcode mode needs a separate barcode asset/audit before final production.' },
    { id:'geometry', status:geometry.exact ? 'pass' : 'error', label:type === 'hardcover' ? 'Amazon hardcover geometry' : 'KDP cover geometry', message:geometry.note },
  ];
  const errors = checks.filter((item) => item.status === 'error').length;
  const warnings = checks.filter((item) => item.status === 'warning').length;
  return { ready:errors === 0, checks, geometry, summary:{ errors, warnings, passes:checks.length-errors-warnings, total:checks.length }, frontArt:front, frontDpi };
}
