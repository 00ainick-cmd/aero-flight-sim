import { S, logEvent, type BreakerId } from '../core/state';
import { navaidByFreq } from './navdata';
import { bearingDeg, clamp, crossTrackNm, distanceNm, wrap180 } from './geo';

/** Signals derived from state every frame; instruments read these rather than recomputing. */
export const D = {
  mainBus: false,
  avBus: false,
  gtnPwr: false,
  gtnComPwr: false,
  gtnOn: false,
  gtnComOn: false,
  gtnGps: false,
  pmaOn: false,
  failsafe: false,
  svShip: false,
  svOn: false,
  netOn: false,
  adahrsOK: false,
  magOK: false,
  arincMod: false,
  arincRx: false,
  svGps: false,
  d30Ship: false,
  d30On: false,
  clockOn: false,
  tx: false,
  txBlocked: '' as string,
  pilotMic: '' as string,
  copilotMic: '' as string,
  pilotHears: [] as string[],
  copilotHears: [] as string[],
  nav: {
    valid: false,
    dis: 0,
    brg: 0,
    dtk: 0,
    xtk: 0,
    ete: 0,
  },
  vor: {
    valid: false,
    ident: '',
    radial: 0,
    dev: 0,
    toFrom: 'TO' as 'TO' | 'FROM',
    dis: 0,
  },
};

const STUCK_MIC_S = 35;

const brk = (id: BreakerId) => S.elec.breakers[id];

function addMsg(id: string, text: string) {
  if (!S.gtn.messages.some((m) => m.id === id)) {
    S.gtn.messages.unshift({ id, text, read: false });
  }
}
function clearMsg(id: string) {
  S.gtn.messages = S.gtn.messages.filter((m) => m.id !== id);
}
function msgIf(cond: boolean, id: string, text: string) {
  if (cond) addMsg(id, text);
  else clearMsg(id);
}

function stepElectrical(dt: number) {
  const e = S.elec;
  const wantMain = e.master ? 13.9 + Math.sin(S.t * 3.1) * 0.03 : 0;
  e.mainV += (wantMain - e.mainV) * Math.min(1, dt * 18);
  if (!e.master && e.mainV < 0.2) e.mainV = 0;
  e.avV = e.avionics && e.master ? e.mainV - 0.1 : 0;
  D.mainBus = e.mainV > 10;
  D.avBus = e.avV > 10;
}

function stepGtn(dt: number) {
  const g = S.gtn;
  D.gtnPwr = D.avBus && brk('GPS');
  D.gtnComPwr = D.avBus && brk('COM1');
  const tr = g.unit.step(D.gtnPwr, dt);
  if (tr === 'boot') {
    g.ready = false;
    g.page = 'home';
    g.back = [];
    g.gpsFixT = 0;
    g.messages = [];
    logEvent('GTN 650: power applied — boot splash');
  } else if (tr === 'off') {
    g.ready = false;
    logEvent('GTN 650: lost aircraft power — unit dark (no COM/NAV/GPS)');
  }
  D.gtnOn = g.unit.on && g.ready;
  D.gtnComOn = D.gtnOn && D.gtnComPwr;
  if (g.unit.on) g.gpsFixT += dt;
  D.gtnGps = D.gtnOn && g.gpsFixT > 6;
  if (g.popup.t > 0) g.popup.t -= dt;

  if (D.gtnOn) {
    msgIf(!D.gtnComPwr, 'com-pwr', 'COM 1 has no power. Check COM 1 circuit breaker.');
    msgIf(!S.modules.config, 'config', 'Configuration module is inoperative.');
    msgIf(!S.modules.fan, 'fan', 'Cooling fan is inoperative. Unit may reduce backlight.');
    msgIf(!D.arincRx && g.unit.t > 4, 'arinc-in', 'ARINC 429 input 1 (EFIS/air data) is not receiving.');
    msgIf(g.stuck, 'stuck', 'COM push-to-talk key stuck.');
  }
}

function stepPma(dt: number) {
  const p = S.pma;
  const tr = p.unit.step(D.avBus && brk('AUDIO') && p.knobOn, dt);
  if (tr === 'off') logEvent('PMA8000G: OFF — fail-safe: pilot headset hard-wired to COM 1');
  if (tr === 'on') logEvent('PMA8000G: powered — restored last button states');
  D.pmaOn = p.unit.on;
  D.failsafe = !D.pmaOn;
  if (p.playT > 0) p.playT -= dt;
}

function stepSkyView(dt: number) {
  const sv = S.sv;
  const ship = D.mainBus && brk('PFD');
  if (ship && !D.svShip) sv.shutdown = false;
  D.svShip = ship;
  const batOK = S.modules.svbat && S.svbat.charge > 0.001;
  const powered = !sv.shutdown && (ship || (sv.unit.lit && batOK));
  const wasBatt = sv.onBattery;
  const tr = sv.unit.step(powered, dt);
  sv.onBattery = sv.unit.lit && !ship;
  if (tr === 'boot') {
    sv.adahrsT = 0; sv.gpsT = 0;
    logEvent('SkyView HDX: power applied — booting');
  }
  if (tr === 'off') {
    sv.overlay = null;
    logEvent(ship ? 'SkyView HDX: shut down' : 'SkyView HDX: dark — no ship power and no backup battery');
  }
  if (sv.onBattery && !wasBatt) logEvent('SkyView HDX: ship power lost — running on SV-BAT-320 backup');
  if (!sv.onBattery && wasBatt && sv.unit.lit) logEvent('SkyView HDX: ship power restored — battery charging');

  if (sv.onBattery) S.svbat.charge = Math.max(0, S.svbat.charge - dt / 3600);
  else if (ship && S.elec.mainV > 12.25 && S.modules.svbat) S.svbat.charge = Math.min(1, S.svbat.charge + dt / 7200);

  D.svOn = sv.unit.on;
  D.netOn = D.svOn && S.modules.hub;
  const adahrsLink = D.netOn && S.modules.adahrs;
  sv.adahrsT = adahrsLink ? sv.adahrsT + dt : 0;
  D.adahrsOK = sv.adahrsT > 2.5;
  D.magOK = D.netOn && S.modules.mag && D.adahrsOK;
  D.arincMod = D.netOn && S.modules.arinc;
  D.arincRx = D.arincMod && D.gtnOn;

  const gpsPowered = sv.unit.lit && S.modules.gps2020;
  sv.gpsT = gpsPowered ? sv.gpsT + dt : 0;
  D.svGps = D.svOn && sv.gpsT > 8;
}

function stepD30(dt: number) {
  const d = S.d30;
  const ship = D.mainBus && brk('STBY');
  const wasShip = D.d30Ship;
  D.d30Ship = ship;

  if (!ship && wasShip && d.unit.lit && !d.manualOff) {
    d.onBattery = true;
    d.stayOn = S.flight.ias > 30;
    d.countdown = d.stayOn ? 0 : 30;
    logEvent(d.stayOn ? 'D30: ship power lost in flight — continuing on internal battery' : 'D30: ship power removed on ground — 30 s shutdown countdown');
  }
  if (ship && !wasShip) d.manualOff = false;
  if (ship) { d.onBattery = false; d.countdown = 0; }

  if (d.onBattery) {
    d.battery = Math.max(0, d.battery - dt / 5400);
    if (d.countdown > 0 && !d.stayOn) {
      d.countdown -= dt;
      if (d.countdown <= 0) { d.onBattery = false; logEvent('D30: shutdown countdown expired'); }
    }
    if (d.battery <= 0) d.onBattery = false;
  } else if (ship) {
    d.battery = Math.min(1, d.battery + dt / 7200);
  }

  const tr = d.unit.step(!d.manualOff && (ship || d.onBattery), dt);
  if (tr === 'boot') { d.altT = 0; d.menu = false; logEvent('D30: powering up'); }
  if (tr === 'off') { d.menu = false; if (!d.manualOff) logEvent('D30: off'); }
  if (d.unit.on) d.altT += dt;
  D.d30On = d.unit.on;
}

function stepClock(dt: number) {
  const c = S.clock;
  const tr = c.unit.step(D.avBus && brk('CLOCK'), dt);
  if (tr === 'off') {
    c.flightS = 0; c.timerS = 0; c.timerRun = false;
    logEvent('Chronos CH93: display off (time of day kept by internal coin cell)');
  }
  if (tr === 'on') logEvent('Chronos CH93: on — local time');
  D.clockOn = c.unit.lit;
  if (c.unit.on) {
    c.flightS += dt;
    if (c.timerRun) c.timerS += dt;
  }
  if (c.popT > 0) c.popT -= dt;
}

function stepAudio(dt: number) {
  const p = S.pma;
  const g = S.gtn;
  const com1 = D.gtnComOn ? `COM 1 ${(g.com.act / 1000).toFixed(3)}` : '';
  const nav1 = D.gtnOn ? `NAV 1 ${(g.nav.act / 1000).toFixed(2)}${g.nav.ident ? ' IDENT' : ''}` : '';
  const unsw = D.svOn ? 'SkyView alerts (unswitched)' : '';
  const hears: string[] = [];
  const coHears: string[] = [];

  if (D.pmaOn) {
    const rx = p.rx;
    const sel = (k: 'COM1' | 'COM2' | 'NAV1' | 'NAV2' | 'ADF' | 'AUX' | 'MKR', label: string) => {
      if (!rx[k]) return;
      if (k === 'COM1') { if (com1) hears.push(com1); else hears.push('COM 1 — radio has no power'); return; }
      if (k === 'NAV1') { if (nav1) hears.push(nav1); else hears.push('NAV 1 — radio has no power'); return; }
      hears.push(`${label} — not installed on this print`);
    };
    sel('COM1', 'COM 1'); sel('COM2', 'COM 2'); sel('NAV1', 'NAV 1'); sel('NAV2', 'NAV 2');
    sel('ADF', 'ADF'); sel('AUX', 'AUX'); sel('MKR', 'Marker');
    if (unsw) hears.push(unsw);
    if (!rx.MUTE && p.ics !== 'ISO') hears.push(`Intercom (${p.ics})`);
    if (p.ics === 'ISO') hears.push('Intercom isolated (ISO)');
    if (rx.MUSIC) hears.push(rx.MUTE ? 'Music (SoftMute on radio)' : 'Bluetooth music');
    if (p.playT > 0) hears.push('flightmate® playback: last COM reception');
    coHears.push(...hears.filter((h) => !h.startsWith('Intercom isolated')));
    D.pilotMic = p.split ? 'COM1' : p.mic;
    D.copilotMic = p.split ? 'COM2' : p.mic;
  } else {
    hears.push(com1 || 'COM 1 — radio has no power');
    if (unsw) hears.push(unsw + ' via fail-safe');
    D.pilotMic = 'COM1';
    D.copilotMic = '';
  }
  D.pilotHears = hears;
  D.copilotHears = D.pmaOn ? coHears : ['— (no audio in fail-safe)'];

  const keyed1 = (S.ptt.pilot && D.pilotMic === 'COM1') || (S.ptt.copilot && D.copilotMic === 'COM1');
  const keyedAny = S.ptt.pilot || S.ptt.copilot;
  if (keyed1 && D.gtnComOn) {
    g.txTime += dt;
    if (g.txTime > STUCK_MIC_S && !g.stuck) {
      g.stuck = true;
      logEvent('GTN 650: stuck-mic timeout — COM transmitter unkeyed');
    }
  } else {
    g.txTime = 0;
    g.stuck = false;
  }
  D.tx = keyed1 && D.gtnComOn && !g.stuck;
  D.txBlocked = '';
  if (keyedAny && !D.tx) {
    if (S.ptt.pilot && D.pilotMic === 'COM2') D.txBlocked = 'COM 2 selected — no COM 2 radio on this print';
    else if (S.ptt.copilot && !D.copilotMic) D.txBlocked = 'Copilot mic dead — audio panel in fail-safe';
    else if (keyed1 && g.stuck) D.txBlocked = 'Stuck-mic timeout — release PTT';
    else if (keyed1) D.txBlocked = 'COM 1 has no power — nothing transmits';
    else if (S.ptt.copilot && D.copilotMic === 'COM2') D.txBlocked = 'Copilot on COM 2 (split) — no COM 2 radio';
  }
}

function stepNav() {
  const f = S.flight;
  const dto = S.gtn.dto;
  if (dto && D.gtnGps) {
    D.nav.valid = true;
    D.nav.dis = distanceNm(f.lat, f.lon, dto.lat, dto.lon);
    D.nav.brg = bearingDeg(f.lat, f.lon, dto.lat, dto.lon);
    D.nav.dtk = dto.dtk;
    D.nav.xtk = crossTrackNm(dto.oLat, dto.oLon, dto.lat, dto.lon, f.lat, f.lon);
    D.nav.ete = f.gs > 20 ? (D.nav.dis / f.gs) * 3600 : 0;
  } else {
    D.nav.valid = false;
  }

  const na = navaidByFreq(S.gtn.nav.act);
  if (D.gtnOn && na) {
    const dis = distanceNm(na.lat, na.lon, f.lat, f.lon);
    if (dis < 80) {
      const radial = bearingDeg(na.lat, na.lon, f.lat, f.lon);
      const diff = wrap180(radial - S.sv.crs);
      const from = Math.abs(diff) < 90;
      const needle = from ? -diff : wrap180(diff + 180);
      D.vor = { valid: true, ident: na.ident, radial, dev: clamp(needle, -12, 12), toFrom: from ? 'FROM' : 'TO', dis };
      return;
    }
  }
  D.vor.valid = false;
}

export function step(dt: number) {
  S.t += dt;
  stepElectrical(dt);
  stepSkyView(dt);
  stepGtn(dt);
  stepPma(dt);
  stepD30(dt);
  stepClock(dt);
  stepAudio(dt);
  stepNav();
}
