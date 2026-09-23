const D2R = Math.PI / 180;

export const FONT = '"B612", "Roboto Condensed", sans-serif';
export const MONO = '"B612 Mono", "B612", monospace';

export interface Rect { x: number; y: number; w: number; h: number }

export function drawAttitude(
  ctx: CanvasRenderingContext2D, r: Rect, cx: number, cy: number,
  pitch: number, roll: number, ppd: number, opts: { ladderW?: number; slip?: number; rollR?: number; symbol?: 'dynon' | 'd30' } = {},
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();

  ctx.translate(cx, cy);
  ctx.rotate(-roll * D2R);
  const off = pitch * ppd;
  const big = Math.max(r.w, r.h) * 2;

  const sky = ctx.createLinearGradient(0, -big / 2 + off, 0, off);
  sky.addColorStop(0, '#0b3f93');
  sky.addColorStop(1, '#3b8be0');
  ctx.fillStyle = sky;
  ctx.fillRect(-big, -big + off, big * 2, big);
  const gnd = ctx.createLinearGradient(0, off, 0, off + big / 2);
  gnd.addColorStop(0, '#8a5a2b');
  gnd.addColorStop(1, '#4a2e12');
  ctx.fillStyle = gnd;
  ctx.fillRect(-big, off, big * 2, big);

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-big, off);
  ctx.lineTo(big, off);
  ctx.stroke();

  // pitch ladder
  const lw = opts.ladderW ?? r.w * 0.18;
  ctx.fillStyle = '#fff';
  ctx.font = `600 ${Math.max(10, ppd * 2.6)}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1.6;
  for (let p = -30; p <= 30; p += 2.5) {
    if (p === 0) continue;
    const y = off - p * ppd;
    if (Math.abs(y) > r.h * 0.34) continue;
    const major = p % 10 === 0;
    const mid = p % 5 === 0;
    const half = major ? lw / 2 : mid ? lw / 3.4 : lw / 6.5;
    ctx.beginPath();
    ctx.moveTo(-half, y);
    ctx.lineTo(half, y);
    ctx.stroke();
    if (major) {
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.abs(p)), -half - 5, y);
      ctx.textAlign = 'left';
      ctx.fillText(String(Math.abs(p)), half + 5, y);
    }
  }
  ctx.restore();

  // roll scale
  const rr = opts.rollR ?? Math.min(r.w, r.h) * 0.36;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, rr, (-90 - 60) * D2R, (-90 + 60) * D2R);
  ctx.stroke();
  for (const a of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
    const len = Math.abs(a) === 30 || Math.abs(a) === 60 ? 14 : 8;
    const t = (a - 90) * D2R;
    ctx.beginPath();
    ctx.moveTo(Math.cos(t) * rr, Math.sin(t) * rr);
    ctx.lineTo(Math.cos(t) * (rr + len), Math.sin(t) * (rr + len));
    ctx.stroke();
  }
  // zero index
  ctx.beginPath();
  ctx.moveTo(0, -rr - 1);
  ctx.lineTo(-7, -rr - 12);
  ctx.lineTo(7, -rr - 12);
  ctx.closePath();
  ctx.fill();

  // roll pointer + slip
  ctx.rotate(-roll * D2R);
  ctx.fillStyle = '#ffd21f';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -rr + 1);
  ctx.lineTo(-8, -rr + 13);
  ctx.lineTo(8, -rr + 13);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const s = (opts.slip ?? 0) * 12;
  ctx.fillRect(-9 + s, -rr + 15, 18, 4);
  ctx.strokeRect(-9 + s, -rr + 15, 18, 4);
  ctx.restore();

  // aircraft symbol
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#ffd21f';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  const u = Math.min(r.w, r.h) / 22;
  if (opts.symbol === 'd30') {
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.rect(sgn * u * 2.2, -u * 0.35, sgn * u * 4.5, u * 0.7);
      ctx.fill(); ctx.stroke();
    }
    ctx.beginPath();
    ctx.rect(-u * 0.4, -u * 0.4, u * 0.8, u * 0.8);
    ctx.fill(); ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-u * 4.5, u * 1.6);
    ctx.lineTo(-u * 4.5, u * 2.2);
    ctx.lineTo(0, u * 0.8);
    ctx.lineTo(u * 4.5, u * 2.2);
    ctx.lineTo(u * 4.5, u * 1.6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.rect(sgn * u * 7, -u * 0.3, sgn * u * 3.5, u * 0.6);
      ctx.fill(); ctx.stroke();
    }
  }
  ctx.restore();
}

export interface Band { from: number; to: number; color: string; inset?: number }

export function drawTape(
  ctx: CanvasRenderingContext2D, r: Rect, value: number,
  o: { ppu: number; minor: number; major: number; side: 'left' | 'right'; bands?: Band[]; bug?: number | null; min?: number; fmt?: (v: number) => string; fontPx?: number },
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.fillStyle = 'rgba(20,24,30,0.62)';
  ctx.fillRect(r.x, r.y, r.w, r.h);

  const cy = r.y + r.h / 2;
  const edge = o.side === 'left' ? r.x + r.w : r.x;
  const dir = o.side === 'left' ? -1 : 1;
  const span = r.h / 2 / o.ppu;
  const lo = Math.floor((value - span) / o.minor) * o.minor;
  const hi = value + span;

  for (const b of o.bands ?? []) {
    const y1 = cy - (Math.min(b.to, hi) - value) * o.ppu;
    const y2 = cy - (Math.max(b.from, lo) - value) * o.ppu;
    if (y2 < y1) continue;
    ctx.fillStyle = b.color;
    const bw = 6;
    const bx = o.side === 'left' ? edge - bw - (b.inset ?? 0) : edge + (b.inset ?? 0);
    ctx.fillRect(bx, y1, bw, y2 - y1);
  }

  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = 1.5;
  const fpx = o.fontPx ?? 16;
  ctx.font = `600 ${fpx}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = o.side === 'left' ? 'right' : 'left';
  for (let v = lo; v <= hi; v += o.minor) {
    if (o.min !== undefined && v < o.min) continue;
    const y = cy - (v - value) * o.ppu;
    const major = Math.abs(v % o.major) < 1e-6;
    const len = major ? 14 : 8;
    ctx.beginPath();
    ctx.moveTo(edge, y);
    ctx.lineTo(edge + dir * len, y);
    ctx.stroke();
    if (major) ctx.fillText(o.fmt ? o.fmt(v) : String(v), edge + dir * (len + 5), y);
  }

  if (o.bug != null) {
    const y = Math.max(r.y + 6, Math.min(r.y + r.h - 6, cy - (o.bug - value) * o.ppu));
    ctx.fillStyle = '#38e0ff';
    ctx.beginPath();
    const bx = edge;
    ctx.moveTo(bx, y - 9);
    ctx.lineTo(bx + dir * 9, y - 9);
    ctx.lineTo(bx + dir * 9, y - 4);
    ctx.lineTo(bx + dir * 4, y);
    ctx.lineTo(bx + dir * 9, y + 4);
    ctx.lineTo(bx + dir * 9, y + 9);
    ctx.lineTo(bx, y + 9);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Pointer box with rolling last digits, like the SkyView/D30 readouts. */
export function drawReadout(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, hgt: number, value: number,
  o: { side: 'left' | 'right'; rollDigits: number; rollStep: number; fontPx: number; color?: string },
) {
  const pt = hgt * 0.35;
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (o.side === 'left') {
    ctx.moveTo(x, y - hgt / 2);
    ctx.lineTo(x + w, y - hgt / 2);
    ctx.lineTo(x + w, y - pt / 2);
    ctx.lineTo(x + w + pt * 0.8, y);
    ctx.lineTo(x + w, y + pt / 2);
    ctx.lineTo(x + w, y + hgt / 2);
    ctx.lineTo(x, y + hgt / 2);
  } else {
    ctx.moveTo(x + w, y - hgt / 2);
    ctx.lineTo(x, y - hgt / 2);
    ctx.lineTo(x, y - pt / 2);
    ctx.lineTo(x - pt * 0.8, y);
    ctx.lineTo(x, y + pt / 2);
    ctx.lineTo(x, y + hgt / 2);
    ctx.lineTo(x + w, y + hgt / 2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.clip();

  const v = Math.max(0, value);
  const rollUnit = o.rollStep;
  const mod = 10 ** o.rollDigits;
  const rolled = v % (mod);
  const fixed = Math.floor(v / mod);
  const frac = (rolled % rollUnit) / rollUnit;
  const base = Math.floor(rolled / rollUnit) * rollUnit;
  ctx.fillStyle = o.color ?? '#fff';
  ctx.font = `700 ${o.fontPx}px ${MONO}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  const rollW = ctx.measureText('0'.repeat(o.rollDigits)).width;
  const rx = x + w - 4;
  ctx.fillText(fixed > 0 ? String(fixed) : '', rx - rollW, y + 1);
  ctx.font = `700 ${o.fontPx * 0.85}px ${MONO}`;
  const lh = hgt * 0.78;
  for (let k = -1; k <= 1; k++) {
    let n = base + k * rollUnit;
    if (n < 0) n += mod;
    n %= mod;
    ctx.fillText(String(n).padStart(o.rollDigits, '0'), rx, y + 1 + frac * lh - k * lh);
  }
  ctx.restore();
}

export function drawRedX(ctx: CanvasRenderingContext2D, r: Rect, label?: string) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#ff2020';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(r.x + 4, r.y + 4);
  ctx.lineTo(r.x + r.w - 4, r.y + r.h - 4);
  ctx.moveTo(r.x + r.w - 4, r.y + 4);
  ctx.lineTo(r.x + 4, r.y + r.h - 4);
  ctx.stroke();
  ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
  if (label) {
    ctx.font = `700 ${Math.max(11, Math.min(18, r.w / 10))}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width + 12;
    ctx.fillStyle = '#000';
    ctx.fillRect(r.x + r.w / 2 - tw / 2, r.y + r.h / 2 - 12, tw, 24);
    ctx.fillStyle = '#ff3030';
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
  }
  ctx.restore();
}

export interface HsiOpts {
  hdg: number;
  hdgValid: boolean;
  bug: number;
  crs: number;
  dev: number | null;
  src: string;
  color: string;
  toFrom: 'TO' | 'FROM' | null;
  trk?: number | null;
}

export function drawHSI(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, o: HsiOpts) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(10,12,16,0.78)';
  ctx.beginPath();
  ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
  ctx.fill();

  const hdg = o.hdgValid ? o.hdg : 0;
  ctx.save();
  ctx.rotate(-hdg * D2R);
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let a = 0; a < 360; a += 5) {
    const major = a % 10 === 0;
    ctx.lineWidth = major ? 2 : 1;
    ctx.save();
    ctx.rotate(a * D2R);
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(0, -r + (major ? 12 : 7));
    ctx.stroke();
    if (a % 30 === 0) {
      const lbl = a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : String(a / 10);
      ctx.font = `700 ${a % 90 === 0 ? r * 0.15 : r * 0.12}px ${FONT}`;
      ctx.fillText(lbl, 0, -r + r * 0.24);
    }
    ctx.restore();
  }

  // heading bug
  ctx.save();
  ctx.rotate(o.bug * D2R);
  ctx.fillStyle = '#38e0ff';
  ctx.beginPath();
  ctx.moveTo(-9, -r - 2);
  ctx.lineTo(-9, -r + 8);
  ctx.lineTo(-3, -r + 8);
  ctx.lineTo(0, -r + 3);
  ctx.lineTo(3, -r + 8);
  ctx.lineTo(9, -r + 8);
  ctx.lineTo(9, -r - 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // track diamond
  if (o.trk != null) {
    ctx.save();
    ctx.rotate(o.trk * D2R);
    ctx.fillStyle = '#ff38ff';
    ctx.beginPath();
    ctx.moveTo(0, -r + 13);
    ctx.lineTo(4, -r + 18);
    ctx.lineTo(0, -r + 23);
    ctx.lineTo(-4, -r + 18);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // course needle
  if (o.dev !== null) {
    ctx.save();
    ctx.rotate(o.crs * D2R);
    const dotSp = r * 0.16;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    for (const d of [-2, -1, 1, 2]) {
      ctx.beginPath();
      ctx.arc(d * dotSp, 0, 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = o.color;
    ctx.fillStyle = o.color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, -r + 26);
    ctx.lineTo(0, -r * 0.42);
    ctx.moveTo(0, r * 0.42);
    ctx.lineTo(0, r - 16);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -r + 20);
    ctx.lineTo(-8, -r + 34);
    ctx.lineTo(8, -r + 34);
    ctx.closePath();
    ctx.fill();
    const dx = Math.max(-2.3, Math.min(2.3, o.dev)) * dotSp;
    ctx.beginPath();
    ctx.moveTo(dx, -r * 0.38);
    ctx.lineTo(dx, r * 0.38);
    ctx.stroke();
    if (o.toFrom) {
      ctx.beginPath();
      const ty = o.toFrom === 'TO' ? -r * 0.26 : r * 0.26;
      const s = o.toFrom === 'TO' ? -1 : 1;
      ctx.moveTo(r * 0.24, ty + s * 9);
      ctx.lineTo(r * 0.24 - 8, ty - s * 3);
      ctx.lineTo(r * 0.24 + 8, ty - s * 3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();

  // lubber + aircraft
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, -r - 2);
  ctx.lineTo(-7, -r - 14);
  ctx.lineTo(7, -r - 14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, -12); ctx.lineTo(0, 14);
  ctx.moveTo(-13, -1); ctx.lineTo(13, -1);
  ctx.moveTo(-6, 11); ctx.lineTo(6, 11);
  ctx.stroke();

  // heading box
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.fillRect(-30, -r - 44, 60, 28);
  ctx.strokeRect(-30, -r - 44, 60, 28);
  ctx.font = `700 19px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = o.hdgValid ? '#fff' : '#ff3030';
  ctx.fillText(o.hdgValid ? `${String(Math.round(o.hdg) % 360 || 360).padStart(3, '0')}°` : '---', 0, -r - 29);

  // source
  ctx.font = `700 14px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = o.color;
  ctx.fillText(o.src, -r - 4, r * 0.85);
  ctx.restore();

  if (!o.hdgValid) drawRedX(ctx, { x: cx - r * 0.7, y: cy - r * 0.7, w: r * 1.4, h: r * 1.4 }, 'HDG');
}
