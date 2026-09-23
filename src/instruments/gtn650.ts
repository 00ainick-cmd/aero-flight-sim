import { S, logEvent, type GtnPage } from '../core/state';
import { cls, h, pressable, screw, setHTML } from '../core/dom';
import { createKnob } from '../core/knob';
import { D } from '../sim/step';
import { AIRPORTS, completeIdent, findWaypoint, navaidByFreq } from '../sim/navdata';
import { bearingDeg, distanceNm, fmtKhz } from '../sim/geo';
import { drawMap, fitCanvas } from './mapdraw';

const COM_MIN = 118000, COM_MAX = 136990;
const NAV_MIN = 108000, NAV_MAX = 117950;

const g = S.gtn;

function popup(text: string, v = -1) {
  g.popup = { t: 1.6, text, v };
}

function go(p: GtnPage) {
  if (g.page !== p) g.back.push(g.page);
  if (g.back.length > 12) g.back.shift();
  g.page = p;
  if (p === 'msg') g.messages.forEach((m) => (m.read = true));
}

function tune(radio: 'com' | 'nav', coarse: boolean, dir: 1 | -1) {
  if (radio === 'com') {
    let mhz = Math.floor(g.com.stby / 1000);
    let khz = g.com.stby % 1000;
    if (coarse) mhz = mhz + dir > 136 ? 118 : mhz + dir < 118 ? 136 : mhz + dir;
    else khz = (khz + dir * 25 + 1000) % 1000;
    g.com.stby = mhz * 1000 + khz;
  } else {
    let mhz = Math.floor(g.nav.stby / 1000);
    let khz = g.nav.stby % 1000;
    if (coarse) mhz = mhz + dir > 117 ? 108 : mhz + dir < 108 ? 117 : mhz + dir;
    else khz = (khz + dir * 50 + 1000) % 1000;
    g.nav.stby = mhz * 1000 + khz;
  }
}

function flip(radio: 'com' | 'nav') {
  const r = radio === 'com' ? g.com : g.nav;
  [r.act, r.stby] = [r.stby, r.act];
  logEvent(`GTN 650: ${radio.toUpperCase()} flip-flop → active ${fmtKhz(r.act, radio === 'com')}`);
}

function parseKp(buf: string, radio: 'com' | 'nav'): number | null {
  if (buf.length < 3) return null;
  const mhz = parseInt(buf.slice(0, 3), 10);
  const k = parseInt(buf.slice(3).padEnd(3, '0'), 10);
  const khz = mhz * 1000 + k;
  if (radio === 'com') {
    if (khz < COM_MIN || khz > COM_MAX || k % 5 !== 0) return null;
    return khz;
  }
  if (khz < NAV_MIN || khz > NAV_MAX || k % 50 !== 0) return null;
  return khz;
}

function kpDisplay(buf: string, radio: 'com' | 'nav'): string {
  const n = radio === 'com' ? 6 : 5;
  const s = buf.padEnd(n, '_');
  return `${s.slice(0, 3)}.${s.slice(3)}`;
}

function kpDigit(d: string, radio: 'com' | 'nav') {
  let b = g.kp;
  const max = radio === 'com' ? 6 : 5;
  if (b.length === 0) {
    if (radio === 'com' && (d === '2' || d === '3')) b = '1';
    if (radio === 'nav' && (d === '8' || d === '9')) b = '10';
  }
  if (b.length < max) b += d;
  g.kp = b;
}

function activateDto(ident: string) {
  const w = findWaypoint(ident);
  if (!w) { popup('Waypoint not found'); return; }
  const f = S.flight;
  g.dto = { ident: w.ident, name: w.name, lat: w.lat, lon: w.lon, oLat: f.lat, oLon: f.lon, dtk: bearingDeg(f.lat, f.lon, w.lat, w.lon) };
  g.dtoEntry = w.ident;
  g.back = [];
  g.page = 'map';
  logEvent(`GTN 650: Direct-To ${w.ident} activated — DTK ${Math.round(g.dto.dtk).toString().padStart(3, '0')}°`);
}

function setCdi(src: 'GPS' | 'VLOC') {
  g.cdi = src;
  if (D.arincRx) S.sv.hsi = src === 'GPS' ? 'GPS1' : 'NAV1';
  logEvent(`GTN 650: CDI source ${src}${D.arincRx ? ' — SkyView HSI auto-switched (ARINC label 100P)' : ''}`);
}

function handle(act: string) {
  const [cmd, arg] = act.split(':');
  switch (cmd) {
    case 'com-act': flip('com'); break;
    case 'nav-act': flip('nav'); break;
    case 'com-stby': g.focus = 'com'; g.kp = ''; go('comkp'); break;
    case 'nav-stby': g.focus = 'nav'; g.kp = ''; go('navkp'); break;
    case 'go': go(arg as GtnPage); break;
    case 'back': g.page = g.back.pop() ?? 'home'; break;
    case 'home': g.back = []; g.page = 'home'; break;
    case 'continue': g.ready = true; logEvent('GTN 650: self-test acknowledged — Home'); break;
    case 'kp': kpDigit(arg, g.page === 'navkp' ? 'nav' : 'com'); break;
    case 'kp-bksp': g.kp = g.kp.slice(0, -1); break;
    case 'kp-enter':
    case 'kp-xfer': {
      const radio = g.page === 'navkp' ? 'nav' : 'com';
      const khz = parseKp(g.kp, radio);
      if (khz == null) { popup('Invalid frequency'); break; }
      const r = radio === 'com' ? g.com : g.nav;
      if (cmd === 'kp-xfer') { r.stby = r.act; r.act = khz; } else r.stby = khz;
      g.kp = '';
      g.page = g.back.pop() ?? 'home';
      break;
    }
    case 'freq': g.com.stby = parseInt(arg, 10); g.focus = 'com'; popup(`COM standby ${fmtKhz(g.com.stby, true)}`); break;
    case 'dto-key': if (g.dtoEntry.length < 5) g.dtoEntry += arg; break;
    case 'dto-bksp': g.dtoEntry = g.dtoEntry.slice(0, -1); break;
    case 'dto-clr': g.dtoEntry = ''; break;
    case 'dto-tab': g.dtoTab = arg as 'wpt' | 'nrst'; break;
    case 'dto-pick': g.dtoEntry = arg; g.dtoTab = 'wpt'; if (g.page !== 'dto') go('dto'); break;
    case 'dto-go': activateDto(completeIdent(g.dtoEntry) ?? g.dtoEntry); break;
    case 'dto-cancel': if (g.dto) logEvent(`GTN 650: Direct-To ${g.dto.ident} cancelled`); g.dto = null; g.page = g.back.pop() ?? 'home'; break;
    case 'map-in': g.mapRange = Math.max(2, g.mapRange / 2); break;
    case 'map-out': g.mapRange = Math.min(80, g.mapRange * 2); break;
    case 'cdi': setCdi(g.cdi === 'GPS' ? 'VLOC' : 'GPS'); break;
  }
}

/* ------------------------------ markup ------------------------------ */

const pad3 = (n: number) => String(Math.round(n) % 360 || 360).padStart(3, '0');
const fmtEte = (s: number) => {
  if (!s || !isFinite(s)) return '__:__';
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

const ICONS: Record<string, string> = {
  fpl: '<path d="M6 26h8l6-14h10" /><circle cx="6" cy="26" r="3"/><circle cx="30" cy="12" r="3"/>',
  map: '<path d="M4 8l9-3 10 3 9-3v21l-9 3-10-3-9 3z"/><path d="M13 5v21M23 8v21"/>',
  nav: '<circle cx="18" cy="18" r="12"/><path d="M18 6v24M11 18h14" /><path d="M18 9l3 6h-6z" fill="currentColor"/>',
  traffic: '<path d="M18 6l6 14h-12z"/><path d="M8 26h4M24 26h4M14 30h8"/>',
  terrain: '<path d="M3 28l9-14 6 8 5-6 10 12z"/>',
  wx: '<path d="M10 22a6 6 0 010-12 8 8 0 0115 2 5 5 0 011 10z"/><path d="M12 26l-2 4M18 26l-2 4M24 26l-2 4"/>',
  nrst: '<path d="M18 4v28M4 18h28"/><circle cx="18" cy="18" r="6"/>',
  util: '<path d="M22 6a6 6 0 00-7 8l-9 9 3 3 9-9a6 6 0 008-7l-4 4-3-1-1-3z"/>',
  sys: '<rect x="6" y="8" width="24" height="16" rx="2"/><path d="M12 30h12M18 24v6"/>',
  msg: '<rect x="5" y="8" width="26" height="18" rx="2"/><path d="M5 10l13 9 13-9"/>',
};

const TILES: [GtnPage, string][] = [
  ['fpl', 'Flight Plan'], ['map', 'Map'], ['nav', 'Default Nav'], ['traffic', 'Traffic'], ['terrain', 'Terrain'],
  ['wx', 'Weather'], ['nrst', 'Nearest'], ['util', 'Utilities'], ['sys', 'System'], ['msg', 'Messages'],
];

function tile(p: GtnPage, label: string) {
  return `<button class="g-tile" data-act="go:${p}"><svg viewBox="0 0 36 36">${ICONS[p] ?? ''}</svg><span>${label}</span></button>`;
}

function nearest(n = 6) {
  const f = S.flight;
  return AIRPORTS.map((a) => ({ a, dis: distanceNm(f.lat, f.lon, a.lat, a.lon), brg: bearingDeg(f.lat, f.lon, a.lat, a.lon) }))
    .sort((x, y) => x.dis - y.dis)
    .slice(0, n);
}

function pageHtml(): string {
  switch (g.page) {
    case 'home':
      return `<div class="g-tiles">${TILES.map(([p, l]) => tile(p, l)).join('')}</div>`;
    case 'map':
      return `<div class="g-map"><canvas class="g-mapc"></canvas>
        <div class="g-maprng"><button data-act="map-out">−</button><span>${g.mapRange} NM</span><button data-act="map-in">+</button></div>
        ${g.dto ? `<div class="g-mapleg"><b>D→</b> ${g.dto.ident}</div>` : ''}</div>`;
    case 'nav': {
      const n = D.nav;
      const vl = g.cdi === 'VLOC';
      const dev = vl ? (D.vor.valid ? D.vor.dev / 10 : 0) : n.valid ? -n.xtk / 2 : 0;
      const flag = vl ? !D.vor.valid : !n.valid;
      const dots = [-2, -1, 0, 1, 2].map((d) => `<i style="left:${50 + d * 20}%"></i>`).join('');
      return `<div class="g-dnav">
        <div class="g-cdi ${vl ? 'vloc' : ''}">${dots}<b class="needle ${flag ? 'flag' : ''}" style="left:${50 + Math.max(-1.2, Math.min(1.2, dev)) * 40}%"></b>
          <span class="g-cdisrc">${vl ? (D.vor.valid ? `VLOC ${D.vor.ident} ${D.vor.toFrom}` : 'VLOC — NO SIGNAL') : n.valid ? `GPS ENR · D→ ${g.dto?.ident}` : 'GPS — NO ACTIVE WPT'}</span></div>
        <div class="g-fields">
          ${fld('DIS', n.valid ? `${n.dis.toFixed(1)}<small>NM</small>` : '__._')}
          ${fld('BRG', n.valid ? `${pad3(n.brg)}°` : '___°')}
          ${fld('DTK', n.valid ? `${pad3(n.dtk)}°` : '___°')}
          ${fld('TRK', D.gtnGps && S.flight.gs > 5 ? `${pad3(S.flight.trk)}°` : '___°')}
          ${fld('XTK', n.valid ? `${Math.abs(n.xtk).toFixed(2)}<small>NM</small>` : '__._')}
          ${fld('ETE', n.valid ? fmtEte(n.ete) : '__:__')}
        </div>
        <button class="g-btn g-cdibtn" data-act="cdi">CDI<br><b>${g.cdi}</b></button>
      </div>`;
    }
    case 'dto': {
      const guess = completeIdent(g.dtoEntry);
      const w = guess ? findWaypoint(guess) : null;
      const f = S.flight;
      const info = w ? `<div class="g-dtoinfo"><div class="nm">${w.name}</div><div>BRG <b>${pad3(bearingDeg(f.lat, f.lon, w.lat, w.lon))}°</b> DIS <b>${distanceNm(f.lat, f.lon, w.lat, w.lon).toFixed(1)}NM</b></div></div>` : `<div class="g-dtoinfo muted">Enter waypoint identifier</div>`;
      const tabs = `<div class="g-tabs"><button class="${g.dtoTab === 'wpt' ? 'on' : ''}" data-act="dto-tab:wpt">Waypoint</button><button class="${g.dtoTab === 'nrst' ? 'on' : ''}" data-act="dto-tab:nrst">NRST</button></div>`;
      if (g.dtoTab === 'nrst') {
        return `<div class="g-dto">${tabs}<div class="g-list">${nearest(5).map((x) => `<button data-act="dto-pick:${x.a.ident}"><b>${x.a.ident}</b><span>${pad3(x.brg)}°</span><span>${x.dis.toFixed(1)}NM</span></button>`).join('')}</div></div>`;
      }
      const keys = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => `<button data-act="dto-key:${c}">${c}</button>`).join('');
      const shown = g.dtoEntry + (guess && guess !== g.dtoEntry ? `<span class="ac">${guess.slice(g.dtoEntry.length)}</span>` : '');
      return `<div class="g-dto">${tabs}
        <div class="g-dtorow"><div class="g-ident"><span>${shown || '&nbsp;'}</span></div>${info}</div>
        <div class="g-kbd">${keys}<button class="w" data-act="dto-bksp">⌫</button><button class="w" data-act="dto-clr">CLR</button></div>
        <div class="g-dtoact">${g.dto ? '<button class="g-btn" data-act="dto-cancel">Cancel D→</button>' : ''}<button class="g-btn go ${w ? '' : 'dis'}" data-act="dto-go">Activate</button></div>
      </div>`;
    }
    case 'comkp':
    case 'navkp': {
      const radio = g.page === 'navkp' ? 'nav' : 'com';
      const d = '1234567890'.split('').map((c) => `<button data-act="kp:${c}">${c}</button>`).join('');
      const nr = radio === 'com'
        ? nearest(3).flatMap((x) => x.a.freqs.slice(0, 2).map((f) => `<button data-act="freq:${f.khz}"><b>${x.a.ident}</b> ${f.type} <span>${fmtKhz(f.khz, true)}</span></button>`)).slice(0, 4).join('')
        : '';
      return `<div class="g-kp">
        <div class="g-kptitle">${radio === 'com' ? 'COM' : 'NAV'} Standby <span class="g-kpval">${kpDisplay(g.kp, radio)}</span></div>
        <div class="g-kpgrid">${d}<button class="w" data-act="kp-bksp">BKSP</button></div>
        <div class="g-kpact"><button class="g-btn" data-act="kp-xfer">Xfer</button><button class="g-btn go" data-act="kp-enter">Enter</button></div>
        ${radio === 'com' ? `<div class="g-find"><div class="t">Find · Nearest</div>${nr}</div>` : `<div class="g-find"><div class="t">Tip</div><div class="tip">Type 1-1-2-6 for 112.60. Large knob = MHz, small = kHz.</div></div>`}
      </div>`;
    }
    case 'nrst':
      return `<div class="g-nrst"><div class="g-hdr"><span>Nearest Airport</span><span>BRG</span><span>DIS</span><span>FREQ</span></div>${nearest(5).map((x) => {
        const f = x.a.freqs[0];
        return `<div class="g-row"><button data-act="dto-pick:${x.a.ident}"><b>${x.a.ident}</b></button><span>${pad3(x.brg)}°</span><span>${x.dis.toFixed(1)}</span><button class="fq" data-act="freq:${f.khz}">${f.type} ${fmtKhz(f.khz, true)}</button></div>`;
      }).join('')}</div>`;
    case 'msg':
      return `<div class="g-msgs"><div class="g-hdr"><span>Messages</span></div>${g.messages.length ? g.messages.map((m) => `<div class="g-msg">${m.text}</div>`).join('') : '<div class="g-msg muted">No messages.</div>'}</div>`;
    case 'sys': {
      const row = (k: string, v: string, ok: boolean) => `<div class="g-srow"><span>${k}</span><b class="${ok ? 'ok' : 'bad'}">${v}</b></div>`;
      return `<div class="g-sys"><div class="g-hdr"><span>System Status</span></div>
        ${row('GPS', D.gtnGps ? '3D DIFF NAV (SBAS)' : 'ACQUIRING', D.gtnGps)}
        ${row('COM 1 power', D.gtnComPwr ? 'OK' : 'NO POWER', D.gtnComPwr)}
        ${row('ARINC 429 IN 1', D.arincRx ? 'RECEIVING' : 'NO DATA', D.arincRx)}
        ${row('Config module', S.modules.config ? 'OK' : 'INOPERATIVE', S.modules.config)}
        ${row('Cooling fan', S.modules.fan ? 'OK' : 'FAIL', S.modules.fan)}
        ${row('Database', 'SIM DATA — NOT FOR NAV', true)}</div>`;
    }
    case 'fpl':
      return `<div class="g-fpl"><div class="g-hdr"><span>Active Flight Plan</span></div>
        ${g.dto ? `<div class="g-fplrow"><span class="m">D→</span><b>${g.dto.ident}</b><span>DTK ${pad3(g.dto.dtk)}°</span><span>${D.nav.valid ? D.nav.dis.toFixed(1) + 'NM' : ''}</span></div>` : '<div class="g-msg muted">No active flight plan. Use Direct-To (D→) to navigate to a waypoint.</div>'}
      </div>`;
    default: {
      const stub: Record<string, [string, string]> = {
        traffic: ['Traffic', 'No traffic source is configured on this installation.'],
        terrain: ['Terrain', 'Terrain page (database only). No TAWS configured. Not simulated.'],
        wx: ['Weather', 'No datalink weather source is connected on this installation.'],
        util: ['Utilities', 'Trip planning, fuel planning and timers are not simulated in this trainer.'],
      };
      const [t, m] = stub[g.page] ?? ['', ''];
      return `<div class="g-stub"><div class="g-hdr"><span>${t}</span></div><div class="g-msg muted">${m}</div></div>`;
    }
  }
}

function fld(label: string, value: string) {
  return `<div class="g-fld"><span>${label}</span><b>${value}</b></div>`;
}

/* ------------------------------ component ------------------------------ */

export function createGtn650() {
  const screen = h('div', { class: 'gtn-screen' });
  const glass = h('div', { class: 'glass' });

  const volKnob = createKnob({
    size: 44,
    title: 'Volume / squelch — click right/left side or scroll to turn; tap center: squelch (COM) / ident (NAV); hold center: 121.5 emergency',
    onOuter: (dir) => {
      if (!D.gtnOn) return;
      const r = g.focus === 'com' ? g.com : g.nav;
      r.vol = Math.max(0, Math.min(1, r.vol + dir * 0.05));
      popup(`${g.focus === 'com' ? 'COM' : 'NAV'} Volume`, r.vol);
    },
    onPush: () => {
      if (!D.gtnOn) return;
      if (g.focus === 'com') { g.com.sq = !g.com.sq; popup(g.com.sq ? 'COM Squelch ON' : 'COM Squelch OFF'); }
      else { g.nav.ident = !g.nav.ident; popup(g.nav.ident ? 'NAV ID ON' : 'NAV ID OFF'); }
    },
    onHold: () => {
      if (!D.gtnOn) return;
      g.com.stby = g.com.act; g.com.act = 121500;
      popup('Emergency 121.500 active');
      logEvent('GTN 650: volume knob held — 121.500 loaded active');
    },
    holdMs: 1500,
  });

  const dualKnob = createKnob({
    size: 64,
    inner: 0.58,
    title: 'Dual concentric — outer: MHz, inner: kHz. Tap center: COM/NAV focus. Hold center: flip-flop',
    onOuter: (dir) => { if (D.gtnOn) { tune(g.focus, true, dir); g.kp = ''; } },
    onInner: (dir) => { if (D.gtnOn) { tune(g.focus, false, dir); g.kp = ''; } },
    onPush: () => { if (D.gtnOn) g.focus = g.focus === 'com' ? 'nav' : 'com'; },
    onHold: () => { if (D.gtnOn) flip(g.focus); },
    holdMs: 600,
  });

  const homeKey = h('button', { class: 'hk', title: 'HOME' }, h('span', {}, 'HOME'));
  const dtoKey = h('button', { class: 'hk dto', title: 'Direct-To', 'data-coach': 'dto' }, h('span', { class: 'dtoglyph' }, 'D', h('i', {}, '→')));
  pressable(homeKey, { onPress: () => { if (D.gtnOn) handle('home'); } });
  pressable(dtoKey, { onPress: () => {
    if (!D.gtnOn) return;
    if (g.page === 'dto') { g.page = g.back.pop() ?? 'home'; return; }
    g.dtoTab = 'wpt';
    if (g.dto) g.dtoEntry = g.dto.ident;
    go('dto');
  } });

  const bezel = h('div', { class: 'gtn bezel' },
    screw('tl'), screw('tr'), screw('bl'), screw('br'),
    h('div', { class: 'gtn-brand' }, 'GARMIN'),
    h('div', { class: 'gtn-model' }, 'GTN 650'),
    h('div', { class: 'photocell' }),
    h('div', { class: 'gtn-left' }, volKnob, h('div', { class: 'vol-glyph' }, '◁)) PUSH SQ'), h('div', { class: 'sdslot' }, h('i'))),
    h('div', { class: 'gtn-screen-wrap' }, screen, glass),
    h('div', { class: 'gtn-right' }, homeKey, dtoKey, dualKnob),
  );

  screen.addEventListener('pointerdown', (e) => {
    const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!t || !D.gtnOn && g.unit.state !== 'on') return;
    e.preventDefault();
    t.classList.add('pressed');
    setTimeout(() => t.classList.remove('pressed'), 140);
    handle(t.dataset.act!);
    render();
  });

  const frame = h('div', { class: 'gtn-frame' });
  screen.append(frame);

  let mapCanvas: HTMLCanvasElement | null = null;

  function freqBox(radio: 'com' | 'nav') {
    const r = radio === 'com' ? g.com : g.nav;
    const isCom = radio === 'com';
    const focus = g.focus === radio;
    let tag = '';
    if (isCom && D.tx) tag = '<span class="tx">TX</span>';
    else if (isCom && !g.com.sq && D.gtnComPwr) tag = '<span class="rx">RX</span>';
    const dead = isCom && !D.gtnComPwr;
    const ident = !isCom ? navaidByFreq(r.act)?.ident ?? '' : '';
    return `<div class="g-radio ${focus ? 'focus' : ''} ${dead ? 'dead' : ''}">
      <div class="g-rlabel">${isCom ? 'COM' : 'NAV'} ${tag}${!isCom && ident ? `<span class="id">${ident}${g.nav.ident ? ' ID' : ''}</span>` : ''}</div>
      <button class="g-act" data-act="${radio}-act">${dead ? '<span class="xx">COM FAIL</span>' : fmtKhz(r.act, isCom)}</button>
      <button class="g-stby" data-act="${radio}-stby">${fmtKhz(r.stby, isCom)}</button>
    </div>`;
  }

  function render() {
    const u = g.unit;
    if (u.state === 'off') {
      setHTML(frame, '');
      mapCanvas = null;
      return;
    }
    if (u.state === 'boot') {
      const pct = Math.min(100, (u.t / u.bootTime) * 100);
      setHTML(frame, `<div class="g-splash"><div class="logo">GARMIN<span>®</span></div><div class="sub">GTN 650</div>
        <div class="bar"><i style="width:${pct.toFixed(0)}%"></i></div>
        <div class="db">${pct < 45 ? 'Performing power-on self test…' : 'Verifying databases…'}</div></div>`);
      mapCanvas = null;
      return;
    }
    if (!g.ready) {
      setHTML(frame, `<div class="g-selftest"><div class="g-hdr"><span>Instrument Panel Self-Test</span></div>
        <div class="st-grid">
          <div>Verify on SkyView HSI (via ARINC 429):</div>
          <div class="st"><span>Lateral deviation</span><b>½ scale LEFT</b></div>
          <div class="st"><span>TO / FROM</span><b>TO</b></div>
          <div class="st"><span>Vertical deviation</span><b>½ scale UP</b></div>
          <div class="st"><span>Databases</span><b class="ok">SIM DATA · verified</b></div>
        </div>
        <button class="g-btn go g-cont" data-act="continue">Continue</button></div>`);
      mapCanvas = null;
      return;
    }

    const f = S.flight;
    const top = `<div class="g-top">
      ${fld('GS', D.gtnGps ? `${Math.round(f.gs)}<small>KT</small>` : '___')}
      ${fld('DTK', D.nav.valid ? `${pad3(D.nav.dtk)}°` : '___°')}
      ${fld('TRK', D.gtnGps && f.gs > 5 ? `${pad3(f.trk)}°` : '___°')}
      ${fld(D.nav.valid ? 'ETE' : 'DIS', D.nav.valid ? fmtEte(D.nav.ete) : '__._')}
    </div>`;
    const unread = g.messages.some((m) => !m.read);
    const bottom = `<div class="g-bot">
      <button data-act="back">Back</button><button data-act="home">Home</button>
      <span class="g-gps ${D.gtnGps ? 'ok' : ''}">${D.gtnGps ? 'GPS' : 'GPS ACQ'}</span>
      <span class="g-leg">${g.dto ? `D→ <b>${g.dto.ident}</b>` : ''}</span>
      <button class="g-msgbtn ${unread ? 'flash' : g.messages.length ? 'has' : ''}" data-act="go:msg">MSG</button>
    </div>`;
    const pop = g.popup.t > 0
      ? `<div class="g-pop">${g.popup.text}${g.popup.v >= 0 ? `<div class="bar"><i style="width:${Math.round(g.popup.v * 100)}%"></i></div><b>${Math.round(g.popup.v * 100)}%</b>` : ''}</div>`
      : '';
    const html = `<div class="g-ui">
      <div class="g-radios">${freqBox('com')}${freqBox('nav')}</div>
      <div class="g-main">${top}<div class="g-page p-${g.page}">${pageHtml()}</div>${bottom}</div>${pop}</div>`;
    if (setHTML(frame, html)) mapCanvas = frame.querySelector('canvas.g-mapc');
  }

  let acc = 0;
  function update(dt: number) {
    acc += dt;
    const lit = g.unit.lit;
    cls(bezel, 'powered', lit);
    cls(screen, 'dim-fan', lit && !S.modules.fan && g.unit.t > 5);
    if (acc > 0.12 || !lit) { acc = 0; render(); }
    if (mapCanvas && g.page === 'map') {
      const ctx = fitCanvas(mapCanvas);
      drawMap(ctx, mapCanvas.clientWidth, mapCanvas.clientHeight, {
        lat: S.flight.lat, lon: S.flight.lon, trk: S.flight.trk, rangeNm: g.mapRange, trackUp: true,
        dto: g.dto, valid: D.gtnGps, style: 'garmin',
      });
    }
  }

  return { el: bezel, update };
}
