// Parse data literals only. Never execute the third-party application bundle.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const bundleUrl = 'https://lf-miaoda-static.feishucdn.com/app_17fnstqv4s4/4/client/assets/index-COWrq5fD.js';
const sourceUrl = 'https://ucngz4c73vdl.feishu.link/app/app_17fnstqv4s4';
const source = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : await (async () => {
  const response = await fetch(bundleUrl);
  if (!response.ok) throw new Error(`Source download failed: ${response.status}`);
  return response.text();
})();
const literals = source.match(/\{name:`[^`]+ [CU]`,hex:`#[0-9A-Fa-f]{6}`[^{}]+\}/g) || [];
const records = literals.map(literal => {
  const value = Object.fromEntries([...literal.matchAll(/(\w+):(?:`([^`]*)`|(-?\d+(?:\.\d+)?))/g)]
    .map(([, key, text, number]) => [key, text ?? Number(number)]));
  for (const key of ['r', 'g', 'b']) if (!Number.isFinite(value[key]) || value[key] < 0 || value[key] > 255) throw new Error(`Invalid ${key}`);
  const expectedHex = '#' + [value.r, value.g, value.b].map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase();
  if (value.hex.toUpperCase() !== expectedHex) throw new Error(`HEX/RGB mismatch: ${value.name}`);
  return { ...value, collection: value.name.endsWith(' C') ? 'C' : 'U' };
});
const unique = new Set(records.map(record => record.name));
if (unique.size !== records.length || records.length < 4900) throw new Error('Source incomplete or contains duplicate IDs');
const counts = { C: records.filter(r => r.collection === 'C').length, U: records.filter(r => r.collection === 'U').length };
const dataset = {
  schemaVersion: 1, sourceUrl, bundleUrl, retrievedAt: new Date().toISOString(),
  sha256: createHash('sha256').update(source).digest('hex'),
  counts, total: records.length,
  notes: [
    'Imported from the public application supplied by the user; not independently verified against an official PANTONE licensed dataset.',
    'Source heading reports 2390 U colors, but both the actual array and rendered main collection contain 2376.',
    'Source fields are preserved verbatim. Some source CMYK values are all zero for visibly colored swatches; do not treat those values as verified printing recipes.',
    'Screen RGB values are approximations. Matching uses Lab D65 calculated consistently from sRGB, not source Lab with unspecified illuminant.',
    'Confirm data redistribution/commercial licensing with the source owner before public commercial release.'
  ], records,
};
writeFileSync(fileURLToPath(new URL('../data/colors.json', import.meta.url)), JSON.stringify(dataset));
console.log(JSON.stringify({ imported: records.length, counts, sha256: dataset.sha256 }));
