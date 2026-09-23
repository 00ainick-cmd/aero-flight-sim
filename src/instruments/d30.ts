import { S, logEvent } from '../core/state';
import { cls, h, pressable, screw } from '../core/dom';
import { D } from '../sim/step';
import { fitCanvas } from './mapdraw';
import { drawAttitude, drawReadout, drawTape, FONT, MONO } from './pfddraw';

const d = S.d30;
const W = 280;
const ALT_INIT_S = 12;

interface Hit { x: number; y: number; w: number; h: number; act: () => void }
let hits: Hit[] = [];

export function createD30() {
  const canvas = h('canvas', { class: 'd30-canvas' });
  const btn = h('button', { class: 'd30-btn', title: 'Tap: menu · Hold 2 s: power on/off' });
  pressable(btn, {
    holdMs: 2000,
    onPress: () => { if (d.unit.on) d.menu = !d.menu; },
    onHold: () => {
      if (d.unit.lit) {
        d.manualOff = true;
        d.onBattery = false;
        logEvent('D30: bezel button held — powered off');
      } else {
        d.manualOff = false;
        if (!D.d30Ship && d.battery > 0) { d.onBattery = true; d.stayOn = true; d.countdown = 0; }
        logEvent(D.d30Ship ? 'D30: bezel button — power on' : 'D30: bezel button — power on from internal battery');
      }
    },
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (!d.unit.on) return;
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * W;
    const hit = hits.find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
    if (hit) hit.act();
    else d.menu = !d.menu;
  });

  const el = h('div', { class: 'd30 bezel' },
    screw('tl'), screw('tr'), screw('bl'), screw('br'),
    h('div', { class: 'd30-face' }, canvas, h('div', { class: 'glass' })),
    h('div', { class: 'd30-brand' }, 'DYNON', h('b', {}, 'D30')),
    h('div', { class: 'usbc' }),
    btn,
  );

  function update() {
    cls(el, 'powered', d.unit.lit);
    const ctx = fitCanvas(canvas);
    const s = canvas.clientWidth / W;
    ctx.save();
    ctx.scale(s, s);
    draw(ctx);
    ctx.restore();
  }
  return { el, update };
}

function button(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, label: string, act: () => void) {
  ctx.fillStyle = '#1e2a38';
  ctx.strokeStyle = '#6f8aa6';
  ctx.lineWidth = 1.5;
  ctx.fillRect(x, y, w, hh);
  ctx.strokeRect(x, y, w, hh);
  ctx.fillStyle = '#fff';
  ctx.font = `700 13px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + hh / 2 + 1);
  hits.push({ x, y, w, h: hh, act });
}

function draw(ctx: CanvasRenderingContext2D) {
  hits = [];
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, W);
  if (d.unit.state === 'off') return;
  if (d.unit.state === 'boot') {
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = `700 34px ${FONT}`;
    ctx.fillText('DYNON', W / 2, W / 2 - 6);
    ctx.font = `400 18px ${FONT}`;
    ctx.fillStyle = '#9fb3c8';
    ctx.fillText('D30', W / 2, W / 2 + 22);
    return;
  }

  const f = S.flight;
  const cy = W * 0.46;
  drawAttitude(ctx, { x: 0, y: 0, w: W, h: W }, W / 2, cy, f.pitch, f.roll, 4.2, { slip: 0, rollR: 92, ladderW: 70, symbol: 'd30' });

  const tapeH = 150;
  const ty = cy - tapeH / 2;
  drawTape(ctx, { x: 2, y: ty, w: 52, h: tapeH }, f.ias, {
    ppu: 2.4, minor: 10, major: 20, side: 'left', min: 20, fontPx: 12,
    bands: [{ from: 52, to: 140, color: '#1fcf3a' }, { from: 140, to: 172, color: '#ffd21f' }, { from: 172, to: 260, color: '#e21a1a' }],
  });
  drawReadout(ctx, 2, cy, 42, 28, f.ias < 20 ? 0 : f.ias, { side: 'left', rollDigits: 1, rollStep: 1, fontPx: 16 });

  const altReady = d.altT > ALT_INIT_S;
  const alt = f.alt + (d.baro - S.sv.baro) * 1000;
  drawTape(ctx, { x: W - 62, y: ty, w: 60, h: tapeH }, altReady ? alt : 0, { ppu: 0.24, minor: 100, major: 500, side: 'right', fontPx: 11 });
  if (altReady) {
    drawReadout(ctx, W - 56, cy, 54, 28, alt, { side: 'right', rollDigits: 2, rollStep: 20, fontPx: 15 });
  } else {
    ctx.fillStyle = '#000';
    ctx.fillRect(W - 58, cy - 14, 56, 28);
    ctx.fillStyle = '#ffb000';
    ctx.font = `700 13px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText('-----', W - 30, cy + 5);
  }

  // top strip
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, W, 22);
  ctx.font = `700 12px ${MONO}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#38e0ff';
  ctx.fillText(`${d.baro.toFixed(2)}`, W - 6, 11);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.fillText('KT', 6, 11);
  ctx.textAlign = 'center';
  ctx.fillText(altReady ? `${f.vs >= 0 ? '↑' : '↓'}${Math.abs(Math.round(f.vs / 10) * 10)}` : '', W / 2, 11);

  // slip ball
  const by = W - 26;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(W / 2 - 40, by - 9, 80, 18);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 10, by - 9); ctx.lineTo(W / 2 - 10, by + 9);
  ctx.moveTo(W / 2 + 10, by - 9); ctx.lineTo(W / 2 + 10, by + 9);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(W / 2 + f.slip * 18, by, 7, 0, Math.PI * 2);
  ctx.fill();

  if (d.onBattery) {
    ctx.fillStyle = Math.floor(S.t * 2) % 2 ? '#ffb000' : '#5a3e00';
    ctx.fillRect(0, 22, W, 20);
    ctx.fillStyle = '#000';
    ctx.font = `700 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`ON BATTERY  ${Math.round(d.battery * 100)}%`, W / 2, 33);
  }

  if (d.onBattery && d.countdown > 0 && !d.stayOn) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(30, 80, W - 60, 110);
    ctx.strokeStyle = '#ffb000';
    ctx.strokeRect(30, 80, W - 60, 110);
    ctx.fillStyle = '#ffb000';
    ctx.font = `700 14px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('EXTERNAL POWER LOST', W / 2, 102);
    ctx.fillStyle = '#fff';
    ctx.fillText(`Shutting down in ${Math.ceil(d.countdown)} s`, W / 2, 124);
    button(ctx, W / 2 - 60, 144, 120, 32, 'STAY ON', () => { d.stayOn = true; logEvent('D30: STAY ON — continuing on internal battery'); });
  } else if (d.menu) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(20, 50, W - 40, 180);
    ctx.fillStyle = '#fff';
    ctx.font = `700 14px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('MENU', W / 2, 68);
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText(`BARO ${d.baro.toFixed(2)} inHg`, W / 2, 92);
    button(ctx, 40, 102, 90, 30, 'BARO −', () => { d.baro = Math.round((d.baro - 0.01) * 100) / 100; });
    button(ctx, W - 130, 102, 90, 30, 'BARO +', () => { d.baro = Math.round((d.baro + 0.01) * 100) / 100; });
    ctx.fillStyle = '#fff';
    ctx.fillText(`BRIGHTNESS ${Math.round(d.bright * 100)}%`, W / 2, 152);
    button(ctx, 40, 162, 90, 30, 'DIM −', () => { d.bright = Math.max(0.3, d.bright - 0.1); });
    button(ctx, W - 130, 162, 90, 30, 'DIM +', () => { d.bright = Math.min(1, d.bright + 0.1); });
    button(ctx, W / 2 - 40, 198, 80, 26, 'EXIT', () => { d.menu = false; });
  }

  if (d.bright < 1) {
    ctx.fillStyle = `rgba(0,0,0,${1 - d.bright})`;
    ctx.fillRect(0, 0, W, W);
  }
  ctx.textBaseline = 'alphabetic';
}
