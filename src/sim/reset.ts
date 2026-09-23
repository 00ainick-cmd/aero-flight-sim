import { S, logEvent } from '../core/state';
import { resetState, writePanelFlight, readAirdata } from '../fdm/fdm';
import { aircraft } from './session';

/** Cold and dark on the numbers. Glass boot state returns to off; physics returns to the runway. */
export function resetColdDark(): void {
  resetState(aircraft);
  S.elec.master = false;
  S.elec.avionics = false;
  S.elec.mainV = 0;
  S.elec.avV = 0;
  S.elec.breakers = { GPS: true, COM1: true, AUDIO: true, CLOCK: true, PFD: true, STBY: true };

  S.gtn.unit.set('off');
  S.gtn.ready = false;
  S.gtn.page = 'home';
  S.gtn.back = [];
  S.gtn.gpsFixT = 0;
  S.gtn.dto = null;
  S.gtn.messages = [];
  S.gtn.stuck = false;
  S.gtn.txTime = 0;

  S.pma.unit.set('off');
  S.sv.unit.set('off');
  S.sv.shutdown = false;
  S.sv.onBattery = false;
  S.sv.adahrsT = 0;
  S.sv.gpsT = 0;
  S.sv.overlay = null;
  S.sv.hdgBug = 360;
  S.sv.crs = 360;
  S.sv.altBug = 2500;
  S.svbat.charge = 1;

  S.d30.unit.set('off');
  S.d30.manualOff = false;
  S.d30.onBattery = false;
  S.d30.countdown = 0;
  S.d30.altT = 0;
  S.d30.menu = false;
  S.d30.battery = 1;

  S.clock.unit.set('off');
  S.clock.flightS = 0;
  S.clock.timerS = 0;
  S.clock.timerRun = false;

  writePanelFlight(S.flight, readAirdata(aircraft));
  logEvent('Reset — cold and dark on runway 36 at KLXT');
}
