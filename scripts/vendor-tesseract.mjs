// Copies the OCR engine and English language data out of node_modules into
// public/tesseract so the app serves them from its own origin instead of a
// third-party CDN. Run automatically before `dev` and `build`.
import { mkdir, copyFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/tesseract');

const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core.wasm.js', 'tesseract-core.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd.wasm.js', 'tesseract-core-simd.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
];

await mkdir(resolve(out, 'lang'), { recursive: true });

let copied = 0;
for (const [from, to] of files) {
  const src = resolve(root, from);
  try {
    await access(src);
  } catch {
    console.warn(`[vendor-tesseract] missing, skipped: ${from}`);
    continue;
  }
  const dest = resolve(out, to);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
  copied += 1;
}

console.log(`[vendor-tesseract] copied ${copied}/${files.length} files into public/tesseract`);
