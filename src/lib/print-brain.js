import { normalizePrintDesign } from './print-model.js';

export const PRINT_BRAIN_VERSION = 1;

const PAPERBACK_TRIMS = Object.freeze([
  { id:'5x8', width:5, height:8, label:'5 × 8 in', max:{ white:828, cream:776, groundwood:812, standard:600, premium:828 } },
  { id:'5.06x7.81', width:5.06, height:7.81, label:'5.06 × 7.81 in', max:{ white:828, cream:776, groundwood:812, standard:600, premium:828 } },
  { id:'5.25x8', width:5.25, height:8, label:'5.25 × 8 in', max:{ white:828, cream:776, groundwood:812, standard:600, premium:828 } },
  { id:'5.5x8.5', width:5.5, height:8.5, label:'5.5 × 8.5 in', max:{ white:828, cream:776, groundwood:812, standard:600, premium:828 } },
  { id:'6x9', width:6, height:9, label:'6 × 9 in', max:{ white:828, cream:776, groundwood:812, standard:600, premium:828 } },
  { id:'6.14x9.21', width:6.14, height:9.21, label:'6.14 × 9.21 in', max:{ white:828, cream:776, groundwood:812, standard:600, premium:828 } },
  { id:'6.69x9.61', width:6.69, height:9.61, label:'6.69 × 9.61 in', max:{ white:828, cream:776, groundwood:812, standard:600, premium:828 } },
  { id:'7x10', width:7, height:10, label:'7 × 10 in', max:{ white:828, cream:776, groundwood:812, standard:600, premium:828 } },
  { id:'7.44x9.69', width:7.44, height:9.69, label:'7.44 × 9.69 in', max:{ white:828, cream:776, groundwood:812, standard:600, premium:828 } },
  { id:'7.5x9.25', width:7.5, height:9.25, label:'7.5 × 9.25 in', max:{ white:828, cream:776, groundwood:812, standard:600, premium:828 } },
  { id:'8x10', width:8, height:10, label:'8 × 10 in', max:{ white:828, cream:776, groundwood:812, standard:600, premium:828 } },
  { id:'8.25x6', width:8.25, height:6, label:'8.25 × 6 in', max:{ white:800, cream:750, groundwood:784, standard:600, premium:800 } },
  { id:'8.25x8.25', width:8.25, height:8.25, label:'8.25 × 8.25 in', max:{ white:800, cream:750, groundwood:784, standard:600, premium:800 } },
  { id:'8.5x8.5', width:8.5, height:8.5, label:'8.5 × 8.5 in', max:{ white:590, cream:550, groundwood:578, standard:600, premium:590 } },
  { id:'8.5x11', width:8.5, height:11, label:'8.5 × 11 in', max:{ white:590, cream:550, groundwood:578, standard:600, premium:590 } },
  { id:'8.27x11.69', width:8.27, height:11.69, label:'8.27 × 11.69 in', max:{ white:780, cream:730, groundwood:764, standard:0, premium:590 } },
]);

const HARDCOVER_TRIMS = Object.freeze([
  { id:'5.5x8.5', width:5.5, height:8.5, label:'5.5 × 8.5 in' },
  { id:'6x9', width:6, height:9, label:'6 × 9 in' },
  { id:'6.14x9.21', width:6.14, height:9.21, label:'6.14 × 9.21 in' },
  { id:'7x10', width:7, height:10, label:'7 × 10 in' },
  { id:'8.25x11', width:8.25, height:11, label:'8.25 × 11 in' },
]);

export function printTrimOptions(type = 'paperback') {
  return type === 'hardcover' ? HARDCOVER_TRIMS : PAPERBACK_TRIMS;
}

export function recommendedPrintProduction(type = 'paperback') {
  return normalizePrintProduction({}, type);
}

export function normalizePrintProduction(input = {}, type = 'paperback') {
  const trims = printTrimOptions(type);
  const explicitWidth = Number(input?.trimWidth);
  const explicitHeight = Number(input?.trimHeight);
  const matchedBySize = Number.isFinite(explicitWidth) && Number.isFinite(explicitHeight)
    ? trims.find((item) => Math.abs(item.width - explicitWidth) < 0.001 && Math.abs(item.height - explicitHeight) < 0.001)
    : null;
  const trim = trims.find((item) => item.id === input?.trimId) || matchedBySize || trims.find((item) => item.id === '6x9') || trims[0];
  const customTrim = input?.trimId === 'custom' && Number.isFinite(explicitWidth) && Number.isFinite(explicitHeight);
  const inkChoices = type === 'hardcover' ? ['black','premium'] : ['black','standard','premium'];
  const ink = inkChoices.includes(input?.ink) ? input.ink : 'black';
  let paper = ['white','cream','groundwood'].includes(input?.paper) ? input.paper : 'cream';
  if (ink !== 'black') paper = 'white';
  if (type === 'hardcover' && paper === 'groundwood') paper = 'cream';
  return {
    version:PRINT_BRAIN_VERSION,
    configured:Boolean(input?.configured),
    trimId:customTrim ? 'custom' : trim.id,
    trimWidth:customTrim ? explicitWidth : trim.width,
    trimHeight:customTrim ? explicitHeight : trim.height,
    ink,
    paper,
    bleed:Boolean(input?.bleed),
    recommendation:'fiction-6x9',
  };
}

export function requiredPrintInsideMargin(pageCount = 0) {
  const count = Number(pageCount) || 0;
  if (count >= 701) return 0.875;
  if (count >= 501) return 0.75;
  if (count >= 301) return 0.625;
  if (count >= 151) return 0.5;
  if (count >= 24) return 0.375;
  return null;
}

export function printPageRange(type, productionInput = {}) {
  const production = normalizePrintProduction(productionInput, type);
  if (type === 'hardcover') {
    const knownTrim = HARDCOVER_TRIMS.some((item) => Math.abs(item.width - production.trimWidth) < 0.001 && Math.abs(item.height - production.trimHeight) < 0.001);
    if (!knownTrim) return { available:false, min:75, max:550, reason:'That trim is not one of KDP’s five supported hardcover sizes.' };
    if (production.ink === 'standard' || production.paper === 'groundwood') return { available:false, min:75, max:550, reason:'That print combination is not available for KDP hardcover.' };
    return { available:true, min:75, max:550, reason:'KDP hardcover supports 75–550 pages for this option.' };
  }
  const trim = PAPERBACK_TRIMS.find((item) => Math.abs(item.width - production.trimWidth) < 0.001 && Math.abs(item.height - production.trimHeight) < 0.001);
  if (!trim) {
    const customOk = production.trimWidth >= 4 && production.trimWidth <= 8.5 && production.trimHeight >= 6 && production.trimHeight <= 11.69;
    return { available:customOk, min:24, max:customOk ? 590 : 0, reason:customOk ? 'Custom paperback trim is inside KDP’s allowed dimensional bounds; exact page-count eligibility should be confirmed in KDP for this custom size.' : 'Custom paperback trim is outside KDP’s allowed dimensional bounds.' };
  }
  const key = production.ink === 'standard' ? 'standard' : production.ink === 'premium' ? 'premium' : production.paper;
  const max = Number(trim.max[key]) || 0;
  const min = production.ink === 'standard' ? 72 : 24;
  return { available:max >= min, min, max, reason:max >= min ? `KDP allows ${min}–${max} pages for this trim/ink/paper combination.` : 'That print combination is not available for this trim.' };
}

export function printEligibility({ type = 'paperback', production:productionInput = {}, pageCount = 0 } = {}) {
  const production = normalizePrintProduction(productionInput, type);
  const range = printPageRange(type, production);
  const count = Number(pageCount) || 0;
  const pageCountOk = !count || (range.available && count >= range.min && count <= range.max);
  const inside = requiredPrintInsideMargin(count);
  const outside = production.bleed ? 0.375 : 0.25;
  return { production, range, pageCountOk, requiredInside:inside, requiredOutside:outside, requiredTopBottom:outside };
}

export function applyPrintBrainToDesign(designInput = {}, productionInput = {}, type = 'paperback', pageCount = 0) {
  const design = normalizePrintDesign(designInput);
  const eligibility = printEligibility({ type, production:productionInput, pageCount });
  const p = eligibility.production;
  design.trimWidth = p.trimWidth;
  design.trimHeight = p.trimHeight;
  if (eligibility.requiredInside != null) design.insideMargin = Math.max(design.insideMargin, eligibility.requiredInside);
  design.outsideMargin = Math.max(design.outsideMargin, eligibility.requiredOutside);
  design.topMargin = Math.max(design.topMargin, eligibility.requiredTopBottom);
  design.bottomMargin = Math.max(design.bottomMargin, eligibility.requiredTopBottom);
  return normalizePrintDesign(design);
}
