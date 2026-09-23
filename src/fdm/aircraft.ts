import type { SurfaceAero } from './aero';
import type { Vec3 } from './math';

/** C172-class trainer. Geometry and inertia as named in IMPLEMENTATION-MAP.md. */

export const MASS = 1043;
export const IXX = 1285;
export const IYY = 1825;
export const IZZ = 2667;

export const HP_W = 119_310;
export const PROP_ETA = 0.72;
export const THRUST_STATIC = 1800;
export const PROP_V_FLOOR = 16;

export const FIELD_ELEV_FT = 1004;
export const FIELD_M = FIELD_ELEV_FT * 0.3048;
/** KLXT trainer fix — same numbers as the panel navdata HOME. */
export const REF_LAT = 38.9597;
export const REF_LON = -94.3714;
export const START_NORTH_M = 120;

export const WHEEL_K = 55_000;
export const WHEEL_C = 9_000;
export const MU_ROLL = 0.02;
export const MU_GRASS = 0.08;
export const MU_BRAKE = 0.45;
export const MU_LAT = 0.55;
export const PAVEMENT_HALF_M = 18;
export const STEER_FADE_MPS = 25;
export const MAX_STEER = 0.4;

const DEG = Math.PI / 180;

export interface WingPanel {
  id: string;
  ac: Vec3;
  side: 1 | -1;
  S: number;
  aero: SurfaceAero;
  dihedral: number;
}

export interface HTail {
  ac: Vec3;
  S: number;
  incidence: number;
  aero: SurfaceAero;
  elevatorMax: number;
}

export interface VTail {
  ac: Vec3;
  S: number;
  aero: SurfaceAero;
  rudderMax: number;
}

/** Mechanical aileron stop. Panel-average angle change is this times AILERON_EFFECT. */
export const AILERON_MAX = 12 * DEG;
/** Outer-wing aileron: most of the panel chord does not move. */
export const AILERON_EFFECT = 0.04;

const wingAero: SurfaceAero = {
  CL0: 0.32,
  CLa: 4.5,
  alphaStall: 16 * DEG,
  M: 12,
  CD0: 0.02,
  AR: 7.48,
  e: 0.75,
};

export const WINGS: WingPanel[] = [
  { id: 'wing-l', ac: [-0.12, -2.7, -0.55], side: -1, S: 8.08, aero: wingAero, dihedral: 3 * DEG },
  { id: 'wing-r', ac: [-0.12, 2.7, -0.55], side: 1, S: 8.08, aero: wingAero, dihedral: 3 * DEG },
];

export const HTAIL: HTail = {
  ac: [-5.4, 0, -0.05],
  S: 4.0,
  incidence: -2 * DEG,
  elevatorMax: 22 * DEG,
  aero: { CL0: 0, CLa: 4.6, alphaStall: 14 * DEG, M: 12, CD0: 0.01, AR: 4.2, e: 0.8 },
};

export const VTAIL: VTail = {
  ac: [-4.9, 0, -0.35],
  S: 1.7,
  rudderMax: 25 * DEG,
  aero: { CL0: 0, CLa: 3.2, alphaStall: 16 * DEG, M: 12, CD0: 0.012, AR: 1.6, e: 0.8 },
};

export interface Wheel {
  id: string;
  pos: Vec3;
  steer: boolean;
}

export const WHEELS: Wheel[] = [
  { id: 'main-l', pos: [-0.35, -1.15, 1.25], steer: false },
  { id: 'main-r', pos: [-0.35, 1.15, 1.25], steer: false },
  { id: 'nose', pos: [1.6, 0, 1.25], steer: true },
];

export const TAILSKID: Vec3 = [-4.6, 0, 0.35];
/** Thrust line below the CG (z down), so power is a mild nose-up couple. */
export const THRUST_POINT: Vec3 = [0, 0, 0.05];
