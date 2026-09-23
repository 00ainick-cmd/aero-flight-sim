# Implementation map — AEA browser FDM

Written before production code. This is the model the simulator integrates. It is a classical flight-dynamics model of one light-GA trainer, not a Microsoft Flight Simulator, X-Plane, JSBSim, or ACE/CAET lesson runtime, and not a kinematic stub.

The glass (Garmin GTN 650, PS Engineering PMA8000G, Dynon SkyView HDX, Dynon D30, Mid-Continent Chronos) is the existing AERO panel, ported into this repo. One airdata pipe copies the FDM state into the panel each fixed step. Instruments do not invent airspeed, altitude, attitude, or groundspeed.

## Stack

Vite + TypeScript. The panel is already a Vite app (`aea-panel-stack`), so the host matches it and the faceplates port without a rewrite. The outside world is a Three.js chase view. Physics stays in TypeScript so the same module runs in Vitest and in the page. No WASM boundary, no OEM ARINC bit-exact stream.

Fixed FDM step: **1/120 s**, accumulated from frame time and capped so a stalled tab cannot tunnel the aircraft through the runway.

## What “classical FDM” means here

Two layers, both named:

1. **Rigid body.** Newtonian translation and Euler rotation in body axes, principal moments, quaternion attitude. Same family as a Kestrel / Bevy-avian rigid body: forces and moments in, motion out. Ground contact is a penalty spring-damper on three wheels, not a scripted “on rails” height.
2. **Surface aerodynamics.** Khan & Nahon, *Real-Time Modeling of Agile Fixed-Wing UAV Aerodynamics* (ICUAS 2015), in the form used by the public Aircraft-Physics lineage (gasgiant): each lifting surface has its own angle of attack, a pre-stall linear coefficient blended into a flat-plate post-stall coefficient, and the resulting force acts at that surface’s aerodynamic center.

JSBSim’s public `c172p` mass properties are used only as a **C172-class inertia and wing-size estimate** (converted from slug·ft² and ft²). The aerodynamic buildup is **not** the JSBSim coefficient tables. Nothing here is a certified Cessna model.

### Frames and state

Body axes: **+x forward, +y right, +z down**. Navigation axes: **NED** (north, east, down).

Integrated state:

| Symbol | Meaning |
| --- | --- |
| lat, lon, h | position, h geometric MSL meters |
| q | unit quaternion, body → NED |
| u, v, w | body velocity, m/s, of the CG relative to the ground |
| p, q̇, r | body rates, rad/s (roll, pitch, yaw) |

Displayed Euler angles are extracted from `q` (yaw-pitch-roll). The quaternion is renormalized every substep.

A vector in the body frame is mapped to NED by `v_ned = q ⊗ v ⊗ q*`.

### Atmosphere

International Standard Atmosphere, troposphere only (this airplane does not climb out of it in the lesson):

```
T = 288.15 − 0.0065 h
p = 101325 (T / 288.15) ^ (g / (287.05287 × 0.0065))
ρ = p / (287.05287 T)
```

`h` is clamped at 0 for the exponent so a numerical dip below sea level cannot go complex. Sea-level density `ρ0 = 1.225 kg/m³`.

Wind is a **steady** horizontal vector, not a noise generator. Trainer wind is **from 360° true at 8 kt** (pure headwind on runway 36), so indicated airspeed and groundspeed differ for a real reason:

```
V_wind,N = −V_w cos(dir_from)
V_wind,E = −V_w sin(dir_from)
```

Air-relative body velocity is `R(q*) (V_ned − V_wind)`. Aero forces use that. Groundspeed uses inertial velocity. There is no turbulence table writing the tapes.

### Per-surface aero (Khan–Nahon blend)

Each surface stores area `S`, aspect ratio `AR`, Oswald factor `e`, zero-lift drag `CD0`, lift slope `CLα` (per radian), `CL0`, stall angle `α0`, blend sharpness `M`, incidence, and the aerodynamic-center position relative to the CG.

Local velocity at the aerodynamic center (rates included, so pitch and roll damping come from the surface, not from an extra `Cmq` table):

```
uℓ = u + q z − r y
vℓ = v + r x − p z
wℓ = w + p y − q x
```

(`u,v,w` here are air-relative.) Speed `V = |vℓ|`. Below 0.5 m/s the surface force is zero.

Angle of attack of a horizontal surface (wing, tail), z-down:

```
α = atan2(wℓ, uℓ) + incidence + δ
```

`δ` is the control contribution (elevator, aileron). Dihedral adds `±Γ β` on the right/left wing panels, `β = atan2(vℓ, hypot(uℓ, wℓ))`.

Blend weight, Khan–Nahon / Aircraft-Physics form. `σ ≈ 0` in the linear region and `σ → 1` past stall; `σ(α0) = 1/2`:

```
σ(α) = (1 + exp(−M(α−α0)) + exp(M(α+α0)))
     / ((1 + exp(−M(α−α0))) (1 + exp(M(α+α0))))
```

Coefficients actually integrated:

```
CL_lin = CL0 + CLα α
CL_fp  = sin(2α)                         // flat plate, 2 sinα cosα
CD_lin = CD0 + CL_lin² / (π AR e)
CD_fp  = 2 sin²(α)                        // flat-plate normal force resolved into drag; peak 2 at 90°
CL     = (1−σ) CL_lin + σ CL_fp
CD     = (1−σ) CD_lin + σ CD_fp
```

`M = 12 /rad` on every surface. Post-stall drag peaking at 2 is the flat-plate model, not a measured C172 `CDmax`.

`CL` and `CD` are evaluated at `α_coeff = atan2(wℓ, uℓ) + incidence + δ`. The force is then resolved along the freestream, using `α_flow = atan2(wℓ, uℓ)` only:

```
X = q̄ S ( CL sin α_flow − CD cos α_flow )
Z = q̄ S (−CL cos α_flow − CD sin α_flow )
Y = 0
q̄ = ½ ρ V²
```

The vertical fin uses the same coefficient law in the x–y plane, with `α_coeff = β + δ_rudder` and `β = atan2(vℓ, hypot(uℓ, wℓ))`. Positive fin `CL` produces a force toward **−y** (stabilizing in a positive-β sideslip):

```
X = q̄ S ( CL sin β − CD cos β )
Y = q̄ S (−CL cos β − CD sin β )
```

Moment about the CG is only `r_ac × F`. Airfoil `Cm0` is omitted; the static margin is the geometric one (wing slightly aft of the CG, tail farther aft).

### Surfaces (trainer)

Wing split into left and right panels so ailerons and roll damping are just local `α`.

| Surface | S (m²) | AR | AC (x, y, z) m | Notes |
| --- | --- | --- | --- | --- |
| Wing, each panel | 8.08 | 7.48 | (−0.12, ±2.7, −0.55) | `CL0 = 0.32`, `CLα = 4.5`, `α0 = 16°`, `CD0 = 0.020`, `e = 0.75`, dihedral `Γ = 3°`. High wing (negative z). |
| Horizontal tail | 4.0 | 4.2 | (−5.4, 0, −0.05) | `CL0 = 0`, `CLα = 4.6`, incidence `−2°`, `CD0 = 0.010`, `α0 = 14°`. The tail is larger than a C172’s so pitch damping — local angle of attack from `q` — keeps a trainer climb from phugoiding back into the runway. |
| Vertical fin | 1.7 | 1.6 | (−4.9, 0, −0.35) | `CLα = 3.2`, `CD0 = 0.012`, `α0 = 16°` |

Wing area `16.16 m²` and span `11.0 m` match the public C172-class planform (174 ft², 36 ft) used only as geometry.

Controls, pilot sign convention:

| Input | +1 means | Surface effect |
| --- | --- | --- |
| Elevator | stick back, nose up | tail `δ = −22°` (trailing edge up, less tail lift, nose rises) |
| Aileron | stick right | surface deflection `±12°`, applied as a panel-average angle-of-attack change of `0.04 × δ` (the aileron is the outer wing, not the whole panel, so a held key is a trainer bank rate rather than a snap roll) |
| Rudder | right pedal | fin `δ = +25°`, nose-right yaw |

Full-scale deflections above are the mechanical stops. The stick scales them linearly.

### Propulsor

Not a blade-element prop and not the Khan–Nahon propeller paper. A first-order power model so the lesson has a throttle:

```
P_shaft = 119310 W × throttle × (ρ/ρ0)^0.8     // 160 hp class
T_cap   = 1800 N × throttle × (ρ/ρ0)
T       = engine × min(T_cap, η P_shaft / max(V_air, 16 m/s))
η = 0.72
```

`engine` is 1 only when the main bus is live (MASTER on). Cold and dark produces no thrust. Thrust acts at `(0, 0, +0.05)` m (below the CG, z-down), so power is a mild nose-up couple, which is the high-wing geometry. Prop torque, p-factor, and gyroscopics are **omitted**; with a pure headwind the takeoff roll is not a right-rudder exercise. That omission is deliberate and is not hidden by a fake yaw moment.

### Mass properties

Textbook C172-class estimate from the public JSBSim `c172p` inertia block, converted with `1 slug·ft² = 1.3558 kg·m²`, at a 2300 lb training weight. Principal axes (`Ixz = 0`).

```
m   = 1043 kg
Ixx = 1285 kg·m²
Iyy = 1825 kg·m²
Izz = 2667 kg·m²
```

### Newton–Euler step

Gravity in NED is `(0, 0, +g)`, `g = 9.80665`. Body gravity is the same vector rotated into body axes.

```
ú = Fx/m + g_x + r v − q w
v̇ = Fy/m + g_y + p w − r u
ẇ = Fz/m + g_z + q u − p v

ṗ = (Mx + (Iyy − Izz) q r) / Ixx
q̈ = (My + (Izz − Ixx) r p) / Iyy
ṙ = (Mz + (Ixx − Iyy) p q) / Izz
```

Attitude: `q̇ = ½ q ⊗ (0, p, q, r)`, then normalize. Position from NED velocity of the CG:

```
φ̇ = V_N / (R_E + h)
λ̇ = V_E / ((R_E + h) cos φ)
ḣ = −V_D
```

`R_E = 6378137 m`. Integrator is semi-implicit Euler at 1/120 s (rates and velocity updated, then attitude and position with the new rates).

### Ground

Runway 36 at KLXT, **true heading 360°**, threshold at the trainer fix `38.9597 N, 94.3714 W`, field elevation **1004 ft** (navdata elev, already labeled sim data). Pavement is 1100 m long and 30 m wide. The airplane starts 120 m down the centerline, cold and dark, parking brake set.

Three wheels, penalty contact. Wheel positions in body (m):

| Wheel | Position | Steer |
| --- | --- | --- |
| Left main | (−0.35, −1.15, 1.25) | no |
| Right main | (−0.35, +1.15, 1.25) | no |
| Nose | (+1.60, 0, 1.25) | rudder, fades to 0 by 25 m/s groundspeed |

Normal force along up (NED −z): `Fn = max(0, k pen + c V_down)` with `k = 55000 N/m`, `c = 9000 N·s/m` per wheel. `V_down` is the wheel’s downward speed, so the damper adds force while the tire is compressing and the `max` keeps the contact from sucking the tire back down. `pen` is how far the wheel is below the field elevation. With the parking brake set and the wheels planted, horizontal velocity and yaw rate are zeroed after the force step (static friction holds the 160 hp class thrust).

In-plane force at each wheel opposes the tire’s longitudinal and lateral slip, clamped by friction:

```
μ_roll = 0.02 on pavement, 0.08 on the grass (|east| > 18 m)
μ_brake = 0.45 when the parking brake is set
μ_lat = 0.55
```

A tail skid at `(−4.6, 0, 0.35)` limits rotation to roughly ten degrees so a full-aft stick cannot pivot the airplane over its tail. The skid uses the same spring. If the CG is driven below 0.85 m above the field while two wheels are still in contact, height is clamped — a numerical backstop for a blown spring, not the normal contact path.

### Airdata pipe

`readAirdata()` is the only source the glass reads. Every fixed step it overwrites `S.flight`:

| Panel field | Definition |
| --- | --- |
| `ias` | `TAS × √(ρ/ρ0)`, knots. TAS is air-relative speed. |
| `tas` | air-relative speed, knots |
| `gs` | horizontal inertial speed, knots |
| `alt` | geometric MSL, feet. Shown as the altimeter at 29.92 in Hg. The panel’s existing D30 baro delta still applies if the standby baro is moved. |
| `vs` | `−V_D` in ft/min |
| `pitch`, `roll` | Euler degrees from `q` |
| `hdg` | true heading degrees. Magnetic variation is **0** in this trainer database (the airports are already sim data), so the heading tape matches the GPS great-circle course without a made-up isogonic. |
| `trk` | inertial track, degrees |
| `slip` | lateral specific force `Fy_nongrav / (m g)`, clamped to ±1.2. The SkyView and D30 balls already scale this number. It is an inclinometer, not a β gauge and not noise. |
| `oat` | ISA Celsius |
| `lat`, `lon` | integrated position |
| `windDir`, `windSpd` | the steady wind, degrees-from and knots |

SkyView, D30, GTN groundspeed/track, the HSI, and the map all already read `S.flight` and the nav solution derived from `lat`/`lon`. Replacing the old `stepFlight()` kinematic autopilot is the entire airdata change. Direct-To math (desired track, cross-track) stays the panel’s great-circle code, fed by FDM position.

Boot, buses, breakers, ARINC-validity flags, and audio routing are untouched panel behavior. Words are still **not** bit-exact Garmin/Dynon labels; the wiring twin’s ARINC reader is reference only and is not re-hosted in this MVP.

### Airplane systems the FDM cares about

- MASTER off → engine disarmed, thrust 0, main bus dead, glass on backup rules the panel already had.
- AVIONICS off → GTN / PMA8000G / Chronos dark; SkyView can still be up on the main bus; GPS course is not valid until the GTN has a fix (`gpsFixT > 6 s` after boot, existing rule).
- Parking brake is a force, not a position freeze.

### Guided first flight

A coach card, not an autopilot. Keyboard only:

| Key | Effect |
| --- | --- |
| W / S | throttle up / down, about 0.45 per second while held |
| B | toggle parking brake |
| A / D | rudder, spring-centered |
| ← / → | aileron, spring-centered |
| ↑ / ↓ | elevator, **sticky** (each hold ramps the stick and it stays). ↑ is stick back. |
| X | center the elevator |
| V | chase camera / cockpit |

Steps the card enforces, in order: MASTER → AVIONICS → wait for SkyView ADAHRS align and GTN GPS → arm Direct-To **KMKC** (writes the same `S.gtn.dto` the Direct-To key writes) → brakes off and taxi → full power → rotate near 60 KIAS to about 8° pitch → turn to the magenta DTK and climb. The lesson completes when the airplane is airborne, above 350 ft AGL, within 25° of the GPS course, and inside 0.8 nm cross-track, with the GTN fix valid. No holds, no approach, no city.

KMKC sits northwest of the KLXT runway, about 14 nm, DTK near 314° true. The turn after departure is the “fly the magenta line” proof.

### What the tests lock

Vitest, node, no browser, file `src/fdm/fdm.test.ts`:

1. Blend: `∂CL/∂α > 0` at 4°; `CL(30°)` below the linear extrapolation (stall actually reduces the slope).
2. Parked 3 s, brake on, engine off: finite state, altitude change under 0.4 m, groundspeed under 0.5 kt.
3. 25 s takeoff roll, full throttle, brake off, stick neutral: IAS above 55 kt, still on the wheels, heading within 12° of runway heading.
4. Seeded ~65 kt on the runway, stick back: pitch increases through 5° (it rotates; it does not need a scripted nose-up).
5. Airborne, elevator trimmed for that speed, 20 s: altitude stays within ±250 ft, IAS stays in 70–150 kt, no non-finite state.
6. Aileron right while airborne: positive roll.
7. Airdata identities: flying north, `GS < TAS` in the headwind; `IAS = TAS √(ρ/ρ0)`.
8. The pipe function writes IAS, altitude, pitch, heading, vertical speed, and groundspeed onto a panel-shaped flight object.

### Out of scope

Flaps, mixture, propeller governor, left-turning tendencies, IFR procedures, navaid scenery, cities, MSFS/SimConnect, Ace/CAET, Blender as a dynamics brain, bit-exact ARINC 429 words.
