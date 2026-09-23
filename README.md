# AERO

An in-browser light-GA flight model that drives Nick’s AERO avionics panel. The airplane is a classical 6-degree-of-freedom trainer (Khan–Nahon surface aero, Newton–Euler body). SkyView HDX, the D30, and the GTN 650 read that model. They do not play a scripted tape.

The equations are in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md). This is not Microsoft Flight Simulator, not an Ace/CAET lesson, and not a bit-exact Garmin or Dynon bus.

## Run

```bash
npm install
npm test           # flight-model smoke tests
npm run dev        # http://127.0.0.1:47231
```

Node 22. The dev server binds `0.0.0.0:47231`.

## First flight

The card on the windshield walks a non-pilot through it:

1. MASTER (main bus — SkyView and D30)
2. AVIONICS (GTN 650, audio panel, clock)
3. Wait for attitude and a GPS fix
4. Arm Direct-To **KMKC**
5. Press **B** to release the parking brake, hold **W** to taxi
6. Full throttle, rotate near 60 KIAS with **↑**
7. Turn onto the magenta course

| Key | Control |
| --- | --- |
| W / S | Throttle up / down (it stays) |
| B | Parking brake |
| A / D | Rudder (spring-centered) |
| ← / → | Bank (spring-centered) |
| ↑ / ↓ | Pitch (it stays). ↑ is stick back |
| X | Center the elevator |
| V | Chase camera or cockpit |
| Space | Pilot push-to-talk |

Wind is a steady 8 knot headwind down runway 36 at KLXT, so indicated airspeed and groundspeed are not the same number. While you are parked with the glass on, the airspeed tape can show that wind and groundspeed stays at zero.

## Layout

```
src/fdm/          atmosphere, surface aero, 6-DOF step, airdata pipe
src/world/        Three.js chase view and the trainer
src/guide/        first-flight card
src/instruments/  ported AERO faceplates
src/panel/        breakers, buses, bay, yoke
src/sim/          panel boot, nav, and the Direct-To record
```

`window.__air()` is the live airdata object. `window.__seek('cold' | 'takeoff' | 'cruise')` drops the same airplane into that condition with the glass already awake (except cold). `window.__reset()` returns to the dark runway.

## Product split (Nick 2026-09-23)

This repo is **AERO Flight** � in-browser classical FDM + AERO panel glass for flying.

Wiring diagrams and wire-fault training live in the separate repo `aero-wiring-twin`. Do not fold that app into this one.

Product chrome is **AERO** only � never Tramper Trainer.
