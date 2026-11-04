import { useEffect, useRef, useState } from 'react';
import { Columns2 } from 'lucide-react';

export default function CompareButton({ active, disabled, onToggle, onHoldChange }) {
  const gesture = useRef(null), timer = useRef(null), suppressClick = useRef(false);
  const callbacks = useRef({ onToggle, onHoldChange });
  const [holding, setHolding] = useState(false);
  callbacks.current = { onToggle, onHoldChange };
  function finish(cancelled = false) {
    clearTimeout(timer.current);
    const current = gesture.current;
    if (!current) return;
    gesture.current = null;
    suppressClick.current = cancelled || current.held;
    if (current.held) { setHolding(false); callbacks.current.onHoldChange(false); }
    if (current.target.hasPointerCapture(current.id)) current.target.releasePointerCapture(current.id);
  }
  useEffect(() => {
    const cancel = () => finish(true);
    const visibility = () => { if (document.hidden) cancel(); };
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', visibility);
    return () => { cancel(); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => { if (disabled) finish(true); }, [disabled]);
  return <button
    className={`compare-button ${active || holding ? 'active' : ''} ${holding ? 'holding' : ''}`}
    disabled={disabled} aria-pressed={active || holding} aria-label="原图对比"
    title="点击：分屏对比；长按：查看原图，松手恢复调色效果"
    onContextMenu={e => e.preventDefault()}
    onPointerDown={e => {
      if (disabled || e.button !== 0 || !e.isPrimary) return;
      finish(true);
      suppressClick.current = false;
      e.currentTarget.setPointerCapture(e.pointerId);
      const current = { id: e.pointerId, x: e.clientX, y: e.clientY, target: e.currentTarget, held: false };
      gesture.current = current;
      timer.current = setTimeout(() => {
        if (gesture.current !== current) return;
        current.held = true; suppressClick.current = true;
        setHolding(true); callbacks.current.onHoldChange(true);
      }, 220);
    }}
    onPointerMove={e => {
      const current = gesture.current;
      if (current?.id === e.pointerId && Math.hypot(e.clientX - current.x, e.clientY - current.y) > 12) finish(true);
    }}
    onPointerUp={e => { if (gesture.current?.id === e.pointerId) finish(); }}
    onPointerCancel={() => finish(true)}
    onLostPointerCapture={() => finish(true)}
    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') suppressClick.current = false; }}
    onClick={e => {
      if (suppressClick.current && e.detail !== 0) { suppressClick.current = false; return; }
      suppressClick.current = false; callbacks.current.onToggle();
    }}
  ><Columns2 size={16} /><span>{holding ? '正在查看原图' : '原图对比'}<small>{holding ? '松手恢复效果' : '点击分屏 · 长按原图'}</small></span></button>;
}
