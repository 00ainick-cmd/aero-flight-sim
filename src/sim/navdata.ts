/**
 * Trainer database. Airport positions are approximate and frequencies are
 * SIM DATA chosen for the exercise — not for navigation.
 */
export interface Airport {
  ident: string;
  name: string;
  lat: number;
  lon: number;
  elev: number;
  freqs: { type: string; khz: number }[];
}

export interface NavAid {
  ident: string;
  name: string;
  lat: number;
  lon: number;
  khz: number;
  kind: 'VOR' | 'LOC';
}

export const AIRPORTS: Airport[] = [
  { ident: 'KLXT', name: "LEE'S SUMMIT MUNI", lat: 38.9597, lon: -94.3714, elev: 1004,
    freqs: [{ type: 'CTAF', khz: 123075 }, { type: 'AWOS', khz: 119925 }] },
  { ident: 'KMKC', name: 'KANSAS CITY DOWNTOWN', lat: 39.1232, lon: -94.5928, elev: 757,
    freqs: [{ type: 'ATIS', khz: 124600 }, { type: 'TWR', khz: 133300 }, { type: 'GND', khz: 121900 }] },
  { ident: 'KMCI', name: 'KANSAS CITY INTL', lat: 39.2976, lon: -94.7139, elev: 1026,
    freqs: [{ type: 'ATIS', khz: 128375 }, { type: 'TWR', khz: 128200 }, { type: 'APP', khz: 120950 }] },
  { ident: 'KOJC', name: 'JOHNSON CO EXECUTIVE', lat: 38.8476, lon: -94.7376, elev: 1096,
    freqs: [{ type: 'ATIS', khz: 124175 }, { type: 'TWR', khz: 126000 }] },
  { ident: 'KIXD', name: 'NEW CENTURY AIRCENTER', lat: 38.8309, lon: -94.8903, elev: 1087,
    freqs: [{ type: 'ATIS', khz: 127800 }, { type: 'TWR', khz: 120200 }] },
  { ident: 'KGPH', name: 'MIDWEST NATIONAL', lat: 39.3325, lon: -94.3097, elev: 777,
    freqs: [{ type: 'CTAF', khz: 122700 }] },
  { ident: 'KSTJ', name: 'ROSECRANS MEMORIAL', lat: 39.7719, lon: -94.9097, elev: 826,
    freqs: [{ type: 'TWR', khz: 118300 }, { type: 'GND', khz: 121900 }] },
  { ident: 'KOWI', name: 'OTTAWA MUNI', lat: 38.5387, lon: -95.253, elev: 966,
    freqs: [{ type: 'CTAF', khz: 123000 }] },
  { ident: 'KSZL', name: 'WHITEMAN AFB', lat: 38.7303, lon: -93.5479, elev: 870,
    freqs: [{ type: 'TWR', khz: 124750 }] },
];

export const NAVAIDS: NavAid[] = [
  { ident: 'MKC', name: 'SIM VOR ALPHA', lat: 39.28, lon: -94.59, khz: 112600, kind: 'VOR' },
  { ident: 'ANX', name: 'SIM VOR BRAVO', lat: 39.1, lon: -94.1, khz: 114000, kind: 'VOR' },
  { ident: 'OJC', name: 'SIM VOR CHARLIE', lat: 38.85, lon: -94.74, khz: 113000, kind: 'VOR' },
];

export const HOME = AIRPORTS[0];

export function findWaypoint(ident: string): { ident: string; name: string; lat: number; lon: number } | null {
  const id = ident.trim().toUpperCase();
  if (!id) return null;
  return AIRPORTS.find((a) => a.ident === id) ?? NAVAIDS.find((n) => n.ident === id) ?? null;
}

export function completeIdent(prefix: string): string | null {
  const p = prefix.trim().toUpperCase();
  if (!p) return null;
  const all = [...AIRPORTS.map((a) => a.ident), ...NAVAIDS.map((n) => n.ident)];
  return all.find((i) => i.startsWith(p)) ?? null;
}

export function navaidByFreq(khz: number): NavAid | null {
  return NAVAIDS.find((n) => n.khz === khz) ?? null;
}
