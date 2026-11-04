import assert from 'node:assert/strict';
import sharp from 'sharp';
import { defaultAdjustments, normalizeAdjustments, adjustmentGroups, hslChannels } from '../shared/adjustments.mjs';
import { getPreset, gradePixels } from '../shared/presets.mjs';

const width = 32, height = 24, source = new Uint8ClampedArray(width * height * 4);
for (let i = 0; i < source.length; i += 4) {
  source[i] = i * 13 % 255; source[i + 1] = (i * 7 + 47) % 255; source[i + 2] = (i * 3 + 97) % 255;
  source[i + 3] = i % 128 === 0 ? 0 : i % 64 === 0 ? 80 : 255;
}
const render = (a, strength = .75, Type = Uint8ClampedArray) => gradePixels(Type.from(source), getPreset('film'), strength, a, width, height);
assert.deepEqual(render(defaultAdjustments(), 0), source);
assert.deepEqual(render(defaultAdjustments()), render(undefined));
for (const c of Object.values(adjustmentGroups).flat()) {
  const a = { [c.key]: 55 }, result = render(a, 0);
  assert.notDeepEqual(result, source, `${c.key} must affect pixels independently of preset strength`);
  for (let i = 3; i < source.length; i += 4) assert.equal(result[i], source[i], `${c.key} must preserve alpha`);
  assert.deepEqual([...result], [...render(a, 0, Buffer)], `${c.key} must agree in browser and server buffers`);
}
for (const c of hslChannels) {
  for (const key of ['hue', 'saturation', 'lightness']) assert.notDeepEqual(render({ hsl: { [c.id]: { [key]: 60 } } }), render(undefined), `${c.id} ${key}`);
}
const combined = normalizeAdjustments({
  exposure: 12, shadows: 25, contrast: 18, temperature: -9, vibrance: 25,
  shadowHue: 195, shadowSaturation: 24, highlightHue: 45, highlightSaturation: 20, balance: 15,
  sharpen: 32, grain: 28, vignette: 23, hsl: { red: { hue: 18, saturation: -15 }, cyan: { lightness: 30 } },
});
assert.deepEqual([...render(combined)], [...render(combined, .75, Buffer)]);
assert.deepEqual(render(combined), render(combined), 'grain must be deterministic');
assert.notDeepEqual(render({ shadowHue: 240, shadowSaturation: 80 }), render({ shadowHue: 0, shadowSaturation: 80 }));
assert.notDeepEqual(render({ ...combined, balance: -70 }), render({ ...combined, balance: 70 }));
for (const invalid of [null, [], { exposure: 101 }, { grain: -1 }, { hsl: { red: { hue: '1' } } }, { typo: 3 }, { hsl: { violet: {} } }]) assert.throws(() => normalizeAdjustments(invalid));
console.log('PASS: all adjustment groups and 24 HSL parameters affect pixels; defaults, alpha, deterministic grain, schema and buffer parity');

const origin = process.env.TEST_ORIGIN || 'http://localhost:3000';
let cookie = '';
async function request(url, options = {}) {
  const r = await fetch(origin + url, { ...options, headers: { ...options.headers, Cookie: cookie } });
  if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
  return r;
}
const post = (url, data) => request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
const config = await (await request('/api/config')).json();
assert.equal(config.exportMode, 'free');
const png = await sharp(Buffer.from(source), { raw: { width, height, channels: 4 } }).png().toBuffer();
const form = new FormData(); form.append('image', new Blob([png], { type: 'image/png' }), 'adjustment-check.png');
const upload = await request('/api/photos', { method: 'POST', body: form }); assert.equal(upload.status, 200);
const photo = await upload.json();
const endpoint = `/api/photos/${photo.id}/export`, base = { preset: 'film', strength: .75, format: 'png', adjustments: combined };
const response = await post(endpoint, base); assert.equal(response.status, 200);
const result = await sharp(Buffer.from(await response.arrayBuffer())).ensureAlpha().raw().toBuffer();
assert.deepEqual([...result], [...render(combined)], 'full-resolution export must exactly equal shared preview pipeline on identical input');
const identity = await post(endpoint, { ...base, strength: 0, adjustments: defaultAdjustments() });
assert.equal(identity.status, 200);
assert.deepEqual([...await sharp(Buffer.from(await identity.arrayBuffer())).ensureAlpha().raw().toBuffer()], [...source]);
for (const adjustments of [{ brightness: 101 }, { hsl: { red: { hue: 'bad' } } }]) assert.equal((await post(endpoint, { ...base, adjustments })).status, 400);
console.log('PASS: immediate free manual export matches every RGBA byte, full reset returns original pixels, invalid manual payloads rejected');
