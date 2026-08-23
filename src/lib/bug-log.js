const KEY = 'yasready-publish-bug-log-v1';

function store(storage = globalThis.localStorage) { return storage; }

export function loadBugLog(storage) {
  try {
    const raw = store(storage)?.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function saveBugLog(items, storage) {
  const clean = Array.isArray(items) ? items.slice(0, 250) : [];
  store(storage)?.setItem(KEY, JSON.stringify(clean));
  return clean;
}

export function addBug({ summary, notes = '', version = '', status = 'open' }, storage) {
  const title = String(summary || '').trim().slice(0, 160);
  if (!title) throw new Error('Bug summary is required.');
  const items = loadBugLog(storage);
  const item = {
    id: globalThis.crypto?.randomUUID?.() || `bug-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    summary: title,
    notes: String(notes || '').trim().slice(0, 2000),
    version: String(version || '').trim().slice(0, 40),
    status: status === 'fixed' ? 'fixed' : 'open',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveBugLog([item, ...items], storage);
  return item;
}

export function setBugStatus(id, status, storage) {
  const items = loadBugLog(storage);
  const next = items.map((item) => item.id === id ? { ...item, status: status === 'fixed' ? 'fixed' : 'open', updatedAt: new Date().toISOString() } : item);
  saveBugLog(next, storage);
  return next;
}

export function deleteBug(id, storage) {
  const next = loadBugLog(storage).filter((item) => item.id !== id);
  saveBugLog(next, storage);
  return next;
}
