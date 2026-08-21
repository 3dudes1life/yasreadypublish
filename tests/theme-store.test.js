import test from 'node:test';
import assert from 'node:assert/strict';
import { parseThemeJson, sanitizeThemeRecord, serializeTheme } from '../src/lib/theme-store.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
  };
}

test('custom theme sanitization stores design metadata without manuscript content', () => {
  const theme = sanitizeThemeRecord({ name: 'My House Style', design: { trimWidth: 6, bodyFont: 'Georgia' } });
  assert.equal(theme.name, 'My House Style');
  assert.equal(theme.design.trimWidth, 6);
  assert.equal(theme.design.bodyFont, 'Georgia');
  assert.equal('manuscript' in theme, false);
});

test('theme JSON round-trip preserves layout metadata', () => {
  const original = sanitizeThemeRecord({ name: 'Round Trip', design: { insideMargin: 0.95, bodyFontSize: 11 } });
  const parsed = parseThemeJson(serializeTheme(original));
  assert.equal(parsed.name, 'Round Trip');
  assert.equal(parsed.design.insideMargin, 0.95);
  assert.equal(parsed.design.bodyFontSize, 11);
});

test('invalid theme JSON is rejected instead of guessed', () => {
  assert.throws(() => parseThemeJson('{"hello":"world"}'), /not a YasReady Publish theme/);
});
