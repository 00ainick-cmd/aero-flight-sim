/** ISA troposphere and the trainer's steady wind. See IMPLEMENTATION-MAP.md. */

export const G = 9.80665;
export const R_EARTH = 6_378_137;
export const R_SPECIFIC = 287.05287;
export const T0 = 288.15;
export const P0 = 101325;
export const LAPSE = 0.0065;
export const RHO0 = 1.225;

/** Wind FROM this true direction, knots. Pure headwind on runway 36. */
export const WIND_FROM_DEG = 360;
export const WIND_KT = 8;

const KT = 0.514444;

export function isa(hMeters: number): { tempK: number; pressure: number; rho: number; oatC: number } {
  const h = Math.max(0, hMeters);
  const tempK = T0 - LAPSE * h;
  const pressure = P0 * (tempK / T0) ** (G / (R_SPECIFIC * LAPSE));
  const rho = pressure / (R_SPECIFIC * tempK);
  return { tempK, pressure, rho, oatC: tempK - 273.15 };
}

/** Wind velocity in NED, m/s. Direction is where the wind comes FROM. */
export function windNed(fromDeg = WIND_FROM_DEG, kt = WIND_KT): [number, number, number] {
  const rad = (fromDeg * Math.PI) / 180;
  const v = kt * KT;
  return [-v * Math.cos(rad), -v * Math.sin(rad), 0];
}
