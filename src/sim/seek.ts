import { S } from '../core/state';
import { FIELD_M } from '../fdm/aircraft';
import { readAirdata, writePanelFlight } from '../fdm/fdm';
import { quatFromEuler } from '../fdm/math';
import { forcePhase } from '../guide/coach';
import { resetStick, setStick } from '../input/stick';
import { armDirectTo } from './course';
import { resetColdDark } from './reset';
import { aircraft } from './session';

const DEG = Math.PI / 180;

function powerGlass(): void {
  S.elec.master = true;
  S.elec.avionics = true;
  S.elec.mainV = 13.8;
  S.elec.avV = 13.7;
  S.gtn.unit.set('on');
  S.gtn.ready = true;
  S.gtn.gpsFixT = 30;
  S.sv.unit.set('on');
  S.sv.shutdown = false;
  S.sv.onBattery = false;
  S.sv.adahrsT = 10;
  S.sv.gpsT = 20;
  S.pma.unit.set('on');
  S.d30.unit.set('on');
  S.d30.manualOff = false;
  S.d30.onBattery = false;
  S.d30.altT = 20;
  S.clock.unit.set('on');
}

function setQuat(roll: number, pitch: number, yaw: number): void {
  const q = quatFromEuler(roll, pitch, yaw);
  aircraft.q[0] = q[0];
  aircraft.q[1] = q[1];
  aircraft.q[2] = q[2];
  aircraft.q[3] = q[3];
  aircraft.p = 0;
  aircraft.pitchRate = 0;
  aircraft.r = 0;
  aircraft.v = 0;
  aircraft.w = 0;
}

/** Jump the live airplane to a real FDM state so a screenshot can catch rotation or cruise. Not an autopilot. */
export function seekDemo(which: 'cold' | 'takeoff' | 'cruise'): void {
  resetStick();
  resetColdDark();
  if (which === 'cold') {
    forcePhase('master');
    return;
  }
  powerGlass();
  writePanelFlight(S.flight, readAirdata(aircraft, 1));
  armDirectTo('KMKC');
  if (which === 'takeoff') {
    aircraft.u = 36;
    aircraft.alt = FIELD_M + 2.2;
    setQuat(0, 8 * DEG, 0);
    setStick({ throttle: 1, brake: false, elevator: 0.24, aileron: 0, rudder: 0 });
    forcePhase('rotate');
    return;
  }
  const dtk = (S.gtn.dto?.dtk ?? 314) * DEG;
  aircraft.u = 46;
  aircraft.alt = FIELD_M + 170;
  setQuat(-12 * DEG, 7 * DEG, dtk + 32 * DEG);
  setStick({ throttle: 0.68, brake: false, elevator: 0.22, aileron: 0, rudder: 0 });
  forcePhase('enroute');
}
