/**
 * Kindle-style preview controls.
 *
 * This is deliberately a simulator, not an Amazon renderer. It uses the same
 * XHTML/CSS that YasReady packages into the EPUB, while exposing the preview
 * dimensions/reader controls Amazon documents in Kindle Previewer: device
 * class, orientation, font sizing and reading appearance.
 */
export const KINDLE_DEVICE_PRESETS = Object.freeze({
  ereader: Object.freeze({ id: 'ereader', label: 'Kindle E-reader', width: 430, height: 610, color: false, radius: 18, bezel: 18 }),
  phone: Object.freeze({ id: 'phone', label: 'Phone', width: 390, height: 700, color: true, radius: 34, bezel: 12 }),
  tablet: Object.freeze({ id: 'tablet', label: 'Tablet', width: 650, height: 840, color: true, radius: 24, bezel: 16 }),
});

export const KINDLE_FONT_FACES = Object.freeze({
  serif: Object.freeze({ id: 'serif', label: 'Reader Serif', stack: 'Georgia, \"Times New Roman\", serif' }),
  sans: Object.freeze({ id: 'sans', label: 'Reader Sans', stack: 'Arial, Helvetica, sans-serif' }),
});

export const KINDLE_FONT_SCALES = Object.freeze({
  xs: Object.freeze({ id: 'xs', label: 'Aa−−', scale: 0.84 }),
  s: Object.freeze({ id: 's', label: 'Aa−', scale: 0.92 }),
  m: Object.freeze({ id: 'm', label: 'Aa', scale: 1 }),
  l: Object.freeze({ id: 'l', label: 'Aa+', scale: 1.12 }),
  xl: Object.freeze({ id: 'xl', label: 'Aa++', scale: 1.26 }),
});

export const KINDLE_APPEARANCES = Object.freeze({
  white: Object.freeze({ id: 'white', label: 'White', background: '#fffdf9', color: '#171719', chrome: '#f4f4f6' }),
  sepia: Object.freeze({ id: 'sepia', label: 'Sepia', background: '#f3ead8', color: '#2a241b', chrome: '#e9dfca' }),
  mint: Object.freeze({ id: 'mint', label: 'Mint', background: '#e8f0e5', color: '#172017', chrome: '#dfe9dc' }),
  dark: Object.freeze({ id: 'dark', label: 'Black', background: '#151517', color: '#f2f2f4', chrome: '#242428' }),
});

export const DEFAULT_KINDLE_PREVIEW = Object.freeze({
  device: 'ereader',
  orientation: 'portrait',
  fontFace: 'serif',
  fontScale: 'm',
  appearance: 'white',
  mode: 'read',
  simulateEink: false,
});

export function normalizeKindlePreview(input = {}) {
  const next = { ...DEFAULT_KINDLE_PREVIEW, ...(input || {}) };
  if (!KINDLE_DEVICE_PRESETS[next.device]) next.device = DEFAULT_KINDLE_PREVIEW.device;
  if (!['portrait', 'landscape'].includes(next.orientation)) next.orientation = DEFAULT_KINDLE_PREVIEW.orientation;
  if (!KINDLE_FONT_FACES[next.fontFace]) next.fontFace = DEFAULT_KINDLE_PREVIEW.fontFace;
  if (!KINDLE_FONT_SCALES[next.fontScale]) next.fontScale = DEFAULT_KINDLE_PREVIEW.fontScale;
  if (!KINDLE_APPEARANCES[next.appearance]) next.appearance = DEFAULT_KINDLE_PREVIEW.appearance;
  if (!['read', 'adjust'].includes(next.mode)) next.mode = DEFAULT_KINDLE_PREVIEW.mode;
  next.simulateEink = Boolean(next.simulateEink);
  return next;
}

export function kindleViewport(input = {}) {
  const prefs = normalizeKindlePreview(input);
  const device = KINDLE_DEVICE_PRESETS[prefs.device];
  const landscape = prefs.orientation === 'landscape';
  return {
    ...device,
    width: landscape ? device.height : device.width,
    height: landscape ? device.width : device.height,
    orientation: prefs.orientation,
    aspectRatio: `${landscape ? device.height : device.width} / ${landscape ? device.width : device.height}`,
  };
}

export function kindlePreviewTokens(input = {}) {
  const prefs = normalizeKindlePreview(input);
  const appearance = KINDLE_APPEARANCES[prefs.appearance];
  const font = KINDLE_FONT_SCALES[prefs.fontScale];
  const fontFace = KINDLE_FONT_FACES[prefs.fontFace];
  const viewport = kindleViewport(prefs);
  return {
    prefs,
    appearance,
    font,
    fontFace,
    viewport,
    grayscale: prefs.device === 'ereader' && prefs.simulateEink,
  };
}
