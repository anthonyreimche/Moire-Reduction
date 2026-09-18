// The brush's pure stroke model, a port of the masking panel's rules: dabs are
// captured in source-UV with the brush settings frozen at paint time, spaced a
// quarter radius apart measured in aspect-corrected UV (so spacing is round on
// screen), and Shift+click interpolates a straight line at that spacing.

import type { BrushDab } from "./safelight";

export interface Point {
  x: number;
  y: number;
}

/** Core's shared brush state (develop-store fields). */
export interface BrushState {
  brushSize: number;
  brushFeather: number;
  brushOpacity: number;
  brushFlow: number;
  brushErase: boolean;
}

export interface Dab extends BrushDab {
  opacity: number;
  flow: number;
}

export const DAB_SPACING = 0.25;

export function makeDab(p: Point, brush: BrushState, altKey: boolean): Dab {
  return {
    x: p.x,
    y: p.y,
    radius: brush.brushSize,
    erase: altKey || brush.brushErase,
    feather: brush.brushFeather,
    opacity: brush.brushOpacity,
    flow: brush.brushFlow,
  };
}

export function dabDistance(a: Point, b: Point, aspect: number): number {
  return Math.hypot((b.x - a.x) * aspect, b.y - a.y);
}

export function shouldStamp(last: Point, cur: Point, brush: BrushState, aspect: number): boolean {
  return dabDistance(last, cur, aspect) >= brush.brushSize * DAB_SPACING;
}

export function lineDabs(
  from: Point,
  to: Point,
  brush: BrushState,
  aspect: number,
  altKey: boolean,
): Dab[] {
  const steps = Math.max(
    1,
    Math.ceil(dabDistance(from, to, aspect) / (brush.brushSize * DAB_SPACING)),
  );
  const dabs: Dab[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    dabs.push(
      makeDab({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, brush, altKey),
    );
  }
  return dabs;
}
