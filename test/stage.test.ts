import { describe, expect, it } from "vitest";
import {
  CHROMA_SIGMA_SCALE,
  EDGE_SIGMA_MAX,
  EDGE_SIGMA_RATIO,
  LEVELS,
  LEVEL_SIGMA,
  REF_LONG_EDGE,
  SIGMA_MIN,
  SIGMA_RANGE,
} from "../src/filter";
import { buildStage, KNOBS, KNOB_DEFAULTS, PARAM, PASS_GLSL, STAGE_ID } from "../src/stage";
import { passFetches } from "./fetch-budget";

describe("stage contract", () => {
  const stage = buildStage();

  it("runs at the noise-reduction marker without owning that phase, per image", () => {
    expect(stage.id).toBe("moire-reduction.reduce");
    expect(stage.phase).toBe("decode");
    expect(stage.presetScope).toBe("per-image");
  });

  it("declares the four sliders, the mask switch and the painted coverage", () => {
    expect(stage.uniforms.map((u) => u.key)).toEqual(["amount", "luminance", "pattern", "edge", "maskOn"]);
    expect(stage.uniforms.map((u) => u.default)).toEqual([0, 0, 50, 50, 0]);
    expect(stage.textures).toEqual([{ key: "mask", kind: "coverage" }]);
    expect(PARAM.mask).toBe(`${STAGE_ID}.mask`);
    expect(KNOBS.map((k) => k.key)).toEqual(["amount", "luminance", "pattern", "edge"]);
    expect(KNOB_DEFAULTS).toEqual({ amount: 0, luminance: 0, pattern: 50, edge: 50 });
  });

  it("drives one prepass of LEVELS iterations from Pattern and Edge protection", () => {
    expect(stage.passes).toHaveLength(1);
    expect(stage.passes?.[0].iterations).toBe(LEVELS);
    expect(stage.passes?.[0].uniforms?.map((u) => u.key)).toEqual(["pattern", "edge"]);
  });

  it("embeds the filter constants the CPU reference uses", () => {
    const constants = [
      REF_LONG_EDGE,
      SIGMA_MIN,
      SIGMA_RANGE,
      EDGE_SIGMA_MAX,
      EDGE_SIGMA_RATIO,
      CHROMA_SIGMA_SCALE,
      LEVEL_SIGMA,
    ];
    for (const n of constants) {
      const literal = Number.isInteger(n) ? `${n}.0` : String(n);
      expect(PASS_GLSL).toContain(literal);
    }
  });

  it("reads the mask through the coverage helper only when a mask is painted", () => {
    expect(stage.glsl).toContain("maskOn > 0.5 ? mask(srcUv) : 1.0");
  });
});

describe("GPU cost", () => {
  it("stays within the per-draw and per-frame fetch budgets", () => {
    const pass = buildStage().passes?.[0];
    if (!pass) throw new Error("stage has no prepass");
    const perDraw = passFetches(pass);
    expect(perDraw).toBe(26);
    expect(perDraw).toBeLessThanOrEqual(32);
    expect(perDraw * (pass.iterations ?? 1)).toBeLessThanOrEqual(128);
  });
});
