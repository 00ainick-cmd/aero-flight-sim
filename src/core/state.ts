import { PowerUnit } from './unit';
import { createState, readAirdata } from '../fdm/fdm';

const PARKED = readAirdata(createState());

export type Bus = 'MAIN' | 'AVIONICS';
export type BreakerId = 'GPS' | 'COM1' | 'AUDIO' | 'CLOCK' | 'PFD' | 'STBY';

export interface BreakerDef {
  id: BreakerId;
  label: string;
  amps: number;
  bus: Bus;
  feeds: string;
}

/** Breaker labels, ratings and bus assignments as drawn on the AEA class print (sheets 1–3). */
export const BREAKERS: BreakerDef[] = [
  { id: 'GPS', label: 'GPS', amps: 3, bus: 'AVIONICS', feeds: 'GTN 650 aircraft power' },
  { id: 'COM1', label: 'COM 1', amps: 5, bus: 'AVIONICS', feeds: 'GTN 650 COM power' },
  { id: 'AUDIO', label: 'AUDIO', amps: 5, bus: 'AVIONICS', feeds: 'PMA8000G' },
  { id: 'CLOCK', label: 'CLOCK', amps: 2, bus: 'AVIONICS', feeds: 'Chronos CH93' },
  { id: 'PFD', label: 'PFD', amps: 3, bus: 'MAIN', feeds: 'SkyView HDX display' },
  { id: 'STBY', label: 'STBY ATT', amps: 1, bus: 'MAIN', feeds: 'D30 standby' },
];

export type ModuleId = 'hub' | 'adahrs' | 'mag' | 'arinc' | 'gps2020' | 'svbat' | 'config' | 'fan';

export type GtnPage =
  | 'home' | 'map' | 'nav' | 'dto' | 'nrst' | 'msg' | 'sys' | 'comkp' | 'navkp' | 'fpl'
  | 'traffic' | 'terrain' | 'wx' | 'util';

export interface GtnMessage {
  id: string;
  text: string;
  read: boolean;
}

export interface DirectTo {
  ident: string;
  name: string;
  lat: number;
  lon: number;
  oLat: number;
  oLon: number;
  dtk: number;
}

export type PmaKey =
  | 'COM1' | 'COM2' | 'NAV1' | 'NAV2' | 'MKR' | 'ADF' | 'AUX' | 'SPR' | 'MUSIC' | 'HRTF' | 'MUTE';

export type SvLayout = 'pfd' | 'split';
export type HsiSource = 'GPS1' | 'NAV1';

export const S = {
  t: 0,

  elec: {
    master: false,
    avionics: false,
    breakers: { GPS: true, COM1: true, AUDIO: true, CLOCK: true, PFD: true, STBY: true } as Record<BreakerId, boolean>,
    mainV: 0,
    avV: 0,
    dimmer: 0.7,
  },

  modules: {
    hub: true, adahrs: true, mag: true, arinc: true, gps2020: true, svbat: true, config: true, fan: true,
  } as Record<ModuleId, boolean>,

  flight: {
    lat: PARKED.lat,
    lon: PARKED.lon,
    hdg: PARKED.hdgDeg,
    trk: PARKED.trkDeg,
    pitch: PARKED.pitchDeg,
    roll: PARKED.rollDeg,
    ias: PARKED.iasKt,
    tas: PARKED.tasKt,
    gs: PARKED.gsKt,
    alt: PARKED.altFt,
    vs: PARKED.vsFpm,
    slip: PARKED.slip,
    oat: PARKED.oatC,
    windDir: PARKED.windDir,
    windSpd: PARKED.windSpdKt,
  },

  ptt: { pilot: false, copilot: false },

  gtn: {
    unit: new PowerUnit(3.5),
    ready: false,
    page: 'home' as GtnPage,
    back: [] as GtnPage[],
    com: { act: 123075, stby: 124600, vol: 0.65, sq: true },
    nav: { act: 112600, stby: 114000, vol: 0.5, ident: false },
    focus: 'com' as 'com' | 'nav',
    kp: '',
    dto: null as DirectTo | null,
    dtoEntry: 'KMKC',
    dtoTab: 'wpt' as 'wpt' | 'nrst',
    cdi: 'GPS' as 'GPS' | 'VLOC',
    gpsFixT: 0,
    messages: [] as GtnMessage[],
    mapRange: 10,
    popup: { t: 0, text: '', v: 0 },
    txTime: 0,
    stuck: false,
    wasOn: false,
  },

  pma: {
    unit: new PowerUnit(0.6),
    knobOn: true,
    rx: { COM1: true, COM2: false, NAV1: false, NAV2: false, MKR: false, ADF: false, AUX: false, SPR: false, MUSIC: false, HRTF: true, MUTE: false } as Record<PmaKey, boolean>,
    mic: 'COM1' as 'COM1' | 'COM2',
    split: false,
    lastMic1: -10,
    ics: 'CREW' as 'ISO' | 'ALL' | 'CREW',
    icsVol: 0.6,
    paxVol: 0.5,
    mkrTest: false,
    playT: 0,
  },

  sv: {
    unit: new PowerUnit(4),
    layout: 'split' as SvLayout,
    hsi: 'GPS1' as HsiSource,
    hdgBug: 360,
    crs: 360,
    altBug: 2500,
    baro: 29.92,
    leftMode: 'HDG' as 'HDG' | 'CRS',
    rightMode: 'BARO' as 'BARO' | 'ALT',
    overlay: null as null | 'net' | 'bat',
    onBattery: false,
    shutdown: false,
    adahrsT: 0,
    gpsT: 0,
    battT: 0,
    mapRange: 10,
  },

  svbat: { charge: 1 },

  d30: {
    unit: new PowerUnit(3),
    manualOff: false,
    onBattery: false,
    countdown: 0,
    stayOn: false,
    menu: false,
    baro: 29.92,
    bright: 0.9,
    altT: 0,
    battery: 1,
  },

  clock: {
    unit: new PowerUnit(0.4),
    mode: 0,
    flightS: 0,
    timerS: 0,
    timerRun: false,
    bright: 0.85,
    popT: 0,
    popText: '',
  },

  /** Discrete events for the log strip below the panel. */
  log: [] as { t: number; text: string }[],
};

export type SimState = typeof S;

export function logEvent(text: string) {
  S.log.unshift({ t: S.t, text });
  if (S.log.length > 40) S.log.length = 40;
}
