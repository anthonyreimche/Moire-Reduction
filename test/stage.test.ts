import { describe, expect, it } from "vitest";
import {
  CHROMA_SIGMA_SCALE,
  EDGE_SIGMA_MAX,
  EDGE_SIGMA_RATIO,
  LEVELS,
  LEVEL_SIGMA,
  LUMA_FLOOR,
  PEAK_LUMA_FLOOR,
  REF_LONG_EDGE,
  SIGMA_MIN,
  SIGMA_RANGE,
} from "../src/filter";
import { buildStage, INLINE_GLSL, KNOBS, KNOB_DEFAULTS, PARAM, PASS_GLSL, STAGE_ID } from "../src/stage";
import { passFetches } from "./fetch-budget";

/** The source as the host's GLSL preprocessor leaves it for a photo at
 *  `version`: the `#if SL_PROCESS_VERSION >= n` branches resolved and the
 *  directive lines gone. */
function forVersion(src: string, version: number): string {
  const taking: boolean[] = [];
  const out: string[] = [];
  for (const line of src.split("\n")) {
    const open = /^\s*#if SL_PROCESS_VERSION >= (\d+)\s*$/.exec(line);
    if (open) taking.push(version >= Number(open[1]));
    else if (/^\s*#else\s*$/.test(line)) taking.push(!taking.pop());
    else if (/^\s*#endif\s*$/.test(line)) taking.pop();
    else if (taking.every(Boolean)) out.push(line);
  }
  expect(taking).toEqual([]);
  return out.join("\n");
}

// Moiré Reduction 1.0.0's blend, which process version 1 photos keep.
const V1_INLINE = `
float cov = maskOn > 0.5 ? mask(srcUv) : 1.0;
float ca = clamp(amount, 0.0, 100.0) / 100.0 * cov;
float la = clamp(luminance, 0.0, 100.0) / 100.0 * cov;
if (ca > 0.0005 || la > 0.0005) {
  float L0 = max(luma(lin), 1e-6);
  float Ls = max(luma(stageResult), 1e-6);
  lin = mix(lin / L0, stageResult / Ls, ca) * mix(L0, Ls, la);
}`;

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

  it("clips samples only for the luma and its log weights, and averages the signed ratio", () => {
    const pass = forVersion(PASS_GLSL, 2);
    expect(pass).not.toMatch(/max\(readPrev/);
    expect(pass).toMatch(/vec3 s = readPrev\(/);
    expect(pass).toMatch(/float Ls = max\(luma\(max\(s, 0\.0\)\), /);
    expect(pass).toMatch(/accR \+= \(s \/ Ls\) \* sp \* eC;/);
  });

  it("floors the smoothed colour's luma at the share of its peak channel, as the original's", () => {
    const peakFloor = (v: string) =>
      `max(luma(${v}), max(1e-6, ${PEAK_LUMA_FLOOR} * max(abs(${v}.r), max(abs(${v}.g), abs(${v}.b)))))`;
    const inline = forVersion(INLINE_GLSL, 2);
    expect(inline).toContain(`float L0 = ${peakFloor("lin")};`);
    expect(inline).toContain(`float Ls = ${peakFloor("stageResult")};`);
  });

  it("keeps 1.0.0's clipped samples and 1e-6 luma floor on process version 1", () => {
    const pass = forVersion(PASS_GLSL, 1);
    expect(pass).toContain("vec3 s = max(readPrev(vUv + vec2(float(dx), float(dy)) * stride * uTexel), 0.0);");
    expect(pass).toContain(`float Ls = max(luma(s), ${LUMA_FLOOR});`);
    expect(pass).not.toMatch(/luma\(max\(s, 0\.0\)\)/);
    expect(forVersion(INLINE_GLSL, 1)).toBe(V1_INLINE);
  });

  it("gives version 2 and 3 the full-range path, one directive per line", () => {
    for (const src of [PASS_GLSL, INLINE_GLSL]) {
      expect(src).toContain("#if SL_PROCESS_VERSION >= 2");
      expect(forVersion(src, 3)).toBe(forVersion(src, 2));
      for (const line of src.split("\n").filter((l) => l.trim().startsWith("#"))) {
        expect(line).toMatch(/^(#if SL_PROCESS_VERSION >= 2|#else|#endif)$/);
      }
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
    for (const version of [1, 2]) {
      const perDraw = passFetches({ ...pass, glsl: forVersion(pass.glsl, version) });
      expect(perDraw).toBe(26);
      expect(perDraw).toBeLessThanOrEqual(32);
      expect(perDraw * (pass.iterations ?? 1)).toBeLessThanOrEqual(128);
    }
  });
});
