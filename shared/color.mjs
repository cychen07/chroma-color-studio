export const clamp = (v, min = 0, max = 255) => Math.min(max, Math.max(min, v));
export const toHex = rgb => '#' + rgb.map(v => Math.round(clamp(v)).toString(16).padStart(2, '0')).join('').toUpperCase();
export const fromHex = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  const h = !d ? 0 : ((max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60);
  return [h, !d ? 0 : d / (1 - Math.abs(2 * l - 1)) * 100, l * 100];
}
export function rgbToLab(rgb) {
  const [r, g, b] = rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  const f = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
  const x = f((r * .4124564 + g * .3575761 + b * .1804375) / .95047);
  const y = f(r * .2126729 + g * .7151522 + b * .0721750);
  const z = f((r * .0193339 + g * .1191920 + b * .9503041) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
// CIEDE2000, kL = kC = kH = 1. Reference: Sharma et al. supplementary test pairs.
export function deltaE2000([l1, a1, b1], [l2, a2, b2]) {
  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const c1 = Math.hypot(a1, b1), c2 = Math.hypot(a2, b2), cb = (c1 + c2) / 2;
  const g = .5 * (1 - Math.sqrt(cb ** 7 / (cb ** 7 + 25 ** 7)));
  const ap1 = (1 + g) * a1, ap2 = (1 + g) * a2;
  const cp1 = Math.hypot(ap1, b1), cp2 = Math.hypot(ap2, b2);
  const hp = (a, b) => (deg(Math.atan2(b, a)) + 360) % 360;
  const h1 = cp1 === 0 ? 0 : hp(ap1, b1), h2 = cp2 === 0 ? 0 : hp(ap2, b2);
  const dl = l2 - l1, dc = cp2 - cp1;
  let dh = cp1 * cp2 === 0 ? 0 : h2 - h1;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin(rad(dh / 2));
  const lb = (l1 + l2) / 2, cpb = (cp1 + cp2) / 2;
  let hb = cp1 * cp2 === 0 ? h1 + h2 : Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2;
  const t = 1 - .17 * Math.cos(rad(hb - 30)) + .24 * Math.cos(rad(2 * hb)) + .32 * Math.cos(rad(3 * hb + 6)) - .20 * Math.cos(rad(4 * hb - 63));
  const sl = 1 + .015 * (lb - 50) ** 2 / Math.sqrt(20 + (lb - 50) ** 2);
  const sc = 1 + .045 * cpb, sh = 1 + .015 * cpb * t;
  const rt = -2 * Math.sqrt(cpb ** 7 / (cpb ** 7 + 25 ** 7)) * Math.sin(rad(60 * Math.exp(-(((hb - 275) / 25) ** 2))));
  return Math.sqrt((dl / sl) ** 2 + (dc / sc) ** 2 + (dH / sh) ** 2 + rt * (dc / sc) * (dH / sh));
}
export function colorFamily(rgb) {
  const [h, s, l] = rgbToHsl(rgb);
  if (l < 10) return '黑色系';
  if (l > 94 && s < 30) return '白色系';
  if (s < 12) return '中性色';
  if (h < 15 || h >= 345) return '红色系';
  if (h < 45) return l < 46 ? '棕色系' : '橙色系';
  if (h < 70) return '黄色系';
  if (h < 165) return '绿色系';
  if (h < 195) return '青色系';
  if (h < 265) return '蓝色系';
  if (h < 295) return '紫色系';
  return '粉色系';
}
export function describeColor(rgb) {
  const [h, s, l] = rgbToHsl(rgb);
  if (l < 10) return '墨黑';
  if (l > 94 && s < 30) return '柔白';
  if (s < 12) return l > 75 ? '雾灰' : l > 40 ? '岩灰' : '炭灰';
  const family = colorFamily(rgb);
  const names = {
    '红色系': l > 70 ? '浅珊瑚' : l < 35 ? '深酒红' : s < 45 ? '陶土红' : '朱红',
    '橙色系': l > 75 ? '奶杏' : s < 45 ? '暖砂' : '落日橙',
    '棕色系': l < 25 ? '深咖' : '焦糖棕',
    '黄色系': l > 80 ? '米白' : s < 40 ? '燕麦色' : l < 40 ? '橄榄黄' : '麦穗黄',
    '绿色系': l < 28 ? '森林绿' : s < 35 ? '鼠尾草绿' : l > 75 ? '浅芽绿' : '苔藓绿',
    '青色系': l > 75 ? '冰青' : l < 35 ? '深湖青' : '湖水青',
    '蓝色系': l < 30 ? '午夜蓝' : l > 75 ? '雾蓝' : '静谧蓝',
    '紫色系': l > 70 ? '淡丁香' : '鸢尾紫',
    '粉色系': l > 75 ? '樱花粉' : '玫瑰粉'
  };
  return names[family] || '中性灰';
}
export function rgbToCmyk(rgb) {
  const [r, g, b] = rgb.map(v => v / 255), k = 1 - Math.max(r, g, b);
  return k === 1 ? [0, 0, 0, 100] : [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k].map(v => Math.round(v * 100));
}
