"""Find preview highlight positions without changing source documents."""
from functools import lru_cache
from difflib import SequenceMatcher
from pathlib import Path
import json
import os
import re
import subprocess
import tempfile
import threading
import unicodedata

GEOMETRY_LOCK = threading.Lock()


def compact(text):
    return ''.join(c for c in unicodedata.normalize('NFKC', text).casefold() if c.isalnum())


def locate(words, segments, terms=None, focused=False):
    stream, mapping = '', []
    for i, word in enumerate(words):
        value = compact(word['text'])
        stream += value
        mapping.extend([i] * len(value))
    selected = set()
    matched = 0
    cursor = 0
    records = []
    group = 0
    for segment in (segments if focused else dict.fromkeys(segments)):
        if segment.strip() == '…':
            group += 1
            continue
        needle = compact(segment)
        if len(needle) < 3:
            continue
        offset = cursor if focused else 0
        found = False
        start = None
        while (offset := stream.find(needle, offset)) >= 0:
            selected.update(mapping[offset:offset + len(needle)])
            start = offset
            offset += len(needle)
            found = True
            if focused:
                cursor = offset
                break
        matched += found
        records.append({'start':start,'end':offset if found else None,'text':needle,'group':group})
    if focused:
        i = 0
        while i < len(records):
            if records[i]['start'] is not None:
                i += 1
                continue
            first = i
            while i < len(records) and records[i]['start'] is None:
                i += 1
            if first == 0 or i == len(records):
                continue
            before, after = records[first-1], records[i]
            if before['group'] != after['group'] or any(r['group'] != before['group'] for r in records[first:i]):
                continue
            gap_start, gap_end = before['end'], after['start']
            expected = ''.join(r['text'] for r in records[first:i])
            gap_words = set(mapping[gap_start:gap_end])
            if len(gap_words) <= 40 and SequenceMatcher(None, expected, stream[gap_start:gap_end], autojunk=False).ratio() >= .72:
                selected.update(gap_words)
                matched += i-first
    if terms is not None:
        scoped = selected
        selected = set()
        for term in dict.fromkeys(terms):
            needle = compact(term)
            if not needle:
                continue
            offset = 0
            while (offset := stream.find(needle, offset)) >= 0:
                indices = set(mapping[offset:offset+len(needle)])
                if indices and indices.issubset(scoped):
                    selected.update(indices)
                offset += len(needle)
    rectangles = []
    for i in sorted(selected, key=lambda i: (round(words[i]['y'], 3), words[i]['x'])):
        word = words[i]
        rect = {key: word[key] for key in ('x', 'y', 'w', 'h')}
        last = rectangles[-1] if rectangles else None
        if last and abs(last['y'] - rect['y']) < min(last['h'], rect['h']) * .45 and -.002 <= rect['x']-(last['x']+last['w']) < .012:
            last['w'] = max(last['x']+last['w'], rect['x']+rect['w'])-last['x']
            last['h'] = max(last['h'], rect['y']+rect['h']-last['y'])
        else:
            rectangles.append(rect)
    return {'boxes': rectangles, 'matched': matched, 'requested': sum(len(compact(s)) >= 3 for s in (segments if focused else dict.fromkeys(segments)))}


@lru_cache(maxsize=16)
def page_words(filename, page_number, modified, size):
    import pdfplumber
    path = Path(filename)
    with pdfplumber.open(path) as document:
        if not 1 <= page_number <= len(document.pages):
            raise ValueError('Page number is out of range.')
        page = document.pages[page_number-1]
        words = page.extract_words(use_text_flow=True, keep_blank_chars=False)
        if sum(len(w['text']) for w in words) >= 35:
            return [{'text': w['text'], 'x': w['x0']/page.width, 'y': w['top']/page.height,
                     'w': (w['x1']-w['x0'])/page.width, 'h': (w['bottom']-w['top'])/page.height} for w in words], 'PDF text'
    import pypdfium2
    with tempfile.TemporaryDirectory(prefix='claims-highlight-') as temp:
        temp = Path(temp)
        with GEOMETRY_LOCK, pypdfium2.PdfDocument(path) as document:
            page = document[page_number-1]
            bitmap = page.render(scale=min(2200/max(page.get_size()), 4))
            bitmap.to_pil().convert('RGB').save(temp/'page.png')
            bitmap.close()
            page.close()
        shell = Path(os.environ.get('SystemRoot', 'C:/Windows'))/'System32/WindowsPowerShell/v1.0/powershell.exe'
        process = subprocess.run([str(shell), '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
                                  str(Path(__file__).with_name('ocr.ps1')), '-ImageFolder', str(temp)],
                                 capture_output=True, text=True, timeout=90,
                                 creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if process.returncode:
            raise ValueError('Unable to position highlights on this scanned page.')
        data = json.loads((temp/'page.png.json').read_text(encoding='utf-8-sig'))
        words = [word for line in data['lines'] for word in line['words']]
        # Search in column order, then merge positions on the rendered page.
        for word in words:
            word['column'] = 0 if word['y'] < data['height']*.1 else 1 if word['x'] < data['width']*.5 else 2
        ordered = []
        for column in (0, 1, 2):
            rows = []
            for word in sorted((w for w in words if w['column'] == column), key=lambda w: (w['y']+w['height']/2, w['x'])):
                center = word['y']+word['height']/2
                if not rows or abs(center-rows[-1][0]) > word['height']*.45:
                    rows.append((center, [word]))
                else:
                    rows[-1][1].append(word)
            for _, row in rows:
                ordered.extend(sorted(row, key=lambda w: w['x']))
        words = ordered
        return [{'text': w['text'], 'x': w['x']/data['width'], 'y': w['y']/data['height'],
                 'w': w['width']/data['width'], 'h': w['height']/data['height']} for w in words], 'Windows OCR'


def highlights(path, page, segments, terms=None, focused=False):
    stat = path.stat()
    words, method = page_words(str(path), page, stat.st_mtime_ns, stat.st_size)
    return {**locate(words, segments, terms, focused), 'method': method}
