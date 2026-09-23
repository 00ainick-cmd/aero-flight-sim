import { h } from '../core/dom';
import { S } from '../core/state';
import { readAirdata } from '../fdm/fdm';
import { stickSnap } from '../input/stick';
import { armDirectTo } from '../sim/course';
import { D } from '../sim/step';
import { aircraft, onSessionReset } from '../sim/session';
import { advance, coachCopy, headingError, type Phase } from './lesson';

let phase: Phase = 'master';
let lastHot = '';
let lastBody = '';

export function lessonPhase(): Phase {
  return phase;
}

export function forcePhase(next: Phase): void {
  phase = next;
  lastHot = '';
  lastBody = '';
}

export function createCoach(): HTMLElement & { paint: () => void } {
  const kicker = h('div', { class: 'coach-kicker' });
  const title = h('h2');
  const body = h('p');
  const arm = h('button', { class: 'coach-arm', type: 'button' }, 'Arm Direct-To KMKC');
  arm.addEventListener('click', () => armDirectTo('KMKC'));
  const keys = h('div', { class: 'coach-keys' },
    h('span', {}, 'W S throttle'),
    h('span', {}, 'B brake'),
    h('span', {}, 'A D rudder'),
    h('span', {}, '← → bank'),
    h('span', {}, '↑ ↓ pitch'),
    h('span', {}, 'X center pitch'),
    h('span', {}, 'V view'),
  );
  const card = h('aside', { class: 'coach', id: 'coach' }, kicker, title, body, arm, keys);

  onSessionReset(() => {
    phase = 'master';
    lastHot = '';
    lastBody = '';
  });

  function paint() {
    const air = readAirdata(aircraft, stickSnap().throttle);
    const stick = stickSnap();
    const dtk = S.gtn.dto && D.nav.valid ? D.nav.dtk : S.gtn.dto?.dtk ?? null;
    const snap = {
      master: S.elec.master,
      avionics: S.elec.avionics,
      adahrs: D.adahrsOK,
      gps: D.gtnGps,
      dto: !!S.gtn.dto,
      brake: stick.brake,
      gs: air.gsKt,
      ias: air.iasKt,
      throttle: stick.throttle,
      pitch: air.pitchDeg,
      agl: air.aglFt - 1.25 / 0.3048,
      onGround: air.onGround,
      xtk: D.nav.valid ? D.nav.xtk : null,
      hdgErr: dtk === null ? null : headingError(dtk, air.hdgDeg),
      dtk,
    };
    // aglFt includes the CG height (~4 ft). The lesson uses height above the field minus that sit.
    phase = advance(phase, snap);
    const copy = coachCopy(phase, snap);
    kicker.textContent = copy.kicker;
    title.textContent = copy.title;
    if (copy.body !== lastBody) {
      body.textContent = copy.body;
      lastBody = copy.body;
    }
    arm.hidden = phase !== 'course';
    card.dataset.phase = phase;
    card.classList.toggle('is-done', phase === 'done');
    if (copy.hot !== lastHot) {
      lastHot = copy.hot ?? '';
      document.querySelectorAll<HTMLElement>('[data-coach]').forEach((el) => {
        el.classList.toggle('coach-hot', !!copy.hot && el.dataset.coach === copy.hot);
      });
      if (copy.hot) {
        document.querySelector<HTMLElement>(`[data-coach="${copy.hot}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  return Object.assign(card, { paint });
}
