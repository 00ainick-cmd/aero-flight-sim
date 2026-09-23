import { BREAKERS, S, logEvent } from '../core/state';
import { cls, h, pressable, screw, setText } from '../core/dom';
import { createKnob } from '../core/knob';

function rocker(label: string, sub: string, get: () => boolean, set: (v: boolean) => void, red = false) {
  const sw = h('button', { class: `rocker ${red ? 'red' : ''}`, title: `${label} — click to toggle` }, h('span', { class: 'on' }, 'ON'), h('span', { class: 'off' }, 'OFF'));
  sw.dataset.coach = label === 'MASTER' ? 'master' : 'avionics';
  pressable(sw, { onPress: () => set(!get()) });
  const wrap = h('div', { class: 'rocker-wrap' }, h('div', { class: 'plac' }, label), sw, h('div', { class: 'plac sub' }, sub));
  return { wrap, sw, get };
}

export function createSwitchPanel() {
  const master = rocker('MASTER', 'MAIN BUS', () => S.elec.master, (v) => {
    S.elec.master = v;
    logEvent(v ? 'MASTER ON — main bus energized' : 'MASTER OFF — main bus and avionics bus dead');
  }, true);
  const avionics = rocker('AVIONICS', 'AVIONICS BUS', () => S.elec.avionics, (v) => {
    S.elec.avionics = v;
    logEvent(v ? 'AVIONICS ON — avionics bus energized' : 'AVIONICS OFF — avionics bus dead');
  });

  const vMain = h('b');
  const vAv = h('b');
  const meter = h('div', { class: 'vmeter' }, h('div', {}, h('span', {}, 'MAIN'), vMain), h('div', {}, h('span', {}, 'AVNX'), vAv));

  const dimKnob = createKnob({
    size: 46,
    title: 'Panel lighting dimmer — click sides or scroll',
    onOuter: (d) => { S.elec.dimmer = Math.max(0, Math.min(1, S.elec.dimmer + d * 0.1)); },
  });

  const cbs = BREAKERS.map((b) => {
    const btn = h('button', { class: 'cb', title: `${b.label} ${b.amps} A — ${b.feeds} (${b.bus.toLowerCase()} bus). Click to pull / reset.` },
      h('span', { class: 'cb-collar' }), h('span', { class: 'cb-stem' }), h('span', { class: 'cb-cap' }, String(b.amps)));
    pressable(btn, { onPress: () => {
      S.elec.breakers[b.id] = !S.elec.breakers[b.id];
      logEvent(`${b.label} breaker ${S.elec.breakers[b.id] ? 'reset (in)' : 'PULLED'} — ${b.feeds}`);
    } });
    return { b, btn, el: h('div', { class: 'cb-wrap' }, h('div', { class: 'plac' }, b.label), btn) };
  });

  const group = (bus: 'AVIONICS' | 'MAIN') =>
    h('div', { class: 'cb-group' }, h('div', { class: 'cb-bus' }, `${bus} BUS`), h('div', { class: 'cb-row' }, ...cbs.filter((c) => c.b.bus === bus).map((c) => c.el)));

  const el = h('div', { class: 'subpanel' },
    screw('tl'), screw('tr'), screw('bl'), screw('br'),
    h('div', { class: 'sp-top' },
      master.wrap, avionics.wrap, meter,
      h('div', { class: 'rocker-wrap' }, h('div', { class: 'plac' }, 'PANEL LT'), dimKnob, h('div', { class: 'plac sub' }, 'DIM')),
    ),
    h('div', { class: 'sp-cbs' }, group('AVIONICS'), group('MAIN')),
  );

  function update() {
    cls(master.sw, 'is-on', S.elec.master);
    cls(avionics.sw, 'is-on', S.elec.avionics);
    setText(vMain, `${S.elec.mainV.toFixed(1)}V`);
    setText(vAv, `${S.elec.avV.toFixed(1)}V`);
    cls(meter, 'dark', S.elec.mainV < 1);
    for (const c of cbs) cls(c.btn, 'popped', !S.elec.breakers[c.b.id]);
    document.documentElement.style.setProperty('--panel-lt', String(S.elec.mainV > 10 ? S.elec.dimmer : 0));
  }
  return { el, update };
}
