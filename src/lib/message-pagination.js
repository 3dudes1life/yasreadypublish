/**
 * YasReady Publish v1.0.50 — line-by-line structured chat pagination.
 *
 * Word sometimes stores an entire group chat as one paragraph with hard line
 * breaks. Story Lock must keep that source paragraph intact, but presentation
 * must allow page breaks BETWEEN individual messages.
 */

export const MESSAGE_PAGINATION_VERSION = 1;

const MESSAGE_LINE = /^\s*\[(?:@?[^\]]+)\]:\s*\S/;

export function structuredMessageSegments(text = '') {
  const source = String(text || '');
  if (!source.includes('\n')) {
    return source ? [{ text:source, renderText:source, start:0, end:source.length, isLast:true }] : [];
  }
  const out = [];
  let start = 0;
  while (start < source.length) {
    const nl = source.indexOf('\n', start);
    const end = nl === -1 ? source.length : nl + 1;
    const raw = source.slice(start, end);
    const renderText = raw.endsWith('\n') ? raw.slice(0, -1) : raw;
    out.push({ text:raw, renderText, start, end, isLast:end === source.length });
    start = end;
  }
  return out;
}

export function isStructuredMessageTranscript({ kind = '', role = '', text = '' } = {}) {
  if (!(String(kind) === 'text-message' || String(role) === 'text-message')) return false;
  const lines = String(text || '').split('\n').filter((line) => line.trim());
  return lines.length > 1 && lines.every((line) => MESSAGE_LINE.test(line));
}
