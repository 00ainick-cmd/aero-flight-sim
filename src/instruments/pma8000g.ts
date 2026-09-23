import { S, logEvent, type PmaKey } from '../core/state';
import { cls, h, pressable, screw } from '../core/dom';
import { createKnob } from '../core/knob';
import { D } from '../sim/step';

const p = S.pma;

interface Btn { el: HTMLElement; lit: () => boolean }

export function createPma8000g() {
  const buttons: Btn[] = [];

  const mkBtn = (label: string, sub: string, lit: () => boolean, onPress: () => void, opts: { onHold?: () => void; onRelease?: () => void; title?: string } = {}) => {
    const el = h('button', { class: 'pma-btn', title: opts.title ?? label }, h('i', { class: 'led' }), h('span', { class: 'l1' }, label), sub ? h('span', { class: 'l2' }, sub) : null);
    pressable(el, { onPress: () => { if (D.pmaOn) onPress(); }, onHold: opts.onHold ? () => { if (D.pmaOn) opts.onHold!(); } : undefined, onRelease: opts.onRelease, holdMs: 700 });
    buttons.push({ el, lit });
    return el;
  };

  const rxToggle = (k: PmaKey) => () => {
    if ((k === 'COM1' || k === 'COM2') && p.mic === k && !p.split) return;
    p.rx[k] = !p.rx[k];
  };

  const selectMic = (c: 'COM1' | 'COM2') => () => {
    const now = S.t;
    if (c === 'COM2' && p.mic === 'COM1' && now - p.lastMic1 < 0.8) {
      p.split = !p.split;
      p.rx.COM2 = true;
      logEvent(`PMA8000G: split mode ${p.split ? 'ON — pilot COM 1 / copilot COM 2' : 'OFF'}`);
      return;
    }
    if (c === 'COM1') p.lastMic1 = now;
    p.split = false;
    p.mic = c;
    p.rx[c] = true;
    logEvent(`PMA8000G: transmit select ${c === 'COM1' ? 'COM 1' : 'COM 2'}`);
  };

  const top = h('div', { class: 'pma-row' },
    mkBtn('COM 1', '', () => p.rx.COM1, rxToggle('COM1'), { title: 'COM 1 receive' }),
    mkBtn('COM 2', '', () => p.rx.COM2, rxToggle('COM2'), { title: 'COM 2 receive' }),
    mkBtn('NAV 1', '', () => p.rx.NAV1, rxToggle('NAV1')),
    mkBtn('NAV 2', '', () => p.rx.NAV2, rxToggle('NAV2')),
    mkBtn('MKR', 'MUTE', () => p.rx.MKR, rxToggle('MKR'), {
      title: 'Marker audio — hold for lamp test',
      onHold: () => { p.mkrTest = true; },
      onRelease: () => { p.mkrTest = false; },
    }),
    mkBtn('ADF', '', () => p.rx.ADF, rxToggle('ADF')),
    mkBtn('AUX', '', () => p.rx.AUX, rxToggle('AUX')),
    mkBtn('SPR', '', () => p.rx.SPR, rxToggle('SPR'), { title: 'Cabin speaker' }),
  );

  const icsLeds = h('div', { class: 'ics-leds' },
    h('span', { 'data-m': 'ISO' }, 'ISO'), h('span', { 'data-m': 'ALL' }, 'ALL'), h('span', { 'data-m': 'CREW' }, 'CREW'));

  const bottom = h('div', { class: 'pma-row' },
    mkBtn('COM 1', 'MIC', () => p.mic === 'COM1' || p.split, selectMic('COM1'), { title: 'COM 1 transmit (tap COM 2 MIC right after for split mode)' }),
    mkBtn('COM 2', 'MIC', () => p.mic === 'COM2' || p.split, selectMic('COM2'), { title: 'COM 2 transmit' }),
    mkBtn('ICS', '', () => false, () => {
      p.ics = p.ics === 'ISO' ? 'ALL' : p.ics === 'ALL' ? 'CREW' : 'ISO';
      logEvent(`PMA8000G: intercom mode ${p.ics}`);
    }, { title: 'Intercom mode ISO / ALL / CREW' }),
    icsLeds,
    mkBtn('MUSIC', '', () => p.rx.MUSIC, rxToggle('MUSIC')),
    mkBtn('PLAY', '', () => p.playT > 0, () => { p.playT = 4; logEvent('PMA8000G: flightmate® playback of last COM reception'); }),
    mkBtn('HRTF', '', () => p.rx.HRTF, rxToggle('HRTF'), { title: 'IntelliAudio® spatial audio' }),
    mkBtn('MUTE', '', () => p.rx.MUTE, rxToggle('MUTE'), { title: 'SoftMute' }),
  );

  const lamp = (c: string, l: string) => h('div', { class: `mkr-lamp ${c}` }, h('span', {}, l));
  const lamps = [lamp('o', 'O'), lamp('m', 'M'), lamp('i', 'I')];

  const knob = createKnob({
    size: 58,
    inner: 0.6,
    title: 'Inner: pilot/copilot ICS volume · Outer: passenger volume · Tap center: power ON/OFF',
    onInner: (d) => { p.icsVol = Math.max(0, Math.min(1, p.icsVol + d * 0.05)); },
    onOuter: (d) => { p.paxVol = Math.max(0, Math.min(1, p.paxVol + d * 0.05)); },
    onPush: () => {
      p.knobOn = !p.knobOn;
      if (!p.knobOn) logEvent('PMA8000G: volume knob pushed OFF');
    },
  });

  const volBar = h('div', { class: 'pma-vol' }, h('i', { class: 'a' }), h('i', { class: 'b' }));
  const bt = h('div', { class: 'pma-bt', title: 'Bluetooth' }, '✱');
  const failsafe = h('div', { class: 'pma-failsafe' }, 'FAIL-SAFE · PILOT ↔ COM 1');

  const el = h('div', { class: 'pma bezel' },
    screw('tl'), screw('tr'), screw('bl'), screw('br'),
    h('div', { class: 'pma-left' }, h('div', { class: 'mkr' }, ...lamps), h('div', { class: 'usb' }, h('i'), h('span', {}, 'USB'))),
    h('div', { class: 'pma-mid' }, top, bottom),
    h('div', { class: 'pma-right' }, h('div', { class: 'pma-brand' }, 'PS ENGINEERING', h('b', {}, 'PMA8000G')), knob, h('div', { class: 'pma-pwr' }, 'PUSH ⏻'), volBar, bt),
    failsafe,
  );

  function update() {
    const on = p.unit.on;
    cls(el, 'powered', on);
    cls(el, 'off-knob', !p.knobOn);
    el.style.setProperty('--dim', String(0.35 + S.elec.dimmer * 0.65));
    for (const b of buttons) cls(b.el, 'lit', on && b.lit());
    cls(bottom.children[2] as HTMLElement, 'lit', on);
    icsLeds.querySelectorAll('span').forEach((s) => cls(s, 'on', on && s.dataset.m === p.ics));
    const test = on && p.mkrTest;
    lamps.forEach((l) => cls(l, 'on', test));
    (volBar.children[0] as HTMLElement).style.width = `${p.icsVol * 100}%`;
    (volBar.children[1] as HTMLElement).style.width = `${p.paxVol * 100}%`;
    cls(bt, 'on', on && p.rx.MUSIC && Math.floor(S.t * 1.5) % 2 === 0);
    cls(failsafe, 'show', !on);
  }

  return { el, update };
}
