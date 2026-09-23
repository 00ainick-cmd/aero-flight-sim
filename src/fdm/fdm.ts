/**
 * 6-DOF trainer. Equations are the ones in IMPLEMENTATION-MAP.md — this file
 * integrates them. It does not script altitude, airspeed, or attitude.
 */
import { surfaceCoeffs } from './aero';
import {
  AILERON_EFFECT,
  AILERON_MAX,
  FIELD_M,
  HP_W,
  HTAIL,
  IXX,
  IYY,
  IZZ,
  MASS,
  MAX_STEER,
  MU_BRAKE,
  MU_GRASS,
  MU_LAT,
  MU_ROLL,
  PAVEMENT_HALF_M,
  PROP_ETA,
  PROP_V_FLOOR,
  REF_LAT,
  REF_LON,
  START_NORTH_M,
  STEER_FADE_MPS,
  TAILSKID,
  THRUST_POINT,
  THRUST_STATIC,
  VTAIL,
  WHEEL_C,
  WHEEL_K,
  WHEELS,
  WINGS,
} from './aircraft';
import { G, R_EARTH, RHO0, WIND_FROM_DEG, WIND_KT, isa, windNed } from './atmosphere';
import {
  V3,
  eulerFromQuat,
  integrateQuat,
  quatFromEuler,
  rotateBodyToNed,
  rotateNedToBody,
  wrap360,
  type Quat,
  type Vec3,
} from './math';

const DEG = 180 / Math.PI;
const KT = 1 / 0.514444;
const M_TO_FT = 1 / 0.3048;

export interface Controls {
  /** +1 stick back (nose up), −1 stick forward. */
  elevator: number;
  /** +1 stick right. */
  aileron: number;
  /** +1 right pedal. */
  rudder: number;
  /** 0..1 */
  throttle: number;
  brake: boolean;
  /** Main bus live. Cold-and-dark produces no thrust. */
  engineArmed: boolean;
}

export interface AircraftState {
  lat: number;
  lon: number;
  alt: number;
  q: Quat;
  u: number;
  v: number;
  w: number;
  p: number;
  pitchRate: number;
  r: number;
  onGround: boolean;
  /** Lateral specific force, g. Inclinometer, not a noise source. */
  ny: number;
  wheelLoad: number;
}

export interface Airdata {
  lat: number;
  lon: number;
  altFt: number;
  aglFt: number;
  iasKt: number;
  tasKt: number;
  gsKt: number;
  vsFpm: number;
  pitchDeg: number;
  rollDeg: number;
  hdgDeg: number;
  trkDeg: number;
  slip: number;
  oatC: number;
  windDir: number;
  windSpdKt: number;
  onGround: boolean;
  alphaDeg: number;
  northM: number;
  eastM: number;
  throttle: number;
}

export function createState(): AircraftState {
  const lat = REF_LAT + (START_NORTH_M / R_EARTH) * DEG;
  return {
    lat,
    lon: REF_LON,
    alt: FIELD_M + 1.25,
    q: quatFromEuler(0, 0, 0),
    u: 0,
    v: 0,
    w: 0,
    p: 0,
    pitchRate: 0,
    r: 0,
    onGround: true,
    ny: 0,
    wheelLoad: MASS * G,
  };
}

export function resetState(s: AircraftState): void {
  const n = createState();
  s.lat = n.lat;
  s.lon = n.lon;
  s.alt = n.alt;
  s.q[0] = n.q[0];
  s.q[1] = n.q[1];
  s.q[2] = n.q[2];
  s.q[3] = n.q[3];
  s.u = 0;
  s.v = 0;
  s.w = 0;
  s.p = 0;
  s.pitchRate = 0;
  s.r = 0;
  s.onGround = true;
  s.ny = 0;
  s.wheelLoad = n.wheelLoad;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function tire(speed: number, mu: number, fn: number): number {
  const cap = mu * fn;
  const slope = cap / 0.35;
  return clamp(-slope * speed, -cap, cap);
}

export function stepAircraft(s: AircraftState, c: Controls, dt: number): void {
  const atm = isa(s.alt);
  const rho = atm.rho;
  const wind = windNed();
  const windB = rotateNedToBody(s.q, wind);
  const ua = s.u - windB[0];
  const va = s.v - windB[1];
  const wa = s.w - windB[2];

  const elev = clamp(c.elevator, -1, 1);
  const ail = clamp(c.aileron, -1, 1);
  const rud = clamp(c.rudder, -1, 1);
  const thr = clamp(c.throttle, 0, 1);

  let F: Vec3 = [0, 0, 0];
  let M: Vec3 = [0, 0, 0];

  const add = (at: Vec3, force: Vec3) => {
    F = V3.add(F, force);
    M = V3.add(M, V3.cross(at, force));
  };

  const omega: Vec3 = [s.p, s.pitchRate, s.r];

  for (const wing of WINGS) {
    const rot = V3.cross(omega, wing.ac);
    const ul = ua + rot[0];
    const vl = va + rot[1];
    const wl = wa + rot[2];
    const V = Math.hypot(ul, vl, wl);
    if (V < 0.5) continue;
    const aFlow = Math.atan2(wl, ul);
    const beta = Math.atan2(vl, Math.hypot(ul, wl));
    const aCoeff = aFlow - wing.side * AILERON_MAX * AILERON_EFFECT * ail + wing.side * wing.dihedral * beta;
    const { CL, CD } = surfaceCoeffs(aCoeff, wing.aero);
    const qBar = 0.5 * rho * V * V;
    const lift = qBar * wing.S * CL;
    const drag = qBar * wing.S * CD;
    const sa = Math.sin(aFlow);
    const ca = Math.cos(aFlow);
    add(wing.ac, [lift * sa - drag * ca, 0, -lift * ca - drag * sa]);
  }

  {
    const rot = V3.cross(omega, HTAIL.ac);
    const ul = ua + rot[0];
    const vl = va + rot[1];
    const wl = wa + rot[2];
    const V = Math.hypot(ul, vl, wl);
    if (V >= 0.5) {
      const aFlow = Math.atan2(wl, ul);
      const aCoeff = aFlow + HTAIL.incidence - elev * HTAIL.elevatorMax;
      const { CL, CD } = surfaceCoeffs(aCoeff, HTAIL.aero);
      const qBar = 0.5 * rho * V * V;
      const lift = qBar * HTAIL.S * CL;
      const drag = qBar * HTAIL.S * CD;
      const sa = Math.sin(aFlow);
      const ca = Math.cos(aFlow);
      add(HTAIL.ac, [lift * sa - drag * ca, 0, -lift * ca - drag * sa]);
    }
  }

  {
    const rot = V3.cross(omega, VTAIL.ac);
    const ul = ua + rot[0];
    const vl = va + rot[1];
    const wl = wa + rot[2];
    const V = Math.hypot(ul, vl, wl);
    if (V >= 0.5) {
      const beta = Math.atan2(vl, Math.hypot(ul, wl));
      const aCoeff = beta + rud * VTAIL.rudderMax;
      const { CL, CD } = surfaceCoeffs(aCoeff, VTAIL.aero);
      const qBar = 0.5 * rho * V * V;
      const lift = qBar * VTAIL.S * CL;
      const drag = qBar * VTAIL.S * CD;
      const sb = Math.sin(beta);
      const cb = Math.cos(beta);
      add(VTAIL.ac, [lift * sb - drag * cb, -lift * cb - drag * sb, 0]);
    }
  }

  const vAir = Math.hypot(ua, va, wa);
  const sigma = atm.rho / RHO0;
  const pShaft = HP_W * thr * sigma ** 0.8;
  const tCap = THRUST_STATIC * thr * sigma;
  const tPower = (PROP_ETA * pShaft) / Math.max(vAir, PROP_V_FLOOR);
  const thrust = c.engineArmed ? Math.min(tCap, tPower) : 0;
  if (thrust > 0) add(THRUST_POINT, [thrust, 0, 0]);

  const east = (s.lon - REF_LON) * (Math.PI / 180) * R_EARTH * Math.cos((REF_LAT * Math.PI) / 180);
  const onPavement = Math.abs(east) <= PAVEMENT_HALF_M;
  const muRoll = onPavement ? MU_ROLL : MU_GRASS;

  let wheelLoad = 0;
  let contacts = 0;
  const gsBody = Math.hypot(s.u, s.v);
  const steer = rud * MAX_STEER * clamp((STEER_FADE_MPS - gsBody) / STEER_FADE_MPS, 0, 1);

  const contact = (pos: Vec3, muLong: number, steerAngle: number) => {
    const rNed = rotateBodyToNed(s.q, pos);
    const wheelAlt = s.alt - rNed[2];
    const pen = FIELD_M - wheelAlt;
    if (pen <= 0) return;
    const vPoint = V3.add([s.u, s.v, s.w], V3.cross(omega, pos));
    const vNed = rotateBodyToNed(s.q, vPoint);
    const fn = Math.max(0, WHEEL_K * pen + WHEEL_C * vNed[2]);
    if (fn <= 0) return;
    contacts += 1;
    wheelLoad += fn;
    const fnBody = rotateNedToBody(s.q, [0, 0, -fn]);
    const cs = Math.cos(steerAngle);
    const sn = Math.sin(steerAngle);
    const vLong = vPoint[0] * cs + vPoint[1] * sn;
    const vLat = -vPoint[0] * sn + vPoint[1] * cs;
    const fLong = tire(vLong, muLong, fn);
    const fLat = tire(vLat, MU_LAT, fn);
    const fBody: Vec3 = [fLong * cs - fLat * sn, fLong * sn + fLat * cs, 0];
    add(pos, V3.add(fnBody, fBody));
  };

  const muLong = c.brake ? MU_BRAKE : muRoll;
  for (const w of WHEELS) contact(w.pos, muLong, w.steer ? steer : 0);
  contact(TAILSKID, muRoll, 0);

  s.onGround = contacts >= 1;
  s.wheelLoad = wheelLoad;
  s.ny = F[1] / (MASS * G);

  const gBody = rotateNedToBody(s.q, [0, 0, G]);
  const uDot = F[0] / MASS + gBody[0] + s.r * s.v - s.pitchRate * s.w;
  const vDot = F[1] / MASS + gBody[1] + s.p * s.w - s.r * s.u;
  const wDot = F[2] / MASS + gBody[2] + s.pitchRate * s.u - s.p * s.v;
  const pDot = (M[0] + (IYY - IZZ) * s.pitchRate * s.r) / IXX;
  const qDot = (M[1] + (IZZ - IXX) * s.r * s.p) / IYY;
  const rDot = (M[2] + (IXX - IYY) * s.p * s.pitchRate) / IZZ;

  s.u += uDot * dt;
  s.v += vDot * dt;
  s.w += wDot * dt;
  s.p += pDot * dt;
  s.pitchRate += qDot * dt;
  s.r += rDot * dt;

  const brakeHolds = c.brake && s.onGround && thrust < MU_BRAKE * MASS * G * 0.8;
  if (brakeHolds) {
    s.u = 0;
    s.v = 0;
    s.r = 0;
  }

  const next = integrateQuat(s.q, s.p, s.pitchRate, s.r, dt);
  s.q[0] = next[0];
  s.q[1] = next[1];
  s.q[2] = next[2];
  s.q[3] = next[3];

  const vNed = rotateBodyToNed(s.q, [s.u, s.v, s.w]);
  const latRad = (s.lat * Math.PI) / 180;
  s.lat += (vNed[0] / (R_EARTH + s.alt)) * DEG * dt;
  s.lon += (vNed[1] / ((R_EARTH + s.alt) * Math.cos(latRad))) * DEG * dt;
  s.alt += -vNed[2] * dt;

  if (s.alt < FIELD_M + 0.4 && s.w > 0 && contacts >= 2) {
    // CG floor: the wheels carry the airplane; this only stops a blown spring from mining.
    const floor = FIELD_M + 0.85;
    if (s.alt < floor) {
      s.alt = floor;
      if (s.w > 0) s.w = 0;
    }
  }
}

export function readAirdata(s: AircraftState, throttle = 0): Airdata {
  const atm = isa(s.alt);
  const windB = rotateNedToBody(s.q, windNed());
  const ua = s.u - windB[0];
  const va = s.v - windB[1];
  const wa = s.w - windB[2];
  const tas = Math.hypot(ua, va, wa);
  const ias = tas * Math.sqrt(atm.rho / RHO0);
  const eul = eulerFromQuat(s.q);
  const vNed = rotateBodyToNed(s.q, [s.u, s.v, s.w]);
  const gs = Math.hypot(vNed[0], vNed[1]);
  const northM = (s.lat - REF_LAT) * (Math.PI / 180) * R_EARTH;
  const eastM = (s.lon - REF_LON) * (Math.PI / 180) * R_EARTH * Math.cos((REF_LAT * Math.PI) / 180);
  const alpha = Math.atan2(wa, Math.max(0.5, ua));
  return {
    lat: s.lat,
    lon: s.lon,
    altFt: s.alt * M_TO_FT,
    aglFt: (s.alt - FIELD_M) * M_TO_FT,
    iasKt: ias * KT,
    tasKt: tas * KT,
    gsKt: gs * KT,
    vsFpm: -vNed[2] * M_TO_FT * 60,
    pitchDeg: eul.pitch * DEG,
    rollDeg: eul.roll * DEG,
    hdgDeg: wrap360(eul.yaw * DEG),
    trkDeg: gs < 0.4 ? wrap360(eul.yaw * DEG) : wrap360(Math.atan2(vNed[1], vNed[0]) * DEG),
    slip: clamp(s.ny, -1.2, 1.2),
    oatC: atm.oatC,
    windDir: WIND_FROM_DEG % 360,
    windSpdKt: WIND_KT,
    onGround: s.onGround,
    alphaDeg: alpha * DEG,
    northM,
    eastM,
    throttle,
  };
}

/** Panel flight object written by the one airdata pipe. */
export interface PanelFlight {
  lat: number;
  lon: number;
  hdg: number;
  trk: number;
  pitch: number;
  roll: number;
  ias: number;
  tas: number;
  gs: number;
  alt: number;
  vs: number;
  slip: number;
  oat: number;
  windDir: number;
  windSpd: number;
}

export function writePanelFlight(target: PanelFlight, a: Airdata): void {
  target.lat = a.lat;
  target.lon = a.lon;
  target.hdg = a.hdgDeg;
  target.trk = a.trkDeg;
  target.pitch = a.pitchDeg;
  target.roll = a.rollDeg;
  target.ias = a.iasKt;
  target.tas = a.tasKt;
  target.gs = a.gsKt;
  target.alt = a.altFt;
  target.vs = a.vsFpm;
  target.slip = a.slip;
  target.oat = a.oatC;
  target.windDir = a.windDir;
  target.windSpd = a.windSpdKt;
}
