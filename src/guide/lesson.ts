import { wrap180 } from '../sim/geo';

export type Phase =
  | 'master'
  | 'avionics'
  | 'align'
  | 'course'
  | 'taxi'
  | 'power'
  | 'rotate'
  | 'enroute'
  | 'done';

export interface LessonSnap {
  master: boolean;
  avionics: boolean;
  adahrs: boolean;
  gps: boolean;
  dto: boolean;
  brake: boolean;
  gs: number;
  ias: number;
  throttle: number;
  pitch: number;
  agl: number;
  onGround: boolean;
  xtk: number | null;
  hdgErr: number | null;
  dtk: number | null;
}

export function advance(phase: Phase, s: LessonSnap): Phase {
  switch (phase) {
    case 'master':
      return s.master ? 'avionics' : phase;
    case 'avionics':
      return s.avionics ? 'align' : phase;
    case 'align':
      return s.adahrs && s.gps ? 'course' : phase;
    case 'course':
      return s.dto ? 'taxi' : phase;
    case 'taxi':
      return !s.brake && s.gs > 6 ? 'power' : phase;
    case 'power':
      return s.throttle > 0.85 && s.ias > 40 ? 'rotate' : phase;
    case 'rotate':
      return !s.onGround && s.agl > 30 ? 'enroute' : phase;
    case 'enroute':
      return !s.onGround
        && s.agl > 350
        && s.hdgErr !== null
        && Math.abs(s.hdgErr) < 25
        && s.xtk !== null
        && Math.abs(s.xtk) < 0.8
        ? 'done'
        : phase;
    default:
      return phase;
  }
}

export function coachCopy(phase: Phase, s: LessonSnap): { kicker: string; title: string; body: string; hot: string | null } {
  switch (phase) {
    case 'master':
      return {
        kicker: '1 · Power',
        title: 'Cold and dark',
        body: 'The trainer is on runway 36 at KLXT. Buses are dead, so the glass is dark. Click the red MASTER rocker. That energizes the main bus for the SkyView and the D30.',
        hot: 'master',
      };
    case 'avionics':
      return {
        kicker: '2 · Avionics',
        title: 'Bring the GTN online',
        body: 'Main bus is live. Click AVIONICS so the GTN 650, the audio panel, and the clock get power.',
        hot: 'avionics',
      };
    case 'align':
      return {
        kicker: '3 · Align',
        title: 'Let the glass wake up',
        body: 'SkyView is aligning. The GTN is acquiring GPS. This takes a few seconds. You are still parked: indicated airspeed can show the 8 knot headwind while groundspeed stays at zero. That split is the flight model, not a tape.',
        hot: null,
      };
    case 'course':
      return {
        kicker: '4 · GPS course',
        title: 'Arm Direct-To KMKC',
        body: 'KMKC is northwest of the field, about 14 miles. Press the GTN D→ key and activate KMKC, or use the button on this card. The magenta desired track is the course you will fly after takeoff.',
        hot: 'dto',
      };
    case 'taxi':
      return {
        kicker: '5 · Taxi',
        title: s.brake && s.throttle > 0.15 ? 'Release the parking brake' : 'Roll onto the centerline',
        body: s.brake
          ? 'Press B to release the parking brake, then hold W for a little power. Steer with A and D. Groundspeed on the GTN should come off zero.'
          : 'Hold W until you are rolling, A and D to steer. Stay over the yellow line. Brakes are B if you need them again.',
        hot: null,
      };
    case 'power':
      return {
        kicker: '6 · Takeoff',
        title: 'Full power',
        body: 'Hold W until the throttle bar is full. Wings level with ← and →, nose straight with A and D. Watch indicated airspeed on the SkyView tape. The rotate call is at about 60 knots.',
        hot: null,
      };
    case 'rotate':
      return {
        kicker: '7 · Rotate',
        title: 'Lift off',
        body: `Indicated ${Math.round(s.ias)} kt. Hold ↑ until pitch is about 8°. ↑ is stick back and it stays put. X centers it, ↓ eases the nose down. Altitude on the SkyView and the D30 should both start to climb.`,
        hot: null,
      };
    case 'enroute': {
      const err = s.hdgErr ?? 0;
      const dtk = s.dtk === null ? '---' : `${Math.round(s.dtk).toString().padStart(3, '0')}°`;
      let body: string;
      if (s.agl < 200) {
        body = 'Climb first. Wings level, pitch near 8°, until you are about 200 ft above the field. If the nose keeps rising, tap ↓. Then bank toward the course.';
      } else if (Math.abs(err) > 15) {
        const dir = err > 0 ? 'right' : 'left';
        const key = err > 0 ? '→' : '←';
        body = `The course is ${Math.abs(Math.round(err))}° to the ${dir} (DTK ${dtk}). Hold ${key} to about 15° of bank, then release. Level the wings as the heading tape meets the course. Pitch is ${s.pitch.toFixed(0)}°.`;
      } else if (s.pitch > 14) {
        body = 'The nose is high. Tap ↓ or press X, then bring pitch back near 8° with a little ↑.';
      } else if (s.pitch < 2 && s.agl < 800) {
        body = 'The nose is low. Hold ↑ until the pitch ladder is near 8° so the climb continues.';
      } else {
        const xtk = s.xtk === null ? '—' : `${s.xtk.toFixed(2)} nm`;
        body = `On the magenta line, cross-track ${xtk}. Keep climbing through 350 ft above the field. The lesson closes once you are established on the GPS course.`;
      }
      return { kicker: '8 · Fly the course', title: 'Follow the magenta line', body, hot: null };
    }
    default:
      return {
        kicker: 'Established',
        title: 'First flight complete',
        body: 'You are airborne on the GPS course to KMKC. SkyView, the D30, and the GTN are reading this airplane’s flight model. Keep flying, or press Reset on the deck to start cold and dark again.',
        hot: null,
      };
  }
}

export function headingError(dtk: number, hdg: number): number {
  return wrap180(dtk - hdg);
}
