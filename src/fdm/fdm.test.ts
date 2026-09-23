import { describe, expect, it } from 'vitest';
import { linearCL, surfaceCoeffs } from './aero';
import { WINGS } from './aircraft';
import { createState, readAirdata, stepAircraft, writePanelFlight, type AircraftState, type Controls } from './fdm';
import { eulerFromQuat, quatFromEuler, rotateBodyToNed } from './math';

const DEG = Math.PI / 180;

function hold(partial: Partial<Controls> = {}): Controls {
  return {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    throttle: 0,
    brake: true,
    engineArmed: false,
    ...partial,
  };
}

function run(s: AircraftState, c: Controls, seconds: number, dt = 1 / 120): void {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) stepAircraft(s, c, dt);
}

function finiteState(s: AircraftState): boolean {
  return [s.lat, s.lon, s.alt, s.u, s.v, s.w, s.p, s.pitchRate, s.r, s.q[0], s.q[1], s.q[2], s.q[3]].every(Number.isFinite);
}

describe('attitude', () => {
  it('maps a nose-up pitch to an upward body axis', () => {
    const q = quatFromEuler(0, 10 * DEG, 0);
    const fwd = rotateBodyToNed(q, [1, 0, 0]);
    expect(fwd[2]).toBeLessThan(0);
    const e = eulerFromQuat(q);
    expect(e.pitch / DEG).toBeCloseTo(10, 5);
    expect(e.roll / DEG).toBeCloseTo(0, 5);
    expect(e.yaw / DEG).toBeCloseTo(0, 5);
  });

  it('treats positive roll as right wing down', () => {
    const q = quatFromEuler(20 * DEG, 0, 0);
    const right = rotateBodyToNed(q, [0, 1, 0]);
    expect(right[2]).toBeGreaterThan(0);
    expect(eulerFromQuat(q).roll / DEG).toBeCloseTo(20, 5);
  });
});

describe('Khan–Nahon blend', () => {
  const wing = WINGS[0].aero;

  it('still gains lift with alpha below stall', () => {
    const a = 4 * DEG;
    const lo = surfaceCoeffs(a - 0.002, wing).CL;
    const hi = surfaceCoeffs(a + 0.002, wing).CL;
    expect(hi).toBeGreaterThan(lo);
  });

  it('falls below the linear extrapolation once stalled', () => {
    const a = 30 * DEG;
    const stalled = surfaceCoeffs(a, wing).CL;
    expect(stalled).toBeLessThan(linearCL(a, wing) * 0.6);
    expect(surfaceCoeffs(a, wing).sigma).toBeGreaterThan(0.8);
  });
});

describe('rigid body on the runway', () => {
  it('stays parked with the brake set and the engine disarmed', () => {
    const s = createState();
    const alt0 = s.alt;
    run(s, hold(), 3);
    const air = readAirdata(s);
    expect(finiteState(s)).toBe(true);
    expect(Math.abs(s.alt - alt0)).toBeLessThan(0.4);
    expect(air.gsKt).toBeLessThan(0.5);
    expect(s.onGround).toBe(true);
    expect(air.iasKt).toBeGreaterThan(4);
    expect(air.iasKt).toBeLessThan(14);
  });

  it('accelerates down runway 36 without lifting off or leaving the heading', () => {
    const s = createState();
    run(s, hold({ brake: false, engineArmed: true, throttle: 1 }), 25);
    const air = readAirdata(s, 1);
    expect(finiteState(s)).toBe(true);
    expect(air.iasKt).toBeGreaterThan(55);
    expect(s.onGround).toBe(true);
    const hdgErr = Math.abs(((air.hdgDeg + 540) % 360) - 180);
    expect(hdgErr).toBeLessThan(12);
    expect(air.northM).toBeGreaterThan(200);
  });

  it('rotates when the stick comes back at flying speed', () => {
    const s = createState();
    s.u = 32;
    run(s, hold({ brake: false, engineArmed: true, throttle: 1, elevator: 0.85 }), 3.5);
    const air = readAirdata(s, 1);
    expect(finiteState(s)).toBe(true);
    expect(air.pitchDeg).toBeGreaterThan(5);
  });
});

describe('airborne', () => {
  it('holds a trimmed cruise within a few hundred feet', () => {
    let best = 0;
    let bestScore = Infinity;
    for (let e = -0.4; e <= 0.8; e += 0.05) {
      const s = createState();
      s.alt += 250;
      s.u = 48;
      s.q = quatFromEuler(0, 2 * DEG, 0);
      run(s, hold({ brake: false, engineArmed: true, throttle: 0.62, elevator: e }), 8);
      const air = readAirdata(s);
      if (!finiteState(s)) continue;
      const seedAgl = 250 / 0.3048 + 1.25 / 0.3048;
      const altScore = Math.abs(air.aglFt - seedAgl) + Math.abs(air.vsFpm) * 0.08;
      if (altScore < bestScore && air.iasKt > 60 && air.iasKt < 160) {
        bestScore = altScore;
        best = e;
      }
    }
    expect(bestScore).toBeLessThan(400);

    const s = createState();
    s.alt += 250;
    s.u = 48;
    s.q = quatFromEuler(0, 2 * DEG, 0);
    const startAlt = s.alt;
    run(s, hold({ brake: false, engineArmed: true, throttle: 0.62, elevator: best }), 20);
    const air = readAirdata(s, 0.62);
    expect(finiteState(s)).toBe(true);
    expect(Math.abs(s.alt - startAlt) * 3.28084).toBeLessThan(250);
    expect(air.iasKt).toBeGreaterThan(70);
    expect(air.iasKt).toBeLessThan(150);
  });

  it('rolls right with right aileron', () => {
    const s = createState();
    s.alt += 300;
    s.u = 45;
    run(s, hold({ brake: false, engineArmed: true, throttle: 0.6, aileron: 0.9, elevator: 0.15 }), 1.2);
    const air = readAirdata(s);
    expect(finiteState(s)).toBe(true);
    expect(Math.abs(air.pitchDeg)).toBeLessThan(25);
    expect(air.rollDeg, `roll ${air.rollDeg.toFixed(1)}`).toBeGreaterThan(4);
    expect(air.rollDeg).toBeLessThan(35);
  });
});

describe('airdata pipe', () => {
  it('makes groundspeed lag true airspeed in the headwind, and IAS follows density', () => {
    const s = createState();
    s.alt += 400;
    s.u = 50;
    const air = readAirdata(s);
    expect(air.gsKt).toBeLessThan(air.tasKt - 5);
    const ratio = air.iasKt / air.tasKt;
    expect(ratio).toBeGreaterThan(0.9);
    expect(ratio).toBeLessThan(1);
    expect(air.iasKt).toBeCloseTo(air.tasKt * ratio, 6);
  });

  it('writes the glass fields from the snapshot', () => {
    const s = createState();
    s.u = 40;
    s.alt += 100;
    const air = readAirdata(s, 0.4);
    const panel = {
      lat: 0, lon: 0, hdg: 0, trk: 0, pitch: 0, roll: 0, ias: 0, tas: 0, gs: 0, alt: 0, vs: 0, slip: 0, oat: 0, windDir: 0, windSpd: 0,
    };
    writePanelFlight(panel, air);
    expect(panel.ias).toBeCloseTo(air.iasKt, 6);
    expect(panel.alt).toBeCloseTo(air.altFt, 6);
    expect(panel.pitch).toBeCloseTo(air.pitchDeg, 6);
    expect(panel.hdg).toBeCloseTo(air.hdgDeg, 6);
    expect(panel.vs).toBeCloseTo(air.vsFpm, 6);
    expect(panel.gs).toBeCloseTo(air.gsKt, 6);
    expect(panel.windSpd).toBe(8);
  });
});
