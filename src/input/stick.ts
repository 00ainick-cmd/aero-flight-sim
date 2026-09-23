import type { Controls } from '../fdm/fdm';

export interface StickSnap {
  elevator: number;
  aileron: number;
  rudder: number;
  throttle: number;
  brake: boolean;
  cockpit: boolean;
}

const held = new Set<string>();
let elevator = 0;
let throttle = 0;
let brake = true;
let cockpit = false;
let aileron = 0;
let rudder = 0;
let scripted: Partial<Controls> | null = null;

const snap: StickSnap = {
  elevator: 0,
  aileron: 0,
  rudder: 0,
  throttle: 0,
  brake: true,
  cockpit: false,
};

const FLIGHT = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyB', 'KeyX', 'KeyV',
]);

function publish(c: Controls) {
  snap.elevator = c.elevator;
  snap.aileron = c.aileron;
  snap.rudder = c.rudder;
  snap.throttle = c.throttle;
  snap.brake = c.brake;
  snap.cockpit = cockpit;
}

export function stickSnap(): StickSnap {
  return snap;
}

export function setStick(partial: Partial<Controls & { cockpit: boolean }>): void {
  scripted = { ...(scripted ?? {}), ...partial };
  if (partial.elevator !== undefined) elevator = partial.elevator;
  if (partial.throttle !== undefined) throttle = partial.throttle;
  if (partial.brake !== undefined) brake = partial.brake;
  if (partial.cockpit !== undefined) cockpit = partial.cockpit;
}

export function clearStickScript(): void {
  scripted = null;
}

export function resetStick(): void {
  elevator = 0;
  throttle = 0;
  brake = true;
  aileron = 0;
  rudder = 0;
  cockpit = false;
  scripted = null;
  held.clear();
  publish({ elevator: 0, aileron: 0, rudder: 0, throttle: 0, brake: true, engineArmed: false });
}

export function attachStick(): void {
  window.addEventListener('keydown', (e) => {
    if (!FLIGHT.has(e.code)) return;
    if (e.repeat && (e.code === 'KeyB' || e.code === 'KeyX' || e.code === 'KeyV')) return;
    e.preventDefault();
    if (!e.repeat && e.code !== 'KeyV') scripted = null;
    held.add(e.code);
    if (!e.repeat && e.code === 'KeyB') brake = !brake;
    if (!e.repeat && e.code === 'KeyX') elevator = 0;
    if (!e.repeat && e.code === 'KeyV') cockpit = !cockpit;
  });
  window.addEventListener('keyup', (e) => {
    held.delete(e.code);
  });
  window.addEventListener('blur', () => held.clear());
}

/** Sample pilot inputs. Elevator and throttle stay where they are left. Aileron and rudder spring home. */
export function sampleStick(dt: number): Controls {
  if (held.has('ArrowUp')) elevator = Math.min(1, elevator + dt * 0.55);
  if (held.has('ArrowDown')) elevator = Math.max(-1, elevator - dt * 0.55);
  if (held.has('KeyW')) throttle = Math.min(1, throttle + dt * 0.45);
  if (held.has('KeyS')) throttle = Math.max(0, throttle - dt * 0.55);
  const ailTarget = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
  const rudTarget = (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0);
  const k = Math.min(1, dt * 8);
  aileron += (ailTarget - aileron) * k;
  rudder += (rudTarget - rudder) * k;

  let c: Controls = { elevator, aileron, rudder, throttle, brake, engineArmed: false };
  if (scripted) c = { ...c, ...scripted, engineArmed: false };
  publish(c);
  return c;
}
