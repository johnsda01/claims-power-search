// Normalized comparison and search-term highlighting. Mirrors the Python
// `normalized()` and the browser `normalizePreview`/`highlight` helpers so the
// same source wording matches across extraction, search, and previews.

export function normalized(text) {
  let value = String(text).normalize('NFKC').toLowerCase();
  value = value.replace(/(?<=\w)[-\u00ad]\s*\n\s*(?=\w)/g, '');
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizePreview(text) {
  let value = '';
  const starts = [];
  const ends = [];
  for (let i = 0; i < text.length; ) {
    const join = text.slice(i).match(/^[-\u00ad]\s*\n\s*(?=[\p{L}\p{N}_])/u);
    if (join && i > 0 && /[\p{L}\p{N}_]/u.test(text[i - 1])) {
      i += join[0].length;
      continue;
    }
    const raw = String.fromCodePoint(text.codePointAt(i));
    const end = i + raw.length;
    for (const c of raw.normalize('NFKC').toLowerCase()) {
      if (/\s/u.test(c)) {
        if (value.endsWith(' ')) {
          ends[ends.length - 1] = end;
          continue;
        }
        value += ' ';
        starts.push(i);
        ends.push(end);
      } else {
        value += c;
        for (let j = 0; j < c.length; j++) {
          starts.push(i);
          ends.push(end);
        }
      }
    }
    i = end;
  }
  return { value, starts, ends };
}

export function previewMatches(text, terms) {
  const mapped = normalizePreview(text);
  const ranges = [];
  for (const raw of new Set(terms || [])) {
    const term = normalizePreview(raw || '').value.trim();
    if (!term) continue;
    let pos = 0;
    while ((pos = mapped.value.indexOf(term, pos)) !== -1) {
      ranges.push([mapped.starts[pos], mapped.ends[pos + term.length - 1]]);
      pos += term.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push(range.slice());
  }
  return merged;
}

export function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function highlight(text, terms) {
  let output = '';
  let end = 0;
  for (const [start, stop] of previewMatches(text, terms)) {
    output += esc(text.slice(end, start)) + '<mark>' + esc(text.slice(start, stop)) + '</mark>';
    end = stop;
  }
  return output + esc(text.slice(end));
}

export function highlightHeading(text, terms, heading) {
  const termRanges = previewMatches(text, terms);
  const headingRanges = heading ? previewMatches(text, [heading]) : [];
  const ranges = [...termRanges.map(([start, stop]) => [start, stop, '']), ...headingRanges.map(([start, stop]) => [start, stop, ' heading-highlight'])]
    .sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let output = '';
  let end = 0;
  for (const [start, stop, className] of ranges) {
    if (start < end) continue;
    output += esc(text.slice(end, start)) + `<mark class="${className.trim()}">${esc(text.slice(start, stop))}</mark>`;
    end = stop;
  }
  return output + esc(text.slice(end));
}

export function excerpt(result) {
  const text = result.text;
  const match = previewMatches(text, result.terms)[0];
  const pos = match ? match[0] : 0;
  let start = Math.max(0, pos - 75);
  let end = Math.min(text.length, start + 480);
  if (start > 0) {
    while (start < pos && /\S/.test(text[start - 1])) start++;
  }
  if (end < text.length) {
    while (end > pos + 1 && /\S/.test(text[end])) end--;
  }
  return (start ? '… ' : '') + text.slice(start, end).trim() + (end < text.length ? ' …' : '');
}

export function policyClauses(text) {
  const nodes = [];
  let stack = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    const value = line.trim();
    const marker = value.match(/^(?:([A-Z])\.|(\d+)\.|([a-z])\.|\((\d+)\)|\(([a-z])\))\s+/);
    const heading =
      (value === value.toUpperCase() &&
        /^(?:SECTION\s+[IVX\d]+\b|(?:GENERAL\s+)?EXCLUSIONS\b|PERILS INSURED AGAINST\b|(?:PROPERTY |LIABILITY )?COVERAGES$|CONDITIONS$|DEFINITIONS$|AGREEMENT$)/.test(
          value,
        )) ||
      /^The following (?:Exclusions|coverages|conditions) (?:are|is) added/i.test(value) ||
      /^(?:Paragraph|Item|Under)\s.+(?:replaced|following|Coverage|Section)/.test(value);
    if (marker || heading) {
      const depth = heading ? (/^SECTION\s/.test(value) ? -2 : -1) : marker[1] ? 0 : marker[2] ? 1 : marker[3] ? 2 : marker[4] ? 3 : 4;
      while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
      const node = { start: offset, depth, parent: stack.length ? stack[stack.length - 1] : null, label: value, end: 0 };
      nodes.push(node);
      stack.push(node);
    }
    offset += line.length + 1;
  }
  nodes.forEach((node, i) => {
    node.end = i + 1 < nodes.length ? nodes[i + 1].start : text.length;
  });
  return nodes;
}

export function focusedExcerpt(result, chosen = null) {
  const previous = (result.contextPages || []).filter((page) => page.page < result.page);
  const spans = [];
  let documentText = '';
  for (const page of [...previous, { page: result.page, text: result.text }]) {
    if (documentText) documentText += '\n\n';
    spans.push({ page: page.page, start: documentText.length, end: documentText.length + page.text.length });
    documentText += page.text;
  }
  const offset = spans[spans.length - 1].start;
  const nodes = policyClauses(documentText);
  const matches = previewMatches(result.text, result.terms).map(([start, end]) => [start + offset, end + offset]);
  let options = nodes.filter((node) => node.start >= offset && matches.some(([start, end]) => start < node.end && end > node.start));
  options.sort((a, b) => b.depth - a.depth || a.start - b.start);
  if (!options.length) {
    const text = excerpt(result);
    return { text, options: [], selected: null, selectedHeading: null, pageSegments: { [result.page]: text.split('\n') }, pages: [result.page] };
  }
  const selected = options.find((node) => node.start === chosen) || options[0];
  const headingByPage = {};
  for (const node of nodes) {
    if ((node.depth !== 0 && node.depth !== -1) || node.start > selected.start) continue;
    const span = spans.find((candidate) => node.start >= candidate.start && node.start <= candidate.end);
    if (span) headingByPage[span.page] = node.label;
  }
  const chain = [];
  for (let node = selected; node; node = node.parent) chain.unshift(node);
  let last = 0;
  let lastPage = null;
  const chunks = [];
  const pageSegments = {};
  for (const node of chain) {
    const span = spans.find((span) => node.start >= span.start && node.start <= span.end);
    const page = span ? span.page : result.page;
    const raw = documentText.slice(node.start, Math.min(node.end, span ? span.end : node.end));
    const lines = raw.trimEnd().split('\n');
    let count = lines.length;
    const boundary = lines.findIndex((line) => /[;:](?:\s+(?:or|and))?\s*$/i.test(line.trim()));
    if (boundary >= 0) count = boundary + 1;
    let part = lines.slice(0, count).join('\n').trim();
    if (node.depth < 0) part = node.label;
    else if (node !== selected && count === lines.length && part.length > 350) {
      part = lines.slice(0, Math.min(3, lines.length)).join('\n').trim() + '\n…';
    }
    if (part.length > 650) part = part.slice(0, 650).replace(/\s+\S*$/, '') + '\n…';
    if (page !== lastPage && page !== result.page) chunks.push(`[Context from PDF page ${page}]`);
    if (page !== lastPage && page === result.page && lastPage !== null && lastPage !== result.page) chunks.push(`[PDF page ${page}]`);
    if (node.start > last && chunks.length && chunks[chunks.length - 1] !== '…') chunks.push('…');
    chunks.push(part);
    last = node.start + lines.slice(0, count).join('\n').length;
    (pageSegments[page] ||= []).push(...part.split('\n'), '…');
    if (node.depth < 0) headingByPage[page] = node.label;
    lastPage = page;
  }
  if (last < documentText.trimEnd().length) chunks.push('…');
  const selectedSpan = spans.find((span) => selected.start >= span.start && selected.start <= span.end);
  return {
    text: chunks.join('\n'),
    options,
    selected: selected.start,
    selectedHeading:
      [...chain].reverse().find((node) => node.depth === 0 || node.depth === -1)?.label ||
      null,
    headingByPage,
    selectedPage: selectedSpan?.page || result.page,
    pageSegments,
    pages: Object.keys(pageSegments).map(Number),
  };
}

export function copyText(result, text) {
  return `${result.source} | ${result.pdf ? 'PDF page ' + result.page : 'Document text'}\n\n${text}`;
}
