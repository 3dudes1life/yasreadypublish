export async function sha256Hex(input) {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : input;

  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function shortHash(hash, length = 12) {
  if (!hash) return '—';
  return `${hash.slice(0, length)}…${hash.slice(-6)}`;
}
