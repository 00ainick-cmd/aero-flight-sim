/**
 * Khan & Nahon (ICUAS 2015) lift/drag blend, Aircraft-Physics form.
 * σ ≈ 0 below stall and → 1 past stall. σ(αStall) = 1/2.
 */

export interface SurfaceAero {
  CL0: number;
  CLa: number;
  alphaStall: number;
  M: number;
  CD0: number;
  AR: number;
  e: number;
}

export function stallBlend(alpha: number, alphaStall: number, M: number): number {
  const a = Math.exp(-M * (alpha - alphaStall));
  const b = Math.exp(M * (alpha + alphaStall));
  return (1 + a + b) / ((1 + a) * (1 + b));
}

export function surfaceCoeffs(alpha: number, p: SurfaceAero): { CL: number; CD: number; sigma: number } {
  const a = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, alpha));
  const sigma = stallBlend(a, p.alphaStall, p.M);
  const CL_lin = p.CL0 + p.CLa * a;
  const CL_fp = Math.sin(2 * a);
  const CD_lin = p.CD0 + (CL_lin * CL_lin) / (Math.PI * p.AR * p.e);
  const CD_fp = 2 * Math.sin(a) * Math.sin(a);
  return {
    CL: (1 - sigma) * CL_lin + sigma * CL_fp,
    CD: (1 - sigma) * CD_lin + sigma * CD_fp,
    sigma,
  };
}

/** Linear (pre-stall, σ = 0) coefficient, used only to show the stall blend bends the curve down. */
export function linearCL(alpha: number, p: SurfaceAero): number {
  return p.CL0 + p.CLa * alpha;
}
