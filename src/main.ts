import '@fontsource/roboto-condensed/400.css';
import '@fontsource/roboto-condensed/500.css';
import '@fontsource/roboto-condensed/700.css';
import '@fontsource/b612/400.css';
import '@fontsource/b612/700.css';
import '@fontsource/b612-mono/400.css';
import '@fontsource/b612-mono/700.css';
import './styles/base.css';
import './styles/panel.css';
import './styles/gtn.css';
import './styles/pma.css';
import './styles/instruments.css';
import './styles/app.css';
import './styles/sim.css';

import { h, setText } from './core/dom';
import { S } from './core/state';
import { readAirdata, stepAircraft, writePanelFlight } from './fdm/fdm';
import { createCoach } from './guide/coach';
import { attachStick, resetStick, sampleStick, setStick, stickSnap } from './input/stick';
import { createChronos } from './instruments/chronos';
import { createD30 } from './instruments/d30';
import { createGtn650 } from './instruments/gtn650';
import { createPma8000g } from './instruments/pma8000g';
import { createSkyView } from './instruments/skyview';
import { createBay } from './panel/bay';
import { createDeck } from './panel/deck';
import { createSwitchPanel } from './panel/switches';
import { resetColdDark } from './sim/reset';
import { seekDemo } from './sim/seek';
import { aircraft, onSessionReset, sessionReset } from './sim/session';
import { D, step } from './sim/step';
import { createView } from './world/view';

const sv = createSkyView();
const pma = createPma8000g();
const gtn = createGtn650();
const d30 = createD30();
const clock = createChronos();
const sw = createSwitchPanel();
const bay = createBay();
const deck = createDeck();

const label = (text: string) => h('div', { class: 'unit-tag' }, text);

const panel = h('div', { class: 'panel' },
  h('div', { class: 'pcol left' }, sv.el, label('PFD · Dynon SkyView HDX · main bus (PFD 3 A)')),
  h('div', { class: 'pcol center' },
    pma.el, label('Audio · PS Engineering PMA8000G · avionics bus (AUDIO 5 A)'),
    gtn.el, label('GPS/NAV/COM · Garmin GTN 650 · avionics bus (GPS 3 A, COM 1 5 A)'),
    sw.el,
  ),
  h('div', { class: 'pcol right' },
    d30.el, label('Standby · Dynon D30 · main bus (STBY ATT 1 A)'),
    clock.el, label('Clock · Mid-Continent CH93 Chronos · avionics bus (CLOCK 2 A)'),
    h('div', { class: 'placard' }, h('b', {}, 'AEA CLASS PROJECT'), h('span', {}, 'AERO panel · not for navigation'), h('span', {}, 'Airdata from the in-browser flight model')),
  ),
);

const viewport = h('div', { class: 'panel-viewport' }, panel);
const canvas = h('canvas', { id: 'view' });
const coach = createCoach();

const iasEl = h('strong');
const gsEl = h('strong');
const altEl = h('strong');
const vsEl = h('strong');
const hdgEl = h('strong');
const thrBar = h('i');
const flag = h('div', { class: 'flag' });
const telem = h('div', { class: 'telem' },
  h('b', {}, 'FLIGHT MODEL'),
  h('div', { class: 'row' }, h('span', {}, 'IAS'), iasEl),
  h('div', { class: 'row' }, h('span', {}, 'GS'), gsEl),
  h('div', { class: 'row' }, h('span', {}, 'ALT'), altEl),
  h('div', { class: 'row' }, h('span', {}, 'VS'), vsEl),
  h('div', { class: 'row' }, h('span', {}, 'HDG'), hdgEl),
  h('div', { class: 'thr' }, thrBar),
  flag,
);

const stage = h('div', { class: 'stage' }, canvas, h('div', { class: 'hud' }, coach, telem));

const busChip = h('span', { class: 'chip' });
const header = h('header', { class: 'topbar' },
  h('div', { class: 'brand' },
    h('div', { class: 'logo' }, h('span', {}, 'AEA'), 'FDM'),
    h('div', {}, h('h1', {}, 'AERO'), h('p', {}, 'In-browser flight model · SkyView, D30, and GTN read the same airdata')),
  ),
  h('div', { class: 'tips' },
    h('span', { class: 'chip' }, 'Runway 36 · KLXT · 8 kt headwind'),
    busChip,
  ),
);

const footer = h('footer', { class: 'notes' },
  h('div', {},
    h('h3', {}, 'One airdata pipe'),
    h('p', {}, 'Attitude, airspeed, altitude, vertical speed, heading, and groundspeed on the SkyView HDX, the D30, and the GTN come from the classical flight model documented in IMPLEMENTATION-MAP.md. The buses, breakers, and boot timers are the AEA panel. This is not MSFS, and the screens are training lookalikes.'),
  ),
  h('div', {},
    h('h3', {}, 'How to fly'),
    h('p', {}, 'Follow the card on the windshield: MASTER, AVIONICS, GPS Direct-To KMKC, brakes off, takeoff, then a left turn onto the magenta course. W/S throttle, B brake, A/D rudder, arrows for bank and pitch, X centers pitch, V toggles the chase camera. Space is still the pilot push-to-talk.'),
  ),
);

const app = document.querySelector<HTMLDivElement>('#app')!;
app.append(header, stage, viewport, h('p', { class: 'fdm-note' }, 'Glass below is the AERO stack. It stays dark until the buses are on.'), deck.el, bay.el, footer);

const view = createView(canvas);
attachStick();
onSessionReset(() => {
  resetColdDark();
  resetStick();
});

function fit() {
  const vw = document.documentElement.clientWidth;
  const stacked = vw < 1100;
  panel.classList.toggle('stacked', stacked);
  const pw = panel.offsetWidth;
  const ph = panel.offsetHeight;
  const s = Math.min(1, (vw - (stacked ? 16 : 32)) / pw);
  panel.style.transform = `scale(${s})`;
  viewport.style.height = `${ph * s}px`;
  viewport.style.width = `${pw * s}px`;
  view.resize();
}
window.addEventListener('resize', fit);
fit();
document.fonts?.ready.then(fit);

const units = [sv, pma, gtn, d30, clock, sw, bay, deck];
const DT = 1 / 120;
let acc = 0;
let last = performance.now();

function pad3(n: number): string {
  return Math.round(n).toString().padStart(3, '0');
}

function frame(now: number) {
  const frameDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  acc += frameDt;
  let n = 0;
  while (acc >= DT && n < 8) {
    acc -= DT;
    n += 1;
    const c = sampleStick(DT);
    c.engineArmed = S.elec.master;
    stepAircraft(aircraft, c, DT);
    writePanelFlight(S.flight, readAirdata(aircraft, c.throttle));
    step(DT);
  }
  if (n === 8) acc = 0;

  const stick = stickSnap();
  const air = readAirdata(aircraft, stick.throttle);
  view.render(frameDt, stick.cockpit, stick.throttle, S.elec.master);
  coach.paint();
  setText(iasEl, `${air.iasKt.toFixed(0)} kt`);
  setText(gsEl, `${air.gsKt.toFixed(0)} kt`);
  setText(altEl, `${Math.round(air.altFt)} ft`);
  setText(vsEl, `${Math.round(air.vsFpm)} fpm`);
  setText(hdgEl, `${pad3(air.hdgDeg)}°`);
  thrBar.style.width = `${Math.round(stick.throttle * 100)}%`;
  setText(flag, stick.brake ? 'PARKING BRAKE SET' : stick.cockpit ? 'COCKPIT VIEW' : 'CHASE VIEW');
  for (const u of units) u.update(frameDt);
  busChip.textContent = `MAIN ${D.mainBus ? 'LIVE' : 'DEAD'} · AVIONICS ${D.avBus ? 'LIVE' : 'DEAD'}`;
  busChip.className = `chip bus ${D.avBus ? 'ok' : D.mainBus ? 'warn' : 'bad'}`;
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

Object.assign(window, {
  __sim: S,
  __fdm: aircraft,
  __air: () => readAirdata(aircraft, stickSnap().throttle),
  __stick: { set: setStick, snap: stickSnap },
  __lesson: () => coach.dataset.phase,
  __seek: seekDemo,
  __reset: sessionReset,
});
