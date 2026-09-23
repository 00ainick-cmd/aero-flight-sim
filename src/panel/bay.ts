import { S, logEvent, type ModuleId } from '../core/state';
import { cls, h, pressable, setText } from '../core/dom';
import { D } from '../sim/step';

interface Plate {
  id: ModuleId;
  name: string;
  pn: string;
  link: string;
  power: string;
  pwr: () => boolean;
  data: () => boolean;
  status: () => string;
}

const svLit = () => S.sv.unit.lit;
const gtnLit = () => S.gtn.unit.lit;

const PLATES: Plate[] = [
  { id: 'hub', name: 'Network Hub', pn: 'SV-NET-HUB', link: 'SkyView Network · 5 ports', power: 'via SkyView Network',
    pwr: () => svLit() && S.modules.hub, data: () => D.netOn,
    status: () => (!S.modules.hub ? 'UNPLUGGED' : D.netOn ? `${['adahrs', 'mag', 'arinc'].filter((m) => S.modules[m as ModuleId]).length + 1} of 5 ports used` : 'no network power') },
  { id: 'adahrs', name: 'ADAHRS', pn: 'SV-ADAHRS-200', link: 'SkyView Network', power: 'via SkyView Network',
    pwr: () => svLit() && S.modules.hub && S.modules.adahrs, data: () => D.adahrsOK,
    status: () => (!S.modules.adahrs ? 'UNPLUGGED' : D.adahrsOK ? 'attitude · air data' : D.netOn && S.modules.hub ? 'aligning…' : 'offline') },
  { id: 'mag', name: 'Magnetometer', pn: 'SV-MAG-236', link: 'SkyView Network', power: 'via SkyView Network',
    pwr: () => svLit() && S.modules.hub && S.modules.mag, data: () => D.magOK,
    status: () => (!S.modules.mag ? 'UNPLUGGED' : D.magOK ? 'heading' : 'offline') },
  { id: 'arinc', name: 'ARINC Adapter', pn: 'SV-ARINC-429', link: 'Network ⇄ ARINC 429 / RS-232 ⇄ GTN', power: 'via SkyView Network',
    pwr: () => svLit() && S.modules.hub && S.modules.arinc, data: () => D.arincRx,
    status: () => (!S.modules.arinc ? 'UNPLUGGED' : !D.arincMod ? 'offline' : D.arincRx ? 'RX GPS#/NAV# · TX EFIS' : 'no data from GTN') },
  { id: 'gps2020', name: 'GPS Receiver', pn: 'SV-GPS-2020', link: 'RS-232 · display Serial 5', power: '8 VDC GPS PWR from display',
    pwr: () => svLit() && S.modules.gps2020, data: () => D.svGps,
    status: () => (!S.modules.gps2020 ? 'UNPLUGGED' : D.svGps ? '3D fix' : svLit() ? 'acquiring…' : 'unpowered') },
  { id: 'svbat', name: 'Backup Battery', pn: 'SV-BAT-320', link: 'Display battery connector', power: 'charges from display',
    pwr: () => S.modules.svbat && S.svbat.charge > 0, data: () => S.sv.onBattery,
    status: () => (!S.modules.svbat ? 'UNPLUGGED' : `${Math.round(S.svbat.charge * 100)}% · ${S.sv.onBattery ? 'DISCHARGING' : D.svShip && S.svbat.charge < 0.999 ? 'charging' : 'standby'}`) },
  { id: 'config', name: 'Config Module', pn: 'GTN config module', link: 'GTN config data/clock', power: 'GTN config module power',
    pwr: () => gtnLit() && S.modules.config, data: () => D.gtnOn && S.modules.config,
    status: () => (!S.modules.config ? 'UNPLUGGED' : gtnLit() ? 'install config stored' : 'unpowered') },
  { id: 'fan', name: 'Cooling Fan', pn: 'GTN rack fan', link: 'Fan tach → GTN', power: 'GTN fan power out (12 VDC)',
    pwr: () => gtnLit() && S.modules.fan, data: () => gtnLit() && S.modules.fan,
    status: () => (!S.modules.fan ? 'UNPLUGGED' : gtnLit() ? 'running' : 'stopped') },
];

export function createBay() {
  const rows = PLATES.map((p) => {
    const pwr = h('i', { class: 'led pwr', title: 'Power' });
    const dat = h('i', { class: 'led dat', title: 'Data / activity' });
    const st = h('div', { class: 'pl-status' });
    const plug = h('button', { class: 'pl-plug' });
    pressable(plug, { onPress: () => {
      S.modules[p.id] = !S.modules[p.id];
      logEvent(`${p.pn}: ${S.modules[p.id] ? 'reconnected' : 'UNPLUGGED'}`);
    } });
    const fan = p.id === 'fan' ? h('div', { class: 'fan-rotor' }) : null;
    const bat = p.id === 'svbat' ? h('div', { class: 'bat-bar' }, h('i')) : null;
    const el = h('div', { class: `plate pl-${p.id}` },
      h('div', { class: 'pl-head' }, h('div', { class: 'pl-leds' }, pwr, dat), h('div', { class: 'pl-name' }, p.pn), fan),
      h('div', { class: 'pl-sub' }, p.name),
      h('div', { class: 'pl-link' }, p.link),
      h('div', { class: 'pl-link dim' }, `Power: ${p.power}`),
      bat, st, plug,
    );
    return { p, el, pwr, dat, st, plug, fan, bat };
  });

  const el = h('section', { class: 'bay' },
    h('header', { class: 'bay-head' }, h('h2', {}, 'Behind the panel'), h('p', {}, 'Remote LRUs from the print. No faceplates — status LEDs only. Unplug one to see what the glass does.')),
    h('div', { class: 'bay-grid' }, ...rows.map((r) => r.el)),
  );

  function update() {
    for (const r of rows) {
      const on = r.p.pwr();
      cls(r.pwr, 'on', on);
      cls(r.dat, 'on', on && r.p.data() && (r.p.id === 'svbat' || Math.floor(S.t * 6 + r.p.id.length) % 3 !== 0));
      cls(r.el, 'unplugged', !S.modules[r.p.id]);
      setText(r.st, r.p.status());
      setText(r.plug, S.modules[r.p.id] ? 'Unplug' : 'Reconnect');
      if (r.fan) cls(r.fan, 'spin', on);
      if (r.bat) (r.bat.firstChild as HTMLElement).style.width = `${S.svbat.charge * 100}%`;
    }
  }
  return { el, update };
}
