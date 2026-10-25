// Locate highlight rectangles on a PDF page from excerpt segments or terms.
// Pure positioning logic ported from page_highlights.py; the caller supplies
// the word list (text + normalized x/y/w/h in 0..1) from either a PDF text
// layer or OCR words.

function compact(text) {
  return [...String(text).normalize('NFKC').toLowerCase()].filter((c) => c >= 'a' && c <= 'z' || c >= '0' && c <= '9').join('');
}

export function locate(words, segments, terms = null, focused = false) {
  let stream = '';
  const mapping = [];
  for (let i = 0; i < words.length; i++) {
    const value = compact(words[i].text);
    stream += value;
    for (let j = 0; j < value.length; j++) mapping.push(i);
  }
  const selected = new Set();
  let matched = 0;
  let cursor = 0;
  const records = [];
  let group = 0;
  const iter = focused ? segments : [...new Set(segments)];
  for (const segment of iter) {
    if (segment.trim() === '…') {
      group += 1;
      continue;
    }
    const needle = compact(segment);
    if (needle.length < 3) continue;
    let offset = focused ? cursor : 0;
    let found = false;
    let start = null;
    let end = null;
    while ((offset = stream.indexOf(needle, offset)) >= 0) {
      for (let k = offset; k < offset + needle.length; k++) selected.add(mapping[k]);
      start = offset;
      end = offset + needle.length;
      offset += needle.length;
      found = true;
      if (focused) {
        cursor = offset;
        break;
      }
    }
    matched += found ? 1 : 0;
    records.push({ start, end: found ? end : null, text: needle, group });
  }
  if (focused) {
    let i = 0;
    while (i < records.length) {
      if (records[i].start !== null) {
        i += 1;
        continue;
      }
      const first = i;
      while (i < records.length && records[i].start === null) i += 1;
      if (first === 0 || i === records.length) continue;
      const before = records[first - 1];
      const after = records[i];
      if (before.group !== after.group || records.slice(first, i).some((r) => r.group !== before.group)) continue;
      const gapStart = before.end;
      const gapEnd = after.start;
      const expected = records.slice(first, i).map((r) => r.text).join('');
      const gapWords = new Set(mapping.slice(gapStart, gapEnd));
      if (gapWords.size <= 40 && similarity(expected, stream.slice(gapStart, gapEnd)) >= 0.72) {
        for (const w of gapWords) selected.add(w);
        matched += i - first;
      }
    }
  }
  let scoped = selected;
  let finalSelected = selected;
  if (terms !== null) {
    scoped = selected;
    finalSelected = new Set();
    for (const term of new Set(terms)) {
      const needle = compact(term);
      if (!needle) continue;
      let offset = 0;
      while ((offset = stream.indexOf(needle, offset)) >= 0) {
        const indices = new Set(mapping.slice(offset, offset + needle.length));
        if (indices.size && [...indices].every((idx) => scoped.has(idx))) {
          for (const idx of indices) finalSelected.add(idx);
        }
        offset += needle.length;
      }
    }
  }
  const rectangles = [];
  for (const i of [...finalSelected].sort((a, b) => Math.round(words[a].y * 1000) - Math.round(words[b].y * 1000) || words[a].x - words[b].x)) {
    const word = words[i];
    const rect = { x: word.x, y: word.y, w: word.w, h: word.h };
    const last = rectangles[rectangles.length - 1];
    if (
      last &&
      Math.abs(last.y - rect.y) < Math.min(last.h, rect.h) * 0.45 &&
      rect.x - (last.x + last.w) >= -0.002 &&
      rect.x - (last.x + last.w) < 0.012
    ) {
      last.w = Math.max(last.x + last.w, rect.x + rect.w) - last.x;
      last.h = Math.max(last.h, rect.y + rect.h - rect.y);
    } else {
      rectangles.push(rect);
    }
  }
  return {
    boxes: rectangles,
    matched,
    requested: (focused ? segments : [...new Set(segments)]).filter((s) => compact(s).length >= 3).length,
  };
}

function similarity(a, b) {
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  const m = a.length;
  const n = b.length;
  const dp = new Array(n + 1);
  for (let i = 0; i <= n; i++) dp[i] = i;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return 1 - dp[n] / Math.max(m, n);
}
