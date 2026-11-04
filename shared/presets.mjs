import { clamp } from './color.mjs';
import { applyAdjustments } from './adjustments.mjs';
export const presets = [
  { id: 'natural', name: '自然本色', english: 'TRUE TO LIFE', tag: '忠于原片', description: '轻提亮度，保留真实的色彩关系，让画面更通透。', colors: ['#CDA57D','#E5DDCB','#7B8B6B','#4D5948'], params: { exposure: .06, contrast: 1.04, saturation: 1.05, warmth: 1, fade: 0, shadow: [0,0,0], light: [0,0,0] } },
  { id: 'film', name: '日落胶片', english: 'GOLDEN MEMORIES', tag: '温暖 · 复古', description: '暖化高光、柔和暗部，让陶土、肤色与夕阳更有胶片的温度。', colors: ['#C57248','#D6AC75','#E9D8AC','#69705D'], params: { exposure: .08, contrast: 1.09, saturation: .9, warmth: 12, fade: 8, shadow: [2,3,6], light: [7,2,-4] } },
  { id: 'cream', name: '奶油柔光', english: 'A SOFTER DAY', tag: '轻盈 · 治愈', description: '降低反差与饱和度，抬起中间调，保留细腻、柔软的奶油质感。', colors: ['#D4BFA9','#EEE7D9','#B5B7A0','#8C9682'], params: { exposure: .15, contrast: .91, saturation: .76, warmth: 5, fade: 7, shadow: [2,1,0], light: [3,2,0] } },
  { id: 'cinema', name: '青橙电影', english: 'IN THE MOOD', tag: '冷暖 · 叙事', description: '给暗部一点青色、高光一点暖橙，以冷暖分离增加画面的层次。', colors: ['#B86C42','#D9AE72','#536F6A','#263D3E'], params: { exposure: -.01, contrast: 1.15, saturation: .91, warmth: 2, fade: 1, shadow: [-9,5,9], light: [11,3,-8] } },
  { id: 'forest', name: '森系呼吸', english: 'INTO THE GREEN', tag: '清冷 · 自然', description: '收敛暖色与高光，让绿意更沉静，适合树影、庭院与旅行照片。', colors: ['#83916E','#BDCAAF','#E4E2CC','#425A4B'], params: { exposure: .04, contrast: .98, saturation: .87, warmth: -6, fade: 3, shadow: [-3,6,2], light: [-1,2,-1] } },
  { id: 'mono', name: '黑白留白', english: 'LESS, BUT MORE', tag: '纯粹 · 质感', description: '去掉色彩，把注意力留给光线、轮廓和材质，强化画面结构。', colors: ['#363A37','#737772','#B8B9AE','#EBEADF'], params: { exposure: .03, contrast: 1.18, saturation: 0, warmth: 0, fade: 4, shadow: [0,0,0], light: [0,0,0] } },
];
export function getPreset(id) { return presets.find(p => p.id === id); }
// Shared pixel pipeline for browser previews and full-resolution server exports.
// Work in sRGB for a photographic effect; preserve the source alpha channel.
export function gradePixels(data, preset, strength = 1, adjustments, width, height) {
  if (!preset || strength === 0) return applyAdjustments(data, adjustments, width, height);
  const p = preset.params, amount = clamp(strength, 0, 1), exposure = 2 ** p.exposure;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const y = .2126 * r + .7152 * g + .0722 * b;
    const shadow = (1 - y / 255) ** 2, light = (y / 255) ** 2;
    for (let c = 0; c < 3; c++) {
      const original = c === 0 ? r : c === 1 ? g : b;
      let v = (y + (original - y) * p.saturation) * exposure;
      v = (v - 127.5) * p.contrast + 127.5;
      v += p.warmth * (c === 0 ? 1 : c === 1 ? .12 : -.85) + p.shadow[c] * shadow + p.light[c] * light;
      v = v * (1 - p.fade / 255) + p.fade;
      data[i + c] = Math.round(clamp(original + (clamp(v) - original) * amount));
    }
  }
  return applyAdjustments(data, adjustments, width, height);
}
