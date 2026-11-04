import { useState } from 'react';
import { Aperture, Palette, RotateCcw, SlidersHorizontal, Sun } from 'lucide-react';
import { adjustmentGroups, toneControls, hslChannels, defaultAdjustments, adjustmentCount } from '../shared/adjustments.mjs';

function AdjustmentSlider({ control, value, onChange, prefix = 'manual' }) {
  const { key, label, min, max, track } = control;
  const zero = -min / (max - min) * 100, percent = (value - min) / (max - min) * 100;
  const id = `${prefix}-${key}`;
  return <div className="adjustment-row">
    <div><label htmlFor={id}>{label}</label><output htmlFor={id} className={value !== 0 ? 'changed' : ''}>{value > 0 && max !== 360 ? '+' : ''}{value}{max === 360 ? '°' : ''}</output></div>
    <div className={`adjustment-track ${track || ''}`} style={{ '--start': `${Math.min(zero, percent)}%`, '--end': `${Math.max(zero, percent)}%`, '--zero': `${zero}%` }}>
      <input id={id} type="range" min={min} max={max} step="1" value={value} onChange={e => onChange(+e.target.value)} />
    </div>
  </div>;
}

export default function ManualEditor({ value, onChange }) {
  const [tab, setTab] = useState('light'), [channelId, setChannelId] = useState('red');
  const channel = hslChannels.find(c => c.id === channelId), count = adjustmentCount(value);
  const set = (key, amount) => onChange({ ...value, [key]: amount });
  const setChannel = (key, amount) => onChange({ ...value, hsl: { ...value.hsl, [channelId]: { ...value.hsl[channelId], [key]: amount } } });
  const tabs = [{ id: 'light', name: '光感', icon: Sun }, { id: 'color', name: '色彩', icon: Palette }, { id: 'detail', name: '细节', icon: Aperture }];
  return <section className="manual-editor" aria-label="专业手动调色">
    <header><div><SlidersHorizontal size={15} /><h3>手动精调</h3></div><button onClick={() => onChange(defaultAdjustments())} disabled={!count} aria-label="重置全部手动调整"><RotateCcw size={12} />重置</button></header>
    <div className="manual-subtitle"><span>按自己的方式，雕琢每一处光与色。</span><b>{count ? `${count} 项调整` : '参数归零'}</b></div>
    <div className="manual-tabs" role="tablist" aria-label="手动调色分类">{tabs.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} aria-controls={`adjustments-${t.id}`} id={`manual-tab-${t.id}`} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}><t.icon size={14} />{t.name}</button>)}</div>
    <div id={`adjustments-${tab}`} role="tabpanel" aria-labelledby={`manual-tab-${tab}`} className="manual-sliders">
      {adjustmentGroups[tab].map(c => <AdjustmentSlider key={c.key} control={c} value={value[c.key]} onChange={v => set(c.key, v)} />)}
      {tab === 'color' && <details className="split-toning"><summary>分离色调 <span>阴影 / 高光</span></summary><div>{toneControls.map(c => <AdjustmentSlider key={c.key} control={c} value={value[c.key]} onChange={v => set(c.key, v)} />)}</div></details>}
      {tab === 'detail' && <p className="detail-note">锐化强调边缘，颗粒增加纹理，暗角收拢视线。导出时按原尺寸处理。</p>}
    </div>
    <div className="hsl-heading"><div><b>HSL</b><span>分色调节</span></div><button aria-label={`重置${channel.name}通道`} onClick={() => onChange({ ...value, hsl: { ...value.hsl, [channelId]: { hue: 0, saturation: 0, lightness: 0 } } })}>{channel.name}<RotateCcw size={11} /></button></div>
    <div className="hsl-channels" role="group" aria-label="HSL 颜色通道">{hslChannels.map(c => <button key={c.id} style={{ '--channel': c.color }} aria-label={`${c.name}通道`} aria-pressed={channelId === c.id} className={channelId === c.id ? 'active' : ''} onClick={() => setChannelId(c.id)}><span />{Object.values(value.hsl[c.id]).some(Boolean) && <i />}</button>)}</div>
    <div className="hsl-sliders" style={{ '--slider-accent': channel.color }}>
      {[['hue', '色相'], ['saturation', '饱和度'], ['lightness', '明度']].map(([key, label]) => <AdjustmentSlider key={`${channelId}-${key}`} prefix={`hsl-${channelId}`} control={{ key, label: `${channel.name} · ${label}`, min: -100, max: 100 }} value={value.hsl[channelId][key]} onChange={v => setChannel(key, v)} />)}
    </div>
    <footer>叠加在当前风格上 · 收藏与导出包含全部调整</footer>
  </section>;
}
