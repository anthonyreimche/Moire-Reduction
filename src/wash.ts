// The on-canvas tint of the painted area while the brush is armed. Drawn in
// screen space from the dabs (each mapped through the overlay's source-UV →
// screen helpers) with the atlas's compositing rules for flow and erase; the
// shader's coverage is the exact one, this is the hint that tracks it. The
// opacity ceiling is folded into the dab alpha rather than applied as a
// per-pixel clamp, which keeps a stroke's repaint to one pass.

import type { Dab } from "./brush";
import type { OverlayPoint } from "./safelight";

export interface WashGeometry {
  toScreen(u: number, v: number): OverlayPoint;
  radiusToScreen(r: number): number;
}

export const WASH_RGB = "230, 64, 64";
export const WASH_ALPHA = 0.5;

export function dabCircle(
  dab: Dab,
  geo: WashGeometry,
): { x: number; y: number; r: number } | null {
  const r = geo.radiusToScreen(dab.radius);
  if (r < 0.3) return null;
  const { x, y } = geo.toScreen(dab.x, dab.y);
  return { x, y, r };
}

export function paintWash(
  ctx: CanvasRenderingContext2D,
  dabs: readonly Dab[],
  geo: WashGeometry,
  width: number,
  height: number,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, width, height);
  for (const dab of dabs) {
    const c = dabCircle(dab, geo);
    if (!c) continue;
    const core = Math.max(0, Math.min(1, 1 - dab.feather));
    const alpha = Math.max(0, Math.min(1, dab.flow * (dab.erase ? 1 : dab.opacity)));
    const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
    grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(core, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalCompositeOperation = dab.erase ? "destination-out" : "source-over";
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = `rgba(${WASH_RGB}, ${WASH_ALPHA})`;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
}
