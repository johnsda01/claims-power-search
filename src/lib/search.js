// Policy search: matches typed words and topic terms against processed pages.
// Mirrors the Python Library.search behavior, including topic-as-OR and
// typed-query-narrows-topics semantics.

import { normalized } from './text.js';
import { TOPICS } from './topics.js';

const CATALOG = new Map(TOPICS.map(([id, label, words]) => [id, { label, words }]));

export function searchDocuments(documents, ids, query, topicIds, mode = 'any') {
  const topics = topicIds.map((id) => ({ id, ...CATALOG.get(id) })).filter((t) => t.label);
  const normalizedQuery = normalized(query);
  const queryWords = normalizedQuery.split(' ');
  if (!normalizedQuery && !topics.length) throw new Error('Type a search or select a claim topic.');
  const results = [];
  const skipped = [];
  for (const id of ids) {
    const doc = documents[id];
    if (!doc) {
      skipped.push(id);
      continue;
    }
    for (const page of doc.pages) {
      const content = normalized(page.text);
      const matches = topics.map(({ label, words }) => ({
        label,
        words: words.filter((w) => normalized(w) && content.includes(normalized(w))),
      }));
      const hits = matches.filter((m) => m.words.length);
      const queryHit =
        normalizedQuery &&
        (mode === 'phrase'
          ? content.includes(normalizedQuery)
          : mode === 'all'
            ? queryWords.every((w) => content.includes(w))
            : queryWords.some((w) => content.includes(w)));
      if ((normalizedQuery && !queryHit) || (topics.length && !hits.length)) continue;
      const terms = [
        ...new Set([
          ...(mode === 'phrase' ? [normalizedQuery] : queryWords),
          ...hits.flatMap((h) => h.words),
        ]),
      ];
      results.push({
        id,
        source: doc.name,
        page: page.page,
        text: page.text,
        method: page.method,
        pdf: doc.pdf,
        topics: hits.map((h) => h.label),
        terms,
        score: terms.reduce((sum, t) => sum + (content.split(normalized(t)).length - 1), 0),
      });
    }
  }
  results.sort((a, b) => b.score - a.score || a.source.localeCompare(b.source) || a.page - b.page);
  const shown = results.slice(0, 300);
  const context = {};
  for (const r of shown) context[r.id] = documents[r.id].pages;
  return { results: shown, total: results.length, skipped, context };
}
