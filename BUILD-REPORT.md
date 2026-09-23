# Build report — AERO browser FDM

The playable slice is a light-GA trainer on runway 36 at KLXT. Physics is the classical model in `IMPLEMENTATION-MAP.md` (Khan–Nahon surface blend, Newton–Euler body, penalty landing gear). The ported AEA panel — SkyView HDX, D30, GTN 650, PMA8000G, Chronos — reads that state through `writePanelFlight`. Nothing in the glass invents airspeed, altitude, or groundspeed.

## How to run

```bash
npm install
npm test
npm run dev    # http://127.0.0.1:47231
```

Dev server for this run: [AERO](http://127.0.0.1:47231).

## Tests

`npm test` — 13 passed (Vitest, node):

- Quaternion pitch-up and right-wing-down signs.
- Khan–Nahon blend still rises with alpha below stall and falls below the linear curve at 30°.
- Parked, brake set, engine off: stays on the runway, groundspeed under half a knot, indicated airspeed shows the 8 kt headwind.
- 25 s takeoff roll: above 55 KIAS, still on the wheels, heading within 12° of runway heading.
- Stick back at flying speed produces a rotation through 5° of pitch.
- Trimmed airborne run stays inside ±250 ft for 20 s.
- Right aileron rolls right, and does not snap past 35° in 1.2 s.
- Northbound flight: groundspeed lags true airspeed in the headwind; IAS = TAS × √(ρ/ρ0).
- The airdata pipe copies IAS, altitude, pitch, heading, vertical speed, and groundspeed onto a panel flight object.
- A keyboard-like open-loop pilot (ramp the elevator, freeze it, then hold about 12° of bank) gets airborne, above 350 ft AGL, within 25° of the KMKC course, and inside 0.8 nm cross-track.
- The coach phases advance master → avionics → align → course → taxi → power → rotate → enroute → done.

## What the screenshots show

Captured from the live page with system Chrome (`scripts/capture-shots.mjs`). Files are in `/opt/cursor/artifacts/`.

| File | What is on screen |
| --- | --- |
| `cold-and-dark.png` | Buses dead, glass dark, parking brake set. Flight-model strip reads about 8 kt indicated, 0 kt groundspeed, 1,008 ft, parked. |
| `takeoff.png` | Rotate. SkyView and D30 both near 76 KIAS and a 14° nose-up attitude; GTN groundspeed near 69 kt. The 7 kt gap is the headwind, not two different stubs. |
| `cruise-glass.png` | Airborne on the way to KMKC, coach still calling the turn. SkyView, D30, and the flight-model strip agree (about 93 KIAS, 1,576 ft, heading near 344°). GTN groundspeed is lower than indicated, Direct-To KMKC is active, SkyView HSI is on GPS1. |

Clicking the highlighted MASTER rocker on a cold airplane moved the lesson to the avionics step and set the main bus on. That path does not use `__seek`.

`window.__seek('takeoff' | 'cruise')` only places the same airplane in a real FDM state and wakes the glass. The tapes after that are the integrator, not a demo reel.

## Limits (on purpose)

- One airplane, one runway, two hangars. No city, no IFR procedure.
- Horizontal tail is larger than a C172’s so the climb does not phugoid back into the pavement. Aileron effect is `0.04 ×` the 12° surface deflection so a held key is a trainer bank, not a snap roll. Both are written in the map.
- No propeller torque, p-factor, or gyroscopics. With the headwind, the roll is straight at neutral rudder.
- Magnetic variation is 0 in this trainer database.
- ARINC words are not bit-exact OEM labels. The wiring twin was reference only and is not hosted here.
