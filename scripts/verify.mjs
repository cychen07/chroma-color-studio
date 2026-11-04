import assert from 'node:assert/strict';
import sharp from 'sharp';
import { deltaE2000, rgbToLab, rgbToCmyk } from '../shared/color.mjs';
import { getPreset, gradePixels } from '../shared/presets.mjs';

const origin = process.env.TEST_ORIGIN || 'http://localhost:3000';
const approx = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);
const pairs = [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
  [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
  [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1],
  [[50, 0, 0], [50, -1, 2], 2.3669],
];
for (const [a, b, d] of pairs) { approx(deltaE2000(a, b), d, .0001); approx(deltaE2000(b, a), d, .0001); }
approx(rgbToLab([255, 255, 255])[0], 100, .0001);
assert.deepEqual(rgbToCmyk([0, 0, 0]), [0, 0, 0, 100]);
const pixel = new Uint8ClampedArray([120, 180, 80, 77]);
assert.deepEqual(gradePixels(pixel.slice(), getPreset('film'), 0), pixel);
const mono = gradePixels(pixel.slice(), getPreset('mono'), 1);
assert.equal(mono[0], mono[1]); assert.equal(mono[1], mono[2]); assert.equal(mono[3], 77);
console.log('PASS: published CIEDE2000 reference pairs, sRGB/Lab, black CMYK, zero-strength identity, monochrome, alpha');

let cookie = '';
async function request(endpoint, options = {}, separate = false) {
  const response = await fetch(origin + endpoint, { ...options, headers: { ...options.headers, ...(!separate && cookie ? { Cookie: cookie } : {}) } });
  if (!separate && response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  return response;
}
const jsonPost = (endpoint, data) => request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
const config = await (await request('/api/config')).json();
assert.equal(config.colorCount, 4990);
assert.equal(config.exportMode, 'free');
assert.deepEqual(config.counts, { C: 2614, U: 2376 });
const colors = await (await request('/api/colors?q=100%20C')).json();
assert.ok(colors.colors.some(c => c.name === '100 C' && c.hex === '#F6EB61'));
const red = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 220, g: 60, b: 45, alpha: 1 } } }).png().toBuffer();
const form = new FormData(); form.append('image', new Blob([red], { type: 'image/png' }), 'verification-red.png');
const uploaded = await request('/api/photos', { method: 'POST', body: form });
assert.equal(uploaded.status, 200); const photo = await uploaded.json();
assert.equal(photo.analysis.colors.length, 1); assert.equal(photo.analysis.colors[0].percent, 100);
assert.deepEqual(photo.analysis.colors[0].rgb, [220, 60, 45]);
assert.equal(photo.analysis.dominant, '红色系');
assert.equal((await request(photo.previewUrl, {}, true)).status, 404);
assert.equal((await jsonPost(`/api/photos/${photo.id}/export`, { preset: 'film', strength: 1, format: 'png' })).status, 200);
assert.equal((await request(`/api/photos/${photo.id}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preset: 'film', strength: 1, format: 'png' }) }, true)).status, 404);
const brokenForm = new FormData(); brokenForm.append('image', new Blob(['not-an-image'], { type: 'image/png' }), 'broken.png');
assert.equal((await request('/api/photos', { method: 'POST', body: brokenForm })).status, 422);
const transparent = await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
const transparentForm = new FormData(); transparentForm.append('image', new Blob([transparent], { type: 'image/png' }), 'empty.png');
assert.equal((await request('/api/photos', { method: 'POST', body: transparentForm })).status, 422);
assert.equal((await request(`/api/photos/${photo.id}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://unrelated.example' }, body: '{}' })).status, 403);
console.log('PASS: complete catalog, real image analysis, solid-color handling, session isolation, immediate free export, invalid/transparent files, cross-origin rejection');

const exported = await jsonPost(`/api/photos/${photo.id}/export`, { preset: 'mono', strength: 1, format: 'png' });
assert.equal(exported.status, 200);
const buffer = Buffer.from(await exported.arrayBuffer()), metadata = await sharp(buffer).metadata();
assert.equal(metadata.width, 8); assert.equal(metadata.height, 8); assert.equal(metadata.format, 'png');
const data = await sharp(buffer).ensureAlpha().raw().toBuffer();
assert.equal(data[0], data[1]); assert.equal(data[1], data[2]); assert.equal(data[3], 255);
const jpeg = await jsonPost(`/api/photos/${photo.id}/export`, { preset: 'film', strength: 0, format: 'jpeg' });
assert.equal(jpeg.status, 200); assert.equal((await sharp(Buffer.from(await jpeg.arrayBuffer())).metadata()).format, 'jpeg');
assert.equal((await jsonPost(`/api/photos/${photo.id}/export`, { preset: 'bad', strength: 1, format: 'png' })).status, 400);
assert.equal((await jsonPost('/api/rewards/start', { photoId: photo.id })).status, 404);
assert.equal((await request(`/api/photos/${photo.id}/grant`)).status, 404);
console.log('PASS: free full-resolution PNG/JPEG exports, actual monochrome pixels, invalid parameters, retired reward endpoints');
console.log('All verification checks passed.');
