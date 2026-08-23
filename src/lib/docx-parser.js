import { canonicalizeManuscriptV2, classifyParagraph, countWords, detectChapters } from './manuscript-rules.js';
import { sha256Hex } from './hash.js';

const JSZip = globalThis.JSZip;
if (!JSZip) throw new Error('JSZip failed to load. YasReady Publish cannot safely read DOCX files.');

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const textOf = (node) => node?.textContent ?? '';

function xmlDoc(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) throw new Error('The DOCX contains XML that could not be read safely.');
  return doc;
}

function getAttr(node, localName) {
  if (!node) return null;
  return node.getAttributeNS(WORD_NS, localName)
    ?? node.getAttribute(`w:${localName}`)
    ?? node.getAttribute(localName);
}

function childrenByLocalName(node, name) {
  return Array.from(node?.childNodes ?? []).filter(
    (child) => child.nodeType === 1 && child.localName === name,
  );
}

function firstChildByLocalName(node, name) {
  return childrenByLocalName(node, name)[0] ?? null;
}

function descendantsByLocalName(node, name) {
  return Array.from(node?.getElementsByTagName?.('*') ?? []).filter((child) => child.localName === name);
}

function parseStyles(stylesXml) {
  const styles = new Map();
  if (!stylesXml) return styles;
  const doc = xmlDoc(stylesXml);

  for (const style of Array.from(doc.getElementsByTagNameNS(WORD_NS, 'style'))) {
    const id = getAttr(style, 'styleId');
    if (!id) continue;
    const nameNode = firstChildByLocalName(style, 'name');
    styles.set(id, getAttr(nameNode, 'val') || id);
  }
  return styles;
}

function parseNumbering(numberingXml) {
  const numbering = {
    nums: new Map(),
    abstracts: new Map(),
  };
  if (!numberingXml) return numbering;
  const doc = xmlDoc(numberingXml);

  for (const abstract of Array.from(doc.getElementsByTagNameNS(WORD_NS, 'abstractNum'))) {
    const abstractId = getAttr(abstract, 'abstractNumId');
    const levels = new Map();
    for (const lvl of childrenByLocalName(abstract, 'lvl')) {
      const ilvl = getAttr(lvl, 'ilvl') || '0';
      const numFmt = getAttr(firstChildByLocalName(lvl, 'numFmt'), 'val') || 'decimal';
      const lvlText = getAttr(firstChildByLocalName(lvl, 'lvlText'), 'val') || '%1.';
      levels.set(ilvl, { numFmt, lvlText });
    }
    numbering.abstracts.set(abstractId, levels);
  }

  for (const num of Array.from(doc.getElementsByTagNameNS(WORD_NS, 'num'))) {
    const numId = getAttr(num, 'numId');
    const abstractId = getAttr(firstChildByLocalName(num, 'abstractNumId'), 'val');
    numbering.nums.set(numId, abstractId);
  }

  return numbering;
}

function runFormatting(run) {
  const props = firstChildByLocalName(run, 'rPr');
  return {
    bold: Boolean(firstChildByLocalName(props, 'b')),
    italic: Boolean(firstChildByLocalName(props, 'i')),
    underline: Boolean(firstChildByLocalName(props, 'u')),
    strike: Boolean(firstChildByLocalName(props, 'strike')),
    smallCaps: Boolean(firstChildByLocalName(props, 'smallCaps')),
  };
}

function runSegments(run) {
  const formatting = runFormatting(run);
  const segments = [];
  let buffer = '';
  const flush = () => {
    if (!buffer) return;
    segments.push({ text: buffer, ...formatting });
    buffer = '';
  };

  for (const child of Array.from(run.childNodes)) {
    if (child.nodeType !== 1) continue;
    switch (child.localName) {
      case 't':
        buffer += textOf(child);
        break;
      case 'tab':
        buffer += '\t';
        break;
      case 'br':
      case 'cr':
        buffer += '\n';
        break;
      case 'noBreakHyphen':
        buffer += '\u2011';
        break;
      case 'softHyphen':
        buffer += '\u00AD';
        break;
      case 'footnoteReference':
      case 'endnoteReference': {
        flush();
        const id = getAttr(child, 'id');
        segments.push({
          text: '',
          ...formatting,
          noteRef: {
            type: child.localName === 'footnoteReference' ? 'footnote' : 'endnote',
            id: String(id ?? ''),
          },
        });
        break;
      }
      default:
        break;
    }
  }
  flush();
  return segments;
}

function paragraphTextAndRuns(paragraph) {
  const runs = [];
  let text = '';

  const walk = (node) => {
    for (const child of Array.from(node.childNodes ?? [])) {
      if (child.nodeType !== 1) continue;
      if (child.localName === 'r') {
        for (const parsed of runSegments(child)) {
          runs.push(parsed);
          text += parsed.text;
        }
      } else if (['hyperlink', 'smartTag', 'sdt', 'fldSimple', 'customXml', 'dir', 'bdo'].includes(child.localName)) {
        walk(child);
      }
    }
  };

  walk(paragraph);
  return { text, runs };
}

function paragraphStyle(paragraph, styles) {
  const pPr = firstChildByLocalName(paragraph, 'pPr');
  const styleNode = firstChildByLocalName(pPr, 'pStyle');
  const styleId = getAttr(styleNode, 'val') || '';
  return {
    id: styleId,
    name: styles.get(styleId) || styleId || 'Normal',
  };
}

function paragraphLayout(paragraph) {
  const pPr = firstChildByLocalName(paragraph, 'pPr');
  const alignment = getAttr(firstChildByLocalName(pPr, 'jc'), 'val') || '';
  const spacing = firstChildByLocalName(pPr, 'spacing');
  const indent = firstChildByLocalName(pPr, 'ind');
  const num = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    alignment,
    spaceBeforeTwips: num(getAttr(spacing, 'before')),
    spaceAfterTwips: num(getAttr(spacing, 'after')),
    lineTwips: num(getAttr(spacing, 'line')),
    lineRule: getAttr(spacing, 'lineRule') || '',
    leftTwips: num(getAttr(indent, 'left') ?? getAttr(indent, 'start')),
    rightTwips: num(getAttr(indent, 'right') ?? getAttr(indent, 'end')),
    firstLineTwips: num(getAttr(indent, 'firstLine')),
    hangingTwips: num(getAttr(indent, 'hanging')),
    keepNext: Boolean(firstChildByLocalName(pPr, 'keepNext')),
    pageBreakBefore: Boolean(firstChildByLocalName(pPr, 'pageBreakBefore')),
  };
}

function paragraphNumbering(paragraph, numbering) {
  const pPr = firstChildByLocalName(paragraph, 'pPr');
  const numPr = firstChildByLocalName(pPr, 'numPr');
  if (!numPr) return null;
  const numId = getAttr(firstChildByLocalName(numPr, 'numId'), 'val');
  const ilvl = getAttr(firstChildByLocalName(numPr, 'ilvl'), 'val') || '0';
  const abstractId = numbering.nums.get(numId);
  const level = numbering.abstracts.get(abstractId)?.get(ilvl) ?? null;
  return { numId, ilvl, ...level };
}

function parseRelationships(xml) {
  const rels = new Map();
  if (!xml) return rels;
  const doc = xmlDoc(xml);
  for (const node of Array.from(doc.getElementsByTagName('*')).filter((item) => item.localName === 'Relationship')) {
    const id = node.getAttribute('Id') || '';
    if (!id) continue;
    rels.set(id, {
      id,
      target: node.getAttribute('Target') || '',
      type: node.getAttribute('Type') || '',
      external: String(node.getAttribute('TargetMode') || '').toLowerCase() === 'external',
    });
  }
  return rels;
}

function resolveWordTarget(target = '') {
  const parts = ['word'];
  for (const part of String(target || '').replaceAll('\\', '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

function imageMimeType(fileName = '') {
  const ext = String(fileName).toLowerCase().split('.').pop();
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'bmp') return 'image/bmp';
  if (ext === 'tif' || ext === 'tiff') return 'image/tiff';
  return 'image/jpeg';
}

async function loadMediaAssets(zip, relationships) {
  const rows = [...relationships.values()].filter((rel) => !rel.external && /\/image$/i.test(rel.type));
  const media = [];
  const byRelId = new Map();
  for (const rel of rows) {
    const path = resolveWordTarget(rel.target);
    const file = zip.file(path);
    if (!file) continue;
    const [bytes, base64] = await Promise.all([file.async('uint8array'), file.async('base64')]);
    const fileName = path.split('/').pop() || `image-${media.length + 1}`;
    const mimeType = imageMimeType(fileName);
    const asset = {
      id: `image-${media.length + 1}`,
      relId: rel.id,
      fileName,
      mimeType,
      fileSize: bytes.length,
      sha256: await sha256Hex(bytes),
      dataUrl: `data:${mimeType};base64,${base64}`,
    };
    media.push(asset);
    byRelId.set(rel.id, asset);
  }
  return { media, byRelId };
}

function paragraphMediaRefs(paragraph, mediaByRelId) {
  const blips = descendantsByLocalName(paragraph, 'blip');
  if (!blips.length) return [];
  const docProps = descendantsByLocalName(paragraph, 'docPr');
  const extents = descendantsByLocalName(paragraph, 'extent');
  return blips.map((blip, index) => {
    const relId = blip.getAttributeNS(REL_NS, 'embed') || blip.getAttribute('r:embed') || '';
    const asset = mediaByRelId.get(relId);
    if (!asset) return null;
    const props = docProps[index] || docProps[0] || null;
    const extent = extents[index] || extents[0] || null;
    const number = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    return {
      mediaId: asset.id,
      relId,
      altText: props?.getAttribute('descr') || props?.getAttribute('title') || '',
      name: props?.getAttribute('name') || asset.fileName,
      widthEmu: number(extent?.getAttribute('cx')),
      heightEmu: number(extent?.getAttribute('cy')),
    };
  }).filter(Boolean);
}

function parseNotes(xml, type, styles) {
  if (!xml) return [];
  const doc = xmlDoc(xml);
  const elementName = type === 'footnote' ? 'footnote' : 'endnote';
  const notes = [];
  for (const note of Array.from(doc.getElementsByTagNameNS(WORD_NS, elementName))) {
    const noteType = getAttr(note, 'type');
    const id = Number(getAttr(note, 'id'));
    if (['separator', 'continuationSeparator', 'continuationNotice'].includes(noteType)) continue;
    if (Number.isFinite(id) && id < 0) continue;
    const paragraphs = descendantsByLocalName(note, 'p').map((paragraph) => {
      const { text, runs } = paragraphTextAndRuns(paragraph);
      return {
        text,
        runs,
        style: paragraphStyle(paragraph, styles),
        layout: paragraphLayout(paragraph),
        wordCount: countWords(text),
      };
    });
    notes.push({
      id: String(getAttr(note, 'id') ?? notes.length + 1),
      type,
      paragraphs,
      wordCount: paragraphs.reduce((sum, paragraph) => sum + paragraph.wordCount, 0),
    });
  }
  return notes;
}

export async function parseDocx(arrayBuffer) {
  let zip;
  try {
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch {
    throw new Error('This file is not a readable DOCX package. Please choose a .docx file.');
  }

  const documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new Error('The DOCX is missing word/document.xml and cannot be imported safely.');

  const [documentXml, stylesXml, numberingXml, footnotesXml, endnotesXml, relationshipsXml] = await Promise.all([
    documentFile.async('string'),
    zip.file('word/styles.xml')?.async('string') ?? null,
    zip.file('word/numbering.xml')?.async('string') ?? null,
    zip.file('word/footnotes.xml')?.async('string') ?? null,
    zip.file('word/endnotes.xml')?.async('string') ?? null,
    zip.file('word/_rels/document.xml.rels')?.async('string') ?? null,
  ]);

  const styles = parseStyles(stylesXml);
  const numbering = parseNumbering(numberingXml);
  const relationships = parseRelationships(relationshipsXml);
  const { media, byRelId: mediaByRelId } = await loadMediaAssets(zip, relationships);
  const notes = [
    ...parseNotes(footnotesXml, 'footnote', styles),
    ...parseNotes(endnotesXml, 'endnote', styles),
  ];
  const noteKeySet = new Set(notes.map((note) => `${note.type}:${note.id}`));

  const document = xmlDoc(documentXml);
  const body = document.getElementsByTagNameNS(WORD_NS, 'body')[0];
  if (!body) throw new Error('The DOCX does not contain a readable document body.');

  const tableCount = body.getElementsByTagNameNS(WORD_NS, 'tbl').length;
  const hyperlinkCount = body.getElementsByTagNameNS(WORD_NS, 'hyperlink').length;
  const fieldCount = body.getElementsByTagNameNS(WORD_NS, 'fldSimple').length + body.getElementsByTagNameNS(WORD_NS, 'instrText').length;
  const manualPageBreakCount = Array.from(body.getElementsByTagNameNS(WORD_NS, 'br')).filter((node) => getAttr(node, 'type') === 'page').length;

  // Tracked revisions create ambiguity about which wording is canonical. Story Lock refuses to guess.
  const inserted = body.getElementsByTagNameNS(WORD_NS, 'ins').length;
  const deleted = body.getElementsByTagNameNS(WORD_NS, 'del').length;
  if (inserted || deleted) {
    throw new Error('Story Lock stopped this import because the DOCX contains tracked changes. Accept or reject all tracked changes in Word, save a clean final DOCX, and import again.');
  }

  const blocks = [];
  let previousNonEmpty = null;

  // Use all body paragraphs in XML order, including paragraphs inside tables/text boxes.
  // We would rather preserve extra source content than silently drop a story paragraph.
  for (const element of Array.from(body.getElementsByTagNameNS(WORD_NS, 'p'))) {
    const { text, runs } = paragraphTextAndRuns(element);
    const style = paragraphStyle(element, styles);
    const numberingInfo = paragraphNumbering(element, numbering);
    const layout = paragraphLayout(element);
    const mediaRefs = paragraphMediaRefs(element, mediaByRelId);
    const draft = { text, styleName: style.name };
    const kind = classifyParagraph(draft, previousNonEmpty);

    const block = {
      id: `p-${blocks.length + 1}`,
      index: blocks.length,
      kind,
      text,
      runs,
      style,
      numbering: numberingInfo,
      layout,
      mediaRefs,
      wordCount: countWords(text),
    };
    blocks.push(block);
    if (kind !== 'blank' || mediaRefs.length) previousNonEmpty = block;
  }

  const noteRefs = blocks.flatMap((block) => (block.runs || []).map((run) => run.noteRef).filter(Boolean));
  const unresolvedNoteRefs = noteRefs.filter((ref) => !noteKeySet.has(`${ref.type}:${ref.id}`));
  if (unresolvedNoteRefs.length) {
    throw new Error(`Story Lock stopped this import because ${unresolvedNoteRefs.length} footnote/endnote reference(s) could not be resolved safely.`);
  }

  const canonicalText = canonicalizeManuscriptV2(blocks, notes, media);
  const chapters = detectChapters(blocks);
  const footnoteCount = notes.filter((note) => note.type === 'footnote').length;
  const endnoteCount = notes.filter((note) => note.type === 'endnote').length;
  const noteWords = notes.reduce((sum, note) => sum + note.wordCount, 0);
  const imageReferenceCount = blocks.reduce((sum, block) => sum + (block.mediaRefs?.length || 0), 0);
  const imageAltTextCount = blocks.reduce((sum, block) => sum + (block.mediaRefs || []).filter((ref) => String(ref.altText || '').trim()).length, 0);
  const stats = {
    paragraphs: blocks.length,
    nonEmptyParagraphs: blocks.filter((b) => b.kind !== 'blank' || b.mediaRefs?.length).length,
    words: blocks.reduce((sum, b) => sum + b.wordCount, 0),
    noteWords,
    characters: blocks.reduce((sum, b) => sum + b.text.length, 0),
    chapters: chapters.length,
    textMessages: blocks.filter((b) => b.kind === 'text-message').length,
    sceneBreaks: blocks.filter((b) => b.kind === 'scene-break').length,
  };

  return {
    blocks,
    chapters,
    notes,
    media,
    canonicalText,
    stats,
    metadata: {
      hasStyles: Boolean(stylesXml),
      hasNumbering: Boolean(numberingXml),
      imageCount: media.length,
      imageReferenceCount,
      imageAltTextCount,
      tableCount,
      hyperlinkCount,
      fieldCount,
      manualPageBreakCount,
      footnoteCount,
      endnoteCount,
      noteReferenceCount: noteRefs.length,
      canonicalVersion: 2,
    },
  };
}
