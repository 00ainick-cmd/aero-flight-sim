/** Body-to-NED quaternion helpers. q = (w, x, y, z), Hamilton product. */

export type Quat = [number, number, number, number];
export type Vec3 = [number, number, number];

export const V3 = {
  add(a: Vec3, b: Vec3): Vec3 {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  },
  scale(a: Vec3, s: number): Vec3 {
    return [a[0] * s, a[1] * s, a[2] * s];
  },
  dot(a: Vec3, b: Vec3): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  },
  cross(a: Vec3, b: Vec3): Vec3 {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  },
};

export function qMul(a: Quat, b: Quat): Quat {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

export function qConj(q: Quat): Quat {
  return [q[0], -q[1], -q[2], -q[3]];
}

export function qNorm(q: Quat): Quat {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/** Rotate a body-frame vector into NED. */
export function rotateBodyToNed(q: Quat, v: Vec3): Vec3 {
  const p = qMul(qMul(q, [0, v[0], v[1], v[2]]), qConj(q));
  return [p[1], p[2], p[3]];
}

/** Rotate an NED vector into the body frame. */
export function rotateNedToBody(q: Quat, v: Vec3): Vec3 {
  return rotateBodyToNed(qConj(q), v);
}

function axisQuat(axis: Vec3, angle: number): Quat {
  const h = angle / 2;
  const s = Math.sin(h);
  return [Math.cos(h), axis[0] * s, axis[1] * s, axis[2] * s];
}

/** Intrinsic yaw (Z), pitch (Y), roll (X). Positive pitch is nose up, positive roll is right wing down. */
export function quatFromEuler(roll: number, pitch: number, yaw: number): Quat {
  const qr = axisQuat([1, 0, 0], roll);
  const qp = axisQuat([0, 1, 0], pitch);
  const qy = axisQuat([0, 0, 1], yaw);
  return qNorm(qMul(qy, qMul(qp, qr)));
}

export function eulerFromQuat(q: Quat): { roll: number; pitch: number; yaw: number } {
  const bx = rotateBodyToNed(q, [1, 0, 0]);
  const by = rotateBodyToNed(q, [0, 1, 0]);
  const bz = rotateBodyToNed(q, [0, 0, 1]);
  const pitch = Math.atan2(-bx[2], Math.hypot(bx[0], bx[1]));
  const yaw = Math.atan2(bx[1], bx[0]);
  const roll = Math.atan2(by[2], bz[2]);
  return { roll, pitch, yaw };
}

export function integrateQuat(q: Quat, p: number, pitchRate: number, r: number, dt: number): Quat {
  const qDot = qMul(q, [0, p, pitchRate, r]);
  return qNorm([
    q[0] + 0.5 * qDot[0] * dt,
    q[1] + 0.5 * qDot[1] * dt,
    q[2] + 0.5 * qDot[2] * dt,
    q[3] + 0.5 * qDot[3] * dt,
  ]);
}

export function wrap360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function finiteVec(v: Vec3): boolean {
  return Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
}
