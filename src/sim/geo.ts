const R_NM = 3440.065;
const D2R = Math.PI / 180;

export const wrap360 = (d: number) => ((d % 360) + 360) % 360;
export const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * D2R;
  const dLon = (lon2 - lon1) * D2R;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin((lon2 - lon1) * D2R) * Math.cos(lat2 * D2R);
  const x =
    Math.cos(lat1 * D2R) * Math.sin(lat2 * D2R) -
    Math.sin(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.cos((lon2 - lon1) * D2R);
  return wrap360(Math.atan2(y, x) / D2R);
}

/** Signed cross-track distance (nm) from the great circle start→end; positive = right of course. */
export function crossTrackNm(
  sLat: number, sLon: number, eLat: number, eLon: number, pLat: number, pLon: number,
): number {
  const d13 = distanceNm(sLat, sLon, pLat, pLon) / R_NM;
  const t13 = bearingDeg(sLat, sLon, pLat, pLon) * D2R;
  const t12 = bearingDeg(sLat, sLon, eLat, eLon) * D2R;
  return Math.asin(Math.sin(d13) * Math.sin(t13 - t12)) * R_NM;
}

/** Local flat projection in nm relative to a center point (x east, y north). */
export function toLocalNm(cLat: number, cLon: number, lat: number, lon: number): [number, number] {
  const x = (lon - cLon) * 60 * Math.cos(cLat * D2R);
  const y = (lat - cLat) * 60;
  return [x, y];
}

export function fmtKhz(khz: number, isCom: boolean): string {
  const mhz = Math.floor(khz / 1000);
  const k = khz % 1000;
  return isCom ? `${mhz}.${String(k).padStart(3, '0')}` : `${mhz}.${String(Math.round(k / 10)).padStart(2, '0')}`;
}
