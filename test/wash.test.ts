import { describe, expect, it } from "vitest";
import { dabCircle } from "../src/wash";

const geo = {
  toScreen: (u: number, v: number) => ({ x: 100 + u * 400, y: 50 + v * 200 }),
  radiusToScreen: (r: number) => r * 200,
};

describe("dabCircle", () => {
  it("places a dab through the overlay mapping", () => {
    const d = { x: 0.5, y: 0.25, radius: 0.1, erase: false, feather: 0.5, opacity: 1, flow: 1 };
    expect(dabCircle(d, geo)).toEqual({ x: 300, y: 100, r: 20 });
  });

  it("drops dabs too small to draw", () => {
    const d = { x: 0.5, y: 0.25, radius: 0.001, erase: false, feather: 0.5, opacity: 1, flow: 1 };
    expect(dabCircle(d, geo)).toBeNull();
  });
});
