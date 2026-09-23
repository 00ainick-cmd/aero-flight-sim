import { describe, expect, it } from 'vitest';
import { createState, readAirdata, stepAircraft, type Controls } from '../fdm/fdm';
import { bearingDeg, crossTrackNm, wrap180 } from '../sim/geo';
import { advance, type LessonSnap, type Phase } from './lesson';

const KMKC = { lat: 39.1232, lon: -94.5928 };
const DT = 1 / 120;

function controls(partial: Partial<Controls>): Controls {
  return { elevator: 0, aileron: 0, rudder: 0, throttle: 0, brake: true, engineArmed: true, ...partial };
}

describe('guided first flight is reachable', () => {
  it('rotates, climbs, and can meet the GPS-course gate with keyboard-like inputs', () => {
    const s = createState();
    const steps = (n: number, c: Controls) => {
      for (let i = 0; i < n; i++) stepAircraft(s, c, DT);
    };

    steps(Math.round(20 / DT), controls({ brake: false, throttle: 1 }));
    const rolling = readAirdata(s, 1);
    expect(rolling.iasKt).toBeGreaterThan(50);
    expect(rolling.onGround).toBe(true);
    const origin = { lat: s.lat, lon: s.lon };

    let elevator = 0;
    let lifted = false;
    for (let i = 0; i < 18 / DT; i++) {
      const air = readAirdata(s, 1);
      if (air.onGround && air.iasKt > 58) elevator = Math.min(0.22, elevator + DT * 0.35);
      steps(1, controls({ brake: false, throttle: 1, elevator }));
      if (!readAirdata(s, 1).onGround && readAirdata(s, 1).vsFpm > 80) {
        lifted = true;
        break;
      }
    }
    expect(lifted).toBe(true);

    let established = false;
    for (let i = 0; i < 100 / DT; i++) {
      const air = readAirdata(s, 0.9);
      const dtk = bearingDeg(origin.lat, origin.lon, KMKC.lat, KMKC.lon);
      const err = wrap180(dtk - air.hdgDeg);
      const xtk = crossTrackNm(origin.lat, origin.lon, KMKC.lat, KMKC.lon, air.lat, air.lon);
      const wantBank = Math.max(-12, Math.min(12, err * 0.4));
      const aileron = air.aglFt < 160 ? 0 : Math.max(-0.12, Math.min(0.12, (wantBank - air.rollDeg) * 0.025));
      steps(1, controls({ brake: false, throttle: 0.9, elevator, aileron, rudder: aileron * 0.2 }));
      if (!air.onGround && air.aglFt > 350 && Math.abs(err) < 25 && Math.abs(xtk) < 0.8) {
        established = true;
        break;
      }
    }
    const end = readAirdata(s, 0.9);
    const dtk = bearingDeg(origin.lat, origin.lon, KMKC.lat, KMKC.lon);
    const err = wrap180(dtk - end.hdgDeg);
    const xtk = crossTrackNm(origin.lat, origin.lon, KMKC.lat, KMKC.lon, end.lat, end.lon);
    expect(end.onGround).toBe(false);
    expect(established, `agl ${end.aglFt.toFixed(0)} pitch ${end.pitchDeg.toFixed(1)} hdg ${end.hdgDeg.toFixed(0)} err ${err.toFixed(0)} xtk ${xtk.toFixed(2)}`).toBe(true);
  });

  it('walks the coach phases in order', () => {
    let phase: Phase = 'master';
    const gates: LessonSnap[] = [
      { master: true, avionics: false, adahrs: false, gps: false, dto: false, brake: true, gs: 0, ias: 8, throttle: 0, pitch: 0, agl: 0, onGround: true, xtk: null, hdgErr: null, dtk: null },
      { master: true, avionics: true, adahrs: false, gps: false, dto: false, brake: true, gs: 0, ias: 8, throttle: 0, pitch: 0, agl: 0, onGround: true, xtk: null, hdgErr: null, dtk: null },
      { master: true, avionics: true, adahrs: true, gps: true, dto: false, brake: true, gs: 0, ias: 8, throttle: 0, pitch: 0, agl: 0, onGround: true, xtk: null, hdgErr: null, dtk: null },
      { master: true, avionics: true, adahrs: true, gps: true, dto: true, brake: true, gs: 0, ias: 8, throttle: 0, pitch: 0, agl: 0, onGround: true, xtk: null, hdgErr: null, dtk: 310 },
      { master: true, avionics: true, adahrs: true, gps: true, dto: true, brake: false, gs: 10, ias: 20, throttle: 0.3, pitch: 1, agl: 4, onGround: true, xtk: 0, hdgErr: 40, dtk: 310 },
      { master: true, avionics: true, adahrs: true, gps: true, dto: true, brake: false, gs: 55, ias: 62, throttle: 1, pitch: 2, agl: 4, onGround: true, xtk: 0.1, hdgErr: 40, dtk: 310 },
      { master: true, avionics: true, adahrs: true, gps: true, dto: true, brake: false, gs: 70, ias: 75, throttle: 1, pitch: 8, agl: 80, onGround: false, xtk: 0.2, hdgErr: 30, dtk: 310 },
      { master: true, avionics: true, adahrs: true, gps: true, dto: true, brake: false, gs: 90, ias: 95, throttle: 0.7, pitch: 6, agl: 500, onGround: false, xtk: 0.3, hdgErr: 8, dtk: 310 },
    ];
    const seen = gates.map((g) => (phase = advance(phase, g)));
    expect(seen).toEqual(['avionics', 'align', 'course', 'taxi', 'power', 'rotate', 'enroute', 'done']);
  });
});
