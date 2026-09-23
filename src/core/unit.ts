export type UnitState = 'off' | 'boot' | 'on';

/** Tracks an LRU's power lifecycle: dark → booting → running. */
export class PowerUnit {
  state: UnitState = 'off';
  /** Seconds spent in the current state. */
  t = 0;
  bootTime: number;

  constructor(bootTime: number) {
    this.bootTime = bootTime;
  }

  get on(): boolean {
    return this.state === 'on';
  }

  get lit(): boolean {
    return this.state !== 'off';
  }

  /** Returns the new state when a transition happened this step. */
  step(powered: boolean, dt: number): UnitState | null {
    this.t += dt;
    if (!powered) {
      if (this.state !== 'off') return this.set('off');
      return null;
    }
    if (this.state === 'off') return this.set('boot');
    if (this.state === 'boot' && this.t >= this.bootTime) return this.set('on');
    return null;
  }

  set(s: UnitState): UnitState {
    this.state = s;
    this.t = 0;
    return s;
  }
}
