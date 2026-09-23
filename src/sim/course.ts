import { S, logEvent } from '../core/state';
import { bearingDeg, wrap360 } from './geo';
import { findWaypoint } from './navdata';

/** Same Direct-To record the GTN writes when Activate is pressed. */
export function armDirectTo(ident: string): boolean {
  const w = findWaypoint(ident);
  if (!w) return false;
  const f = S.flight;
  const dtk = bearingDeg(f.lat, f.lon, w.lat, w.lon);
  S.gtn.dto = { ident: w.ident, name: w.name, lat: w.lat, lon: w.lon, oLat: f.lat, oLon: f.lon, dtk };
  S.gtn.dtoEntry = w.ident;
  S.gtn.cdi = 'GPS';
  S.gtn.page = 'map';
  S.gtn.back = [];
  S.sv.hsi = 'GPS1';
  S.sv.crs = Math.round(dtk);
  S.sv.hdgBug = Math.round(wrap360(dtk));
  logEvent(`GTN 650: Direct-To ${w.ident} activated — DTK ${Math.round(dtk).toString().padStart(3, '0')}°`);
  return true;
}
