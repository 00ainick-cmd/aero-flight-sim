import { S, logEvent } from '../core/state';
import { cls, h, pressable, setHTML } from '../core/dom';
import { sevenSegSvg } from './sevenseg';

const c = S.clock;
const MODES = ['LOCAL', 'UTC', 'FLIGHT', 'TIMER', 'VOLTS', 'OAT'] as const;

const two = (n: number) => String(Math.floor(n)).padStart(2, '0');
const hms = (s: number) => `${two(s / 3600)}:${two((s % 3600) / 60)}:${two(s % 60)}`;

function pop(text: string) {
  c.popT = 1.2;
  c.popText = text;
}

function dim(dir: 1 | -1) {
  c.bright = Math.max(0.15, Math.min(1, c.bright + dir * 0.15));
  pop(`dIM ${Math.round(c.bright * 6)}`);
}

export function createChronos() {
  const display = h('div', { class: 'ch-digits' });
  const ann = h('div', { class: 'ch-ann' },
    ...['UTC', 'FLT', 'TMR', 'VOLTS', 'OAT'].map((t) => h('span', { 'data-a': t }, t)));

  const mk = (label: string, fn: () => void, title: string) => {
    const b = h('button', { class: 'ch-btn', title }, h('span', {}, label));
    pressable(b, { onPress: () => { if (c.unit.on) fn(); } });
    return b;
  };

  const modeBtn = mk('MODE', () => {
    c.mode = (c.mode + 1) % MODES.length;
    logEvent(`Chronos CH93: mode ${MODES[c.mode]}`);
  }, 'Cycle Local → UTC → Flight → Timer → Volts → OAT');
  const plus = mk('+', () => {
    if (MODES[c.mode] === 'TIMER') { c.timerRun = !c.timerRun; pop(c.timerRun ? 'Strt' : 'StOP'); }
    else dim(1);
  }, 'Timer: start/stop · other modes: brighter');
  const minus = mk('−', () => {
    const m = MODES[c.mode];
    if (m === 'TIMER') { if (!c.timerRun) { c.timerS = 0; pop('rESEt'); } }
    else if (m === 'FLIGHT') { c.flightS = 0; pop('rESEt'); }
    else dim(-1);
  }, 'Timer/Flight: reset · other modes: dimmer');

  const el = h('div', { class: 'chronos' },
    h('div', { class: 'ch-ring' }),
    h('div', { class: 'ch-face' },
      h('div', { class: 'ch-brand' }, 'CHRONOS'),
      h('div', { class: 'ch-window' }, display, ann),
      h('div', { class: 'ch-btns' }, modeBtn, plus, minus),
      h('div', { class: 'ch-mfr' }, 'MID-CONTINENT · CH93'),
    ),
  );

  function update() {
    const lit = c.unit.lit;
    cls(el, 'powered', lit);
    el.style.setProperty('--ch-bright', String(c.bright));
    if (!lit) {
      setHTML(display, sevenSegSvg('      ', 6));
      ann.querySelectorAll('span').forEach((s) => cls(s, 'on', false));
      return;
    }
    const m = MODES[c.mode];
    const now = new Date();
    let txt = '';
    if (c.popT > 0) txt = c.popText.padStart(6, ' ');
    else if (m === 'LOCAL') txt = `${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`;
    else if (m === 'UTC') txt = `${two(now.getUTCHours())}:${two(now.getUTCMinutes())}:${two(now.getUTCSeconds())}`;
    else if (m === 'FLIGHT') txt = hms(c.flightS);
    else if (m === 'TIMER') txt = hms(c.timerS);
    else if (m === 'VOLTS') txt = `${S.elec.avV.toFixed(1)} `.padStart(6, ' ');
    else txt = `${Math.round(S.flight.oat)}°C`.padStart(6, ' ');
    if (c.unit.state === 'boot') txt = '888888';
    setHTML(display, sevenSegSvg(txt, 6));
    const a = { UTC: m === 'UTC', FLT: m === 'FLIGHT', TMR: m === 'TIMER', VOLTS: m === 'VOLTS', OAT: m === 'OAT' } as Record<string, boolean>;
    ann.querySelectorAll('span').forEach((s) => cls(s, 'on', c.unit.on && a[s.dataset.a!]));
  }
  return { el, update };
}
