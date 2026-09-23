import { createState, type AircraftState } from '../fdm/fdm';

/** The one airplane. The panel never owns a second flight state. */
export const aircraft: AircraftState = createState();

const resets: Array<() => void> = [];

export function onSessionReset(fn: () => void): void {
  resets.push(fn);
}

export function sessionReset(): void {
  for (const fn of resets) fn();
}
