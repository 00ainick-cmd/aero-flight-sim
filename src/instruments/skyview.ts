import { S, logEvent } from '../core/state';
import { cls, h, pressable, screw } from '../core/dom';
import { createKnob } from '../core/knob';
import { D } from '../sim/step';
import { wrap360 } from '../sim/geo';
import { drawMap, fitCanvas } from './mapdraw';
import { drawAttitude, drawHSI, drawReadout, drawRedX, drawTape, FONT, MONO, type Rect } from './pfddraw';

const sv = S.sv;
const SW = 1000;
const SH = 625;
const TOP = 30;
const BOT = 34;
const KNOB_ZONE = 110;
const KEY_W = (SW - KNOB_ZONE * 2) / 8;

type Softkey = { label: string; act?: () => void; active?: boolean };

function softkeys(): Softkey[] {
  const k: Softkey[] = Array.from({ length: 8 }, () => ({ label: '' }));
  if (sv.overlay) {
    k[7] = { label: 'BACK', act: () => { sv.overlay = null; } };
    if (sv.overlay === 'bat' && sv.onBattery) {
      k[6] = { label: 'SHUT DOWN', act: () => { sv.shutdown = true; logEvent('SkyView HDX: pilot shut down display while on backup battery'); } };
    }
    return k;
  }
  k[0] = { label: sv.layout === 'split' ? 'FULL PFD' : 'PFD+MAP', act: () => { sv.layout = sv.layout === 'split' ? 'pfd' : 'split'; } };
  k[1] = { label: `HSI: ${sv.hsi}`, act: () => { sv.hsi = sv.hsi === 'GPS1' ? 'NAV1' : 'GPS1'; logEvent(`SkyView HDX: HSI source manually set to ${sv.hsi}`); } };
  if (sv.layout === 'split') {
    k[2] = { label: 'RNG −', act: () => { sv.mapRange = Math.max(2, sv.mapRange / 2); } };
    k[3] = { label: 'RNG +', act: () => { sv.mapRange = Math.min(80, sv.mapRange * 2); } };
  }
  k[4] = { label: 'NETWORK', act: () => { sv.overlay = 'net'; } };
  k[5] = { label: 'BATTERY', act: () => { sv.overlay = 'bat'; } };
  k[7] = { label: `DIM ${Math.round(bright * 100)}%`, act: () => { bright = bright > 0.9 ? 0.7 : bright > 0.6 ? 0.45 : 1; } };
  return k;
}

let bright = 1;

export function createSkyView() {
  const canvas = h('canvas', { class: 'sv-canvas' });
  const glass = h('div', { class: 'glass' });

  const leftKnob = createKnob({
    size: 62,
    title: 'Left knob — turn: heading bug (or course). Tap center: HDG/CRS. Hold center: sync to current heading',
    onOuter: (d) => {
      if (!D.svOn) return;
      if (sv.leftMode === 'HDG') sv.hdgBug = wrap360(sv.hdgBug + d * 2);
      else sv.crs = wrap360(sv.crs + d * 2);
    },
    onPush: () => { if (D.svOn) sv.leftMode = sv.leftMode === 'HDG' ? 'CRS' : 'HDG'; },
    onHold: () => {
      if (!D.svOn) return;
      if (sv.leftMode === 'HDG') sv.hdgBug = Math.round(S.flight.hdg);
      else sv.crs = D.vor.valid ? Math.round(wrap360(D.vor.radial + 180)) : Math.round(S.flight.hdg);
    },
  });
  const rightKnob = createKnob({
    size: 62,
    title: 'Right knob — turn: baro setting (or altitude bug). Tap center: BARO/ALT',
    onOuter: (d) => {
      if (!D.svOn) return;
      if (sv.rightMode === 'BARO') sv.baro = Math.round((sv.baro + d * 0.01) * 100) / 100;
      else sv.altBug = Math.max(0, sv.altBug + d * 100);
    },
    onPush: () => { if (D.svOn) sv.rightMode = sv.rightMode === 'BARO' ? 'ALT' : 'BARO'; },
  });

  const keys = Array.from({ length: 8 }, (_, i) => {
    const b = h('button', { class: 'sv-key', title: `Softkey ${i + 1}` });
    pressable(b, { onPress: () => { if (D.svOn) softkeys()[i].act?.(); } });
    return b;
  });

  const el = h('div', { class: 'skyview bezel' },
    screw('tl'), screw('tr'), screw('bl'), screw('br'),
    h('div', { class: 'sv-brand' }, 'DYNON'),
    h('div', { class: 'sv-model' }, 'SkyView HDX'),
    h('div', { class: 'photocell sv-photo' }),
    h('div', { class: 'sv-screen-wrap' }, canvas, glass),
    h('div', { class: 'sv-controls' }, h('div', { class: 'sv-kz' }, leftKnob), h('div', { class: 'sv-keys' }, ...keys), h('div', { class: 'sv-kz' }, rightKnob)),
  );

  canvas.addEventListener('pointerdown', (e) => {
    if (!D.svOn) return;
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * SW;
    const y = ((e.clientY - r.top) / r.height) * SH;
    if (y > SH - BOT && x > KNOB_ZONE && x < SW - KNOB_ZONE) {
      const i = Math.floor((x - KNOB_ZONE) / KEY_W);
      softkeys()[i]?.act?.();
    }
  });

  function update() {
    cls(el, 'powered', sv.unit.lit);
    const ctx = fitCanvas(canvas);
    const sx = canvas.clientWidth / SW;
    ctx.save();
    ctx.scale(sx, sx);
    draw(ctx);
    ctx.restore();
  }

  return { el, update };
}

function draw(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SW, SH);
  const u = sv.unit;
  if (u.state === 'off') return;
  if (u.state === 'boot') {
    drawBoot(ctx, u.t / u.bootTime);
    return;
  }

  const split = sv.layout === 'split';
  const pfdW = split ? 600 : SW;
  drawPfd(ctx, { x: 0, y: TOP, w: pfdW, h: SH - TOP - BOT });
  if (split) drawMapPane(ctx, { x: pfdW, y: TOP, w: SW - pfdW, h: SH - TOP - BOT });
  drawTopBar(ctx);
  drawSoftkeys(ctx);
  if (sv.overlay === 'net') drawNet(ctx);
  if (sv.overlay === 'bat') drawBat(ctx);

  if (bright < 1) {
    ctx.fillStyle = `rgba(0,0,0,${1 - bright})`;
    ctx.fillRect(0, 0, SW, SH);
  }
}

function drawBoot(ctx: CanvasRenderingContext2D, p: number) {
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = `700 64px ${FONT}`;
  ctx.fillText('DYNON', SW / 2, SH / 2 - 30);
  ctx.font = `400 26px ${FONT}`;
  ctx.fillStyle = '#9fb3c8';
  ctx.fillText('SkyView HDX', SW / 2, SH / 2 + 14);
  ctx.strokeStyle = '#555';
  ctx.strokeRect(SW / 2 - 160, SH / 2 + 60, 320, 10);
  ctx.fillStyle = '#2f8fff';
  ctx.fillRect(SW / 2 - 159, SH / 2 + 61, 318 * Math.min(1, p), 8);
  ctx.font = `400 15px ${FONT}`;
  ctx.fillStyle = '#888';
  ctx.fillText(p < 0.5 ? 'Starting up…' : 'Searching SkyView Network…', SW / 2, SH / 2 + 100);
  ctx.textAlign = 'left';
}

function hsiState() {
  const selfTest = S.gtn.unit.on && !S.gtn.ready && D.arincMod;
  if (sv.hsi === 'GPS1') {
    if (selfTest) return { dev: -1, crs: sv.hdgBug, toFrom: 'TO' as const, flag: '', color: '#ff38ff', src: 'GPS1 TEST' };
    if (!D.arincRx) return { dev: null, crs: 0, toFrom: null, flag: 'GPS1 NO DATA', color: '#ff38ff', src: 'GPS1' };
    if (!D.nav.valid) return { dev: null, crs: 0, toFrom: null, flag: 'GPS1 NO WPT', color: '#ff38ff', src: 'GPS1' };
    return { dev: -D.nav.xtk, crs: D.nav.dtk, toFrom: 'TO' as const, flag: '', color: '#ff38ff', src: 'GPS1 ENR' };
  }
  if (selfTest) return { dev: -1, crs: sv.crs, toFrom: 'TO' as const, flag: '', color: '#3dff5a', src: 'NAV1 TEST' };
  if (!D.arincRx) return { dev: null, crs: 0, toFrom: null, flag: 'NAV1 NO DATA', color: '#3dff5a', src: 'NAV1' };
  if (!D.vor.valid) return { dev: null, crs: sv.crs, toFrom: null, flag: 'NAV1 NO SIGNAL', color: '#3dff5a', src: 'NAV1' };
  return { dev: D.vor.dev / 5, crs: sv.crs, toFrom: D.vor.toFrom, flag: '', color: '#3dff5a', src: `NAV1 ${D.vor.ident}` };
}

function drawPfd(ctx: CanvasRenderingContext2D, r: Rect) {
  const f = S.flight;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h * 0.34;
  const ppd = r.h / 58;
  const aligned = D.adahrsOK;

  if (aligned) {
    drawAttitude(ctx, r, cx, cy, f.pitch, f.roll, ppd, { slip: f.slip, rollR: 150, ladderW: 130 });
  } else {
    ctx.fillStyle = '#101418';
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }

  // heading tape
  const htY = r.y + 4;
  const htW = Math.min(420, r.w - 260);
  const htX = cx - htW / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(htX, htY, htW, 26);
  ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(htX, htY, htW, 26);
  if (D.magOK) {
    const pp = 4;
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.font = `600 13px ${FONT}`;
    ctx.textAlign = 'center';
    for (let a = Math.floor((f.hdg - 60) / 5) * 5; a <= f.hdg + 60; a += 5) {
      const x = cx + (a - f.hdg) * pp;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, htY + 26);
      ctx.lineTo(x, htY + (a % 10 === 0 ? 16 : 20));
      ctx.stroke();
      if (a % 10 === 0) {
        const w = wrap360(a);
        const lbl = w === 0 ? 'N' : w === 90 ? 'E' : w === 180 ? 'S' : w === 270 ? 'W' : String(w / 10).padStart(2, '0');
        ctx.fillText(lbl, x, htY + 10);
      }
    }
    const bx = cx + (((sv.hdgBug - f.hdg + 540) % 360) - 180) * pp;
    ctx.fillStyle = '#38e0ff';
    ctx.fillRect(Math.max(htX, Math.min(htX + htW - 12, bx - 6)), htY + 20, 12, 6);
  }
  ctx.restore();

  // tapes
  const tapeH = r.h * 0.6;
  const tapeY = cy - tapeH / 2;
  const asi: Rect = { x: r.x + 10, y: tapeY, w: 86, h: tapeH };
  const alt: Rect = { x: r.x + r.w - 10 - 34 - 96, y: tapeY, w: 96, h: tapeH };
  const vsi: Rect = { x: alt.x + alt.w + 2, y: tapeY + 30, w: 32, h: tapeH - 60 };

  if (aligned) {
    drawTape(ctx, asi, f.ias, {
      ppu: 3.4, minor: 5, major: 10, side: 'left', min: 20, fontPx: 16,
      bands: [
        { from: 45, to: 85, color: '#fff', inset: 7 },
        { from: 52, to: 140, color: '#1fcf3a' },
        { from: 140, to: 172, color: '#ffd21f' },
        { from: 172, to: 260, color: '#e21a1a' },
      ],
    });
    drawReadout(ctx, asi.x + 4, cy, 66, 40, f.ias, { side: 'left', rollDigits: 1, rollStep: 1, fontPx: 24 });
    drawTape(ctx, alt, f.alt, { ppu: 0.34, minor: 20, major: 100, side: 'right', bug: sv.altBug, fontPx: 15, fmt: (v) => String(v) });
    drawReadout(ctx, alt.x + 14, cy, 78, 40, f.alt, { side: 'right', rollDigits: 2, rollStep: 20, fontPx: 23 });
    // VSI
    ctx.fillStyle = 'rgba(20,24,30,0.62)';
    ctx.fillRect(vsi.x, vsi.y, vsi.w, vsi.h);
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'left';
    const vc = vsi.y + vsi.h / 2;
    const vpp = vsi.h / 2 / 2000;
    for (const v of [-2000, -1500, -1000, -500, 0, 500, 1000, 1500, 2000]) {
      const y = vc - v * vpp;
      ctx.beginPath();
      ctx.moveTo(vsi.x, y);
      ctx.lineTo(vsi.x + (v % 1000 === 0 ? 10 : 6), y);
      ctx.stroke();
      if (v % 1000 === 0 && v !== 0) ctx.fillText(String(Math.abs(v / 1000)), vsi.x + 13, y + 4);
    }
    const vy = vc - Math.max(-2000, Math.min(2000, f.vs)) * vpp;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(vsi.x + 2, vy);
    ctx.lineTo(vsi.x + 14, vy - 6);
    ctx.lineTo(vsi.x + 14, vy + 6);
    ctx.closePath();
    ctx.fill();
  } else {
    const label = D.netOn && S.modules.adahrs && sv.adahrsT > 0 ? 'ALIGNING' : 'ADAHRS';
    drawRedX(ctx, { x: cx - 150, y: cy - 110, w: 300, h: 190 }, label === 'ALIGNING' ? 'ADAHRS ALIGNING' : 'NO ADAHRS DATA');
    drawRedX(ctx, asi, 'IAS');
    drawRedX(ctx, alt, 'ALT');
  }

  // bug/baro labels
  ctx.font = `700 15px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#38e0ff';
  ctx.fillText(`${sv.altBug}`, alt.x + alt.w / 2, tapeY - 10);
  ctx.fillText(`${sv.baro.toFixed(2)} IN`, alt.x + alt.w / 2, tapeY + tapeH + 20);
  ctx.fillStyle = '#fff';
  ctx.font = `600 13px ${FONT}`;
  ctx.fillText(aligned ? `TAS ${Math.round(f.tas)} KT` : 'TAS ---', asi.x + asi.w / 2, tapeY + tapeH + 20);
  ctx.fillText(D.svGps ? `GS ${Math.round(f.gs)} KT` : 'GS ---', asi.x + asi.w / 2, tapeY + tapeH + 38);
  ctx.fillText(aligned ? `OAT ${Math.round(f.oat)}°C` : 'OAT ---', asi.x + asi.w / 2, tapeY - 10);

  // wind
  if (aligned && D.svGps && D.magOK && f.ias > 30) {
    const wx = asi.x + asi.w / 2;
    const wy = tapeY + tapeH + 70;
    ctx.save();
    ctx.translate(wx - 30, wy);
    ctx.rotate(((f.windDir + 180 - f.hdg) * Math.PI) / 180);
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(0, 11);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 13); ctx.lineTo(-5, 4); ctx.lineTo(5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText(`${String(f.windDir).padStart(3, '0')}°/${f.windSpd}`, wx - 14, wy + 5);
  }

  // HSI
  const hr = Math.min(128, r.h * 0.23);
  const hcx = cx;
  const hcy = r.y + r.h - hr - 14;
  const hs = hsiState();
  drawHSI(ctx, hcx, hcy, hr, {
    hdg: f.hdg, hdgValid: D.magOK, bug: sv.hdgBug, crs: hs.crs, dev: hs.dev, src: hs.src, color: hs.color, toFrom: hs.toFrom,
    trk: D.svGps && f.gs > 20 ? f.trk : null,
  });
  if (hs.flag) {
    ctx.font = `700 14px ${FONT}`;
    ctx.textAlign = 'center';
    const tw = ctx.measureText(hs.flag).width + 14;
    ctx.fillStyle = '#000';
    ctx.fillRect(hcx - tw / 2, hcy + hr * 0.35, tw, 22);
    ctx.fillStyle = '#ffb000';
    ctx.fillText(hs.flag, hcx, hcy + hr * 0.35 + 16);
  }

  // left/right knob mode readouts beside HSI
  ctx.textAlign = 'right';
  ctx.font = `700 14px ${FONT}`;
  const lx = hcx - hr - 12;
  const ly = hcy + hr * 0.45;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(lx - 82, ly - 16, 86, 46);
  ctx.fillStyle = '#38e0ff';
  ctx.fillText(`HDG ${String(Math.round(sv.hdgBug)).padStart(3, '0')}°`, lx, ly);
  ctx.fillStyle = hs.color;
  ctx.fillText(`CRS ${String(Math.round(hs.crs || sv.crs)).padStart(3, '0')}°`, lx, ly + 22);

  if (hs.src.startsWith('GPS1') && D.nav.valid && D.arincRx && S.gtn.dto) {
    const wx = hcx + hr + 12;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(wx - 4, ly - 16, 90, 64);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff38ff';
    ctx.font = `700 15px ${FONT}`;
    ctx.fillText(`${S.gtn.dto.ident}`, wx, ly);
    ctx.fillStyle = '#fff';
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText(`${D.nav.dis.toFixed(1)} NM`, wx, ly + 20);
    ctx.fillText(`DTK ${String(Math.round(D.nav.dtk)).padStart(3, '0')}°`, wx, ly + 38);
  }
}

function drawMapPane(ctx: CanvasRenderingContext2D, r: Rect) {
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.beginPath();
  ctx.rect(0, 0, r.w, r.h);
  ctx.clip();
  const f = S.flight;
  drawMap(ctx, r.w, r.h, {
    lat: f.lat, lon: f.lon, trk: f.trk, rangeNm: sv.mapRange, trackUp: true,
    dto: D.arincRx ? S.gtn.dto : null, valid: D.svGps, style: 'dynon',
  });
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(r.w - 110, 4, 106, 18);
  ctx.fillStyle = '#fff';
  ctx.font = `600 12px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(`RNG ${sv.mapRange} NM`, r.w - 10, 17);
  ctx.textAlign = 'left';
  ctx.restore();
  ctx.fillStyle = '#333';
  ctx.fillRect(r.x, r.y, 2, r.h);
}

function drawTopBar(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#0b0b0b';
  ctx.fillRect(0, 0, SW, TOP);
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, TOP - 1, SW, 1);
  ctx.font = `700 15px ${MONO}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const now = new Date();
  ctx.fillStyle = '#fff';
  ctx.fillText(D.svGps ? `${now.toISOString().slice(11, 19)}Z` : '--:--:--', 10, TOP / 2);

  ctx.font = `700 12px ${FONT}`;
  ctx.fillStyle = D.svGps ? '#3dff5a' : '#ffb000';
  ctx.fillText(D.svGps ? 'GPS 3D' : S.modules.gps2020 ? 'GPS ACQ' : 'NO GPS', 110, TOP / 2);
  const netCount = D.netOn ? ['adahrs', 'mag', 'arinc'].filter((m) => S.modules[m as 'adahrs']).length : 0;
  ctx.fillStyle = netCount === 3 ? '#9fb3c8' : '#ffb000';
  ctx.fillText(`NET ${netCount}/3`, 175, TOP / 2);

  // annunciations
  const ann: [string, string][] = [];
  if (sv.onBattery) ann.push(['ON BACKUP BATTERY', Math.floor(S.t * 2) % 2 ? '#ffb000' : '#000']);
  if (!D.adahrsOK && !(D.netOn && S.modules.adahrs)) ann.push(['ADAHRS OFFLINE', '#e21a1a']);
  if (D.adahrsOK && !D.magOK) ann.push(['MAG OFFLINE', '#ffb000']);
  if (D.netOn && !S.modules.arinc) ann.push(['ARINC OFFLINE', '#ffb000']);
  if (!D.netOn) ann.push(['NETWORK FAIL', '#e21a1a']);
  if (!S.modules.svbat) ann.push(['NO BACKUP BATT', '#ffb000']);
  let ax = 250;
  ctx.font = `700 12px ${FONT}`;
  for (const [t, c] of ann.slice(0, 3)) {
    const w = ctx.measureText(t).width + 14;
    ctx.fillStyle = c;
    ctx.fillRect(ax, 5, w, TOP - 10);
    ctx.fillStyle = c === '#000' ? '#ffb000' : '#000';
    if (c === '#e21a1a') ctx.fillStyle = '#fff';
    ctx.fillText(t, ax + 7, TOP / 2 + 1);
    ax += w + 6;
  }

  // battery icon
  const bx = SW - 110;
  const by = 7;
  const bw = 34;
  const bh = 16;
  ctx.strokeStyle = S.modules.svbat ? (sv.onBattery ? '#ffb000' : '#ccc') : '#555';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fillRect(bx + bw, by + 4, 3, bh - 8);
  if (S.modules.svbat) {
    const c = S.svbat.charge;
    ctx.fillStyle = c < 0.2 ? '#e21a1a' : sv.onBattery ? '#ffb000' : '#3dff5a';
    ctx.fillRect(bx + 2, by + 2, (bw - 4) * c, bh - 4);
    if (!sv.onBattery && c < 0.999) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(bx + 19, by + 1); ctx.lineTo(bx + 12, by + 9); ctx.lineTo(bx + 17, by + 9);
      ctx.lineTo(bx + 14, by + 15); ctx.lineTo(bx + 22, by + 7); ctx.lineTo(bx + 17, by + 7);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    ctx.fillStyle = '#e21a1a';
    ctx.fillText('✕', bx + 12, by + 9);
  }
  ctx.font = `700 12px ${FONT}`;
  ctx.fillStyle = sv.onBattery ? '#ffb000' : '#ccc';
  ctx.textAlign = 'left';
  const mins = Math.round(S.svbat.charge * 60);
  ctx.fillText(S.modules.svbat ? (sv.onBattery ? `${mins}m` : `${Math.round(S.svbat.charge * 100)}%`) : '--', bx + bw + 8, TOP / 2 + 1);
  ctx.textBaseline = 'alphabetic';
}

function drawSoftkeys(ctx: CanvasRenderingContext2D) {
  const y = SH - BOT;
  ctx.fillStyle = '#0b0b0b';
  ctx.fillRect(0, y, SW, BOT);
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, y, SW, 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 13px ${FONT}`;
  const ks = softkeys();
  ks.forEach((k, i) => {
    const x = KNOB_ZONE + i * KEY_W;
    if (k.label) {
      ctx.fillStyle = '#1c2530';
      ctx.fillRect(x + 4, y + 4, KEY_W - 8, BOT - 8);
      ctx.fillStyle = '#e9f1ff';
      ctx.fillText(k.label, x + KEY_W / 2, y + BOT / 2 + 1);
    }
  });
  ctx.fillStyle = '#38e0ff';
  ctx.fillText(sv.leftMode === 'HDG' ? '◀ HDG ▶' : '◀ CRS ▶', KNOB_ZONE / 2, y + BOT / 2 + 1);
  ctx.fillText(sv.rightMode === 'BARO' ? '◀ BARO ▶' : '◀ ALT ▶', SW - KNOB_ZONE / 2, y + BOT / 2 + 1);
  ctx.textBaseline = 'alphabetic';
}

function panel(ctx: CanvasRenderingContext2D, title: string) {
  const x = 170, y = 70, w = SW - 340, hgt = SH - 150;
  ctx.fillStyle = 'rgba(6,10,16,0.94)';
  ctx.fillRect(x, y, w, hgt);
  ctx.strokeStyle = '#4a6a8a';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, hgt);
  ctx.fillStyle = '#1c2a3a';
  ctx.fillRect(x, y, w, 34);
  ctx.fillStyle = '#fff';
  ctx.font = `700 16px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(title, x + 14, y + 23);
  return { x, y: y + 50, w };
}

function drawNet(ctx: CanvasRenderingContext2D) {
  const p = panel(ctx, 'SYSTEM SETUP › NETWORK STATUS');
  const rows: [string, string, boolean][] = [
    ['SV-NET-HUB (5-port, passive)', S.modules.hub ? 'CONNECTED' : 'DISCONNECTED', S.modules.hub],
    ['SV-ADAHRS-200 #1', D.netOn && S.modules.adahrs ? (D.adahrsOK ? 'ONLINE' : 'ALIGNING') : 'NOT FOUND', D.netOn && S.modules.adahrs],
    ['SV-MAG-236 (remote magnetometer)', D.netOn && S.modules.mag ? 'ONLINE' : 'NOT FOUND', D.netOn && S.modules.mag],
    ['SV-ARINC-429', D.arincMod ? (D.arincRx ? 'ONLINE · RX1 GPS# / RX2 NAV#' : 'ONLINE · NO RX DATA') : 'NOT FOUND', D.arincRx],
    ['SV-GPS-2020 (Serial 5, 8 V GPS PWR)', D.svGps ? '3D FIX' : S.modules.gps2020 ? 'ACQUIRING' : 'NO DATA', D.svGps],
    ['SV-BAT-320', S.modules.svbat ? `${Math.round(S.svbat.charge * 100)}% ${sv.onBattery ? 'DISCHARGING' : 'CHARGING/FULL'}` : 'NOT CONNECTED', S.modules.svbat],
  ];
  ctx.font = `600 15px ${FONT}`;
  rows.forEach(([k, v, ok], i) => {
    const y = p.y + i * 34;
    ctx.fillStyle = '#cfd8e3';
    ctx.textAlign = 'left';
    ctx.fillText(k, p.x + 20, y + 14);
    ctx.textAlign = 'right';
    ctx.fillStyle = ok ? '#3dff5a' : '#ffb000';
    ctx.fillText(v, p.x + p.w - 20, y + 14);
    ctx.fillStyle = '#223';
    ctx.fillRect(p.x + 14, y + 24, p.w - 28, 1);
  });
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7f93a8';
  ctx.font = `400 13px ${FONT}`;
  ctx.fillText('Hub carries SkyView Network only — GPS-2020 is RS-232, GTN link is ARINC 429 via the adapter.', p.x + 20, p.y + rows.length * 34 + 22);
}

function drawBat(ctx: CanvasRenderingContext2D) {
  const p = panel(ctx, 'BACKUP BATTERY · SV-BAT-320');
  const c = S.svbat.charge;
  ctx.textAlign = 'left';
  ctx.font = `600 16px ${FONT}`;
  const lines: [string, string, string][] = [
    ['Connected', S.modules.svbat ? 'YES' : 'NO', S.modules.svbat ? '#3dff5a' : '#ffb000'],
    ['Ship power (PFD breaker, main bus)', D.svShip ? `${S.elec.mainV.toFixed(1)} V` : 'LOST', D.svShip ? '#3dff5a' : '#ffb000'],
    ['State', !S.modules.svbat ? '—' : sv.onBattery ? 'DISCHARGING — powering display' : c < 0.999 ? 'CHARGING (bus > 12.25 V)' : 'FULL', sv.onBattery ? '#ffb000' : '#3dff5a'],
    ['Charge', `${Math.round(c * 100)} %`, c < 0.2 ? '#e21a1a' : '#fff'],
    ['Est. endurance', S.modules.svbat ? `${Math.round(c * 60)} min` : '—', '#fff'],
    ['Backup powers', 'This display + network modules + SV-GPS-2020', '#cfd8e3'],
    ['Does not power', 'GTN 650, PMA8000G, D30, Chronos', '#cfd8e3'],
  ];
  lines.forEach(([k, v, col], i) => {
    const y = p.y + i * 34;
    ctx.fillStyle = '#cfd8e3';
    ctx.textAlign = 'left';
    ctx.fillText(k, p.x + 20, y + 14);
    ctx.textAlign = 'right';
    ctx.fillStyle = col;
    ctx.fillText(v, p.x + p.w - 20, y + 14);
  });
  ctx.textAlign = 'left';
}
