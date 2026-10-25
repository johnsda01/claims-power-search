// Preview-logic tests, ported from test_previews.cjs to ES modules.
// Runs under plain Node (no browser) via `npm test`.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { highlight, excerpt, focusedExcerpt, copyText } from './src/lib/text.js';
import { locate } from './src/lib/highlights.js';

const tests = [
  ['topic phrases across PDF line breaks', () => assert.equal(highlight('Debris\n  removal is covered.', ['debris removal']), '<mark>Debris\n  removal</mark> is covered.')],
  ['hyphenated PDF words', () => assert.equal(highlight('Power fail-\nure applies.', ['power failure']), '<mark>Power fail-\nure</mark> applies.')],
  ['OCR and Unicode spaces', () => assert.equal(highlight('Surface\u00a0water and \ufb02ood', ['surface water', 'flood']), '<mark>Surface\u00a0water</mark> and <mark>\ufb02ood</mark>')],
  ['overlapping topic phrases', () => assert.equal(highlight('Power failure', ['power', 'power failure']), '<mark>Power failure</mark>')],
  ['safe document text', () => assert.equal(highlight('<script> & flood', ['flood']), '&lt;script&gt; &amp; <mark>flood</mark>')],
  [
    'short excerpt centered on topic without typed words',
    () => {
      const text = 'Unrelated wording. '.repeat(100) + 'Debris\nremoval coverage applies. ' + 'Later wording. '.repeat(100);
      const result = { text, terms: ['debris removal'] };
      const preview = excerpt(result);
      assert.ok(preview.length <= 484);
      assert.ok(highlight(preview, result.terms).includes('<mark>Debris\nremoval</mark>'));
      assert.ok(!preview.includes('Unrelated wording. '.repeat(10)));
    },
  ],
  [
    'blank exact-phrase input does not anchor a topic preview to page start',
    () => {
      const result = { text: 'Unrelated opening. '.repeat(100) + 'Cosmetic and aesthetic damage to floors. ' + 'Following text. '.repeat(100), terms: ['', 'cosmetic', 'aesthetic'] };
      const preview = excerpt(result);
      assert.ok(preview.includes('Cosmetic'));
      assert.ok(highlight(preview, result.terms).includes('<mark>Cosmetic</mark>'));
      assert.ok(preview.length <= 484);
    },
  ],
  [
    'full page is not shortened',
    () => {
      const text = 'Full source. '.repeat(200) + 'Flood.';
      assert.equal(
        highlight(text, ['flood']).replaceAll('<mark>', '').replaceAll('</mark>', ''),
        text,
      );
    },
  ],
  [
    'fence excerpt keeps the parent clauses and omits sibling clauses',
    () => {
      const result = {
        text:
          'SECTION I - EXCLUSIONS\n13. Hurricane Loss to:\na. Antennas;\nb. Awnings;\nc. Solar panels;\nd. Unattached:\n(1) Sheds;\n(2) Permanently installed equipment;\n(3) Fences;\ninstalled\n(4) Fabric windscreens on fences;\n14. Existing Damage\nPrior damage.',
        terms: ['hurricane', 'fences'],
      };
      const focused = focusedExcerpt(result);
      assert.ok(focused.text.includes('13. Hurricane Loss to:'));
      assert.ok(focused.text.includes('d. Unattached:'));
      assert.ok(focused.text.includes('(3) Fences;'));
      for (const excluded of ['Antennas', 'Awnings', 'Solar panels', 'Sheds', 'equipment', 'installed', 'windscreens', 'Prior damage'])
        assert.ok(!focused.text.includes(excluded), excluded);
      assert.ok(focused.text.includes('…'));
      assert.equal(focused.options.length, 3);
      const alternative = focused.options.find((option) => option.label.startsWith('(4)'));
      assert.ok(focusedExcerpt(result, alternative.start).text.includes('(4) Fabric windscreens'));
    },
  ],
  [
    'copies include source and physical page',
    () => {
      const copy = copyText({ source: 'Policy.pdf', pdf: true, page: 8 }, '13. Hurricane Loss to:\n…\nd. Unattached:\n…\n(3) Fences;');
      assert.ok(copy.startsWith('Policy.pdf | PDF page 8\n\n'));
      assert.ok(copy.includes('…'));
    },
  ],
  [
    'continues governing parents from the previous page',
    () => {
      const result = {
        page: 9,
        text: '(6) Any of the following:\n(a) Wear and tear;\n(b) Mechanical breakdown;\n(c) Smog, rust or other corrosion, or dry\nrot;\n(d) Smoke;',
        terms: ['dry rot'],
        contextPages: [{ page: 8, text: 'SECTION I - PERILS INSURED AGAINST\nA. Coverage A - Dwelling And Coverage B -\nOther Structures\n1. We insure against direct loss.\n2. We do not insure, however, for loss:\na. Excluded loss;\nb. Collapse;\nc. Caused by:\n(1) Freezing;' }],
      };
      const focus = focusedExcerpt(result);
      for (const text of ['SECTION I - PERILS INSURED AGAINST', 'A. Coverage A', 'Other Structures', '2. We do not insure', 'c. Caused by:', '(6) Any of the following:', '(c) Smog'])
        assert.ok(focus.text.includes(text), text);
      assert.ok(focus.text.includes('[Context from PDF page 8]'));
      assert.ok(focus.text.includes('[PDF page 9]'));
      assert.ok(!focus.pageSegments[9].join(' ').includes('We do not insure'));
      assert.ok(focus.pageSegments[8].join(' ').includes('We do not insure'));
    },
  ],
  [
    'new named exclusions section clears unrelated coverage parents',
    () => {
      const focus = focusedExcerpt({
        page: 5,
        text: 'SECTION II - EXCLUSIONS\nE. Coverage E Personal Liability\nParagraph 1. is replaced by the following:\n1. Expected Injury\nThe following Exclusions are added:\n9. Trampolines\n10. Animals\n11. Fungi or Bacteria\nFungi means mold.',
        terms: ['mold'],
      });
      assert.ok(focus.text.includes('SECTION II - EXCLUSIONS'));
      assert.ok(focus.text.includes('The following Exclusions are added:'));
      assert.ok(!focus.text.includes('E. Coverage E'));
    },
  ],
  [
    'highlight locate: specific numbered clause does not highlight its sibling',
    () => {
      const words = [
        { text: '(3)', x: 0, y: 0.4, w: 0.08, h: 0.02 },
        { text: 'Fences;', x: 0.1, y: 0.4, w: 0.08, h: 0.02 },
        { text: '(4)', x: 0, y: 0.5, w: 0.08, h: 0.02 },
        { text: 'Fabric', x: 0.1, y: 0.5, w: 0.08, h: 0.02 },
        { text: 'fences;', x: 0.18, y: 0.5, w: 0.08, h: 0.02 },
      ];
      const result = locate(words, ['(3) Fences;']);
      assert.equal(result.matched, 1);
      assert.ok(result.boxes.every((rect) => rect.y === 0.4));
    },
  ],
  [
    'highlight locate: normalized OCR words and wrapped lines',
    () => {
      const words = [
        { text: '\ufb02ood,', x: 0.1, y: 0, w: 0.2, h: 0.02 },
        { text: 'surface', x: 0.1, y: 0.03, w: 0.2, h: 0.02 },
        { text: 'water', x: 0.1, y: 0.06, w: 0.2, h: 0.02 },
      ];
      assert.equal(locate(words, ['flood, surface\nwater']).matched, 1);
    },
  ],
  [
    'highlight locate: unmatched wording returns no guessed position',
    () => {
      assert.deepEqual(locate([{ text: 'Fire', x: 0, y: 0, w: 0.1, h: 0.1 }], ['Flood']).boxes, []);
    },
  ],
  [
    'highlight locate: only query words inside the selected clause',
    () => {
      const lines = ['10. Animals', 'Bodily injury or property damage', '11. Fungi or Bacteria', 'Bodily injury or property damage', 'Fungi means mold or fungus.', '12. Swimming pools', 'Bodily injury or property damage'];
      const words = lines.flatMap((line, row) => line.split(' ').map((w, i) => ({ text: w, x: i * 0.08, y: row * 0.1, w: 0.07, h: 0.02 })));
      const result = locate(words, ['11. Fungi or Bacteria', 'Bodily injury or property damage', 'Fungi means mold or fungus.'], ['fungi', 'mold', 'fungus', 'bacteria'], true);
      assert.equal(result.matched, 3);
      assert.ok(result.boxes.length);
      assert.ok(result.boxes.every((r) => Math.round(r.y, 1) === 0.2 || Math.round(r.y, 1) === 0.4) || result.boxes.every((r) => [0.2, 0.4].includes(Math.round(r.y * 10) / 10)));
    },
  ],
  [
    'highlight locate: repeated phrase uses the occurrence after the clause heading',
    () => {
      const lines = ['10. Other', 'Bodily injury', '11. Selected', 'Bodily injury', '12. Other', 'Bodily injury'];
      const words = lines.flatMap((line, row) => line.split(' ').map((w, i) => ({ text: w, x: i * 0.1, y: row * 0.1, w: 0.08, h: 0.02 })));
      const result = locate(words, ['11. Selected', 'Bodily injury'], ['bodily injury'], true);
      assert.ok(result.boxes);
      assert.ok(result.boxes.every((r) => Math.round(r.y * 10) / 10 === 0.3));
    },
  ],
  [
    'highlight locate: minor OCR difference can match between known neighboring lines',
    () => {
      const lines = ['Fungi means fungus', 'inclucling mold or mildew', 'mycotoxins and spores'];
      const words = lines.flatMap((line, row) => line.split(' ').map((w, i) => ({ text: w, x: i * 0.1, y: row * 0.1, w: 0.08, h: 0.02 })));
      const result = locate(words, ['Fungi means fungus', 'including mold or mildew', 'mycotoxins and spores'], ['mold'], true);
      assert.equal(result.matched, 3);
      assert.equal(result.boxes.length, 1);
      assert.ok(Math.abs(result.boxes[0].y - 0.1) < 1e-9);
    },
  ],
  [
    'highlight locate: OCR recovery never bridges an explicit omission',
    () => {
      const lines = ['Fungi means fungus', 'including mold or mildew', 'mycotoxins and spores'];
      const words = lines.flatMap((line, row) => line.split(' ').map((w, i) => ({ text: w, x: i * 0.1, y: row * 0.1, w: 0.08, h: 0.02 })));
      const result = locate(words, ['Fungi means fungus', '…', 'wrong mold or mildew', 'mycotoxins and spores'], ['mold'], true);
      assert.equal(result.boxes.length, 0);
    },
  ],
];

let passed = 0;
for (const [name, test] of tests) {
  test();
  console.log('PASS ' + name);
  passed += 1;
}
console.log(passed + ' preview checks passed.');
