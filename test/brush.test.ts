import { describe, expect, it } from "vitest";
import {
  DAB_SPACING,
  dabDistance,
  lineDabs,
  makeDab,
  shouldStamp,
  type BrushState,
} from "../src/brush";

const brush: BrushState = {
  brushSize: 0.08,
  brushFeather: 0.5,
  brushOpacity: 0.7,
  brushFlow: 0.4,
  brushErase: false,
};

describe("makeDab", () => {
  it("captures the brush settings at paint time", () => {
    expect(makeDab({ x: 0.3, y: 0.6 }, brush, false)).toEqual({
      x: 0.3,
      y: 0.6,
      radius: 0.08,
      erase: false,
      feather: 0.5,
      opacity: 0.7,
      flow: 0.4,
    });
  });

  it("erases from Alt or from the Erase toggle", () => {
    expect(makeDab({ x: 0, y: 0 }, brush, true).erase).toBe(true);
    expect(makeDab({ x: 0, y: 0 }, { ...brush, brushErase: true }, false).erase).toBe(true);
  });
});

describe("spacing", () => {
  it("measures distance in aspect-corrected UV so spacing is round on screen", () => {
    expect(dabDistance({ x: 0, y: 0 }, { x: 0.1, y: 0 }, 2)).toBeCloseTo(0.2, 9);
    expect(dabDistance({ x: 0, y: 0 }, { x: 0, y: 0.1 }, 2)).toBeCloseTo(0.1, 9);
  });

  it("stamps once the pointer has moved a quarter radius", () => {
    expect(DAB_SPACING).toBe(0.25);
    expect(shouldStamp({ x: 0, y: 0 }, { x: 0, y: 0.019 }, brush, 1)).toBe(false);
    expect(shouldStamp({ x: 0, y: 0 }, { x: 0, y: 0.02 }, brush, 1)).toBe(true);
  });

  it("interpolates a straight line at that spacing, excluding the start", () => {
    const dabs = lineDabs({ x: 0.1, y: 0.5 }, { x: 0.2, y: 0.5 }, brush, 1, false);
    expect(dabs).toHaveLength(5);
    expect(dabs[0].x).toBeCloseTo(0.12, 9);
    expect(dabs[4]).toMatchObject({ x: 0.2, y: 0.5, radius: 0.08 });
  });

  it("still stamps one dab for a click shorter than the spacing", () => {
    expect(lineDabs({ x: 0.1, y: 0.5 }, { x: 0.101, y: 0.5 }, brush, 1, false)).toHaveLength(1);
  });
});
