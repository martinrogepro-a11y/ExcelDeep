import { h } from './dom';

export interface SignaturePad {
  el: HTMLDivElement;
  /** Longueur du trait, en pixels. */
  inked(): number;
  clear(): void;
}

/** Zone où l'on signe au doigt. `onInk` est appelé à chaque trait. */
export function signaturePad(hint: string, onInk: () => void): SignaturePad {
  const canvas = h('canvas', { class: 'pad-canvas', 'aria-label': 'Zone de signature' });
  const el = h('div', { class: 'pad' }, canvas, h('span', { class: 'pad-hint' }, hint));
  const ctx = canvas.getContext('2d');
  let length = 0;
  let last: { x: number; y: number } | null = null;

  const fit = () => {
    const r = canvas.getBoundingClientRect();
    if (r.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0b2a8a';
  };
  requestAnimationFrame(fit);

  const pos = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (canvas.width === 0) fit();
    canvas.setPointerCapture(e.pointerId);
    last = pos(e);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!last || !ctx) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    length += Math.hypot(p.x - last.x, p.y - last.y);
    last = p;
    el.classList.add('inked');
    onInk();
  });
  const end = () => (last = null);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  return {
    el,
    inked: () => length,
    clear: () => {
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      length = 0;
      el.classList.remove('inked');
      onInk();
    },
  };
}
