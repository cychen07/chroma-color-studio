import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { analyze } from '../server/analyze.mjs';
import { rgbToLab } from '../shared/color.mjs';
import { gradePixels, getPreset } from '../shared/presets.mjs';
const catalog = JSON.parse(await readFile(new URL('../data/colors.json', import.meta.url), 'utf8')).records.map(c => ({ ...c, labD65: rgbToLab([c.r, c.g, c.b]) }));
const sample = await readFile(new URL('../public/sample.jpg', import.meta.url));
const round = n => Math.round(n * 100) / 100;
async function timed(fn) {
  const cpu = process.cpuUsage(), start = performance.now(), value = await fn(), elapsed = performance.now() - start, usage = process.cpuUsage(cpu);
  return { value, wallMs: round(elapsed), cpuMs: round((usage.user + usage.system) / 1000) };
}
const report = { measuredAt: new Date().toISOString(), machine: os.cpus()[0].model, node: process.version, runs: 3, note: 'Local warm-process benchmark; CPU is cumulative across Sharp threads. 12MP source is a resized sample, not an independent camera photograph. Excludes HTTP, disk I/O, TLS, SQLite, idle server and page assets.', samples: [] };
for (const size of ['native', '12mp']) {
  const input = size === 'native' ? sample : await sharp(sample).resize(4000, 3000, { fit: 'cover' }).jpeg({ quality: 92 }).toBuffer();
  const meta = await sharp(input).metadata(), runs = [];
  for (let run = 0; run < 3; run++) {
    const normalize = await timed(() => sharp(input).rotate().toColourspace('srgb').ensureAlpha().png().toBuffer());
    const analysis = await timed(() => analyze(normalize.value, catalog));
    const preview = await timed(() => sharp(normalize.value).resize(1400, 1400, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 91 }).toBuffer());
    const exportPhoto = async adjustments => {
      const { data, info } = await sharp(normalize.value).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      gradePixels(data, getPreset('film'), .75, adjustments, info.width, info.height);
      return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).flatten({ background: '#ffffff' }).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
    };
    const presetExport = await timed(() => exportPhoto());
    const manualExport = await timed(() => exportPhoto({ exposure: 12, contrast: 15, temperature: -10, sharpen: 25, grain: 15, vignette: 20, hsl: { orange: { saturation: -15 } } }));
    const brief = step => ({ wallMs: step.wallMs, cpuMs: step.cpuMs });
    runs.push({ normalize: brief(normalize), analyze: brief(analysis), preview: brief(preview), presetExport: brief(presetExport), manualExport: brief(manualExport), bytes: { input: input.length, normalizedPng: normalize.value.length, previewWebp: preview.value.length, presetJpeg: presetExport.value.length, manualJpeg: manualExport.value.length } });
  }
  report.samples.push({ size, width: meta.width, height: meta.height, runs });
  console.log(JSON.stringify({ size, width: meta.width, height: meta.height, run: runs[1] }));
}
await writeFile(new URL('../docs/benchmark.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log('Saved docs/benchmark.json');
