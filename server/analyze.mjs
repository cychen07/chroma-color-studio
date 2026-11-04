import sharp from 'sharp';
import { rgbToLab, rgbToHsl, colorFamily, describeColor, toHex, deltaE2000 } from '../shared/color.mjs';

export async function analyze(buffer, catalog) {
  const { data } = await sharp(buffer).resize(160, 160, { fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const rgb = [data[i], data[i + 1], data[i + 2]];
    pixels.push({ rgb, lab: rgbToLab(rgb) });
  }
  if (!pixels.length) throw Object.assign(new Error('这张图片完全透明，请选择一张有可见内容的图片。'), { status: 422 });
  const distance = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  // Deterministic farthest-point seeding, then weighted Lab k-means.
  const centers = [pixels[Math.floor(pixels.length / 2)].lab.slice()];
  while (centers.length < 6) {
    let best = null, farthest = 0;
    for (const px of pixels) {
      const d = Math.min(...centers.map(c => distance(px.lab, c)));
      if (d > farthest) { best = px; farthest = d; }
    }
    if (!best || farthest < 16) break;
    centers.push(best.lab.slice());
  }
  let groups;
  for (let iteration = 0; iteration < 14; iteration++) {
    groups = centers.map(() => ({ count: 0, rgb: [0, 0, 0], lab: [0, 0, 0] }));
    for (const px of pixels) {
      let index = 0, best = Infinity;
      centers.forEach((c, j) => { const d = distance(px.lab, c); if (d < best) { best = d; index = j; } });
      const group = groups[index]; group.count++;
      for (let c = 0; c < 3; c++) { group.rgb[c] += px.rgb[c]; group.lab[c] += px.lab[c]; }
    }
    let movement = 0;
    groups.forEach((group, i) => {
      if (!group.count) return;
      const center = group.lab.map(n => n / group.count);
      movement += distance(center, centers[i]); centers[i] = center;
    });
    if (movement < .03) break;
  }
  const colors = groups.filter(g => g.count).sort((a, b) => b.count - a.count).map(group => {
    const rgb = group.rgb.map(n => Math.round(n / group.count)), lab = rgbToLab(rgb);
    let nearest = null, dE = Infinity;
    for (const color of catalog) {
      const d = deltaE2000(lab, color.labD65);
      if (d < dE) { nearest = color; dE = d; }
    }
    return {
      rgb, hex: toHex(rgb), lab: lab.map(n => +n.toFixed(2)), name: describeColor(rgb), family: colorFamily(rgb),
      percent: group.count / pixels.length * 100,
      reference: { name: nearest.name, hex: nearest.hex, collection: nearest.collection, deltaE: +dE.toFixed(2), cmyk: [nearest.c, nearest.m, nearest.y, nearest.k] },
    };
  });
  // Largest remainder rounding makes visible percentages sum to exactly 100.
  const whole = colors.map(c => Math.floor(c.percent));
  const remainderOrder = colors.map((c, i) => ({ i, f: c.percent - whole[i] })).sort((a, b) => b.f - a.f);
  for (let i = 0, missing = 100 - whole.reduce((a, b) => a + b, 0); i < missing; i++) whole[remainderOrder[i].i]++;
  colors.forEach((c, i) => c.percent = whole[i]);
  const avg = pixels.reduce((a, p) => {
    const [, s] = rgbToHsl(p.rgb);
    return { light: a.light + p.lab[0], saturation: a.saturation + s, temperature: a.temperature + p.lab[2] };
  }, { light: 0, saturation: 0, temperature: 0 });
  for (const key of Object.keys(avg)) avg[key] = Math.round(avg[key] / pixels.length);
  const temperature = Math.abs(avg.temperature) < 6 ? '中性调' : avg.temperature > 0 ? '暖色调' : '冷色调';
  const saturation = avg.saturation < 30 ? '低饱和' : avg.saturation < 60 ? '中饱和' : '高饱和';
  const light = avg.light < 35 ? '低明度' : avg.light < 70 ? '中明度' : '高明度';
  const dominant = colors[0].family;
  const recommended = avg.light < 35 ? 'cream' : avg.temperature > 8 ? 'film' : dominant === '绿色系' ? 'forest' : 'cinema';
  return {
    colors, temperature, saturation, light, dominant, metrics: avg, recommended,
    summary: `画面以${colors[0].name}与${colors[1]?.name || colors[0].name}为主，呈现${temperature.replace('调', '')}、${saturation}的色彩关系。${avg.light < 40 ? '建议适度提亮暗部，保留细节。' : avg.saturation > 65 ? '适度收敛饱和度，可以让视觉更舒适。' : '保留主色关系，轻调反差就能带来新的氛围。'}`,
    method: 'sRGB · D65 · Lab K-means · CIEDE2000',
  };
}
