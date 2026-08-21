import { normalizePrintDesign } from './print-model.js';

const STORAGE_KEY = 'yasreadypublish.custom-themes.v1';

function makeId() {
  if (globalThis.crypto?.randomUUID) return `custom-${crypto.randomUUID()}`;
  return `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function sanitizeThemeRecord(input = {}) {
  const name = String(input.name || input.design?.name || 'Custom Theme').trim().slice(0, 80) || 'Custom Theme';
  const id = String(input.id || makeId());
  const now = new Date().toISOString();
  const design = normalizePrintDesign({ ...(input.design || input), templateId: id, name });
  return {
    id,
    name,
    description: String(input.description || '').trim().slice(0, 240),
    createdAt: input.createdAt || now,
    updatedAt: now,
    design,
  };
}

export function loadCustomThemes(storage = globalThis.localStorage) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => sanitizeThemeRecord(item));
  } catch {
    return [];
  }
}

export function persistCustomThemes(themes, storage = globalThis.localStorage) {
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(themes));
}

export function saveCustomTheme({ name, description = '', design }, storage = globalThis.localStorage) {
  const themes = loadCustomThemes(storage);
  const record = sanitizeThemeRecord({ name, description, design });
  themes.push(record);
  persistCustomThemes(themes, storage);
  return record;
}

export function deleteCustomTheme(id, storage = globalThis.localStorage) {
  const themes = loadCustomThemes(storage).filter((theme) => theme.id !== id);
  persistCustomThemes(themes, storage);
  return themes;
}

export function serializeTheme(theme) {
  const record = sanitizeThemeRecord(theme);
  return JSON.stringify({
    format: 'yasreadypublish-theme',
    version: 1,
    name: record.name,
    description: record.description,
    design: { ...record.design, templateId: 'custom' },
  }, null, 2);
}

export function parseThemeJson(text) {
  const parsed = JSON.parse(String(text || ''));
  if (parsed?.format !== 'yasreadypublish-theme' || parsed?.version !== 1 || !parsed?.design) {
    throw new Error('That file is not a YasReady Publish theme v1 JSON file.');
  }
  return sanitizeThemeRecord({ name: parsed.name, description: parsed.description, design: parsed.design });
}
