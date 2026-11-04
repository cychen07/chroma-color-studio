import { clamp } from './color.mjs';

export const adjustmentGroups = {
  light: [
    { key: 'exposure', label: '曝光', min: -100, max: 100 },
    { key: 'brightness', label: '明度', min: -100, max: 100 },
    { key: 'contrast', label: '对比度', min: -100, max: 100 },
    { key: 'highlights', label: '高光', min: -100, max: 100 },
    { key: 'shadows', label: '阴影', min: -100, max: 100 },
    { key: 'fade', label: '褪色', min: 0, max: 100 },
  ],
  color: [
    { key: 'temperature', label: '色温', min: -100, max: 100, track: 'temperature' },
    { key: 'tint', label: '色调', min: -100, max: 100, track: 'tint' },
    { key: 'saturation', label: '饱和度', min: -100, max: 100 },
    { key: 'vibrance', label: '自然饱和度', min: -100, max: 100 },
  ],
  detail: [
    { key: 'sharpen', label: '锐化', min: 0, max: 100 },
    { key: 'grain', label: '颗粒', min: 0, max: 100 },
    { key: 'vignette', label: '暗角', min: 0, max: 100 },
  ],
};
export const toneControls = [
  { key: 'shadowHue', label: '阴影色相', min: 0, max: 360, track: 'hue' },
  { key: 'shadowSaturation', label: '阴影着色', min: 0, max: 100 },
  { key: 'highlightHue', label: '高光色相', min: 0, max: 360, track: 'hue' },
  { key: 'highlightSaturation', label: '高光着色', min: 0, max: 100 },
  { key: 'balance', label: '光影平衡', min: -100, max: 100 },
];
export const hslChannels = [
  { id: 'red', name: '红色', hue: 0, color: '#ef6666' },
  { id: 'orange', name: '橙色', hue: 30, color: '#f4a253' },
  { id: 'yellow', name: '黄色', hue: 60, color: '#e6d368' },
  { id: 'green', name: '绿色', hue: 120, color: '#7bb47c' },
  { id: 'cyan', name: '青色', hue: 180, color: '#62bfc1' },
  { id: 'blue', name: '蓝色', hue: 240, color: '#749ade' },
  { id: 'purple', name: '紫色', hue: 270, color: '#ad8bce' },
  { id: 'magenta', name: '洋红', hue: 300, color: '#d788b5' },
];
const controls = [...Object.values(adjustmentGroups).flat(), ...toneControls];
export function defaultAdjustments() {
  return { ...Object.fromEntries(controls.map(c => [c.key, 0])), hsl: Object.fromEntries(hslChannels.map(c => [c.id, { hue: 0, saturation: 0, lightness: 0 }])) };
}
// Same schema at the API boundary and when restoring browser recipes.
export function normalizeAdjustments(input) {
  const result = defaultAdjustments();
  if (input === undefined) return result;
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const number = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  if (!object(input) || Object.keys(input).some(k => k !== 'hsl' && !controls.some(c => c.key === k))) throw new Error('手动调色参数不正确。');
  for (const c of controls) {
    if (!Object.hasOwn(input, c.key)) continue;
    if (!number(input[c.key], c.min, c.max)) throw new Error('手动调色数值超出范围。');
    result[c.key] = input[c.key];
  }
  if (Object.hasOwn(input, 'hsl')) {
    if (!object(input.hsl) || Object.keys(input.hsl).some(k => !hslChannels.some(c => c.id === k))) throw new Error('HSL 色彩通道不正确。');
    for (const c of hslChannels) {
      if (!Object.hasOwn(input.hsl, c.id)) continue;
      const channel = input.hsl[c.id];
      if (!object(channel) || Object.keys(channel).some(k => !['hue', 'saturation', 'lightness'].includes(k))) throw new Error('HSL 参数不正确。');
      for (const key of ['hue', 'saturation', 'lightness']) {
        if (!Object.hasOwn(channel, key)) continue;
        if (!number(channel[key], -100, 100)) throw new Error('HSL 数值超出范围。');
        result.hsl[c.id][key] = channel[key];
      }
    }
  }
  return result;
}
export function adjustmentCount(a) {
  if (!a) return 0;
  return controls.filter(c => a[c.key] !== 0).length + Object.values(a.hsl).reduce((n, c) => n + Object.values(c).filter(v => v !== 0).length, 0);
}
function hueRgb(h) {
  const component = n => {
    const k = (n + h / 30) % 12;
    return 1 - Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [component(0) / 2, component(8) / 2, component(4) / 2];
}
function hslShift(r, g, b, channels) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < .001) return [r, g, b];
  let h = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  let l = (max + min) / 510, s = d / (255 * (1 - Math.abs(2 * l - 1)));
  let dh = 0, ds = 0, dl = 0, weight = 0;
  for (const c of channels) {
    const distance = Math.abs(h - c.hue), t = Math.max(0, 1 - Math.min(distance, 360 - distance) / 45);
    const w = t * t * (3 - 2 * t);
    dh += c.value.hue * .3 * w; ds += c.value.saturation / 100 * w; dl += c.value.lightness / 100 * w; weight += w;
  }
  const scale = Math.max(1, weight);
  h = (h + dh / scale + 360) % 360;
  s = clamp(s * (1 + ds / scale), 0, 1);
  l = clamp(l + dl / scale * .35, 0, 1);
  const chroma = (1 - Math.abs(2 * l - 1)) * s, offset = l - chroma / 2;
  return hueRgb(h).map(v => (offset + v * chroma) * 255);
}
export function applyAdjustments(data, input, width, height) {
  const a = normalizeAdjustments(input);
  if (!adjustmentCount(a)) return data;
  const channels = hslChannels.filter(c => Object.values(a.hsl[c.id]).some(Boolean)).map(c => ({ ...c, value: a.hsl[c.id] }));
  const exposure = 2 ** (a.exposure / 50), contrast = 2 ** (a.contrast / 100);
  const shadowColor = hueRgb(a.shadowHue).map(v => (v - .5) * a.shadowSaturation * .7);
  const highlightColor = hueRgb(a.highlightHue).map(v => (v - .5) * a.highlightSaturation * .7);
  for (let i = 0; i < data.length; i += 4) {
    const y = (.2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]) / 255;
    const shadow = (1 - y) ** 2, highlight = y ** 2;
    const toneLight = clamp(y + a.balance / 200, 0, 1), toneShadow = 1 - toneLight;
    for (let c = 0; c < 3; c++) {
      let v = data[i + c] * exposure + a.brightness * .64;
      v = (v - 127.5) * contrast + 127.5 + (a.shadows * shadow + a.highlights * highlight) * .9;
      v += a.temperature * (c === 0 ? .4 : c === 1 ? .04 : -.4) + a.tint * (c === 1 ? -.25 : .15);
      v = v * (1 - a.fade / 250) + a.fade * .5;
      v += shadowColor[c] * toneShadow ** 2 + highlightColor[c] * toneLight ** 2;
      data[i + c] = Math.round(clamp(v));
    }
    const r = data[i], g = data[i + 1], b = data[i + 2], gray = .2126 * r + .7152 * g + .0722 * b;
    const sat = Math.max(0, (1 + a.saturation / 100) * (1 + a.vibrance / 100 * (1 - (Math.max(r, g, b) - Math.min(r, g, b)) / 255)));
    data[i] = Math.round(clamp(gray + (r - gray) * sat));
    data[i + 1] = Math.round(clamp(gray + (g - gray) * sat));
    data[i + 2] = Math.round(clamp(gray + (b - gray) * sat));
    if (channels.length) {
      const rgb = hslShift(data[i], data[i + 1], data[i + 2], channels);
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(clamp(rgb[c]));
    }
  }
  if (!a.sharpen && !a.grain && !a.vignette) return data;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width * height * 4 !== data.length) throw new Error('细节处理需要正确的图片尺寸。');
  // Scale the detail radius with image dimensions; deterministic grain never flickers.
  const source = a.sharpen ? Uint8Array.from(data) : null, radius = Math.max(1, Math.round(Math.max(width, height) / 1000));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const nx = (x + .5) / width, ny = (y + .5) / height;
    const edge = clamp(((nx - .5) ** 2 + (ny - .5) ** 2) * 2, 0, 1);
    const vignette = 1 - edge ** 1.4 * a.vignette / 130;
    let hash = Math.imul(Math.floor(nx * 1400) + 1, 374761393) ^ Math.imul(Math.floor(ny * 1400) + 1, 668265263);
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    const noise = ((hash >>> 0) / 4294967295 - .5) * a.grain * .65;
    for (let c = 0; c < 3; c++) {
      let v = data[i + c];
      if (source) {
        const left = (y * width + Math.max(0, x - radius)) * 4, right = (y * width + Math.min(width - 1, x + radius)) * 4;
        const top = (Math.max(0, y - radius) * width + x) * 4, bottom = (Math.min(height - 1, y + radius) * width + x) * 4;
        const neighbor = index => source[index + 3] ? source[index + c] : source[i + c];
        v += (source[i + c] - (neighbor(left) + neighbor(right) + neighbor(top) + neighbor(bottom)) / 4) * a.sharpen / 65;
      }
      data[i + c] = Math.round(clamp(v * vignette + noise));
    }
  }
  return data;
}
