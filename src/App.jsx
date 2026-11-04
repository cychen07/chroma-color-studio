import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Bookmark, Check,
  ChevronDown, ChevronRight, CircleHelp, Columns2, Copy, Expand, ImagePlus,
  Layers2, LoaderCircle, Menu, Palette, Plus, Search,
  ShieldCheck, SlidersHorizontal, Smartphone, Sparkles, Sun, Upload, X,
} from 'lucide-react';
import { presets, getPreset, gradePixels } from '../shared/presets.mjs';
import { fromHex, rgbToCmyk, rgbToHsl } from '../shared/color.mjs';
import { defaultAdjustments, normalizeAdjustments, adjustmentCount } from '../shared/adjustments.mjs';
import CompareButton from './CompareButton.jsx';
import ManualEditor from './ManualEditor.jsx';

async function api(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || '网络暂时没有响应，请重试。');
  }
  return response.json();
}
const post = (url, body = {}) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function readSaved() { try { return JSON.parse(localStorage.getItem('chroma-saved') || '[]').filter(r => getPreset(r.preset)).flatMap(r => { try { return [{ ...r, adjustments: normalizeAdjustments(r.adjustments) }]; } catch { return []; } }); } catch { return []; } }

function Logo({ small = false }) {
  return <div className={`brand ${small ? 'small' : ''}`}><span className="brand-mark"><i /><i /><i /></span><div><b>色序</b><span>CHROMA</span></div></div>;
}
function Modal({ title, eyebrow, children, onClose, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const all = ref.current?.querySelectorAll('button:not(:disabled), input, select, a[href], [tabindex="0"]');
        if (!all?.length) return;
        if (e.shiftKey && document.activeElement === all[0]) { e.preventDefault(); all[all.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === all[all.length - 1]) { e.preventDefault(); all[0].focus(); }
      }
    };
    document.addEventListener('keydown', close);
    ref.current?.querySelector('button')?.focus();
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', close); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={ref} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button className="icon-button modal-close" onClick={onClose} aria-label="关闭弹窗"><X size={20} /></button>
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h2 id="modal-title">{title}</h2>{children}
    </section>
  </div>;
}

function GradeCanvas({ src, preset, strength, adjustments, className = '', onError, original = false, maxSize = 1400 }) {
  const ref = useRef(), pixels = useRef(null), [version, setVersion] = useState(0);
  const worker = useRef(null), inFlight = useRef(false), pending = useRef(null), sequence = useRef(0), sentVersion = useRef(-1);
  function paint(data, width, height) {
    if (!ref.current) return;
    ref.current.width = width; ref.current.height = height;
    ref.current.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
  }
  function pump() {
    if (!pending.current || inFlight.current) return;
    const job = pending.current; pending.current = null;
    if (!worker.current) {
      const data = pixels.current.data.slice();
      gradePixels(data, job.preset, job.strength, job.adjustments, pixels.current.width, pixels.current.height);
      paint(data, pixels.current.width, pixels.current.height);
      return;
    }
    inFlight.current = true;
    if (sentVersion.current !== job.version) {
      job.source = pixels.current.data.slice().buffer;
      job.width = pixels.current.width; job.height = pixels.current.height;
      sentVersion.current = job.version;
    }
    worker.current.postMessage(job, job.source ? [job.source] : []);
  }
  useEffect(() => {
    try {
      const w = new Worker(new URL('./grade.worker.js', import.meta.url), { type: 'module' });
      worker.current = w;
      w.onmessage = ({ data }) => {
        inFlight.current = false;
        if (data.requestId === sequence.current) paint(new Uint8ClampedArray(data.buffer), data.width, data.height);
        pump();
      };
      w.onerror = () => { w.terminate(); worker.current = null; inFlight.current = false; onError?.('调色预览加载失败，请刷新后重试。'); };
    } catch { worker.current = null; }
    return () => { worker.current?.terminate(); worker.current = null; };
  }, []);
  useEffect(() => {
    let alive = true;
    pixels.current = null;
    pending.current = null;
    sequence.current++;
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      pixels.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setVersion(v => v + 1);
    };
    img.onerror = () => { if (alive) onError?.('预览图加载失败，请重新上传图片。'); };
    img.src = src;
    return () => { alive = false; };
  }, [src, maxSize]);
  useEffect(() => {
    if (!pixels.current || !ref.current) return;
    pending.current = { preset, strength: original ? 0 : strength, adjustments: original ? undefined : adjustments, requestId: ++sequence.current, version };
    pump();
  }, [version, preset, strength, adjustments, original]);
  return <canvas ref={ref} className={className} role="img" aria-label={original ? '原始图片' : `${preset.name}调色预览`} />;
}

function ColorDetail({ color, onClose, notify }) {
  const rgb = color.rgb || [color.r, color.g, color.b];
  const hex = color.hex, ref = color.reference;
  const cmyk = rgbToCmyk(rgb);
  const hsl = rgbToHsl(rgb).map(Math.round);
  return <Modal title={color.name} eyebrow={ref ? 'COLOR NOTES / 采样色详情' : 'COLOR LIBRARY / 参考色卡'} onClose={onClose}>
    <div className="color-detail-swatch" style={{ background: hex }}><span>{hex}</span></div>
    <div className="value-grid">
      <div><span>HEX</span><button onClick={() => navigator.clipboard.writeText(hex).then(() => notify('色值已复制')).catch(() => notify(`色值：${hex}`))}>{hex}<Copy size={13} /></button></div>
      <div><span>sRGB</span><b>{rgb.join(', ')}</b></div>
      <div><span>HSL · 换算</span><b>{hsl[0]}° / {hsl[1]}% / {hsl[2]}%</b></div>
      <div><span>CMYK · 近似换算</span><b>{cmyk.join(' / ')}</b></div>
    </div>
    {ref ? <div className="reference-box"><span className="reference-chip" style={{ background: ref.hex }} /><div><small>最接近的参考色卡</small><b>{ref.name} <span>ΔE₀₀ {ref.deltaE}</span></b></div></div> : <div className="reference-box"><Palette size={22} /><div><small>来源色库 · {color.collection === 'C' ? 'Solid Coated 亮光' : 'Solid Uncoated 哑光'}</small><b>原始 CMYK：{[color.c, color.m, color.y, color.k].join(' / ')}</b></div></div>}
    <p className="fineprint">{ref ? '中文名称为便于理解的色彩描述；色卡名称保留原始编号。ΔE₀₀ 越小，屏幕颜色越接近。' : '保留用户提供色库中的原始数据。部分原始 CMYK 存在缺失或异常，未经独立校准。'} 数值基于 sRGB 屏幕显示，印刷请以实物色卡及色彩管理流程为准。</p>
  </Modal>;
}

function ExportModal({ photo, preset, strength, adjustments, onClose, notify }) {
  const [format, setFormat] = useState('jpeg'), [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/photos/${photo.id}/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preset: preset.id, strength, adjustments, format }) });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }
      const blob = await response.blob(), url = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = url; anchor.download = `${photo.name.replace(/\.[^.]+$/, '')}-${preset.name}.${format === 'png' ? 'png' : 'jpg'}`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      notify('图片已导出，去下载列表看看吧'); onClose();
    } catch (e) { setError(e.message || '导出失败，请重试。'); } finally { setBusy(false); }
  }
  return <Modal title="把喜欢的色彩带走" eyebrow="MAKE IT YOURS" onClose={onClose}>
    <div className="export-preview"><GradeCanvas src={photo.previewUrl} preset={preset} strength={strength} adjustments={adjustments} maxSize={260} /><div><b>{preset.name}{adjustmentCount(adjustments) > 0 ? ' · 手动精调' : ''}</b><span>{photo.width} × {photo.height} · 原尺寸</span></div></div>
    <p className="modal-description">选择格式，免费保存当前风格与全部手动调整。</p>
    <div className="format-row"><span>导出格式</span><div role="group" aria-label="导出格式">{['jpeg', 'png'].map(f => <button key={f} className={format === f ? 'selected' : ''} disabled={busy} onClick={() => setFormat(f)}>{f === 'jpeg' ? 'JPG · 高画质' : 'PNG · 无损'}</button>)}</div></div>
    <p className="fineprint">不加水印 · 保留原始尺寸 · sRGB<br />JPG 将透明背景转为白色；PNG 保留透明度。</p>
    <button className="primary full" onClick={download} disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <ArrowDownToLine size={17} />} {busy ? '正在生成原尺寸图片…' : '免费下载图片'}</button>
    {error && <p role="alert" className="error-text">{error}</p>}
  </Modal>;
}

function Library({ config, onColor }) {
  const [query, setQuery] = useState(''), [collection, setCollection] = useState(''), [family, setFamily] = useState('');
  const [result, setResult] = useState({ colors: [], total: 0 }), [busy, setBusy] = useState(true), [error, setError] = useState('');
  const [page, setPage] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true); setError('');
      try { const data = await api(`/api/colors?q=${encodeURIComponent(query)}&collection=${collection}&family=${encodeURIComponent(family)}&offset=${page * 60}`, { signal: controller.signal }); setResult(data); }
      catch (e) { if (e.name !== 'AbortError') setError(e.message); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, collection, family, page]);
  return <section className="library">
    <div className="library-intro"><div><div className="eyebrow">A WORLD OF COLOR</div><h1>每一种色彩，都有迹可循。</h1><p>在 {config.colorCount.toLocaleString()} 张参考色卡中，寻找让你心动的那一种。</p></div><div className="library-art" aria-hidden="true"><i /><i /><i /><i /></div></div>
    <div className="library-toolbar"><label className="search-field"><Search size={18} /><input aria-label="搜索色号或 HEX" placeholder="搜索色号或 HEX，如 186 C、#F6EB61" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label>
      <select aria-label="色卡材质" value={collection} onChange={e => { setCollection(e.target.value); setPage(0); }}><option value="">全部色卡</option><option value="C">C 卡 · 亮光</option><option value="U">U 卡 · 哑光</option></select>
      <select aria-label="按色系筛选" value={family} onChange={e => { setFamily(e.target.value); setPage(0); }}><option value="">全部色系</option>{['红色系','橙色系','棕色系','黄色系','绿色系','青色系','蓝色系','紫色系','粉色系','中性色','白色系','黑色系'].map(f => <option key={f}>{f}</option>)}</select>
    </div>
    <div className="library-meta"><span>{busy ? '正在寻找颜色…' : `找到 ${result.total.toLocaleString()} 种颜色`}</span><span>C {config.counts.C.toLocaleString()} · U {config.counts.U.toLocaleString()}</span></div>
    {error && <div role="alert" className="error-text">{error}</div>}
    <div className={`swatch-grid ${busy ? 'loading-grid' : ''}`}>{result.colors.map(c => <button className="library-swatch" key={c.name} onClick={() => onColor(c)}><div style={{ background: c.hex }} /><section><b>{c.name}</b><span>{c.hex}</span></section><small>{c.family} <ArrowUpRight size={13} /></small></button>)}</div>
    {!busy && !result.colors.length && <div className="empty-result"><Search size={32} /><h3>还没找到这个颜色</h3><p>试试完整色号，或清除当前筛选。</p><button className="secondary" onClick={() => { setQuery(''); setCollection(''); setFamily(''); setPage(0); }}>清除筛选</button></div>}
    {result.total > 60 && <div className="pagination"><button className="secondary" disabled={!page || busy} onClick={() => setPage(p => p - 1)}><ArrowLeft size={15} />上一页</button><span>{page + 1} / {Math.ceil(result.total / 60)}</span><button className="secondary" disabled={(page + 1) * 60 >= result.total || busy} onClick={() => setPage(p => p + 1)}>下一页<ArrowRight size={15} /></button></div>}
    <p className="source-note">数据来自你提供的参考色库，屏幕色值为近似模拟。<a href={config.sourceUrl} target="_blank" rel="noreferrer">查看原始来源 <ArrowUpRight size={12} /></a></p>
  </section>;
}

export default function App() {
  const [config, setConfig] = useState(null), [photo, setPhoto] = useState(null), [busy, setBusy] = useState(true);
  const [error, setError] = useState(''), [nav, setNav] = useState('studio'), [mobileMenu, setMobileMenu] = useState(false);
  const [presetId, setPresetId] = useState('film'), [strength, setStrength] = useState(.75), [compare, setCompare] = useState(false), [split, setSplit] = useState(50);
  const [adjustments, setAdjustments] = useState(defaultAdjustments), [holdingOriginal, setHoldingOriginal] = useState(false);
  const [panel, setPanel] = useState('analysis'), [expanded, setExpanded] = useState(false), [modal, setModal] = useState(null), [selectedColor, setSelectedColor] = useState(null);
  const [saved, setSaved] = useState(readSaved), [toast, setToast] = useState(''), [dragging, setDragging] = useState(false);
  const fileRef = useRef(), toastTimer = useRef(), activeRequest = useRef(0);
  const preset = getPreset(presetId);
  const notify = message => { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 3400); };
  useEffect(() => {
    api('/api/config').then(setConfig).catch(e => setError(e.message));
    loadDemo();
    return () => clearTimeout(toastTimer.current);
  }, []);
  useEffect(() => {
    if (!mobileMenu) return;
    const close = event => { if (event.key === 'Escape') setMobileMenu(false); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [mobileMenu]);
  async function applyPhoto(loader) {
    const request = ++activeRequest.current;
    setBusy(true); setError('');
    try {
      const p = await loader();
      if (request !== activeRequest.current) return;
      setPhoto(p); setPresetId(p.analysis.recommended); setCompare(false); setHoldingOriginal(false); setAdjustments(defaultAdjustments()); setStrength(.75); setNav('studio');
    } catch (e) { if (request === activeRequest.current) setError(e.message); }
    finally { if (request === activeRequest.current) setBusy(false); }
  }
  function loadDemo() { return applyPhoto(() => post('/api/demo')); }
  function uploadFile(file) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('支持 JPG、PNG 和 WebP，暂不支持 HEIC 或动图。'); return; }
    if (file.size > 20 * 1024 * 1024) { setError('图片不能超过 20 MB，请压缩后再试。'); return; }
    const form = new FormData(); form.append('image', file);
    applyPhoto(() => api('/api/photos', { method: 'POST', body: form }));
  }
  function navigate(value) { setNav(value); setMobileMenu(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function choosePreset(value) { setPresetId(value); setStrength(.75); setAdjustments(defaultAdjustments()); setCompare(false); }
  const currentSaved = photo && saved.some(s => s.preset === preset.id && s.photoId === photo.id && s.strength === strength && JSON.stringify(s.adjustments) === JSON.stringify(adjustments));
  function saveRecipe() {
    if (!photo) return;
    if (currentSaved) { notify('这份配色已经在收藏里了'); return; }
    const next = [{ id: `${Date.now()}`, preset: preset.id, strength, adjustments, name: photo.name, photoId: photo.id, colors: photo.analysis.colors.map(c => c.hex), date: new Date().toLocaleDateString('zh-CN') }, ...saved].slice(0, 50);
    try { localStorage.setItem('chroma-saved', JSON.stringify(next)); setSaved(next); notify('调色方案已收藏'); } catch { notify('浏览器存储空间不足，暂时无法收藏'); }
  }
  function removeRecipe(id) {
    const next = saved.filter(s => s.id !== id);
    try { localStorage.setItem('chroma-saved', JSON.stringify(next)); setSaved(next); } catch { notify('暂时无法更新收藏'); }
  }
  function applyRecipe(recipe) {
    setPresetId(recipe.preset); setStrength(recipe.strength); setAdjustments(normalizeAdjustments(recipe.adjustments));
    setCompare(false); navigate('studio'); notify('方案与手动调整已应用到当前图片');
  }
  const navItems = [{ id: 'studio', icon: SlidersHorizontal, text: '图片调色', caption: 'COLOR STUDIO' }, { id: 'library', icon: Palette, text: '探索色卡', caption: 'COLOR LIBRARY' }, { id: 'saved', icon: Bookmark, text: '我的收藏', caption: 'YOUR FAVORITES' }];
  return <div className="app-shell">
    <input ref={fileRef} type="file" tabIndex={-1} accept="image/jpeg,image/png,image/webp" className="file-input" aria-label="上传图片文件" onChange={e => { uploadFile(e.target.files?.[0]); e.target.value = ''; }} />
    <aside className={`sidebar ${mobileMenu ? 'mobile-open' : ''}`}>
      <button className="icon-button mobile-nav-close" aria-label="关闭导航菜单" onClick={() => setMobileMenu(false)}><X size={20} /></button>
      <a href="/" className="brand-link" aria-label="色序首页" onClick={e => { e.preventDefault(); navigate('studio'); }}><Logo /></a>
      <div className="sidebar-section-label">YOUR CREATIVE SPACE</div>
      <nav aria-label="主导航">{navItems.map(item => <button key={item.id} className={`nav-item ${nav === item.id ? 'active' : ''}`} aria-current={nav === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={19} strokeWidth={1.7} /><span>{item.text}</span>{item.id === 'saved' && saved.length > 0 ? <small>{saved.length}</small> : nav === item.id && <i />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="pocket-note"><Smartphone size={23} strokeWidth={1.5} /><b>灵感，不受屏幕限制</b><p>在手机浏览器打开<br />随时遇见好色彩</p><span>MOBILE FRIENDLY <ArrowUpRight size={12} /></span></div><button className="sidebar-help" onClick={() => setModal('help')}><CircleHelp size={17} /> 使用指南 <ArrowUpRight size={14} /></button><div className="sidebar-footer">色彩自有秩序 <span>v0.1</span></div></div>
    </aside>
    {mobileMenu && <div className="nav-scrim" onClick={() => setMobileMenu(false)} />}
    <div className="main-shell">
      <header className="topbar"><div className="desktop-breadcrumb">工作空间 <ChevronRight size={13} /><span>{navItems.find(i => i.id === nav).text}</span></div><div className="mobile-brand"><Logo small /></div><div className="topbar-right"><span className="local-status"><i /> 让灵感自然发生</span><button className="quiet privacy-button" onClick={() => setModal('privacy')}><ShieldCheck size={15} />隐私与使用</button><span className="avatar">C<span /></span><button className="icon-button mobile-menu-button" aria-label="打开导航菜单" onClick={() => setMobileMenu(!mobileMenu)}><Menu size={21} /></button></div></header>
      <main>
        {nav === 'studio' && <>
          <section className="page-heading"><div><div className="eyebrow"><span /> FIND YOUR COLOR, FEEL YOUR MOMENT</div><h1>让色彩，<em>恰如其分。</em></h1><p>读懂一张照片的色彩，再给它一点新的情绪。</p></div><button className="upload-button" onClick={() => fileRef.current.click()} disabled={busy}><Plus size={18} />上传你的图片<ArrowUpRight size={16} /></button></section>
          {error && <div className="error-banner" role="alert"><CircleHelp size={18} /><span>{error}</span><button onClick={() => setError('')} aria-label="关闭错误提示"><X size={16} /></button></div>}
          <section className="workspace-grid">
            <div className={`image-card ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); uploadFile(e.dataTransfer.files?.[0]); }}>
              <div className="card-toolbar"><div className="image-file"><span className="file-icon"><ImagePlus size={16} /></span><b>{photo?.name || '你的下一张好照片'}</b>{photo && <span>{photo.width} × {photo.height}</span>}</div><div><button className="icon-button" aria-label="更换图片" title="更换图片" disabled={busy} onClick={() => fileRef.current.click()}><Upload size={16} /></button><button className="icon-button" aria-label="放大预览" title="放大预览" disabled={!photo || busy} onClick={() => setModal('zoom')}><Expand size={16} /></button></div></div>
              <div className={`photo-stage ${!photo ? 'empty' : ''}`} style={{ '--photo-ratio': photo ? photo.width / photo.height : 1.4 }}>
                {photo ? <div className="photo-frame">
                  <GradeCanvas src={photo.previewUrl} preset={preset} strength={strength} adjustments={adjustments} onError={setError} />
                  <div className="original-clip" aria-hidden={!compare && !holdingOriginal} style={{ visibility: compare || holdingOriginal ? 'visible' : 'hidden', clipPath: holdingOriginal ? 'none' : `inset(0 ${100 - split}% 0 0)` }}><GradeCanvas src={photo.previewUrl} preset={preset} strength={0} original /></div>
                  <span className="photo-tag">{holdingOriginal ? '原图 · 松手恢复效果' : compare ? '原图' : '调色预览'}<span /></span>
                  {compare && !holdingOriginal && <><span className="photo-tag after">调色后</span><div className="comparison-divider" style={{ left: `${split}%` }}><span><ChevronRight size={14} /><ChevronRight size={14} /></span></div><input className="comparison-slider" aria-label="原图与调色对比分界" type="range" min="0" max="100" value={split} onChange={e => setSplit(+e.target.value)} /></>}
                  {!compare && !holdingOriginal && <div className="photo-caption"><span>A LITTLE COLOR. A NEW PERSPECTIVE.</span><i />{preset.name}{adjustmentCount(adjustments) > 0 ? ' · 精调' : ''}</div>}
                </div> : <div className="upload-empty"><ImagePlus size={36} strokeWidth={1.2} /><h3>放入一张照片，发现它的颜色</h3><p>拖拽图片到这里，或点击上传</p><button className="secondary" onClick={() => fileRef.current.click()}>选择图片</button>{!busy && <button className="text-link" onClick={loadDemo}>用示例图片试一试 <ArrowRight size={14} /></button>}</div>}
                {busy && <div className="processing-overlay"><LoaderCircle className="spin" size={28} /><b>正在读懂画面的色彩</b><span>提取主色 · 匹配色卡 · 寻找灵感</span></div>}
                {dragging && <div className="drop-overlay"><Upload size={30} /><b>松开，开启你的色彩探索</b></div>}
              </div>
              <div className="image-controls"><CompareButton active={compare} disabled={!photo || busy} onToggle={() => setCompare(v => !v)} onHoldChange={held => { setHoldingOriginal(held); if (held) setCompare(false); }} /><div className="strength-control"><label htmlFor="strength">风格强度</label><input id="strength" type="range" min="0" max="100" value={Math.round(strength * 100)} onChange={e => setStrength(+e.target.value / 100)} disabled={!photo} /><output>{Math.round(strength * 100)}<span>%</span></output></div><button className="reset-button" onClick={() => { setStrength(0); setAdjustments(defaultAdjustments()); setCompare(false); }} disabled={!photo}>还原</button></div>
              <div className="upload-note"><ShieldCheck size={12} /> 图片仅用于本次处理，24 小时后自动清除 <span>JPG / PNG / WEBP · 最大 20 MB</span></div>
            </div>
            <aside className="analysis-card">
              <div className="panel-tabs" role="tablist" aria-label="分析面板"><button role="tab" aria-selected={panel === 'analysis'} className={panel === 'analysis' ? 'active' : ''} onClick={() => setPanel('analysis')}><Palette size={16} />色彩解析</button><button role="tab" aria-selected={panel === 'advice'} className={panel === 'advice' ? 'active' : ''} onClick={() => setPanel('advice')}><Sparkles size={16} />调色建议</button></div>
              {photo && panel === 'analysis' ? <div className="analysis-body" role="tabpanel">
                <div className="analysis-heading"><h2>画面的色彩语言</h2><span>{photo.analysis.colors.length} 种主色</span></div>
                <div className="tone-tags"><span><Sun size={12} />{photo.analysis.temperature}</span><span>{photo.analysis.saturation}</span><span>{photo.analysis.dominant}</span></div>
                <div className="palette-ribbon">{photo.analysis.colors.map((c, i) => <button key={i} style={{ background: c.hex, flex: Math.max(c.percent, 5) }} aria-label={`查看${c.name} ${c.hex}详情`} onClick={() => setSelectedColor(c)}><span>{c.percent}%</span></button>)}</div>
                <div className="color-list-heading"><span>采样色 / 近似色卡</span><span>HEX · 占比</span></div>
                <div className="color-list">{photo.analysis.colors.map((c, i) => <button className="color-row" key={i} onClick={() => setSelectedColor(c)}><span className="color-dot" style={{ background: c.hex }} /><span className="color-row-name"><b>{c.name}</b><small>{c.reference.name}</small></span><span className="color-hex">{c.hex}</span><span className="color-percent">{c.percent}<small>%</small></span></button>)}</div>
                <div className="analysis-footnote"><span className="tiny-spark">✳</span><p>以 {config?.colorCount.toLocaleString() || '4,990'} 张色卡为参考，感知色差匹配。<br /><span>点击颜色，查看完整数值与匹配详情。</span></p></div>
              </div> : photo ? <div className="advice-body" role="tabpanel">
                <div className="eyebrow">A NOTE FOR YOUR PHOTO</div><h2>顺着画面的情绪，再向前一点。</h2><p>{photo.analysis.summary}</p>
                <div className="recommend-feature">
                  <div className="recommend-kicker"><Sparkles size={13} />这张照片的推荐方案<span>一键完成</span></div>
                  <div className="recommend-name"><h3>{getPreset(photo.analysis.recommended).name}</h3><div>{getPreset(photo.analysis.recommended).colors.map(c => <i key={c} style={{ background: c }} />)}</div></div>
                  <p>{getPreset(photo.analysis.recommended).description}</p>
                  <button className="primary" onClick={() => { choosePreset(photo.analysis.recommended); notify('已应用推荐方案，手动参数已归零'); }}><Sparkles size={15} />应用推荐方案<ArrowRight size={15} /></button>
                  <small>根据画面色彩推荐 · 替换当前风格与手动调整</small>
                </div>
                <ManualEditor value={adjustments} onChange={setAdjustments} />
              </div> : <div className="analysis-placeholder"><Palette size={35} strokeWidth={1.2} /><p>照片的色彩故事<br />即将在这里展开</p></div>}
            </aside>
          </section>
          <section className="styles-section"><div className="section-heading"><div><span className="section-icon"><Sparkles size={18} /></span><h2>给照片，换一种心情</h2><span className="desktop-hint">选一个风格，看看不一样的它</span></div><button className="text-link" onClick={() => setExpanded(v => !v)}>{expanded ? '收起风格' : '全部 6 种风格'}{expanded ? <ChevronDown size={15} /> : <ArrowRight size={15} />}</button></div>
            <div className={`preset-grid ${expanded ? 'expanded' : ''}`}>{(expanded ? presets : presets.slice(0, 4)).map(p => <button key={p.id} className={`preset-card ${preset.id === p.id ? 'selected' : ''}`} onClick={() => choosePreset(p.id)} aria-pressed={preset.id === p.id}>
              <div className="preset-image">{photo && <GradeCanvas src={photo.previewUrl} preset={p} strength={1} maxSize={420} />}<span className="preset-tag">{photo?.analysis.recommended === p.id ? <><Sparkles size={10} /> 为你推荐</> : p.tag}</span><span className="preset-check">{preset.id === p.id && <Check size={13} />}</span></div>
              <div className="preset-info"><div><h3>{p.name}</h3><span>{p.english}</span></div><div className="mini-palette">{p.colors.map(c => <i key={c} style={{ background: c }} />)}</div></div>
            </button>)}</div>
          </section>
          <section className="selected-style"><span className="selected-spark"><Sparkles size={18} /></span><div><b>{preset.name}<span> · {adjustmentCount(adjustments) ? `${adjustmentCount(adjustments)} 项手动精调` : preset.tag}</span></b><p>{preset.description} 选择新风格会重置手动参数。</p></div><button className={`save-button ${currentSaved ? 'saved' : ''}`} onClick={saveRecipe} disabled={!photo}><Bookmark size={16} fill={currentSaved ? 'currentColor' : 'none'} />{currentSaved ? '已收藏' : '收藏方案'}</button></section>
          <section className="export-bar"><div className="export-promise"><div className="export-icon"><Layers2 size={22} strokeWidth={1.5} /></div><div><b>好看的色彩，值得留下。</b><p>原尺寸导出 <i /> 无水印 <i /> 自由切换风格</p></div></div><button className="primary export-primary" disabled={!photo || busy} onClick={() => setModal('export')}><ArrowDownToLine size={17} /><span>免费导出图片<small>原尺寸 · 包含全部调整</small></span><ArrowRight size={17} /></button></section>
          <footer className="page-footer"><span>COLOR IS A FEELING.</span><p>每张照片，都有属于自己的色彩秩序。</p><button className="quiet" onClick={() => setModal('help')}>关于色序 <ArrowUpRight size={12} /></button></footer>
        </>}
        {nav === 'library' && (config ? <Library config={config} onColor={setSelectedColor} /> : <div className="empty-result">正在加载色库…</div>)}
        {nav === 'saved' && <section className="saved-page"><div className="eyebrow">LITTLE THINGS YOU LOVE</div><h1>收好每一次心动。</h1><p className="page-description">把喜欢的色彩和调色方案，留给下一次灵感。</p>{!saved.length ? <div className="saved-empty"><div className="empty-palette"><i /><i /><i /></div><h2>你的灵感收藏夹，等你填满</h2><p>在调色工作台点击「收藏方案」，<br />下次就能把相同的氛围应用到新照片。</p><button className="primary" onClick={() => navigate('studio')}>去发现色彩<ArrowRight size={17} /></button></div> : <><p className="fineprint">收藏保存在当前浏览器中，保存风格、全部手动参数与色值，不保存原图。</p><div className="saved-grid">{saved.map(s => <article className="saved-card" key={s.id}><div className="saved-colors">{s.colors.map((c, i) => <span key={i} style={{ background: c }} />)}</div><div className="saved-content"><small>{s.date} · 强度 {Math.round(s.strength * 100)}%{adjustmentCount(s.adjustments) ? ` · ${adjustmentCount(s.adjustments)} 项精调` : ''}</small><h3>{getPreset(s.preset).name}</h3><p>{s.name}</p><div><button className="text-link" onClick={() => applyRecipe(s)}>应用方案 <ArrowRight size={14} /></button><button className="quiet" onClick={() => removeRecipe(s.id)}>移除</button></div></div></article>)}</div></>}</section>}
      </main>
    </div>
    {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    {selectedColor && <ColorDetail color={selectedColor} onClose={() => setSelectedColor(null)} notify={notify} />}
    {modal === 'export' && photo && <ExportModal photo={photo} preset={preset} strength={strength} adjustments={adjustments} onClose={() => setModal(null)} notify={notify} />}
    {modal === 'zoom' && photo && <Modal title={`${preset.name} · ${Math.round(strength * 100)}%`} eyebrow="TAKE A CLOSER LOOK" wide onClose={() => setModal(null)}><GradeCanvas className="zoom-canvas" src={photo.previewUrl} preset={preset} strength={strength} adjustments={adjustments} /><p className="fineprint">这里展示屏幕预览。导出时按原图 {photo.width} × {photo.height} 像素处理，压缩与缩放可能使细节略有差异。</p></Modal>}
    {modal === 'help' && <Modal title="让好色彩，自然发生。" eyebrow="HELLO, THIS IS CHROMA" onClose={() => setModal(null)}><div className="help-steps"><div><span>01</span><section><b>放入你的照片</b><p>上传 JPG、PNG 或 WebP，自动提取主色和色调。单张最大 20 MB、2400 万像素。</p></section></div><div><span>02</span><section><b>找一个喜欢的氛围</b><p>点击「原图对比」打开分屏；鼠标或手指长按查看完整原图，松手恢复完整调色效果。在「调色建议」中免费应用推荐，或用光感、色彩、细节与 HSL 手动精调。选择新风格会重置手动参数。</p></section></div><div><span>03</span><section><b>留住这份色彩</b><p>收藏会保存风格与手动参数；选择 JPG 或 PNG 即可免费导出原尺寸照片。手机可通过浏览器下载并保存。</p></section></div></div><p className="fineprint">当前版本的手动调整、系统推荐、收藏与图片导出均免费开放。</p></Modal>}
    {modal === 'privacy' && <Modal title="你的照片，始终属于你。" eyebrow="YOUR PHOTO, YOUR CONTROL" onClose={() => setModal(null)}><div className="privacy-copy"><h3>图片如何处理</h3><p>图片上传到本产品后端，用于提取颜色、生成预览与导出。无需发送给第三方 AI 模型。服务按 24 小时有效期保存文件，并定时清理过期图片。</p><h3>我们保存什么</h3><p>浏览器仅保存收藏方案和临时会话标识；后端色库独立存储。不同浏览器会话不能访问彼此的图片。</p><h3>关于参考色值</h3><p>参考色卡来自你提供的应用。屏幕色值和印刷实物存在差异，中文采样色名称是描述性名称。</p></div></Modal>}
  </div>;
}
