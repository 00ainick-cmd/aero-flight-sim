import { h } from './dom';

export interface KnobOptions {
  size: number;
  /** Inner knob diameter as a fraction of size; omit for a single knob. */
  inner?: number;
  label?: string;
  onOuter?: (dir: 1 | -1) => void;
  onInner?: (dir: 1 | -1) => void;
  onPush?: () => void;
  onHold?: () => void;
  holdMs?: number;
  title?: string;
}

const DETENT_DEG = 18;

/**
 * Rotary knob. Click the right/left half of a ring to step CW/CCW, drag around it,
 * or scroll the wheel over it. The center cap is the push switch (tap or hold).
 */
export function createKnob(o: KnobOptions): HTMLElement {
  const dual = o.inner !== undefined;
  const root = h('div', { class: `knob ${dual ? 'dual' : 'single'}`, title: o.title ?? '' });
  root.style.width = root.style.height = `${o.size}px`;

  const outer = h('div', { class: 'knob-outer' });
  const innerEl = dual ? h('div', { class: 'knob-inner' }) : null;
  const cap = h('div', { class: 'knob-cap' });
  const marker = h('div', { class: 'knob-marker' });
  const hint = h('div', { class: 'knob-hint' }, h('span', { class: 'ccw' }, '⟲'), h('span', { class: 'cw' }, '⟳'));
  root.append(outer);
  if (innerEl) {
    innerEl.style.width = innerEl.style.height = `${o.size * o.inner!}px`;
    innerEl.append(marker, cap);
    root.append(innerEl);
  } else {
    outer.append(marker, cap);
  }
  root.append(hint);
  if (o.label) root.append(h('div', { class: 'knob-label' }, o.label));

  let rotOuter = Math.random() * 360;
  let rotInner = Math.random() * 360;
  const paint = () => {
    outer.style.setProperty('--r', `${rotOuter}deg`);
    if (innerEl) innerEl.style.setProperty('--r', `${rotInner}deg`);
  };
  paint();

  const zone = (e: PointerEvent | WheelEvent) => {
    const r = root.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy) / (r.width / 2);
    const capR = dual ? o.inner! * 0.42 : 0.4;
    let ring: 'push' | 'inner' | 'outer' = 'outer';
    if (dist < capR) ring = 'push';
    else if (dual && dist < o.inner!) ring = 'inner';
    return { ring, dx, dy, cx, cy };
  };

  const turn = (ring: 'inner' | 'outer', dir: 1 | -1) => {
    if (ring === 'inner' || !dual) {
      if (dual) rotInner += dir * DETENT_DEG; else rotOuter += dir * DETENT_DEG;
      (dual ? o.onInner : o.onOuter ?? o.onInner)?.(dir);
    } else {
      rotOuter += dir * DETENT_DEG;
      o.onOuter?.(dir);
    }
    paint();
  };

  let drag: null | { ring: 'push' | 'inner' | 'outer'; a0: number; moved: boolean; x0: number; timer: number; held: boolean } = null;

  root.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const z = zone(e);
    try { root.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    drag = { ring: z.ring, a0: Math.atan2(z.dy, z.dx), moved: false, x0: z.dx, timer: 0, held: false };
    if (z.ring === 'push') {
      root.classList.add('pushing');
      if (o.onHold) {
        const d = drag;
        d.timer = window.setTimeout(() => { d.held = true; o.onHold?.(); root.classList.remove('pushing'); }, o.holdMs ?? 900);
      }
    }
  });

  root.addEventListener('pointermove', (e) => {
    if (!drag || drag.ring === 'push') return;
    const z = zone(e);
    const a = Math.atan2(z.dy, z.dx);
    let da = ((a - drag.a0) * 180) / Math.PI;
    if (da > 180) da -= 360;
    if (da < -180) da += 360;
    if (Math.abs(da) >= DETENT_DEG) {
      drag.moved = true;
      const dir = da > 0 ? 1 : -1;
      turn(drag.ring, dir);
      drag.a0 = a;
    }
  });

  const end = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    root.classList.remove('pushing');
    clearTimeout(d.timer);
    if (d.ring === 'push') {
      if (!d.held) o.onPush?.();
      return;
    }
    if (!d.moved) turn(d.ring, d.x0 >= 0 ? 1 : -1);
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);

  root.addEventListener('wheel', (e) => {
    e.preventDefault();
    const z = zone(e);
    const ring = z.ring === 'push' ? (dual ? 'inner' : 'outer') : z.ring;
    turn(ring, e.deltaY < 0 ? 1 : -1);
  }, { passive: false });

  return root;
}
