import { S, logEvent } from '../core/state';
import { cls, h, pressable, setHTML, setText } from '../core/dom';
import { readAirdata } from '../fdm/fdm';
import { stickSnap } from '../input/stick';
import { aircraft, sessionReset } from '../sim/session';
import { D } from '../sim/step';

export function createDeck() {
  const pttP = h('button', { class: 'ptt', title: 'Pilot push-to-talk (hold, or hold Space)' }, h('span', {}, 'PTT'), h('small', {}, 'PILOT · SPACE'));
  const pttC = h('button', { class: 'ptt co', title: 'Copilot push-to-talk (hold, or hold C)' }, h('span', {}, 'PTT'), h('small', {}, 'COPILOT · C'));
  const setPtt = (who: 'pilot' | 'copilot', v: boolean) => {
    if (S.ptt[who] === v) return;
    S.ptt[who] = v;
    if (v) logEvent(`${who === 'pilot' ? 'Pilot' : 'Copilot'} PTT pressed`);
  };
  pressable(pttP, { pressOnDown: true, onPress: () => setPtt('pilot', true), onRelease: () => setPtt('pilot', false) });
  pressable(pttC, { pressOnDown: true, onPress: () => setPtt('copilot', true), onRelease: () => setPtt('copilot', false) });
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space') { e.preventDefault(); setPtt('pilot', true); }
    if (e.code === 'KeyC') setPtt('copilot', true);
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') setPtt('pilot', false);
    if (e.code === 'KeyC') setPtt('copilot', false);
  });
  window.addEventListener('blur', () => { setPtt('pilot', false); setPtt('copilot', false); });

  const txLamp = h('div', { class: 'txlamp' }, 'TX');
  const micP = h('div', { class: 'mic' });
  const micC = h('div', { class: 'mic' });
  const hearsP = h('ul', { class: 'hears' });
  const hearsC = h('ul', { class: 'hears' });
  const note = h('div', { class: 'tx-note' });
  const mode = h('div', { class: 'pma-mode' });

  const resetBtn = h('button', { class: 'seg', type: 'button' }, 'Reset cold and dark');
  pressable(resetBtn, { onPress: () => sessionReset() });
  const flightNote = h('div', { class: 'pilot-note' });
  const flightNums = h('div', { class: 'pilot-note' });

  const log = h('ol', { class: 'log' });

  const el = h('section', { class: 'deck' },
    h('div', { class: 'card yoke' },
      h('h3', {}, 'Yoke'),
      h('div', { class: 'ptts' }, pttP, pttC, txLamp),
      note,
    ),
    h('div', { class: 'card headset' },
      h('h3', {}, 'Headset audio', mode),
      h('div', { class: 'hs-cols' },
        h('div', {}, h('div', { class: 'hs-who' }, 'Pilot'), micP, hearsP),
        h('div', {}, h('div', { class: 'hs-who' }, 'Copilot'), micC, hearsC),
      ),
    ),
    h('div', { class: 'card scenario' },
      h('h3', {}, 'Flight model'),
      flightNums,
      flightNote,
      h('div', { class: 'segs' }, resetBtn),
    ),
    h('div', { class: 'card events' }, h('h3', {}, 'Event log'), log),
  );

  let lastLog = -1;
  function update() {
    cls(pttP, 'down', S.ptt.pilot);
    cls(pttC, 'down', S.ptt.copilot);
    cls(txLamp, 'on', D.tx);
    setText(note, D.tx ? `Transmitting on COM 1 ${(S.gtn.com.act / 1000).toFixed(3)} — GTN annunciates TX` : D.txBlocked || 'Hold PTT to key the selected transmitter.');
    cls(note, 'warn', !!D.txBlocked);

    setText(mode, D.pmaOn ? `PMA8000G on · ICS ${S.pma.ics}${S.pma.split ? ' · SPLIT' : ''}` : 'PMA8000G OFF · FAIL-SAFE');
    cls(mode, 'warn', !D.pmaOn);
    setText(micP, `Mic → ${D.pilotMic === 'COM1' ? 'COM 1' : 'COM 2'}${D.failsafe ? ' (hard-wired)' : ''}`);
    setText(micC, D.copilotMic ? `Mic → ${D.copilotMic === 'COM1' ? 'COM 1' : 'COM 2'}` : 'Mic → nothing');
    setHTML(hearsP, D.pilotHears.map((x) => `<li class="${/no power|not installed/.test(x) ? 'x' : ''}">${x}</li>`).join(''));
    setHTML(hearsC, D.copilotHears.map((x) => `<li class="${/no power|not installed|no audio/.test(x) ? 'x' : ''}">${x}</li>`).join(''));

    const air = readAirdata(aircraft, stickSnap().throttle);
    const stick = stickSnap();
    setText(flightNums, `IAS ${air.iasKt.toFixed(0)}  GS ${air.gsKt.toFixed(0)}  ALT ${Math.round(air.altFt)}  VS ${Math.round(air.vsFpm)}  HDG ${Math.round(air.hdgDeg).toString().padStart(3, '0')}`);
    const where = air.onGround ? 'on the runway' : 'airborne';
    const dto = S.gtn.dto;
    setText(flightNote, `AERO is ${where}. Throttle ${Math.round(stick.throttle * 100)}% · parking brake ${stick.brake ? 'SET' : 'off'}.${dto ? ` GPS D→ ${dto.ident}.` : ''} Tapes read this state.`);

    if (S.log.length && S.log[0].t !== lastLog) {
      lastLog = S.log[0].t;
      setHTML(log, S.log.slice(0, 14).map((e) => {
        const m = Math.floor(e.t / 60);
        const s = Math.floor(e.t % 60);
        return `<li><time>${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}</time>${e.text}</li>`;
      }).join(''));
    }
  }
  return { el, update };
}
