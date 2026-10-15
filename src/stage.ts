// The GPU stage: one à trous prepass (the filter) and the inline blend that
// mixes its result into the pipeline under the painted coverage. Runs in the
// "decode" phase so it injects at the noise-reduction marker — the tonal space
// the prepass framework produces — without triggering the rule that hands the
// whole noise-reduction phase to an extension (which would switch core NR off).
//
// Identifier rules: uniform and texture keys are rewritten into the stage's
// namespace by whole-identifier replace, so the GLSL below uses `pattern`,
// `edge`, `amount`, `luminance`, `maskOn` and `mask` only as those params, and
// no key shadows an engine helper (`luma`, `readPrev`, `step`).

import type { ProcessingStageContribution, UniformDeclaration } from "./safelight";
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
} from "./filter";

export const EXT_ID = "moire-reduction";
export const STAGE_ID = `${EXT_ID}.reduce`;

export type KnobKey = "amount" | "luminance" | "pattern" | "edge";

export interface Knob {
  key: KnobKey;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** Alt/Ctrl-drag preview mode (develop-store sharpenViz): 3 = luminance
   *  signal, 4 = chroma reveal against neutral grey. */
  viz: 3 | 4;
}

export const KNOBS: Knob[] = [
  { key: "amount", label: "Amount", min: 0, max: 100, step: 1, default: 0, viz: 4 },
  { key: "luminance", label: "Luminance", min: 0, max: 100, step: 1, default: 0, viz: 3 },
  { key: "pattern", label: "Pattern", min: 0, max: 100, step: 1, default: 50, viz: 4 },
  { key: "edge", label: "Edge protection", min: 0, max: 100, step: 1, default: 50, viz: 4 },
];

export const KNOB_DEFAULTS: Record<KnobKey, number> = {
  amount: 0,
  luminance: 0,
  pattern: 50,
  edge: 50,
};

/** Qualified param-bag keys. */
export const PARAM = {
  amount: `${STAGE_ID}.amount`,
  luminance: `${STAGE_ID}.luminance`,
  pattern: `${STAGE_ID}.pattern`,
  edge: `${STAGE_ID}.edge`,
  maskOn: `${STAGE_ID}.maskOn`,
  mask: `${STAGE_ID}.mask`,
} as const;

const knobUniform = (k: Knob): UniformDeclaration => ({
  key: k.key,
  glslType: "float",
  default: k.default,
  range: { min: k.min, max: k.max, step: k.step },
  label: k.label,
});

const MASK_ON: UniformDeclaration = { key: "maskOn", glslType: "float", default: 0 };

// GLSL float literal: integers gain a ".0" so 4096 does not become an int.
const f = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n));

export const PASS_HELPERS = `float b3w(int d) { d = d < 0 ? -d : d; return d == 0 ? 0.375 : (d == 1 ? 0.25 : 0.0625); }`;

export const PASS_GLSL = `
{
  vec2 res = 1.0 / uTexel;
  float anchor = max(res.x, res.y) / ${f(REF_LONG_EDGE)};
  float sigmaRef = ${f(SIGMA_MIN)} * pow(${f(SIGMA_RANGE)}, clamp(pattern, 0.0, 100.0) / 100.0);
  float stride = sigmaRef * anchor / ${f(LEVEL_SIGMA)} * exp2(float(uPassIndex));
  float sL = ${f(EDGE_SIGMA_MAX)} * pow(${f(EDGE_SIGMA_RATIO)}, clamp(edge, 0.0, 100.0) / 100.0);
  float sC = ${f(CHROMA_SIGMA_SCALE)} * sL;
  vec3 ctr = max(c, 0.0);
  float Lc = max(luma(ctr), ${f(LUMA_FLOOR)});
  float accL = 0.0;
  float wL = 0.0;
  vec3 accR = vec3(0.0);
  float wC = 0.0;
  for (int dy = -2; dy <= 2; dy++) {
    for (int dx = -2; dx <= 2; dx++) {
      vec3 s = max(readPrev(vUv + vec2(float(dx), float(dy)) * stride * uTexel), 0.0);
      float Ls = max(luma(s), ${f(LUMA_FLOOR)});
      float sp = b3w(dx) * b3w(dy);
      float dl = log(Ls / Lc);
      float eL = exp(-(dl * dl) / (sL * sL));
      float eC = exp(-(dl * dl) / (sC * sC));
      accL += Ls * sp * eL;
      wL += sp * eL;
      accR += (s / Ls) * sp * eC;
      wC += sp * eC;
    }
  }
  c = (accR / wC) * (accL / wL);
}`;

export const INLINE_GLSL = `
float cov = maskOn > 0.5 ? mask(srcUv) : 1.0;
float ca = clamp(amount, 0.0, 100.0) / 100.0 * cov;
float la = clamp(luminance, 0.0, 100.0) / 100.0 * cov;
if (ca > 0.0005 || la > 0.0005) {
  // Signed lin (RAW outside sRGB) can have luma near or below zero: floor it at
  // the share of the peak channel any non-negative colour keeps (no-op there).
  float L0 = max(luma(lin), max(1e-6, ${f(PEAK_LUMA_FLOOR)} * max(abs(lin.r), max(abs(lin.g), abs(lin.b)))));
  float Ls = max(luma(stageResult), 1e-6);
  lin = mix(lin / L0, stageResult / Ls, ca) * mix(L0, Ls, la);
}`;

export function buildStage(): ProcessingStageContribution {
  const [amount, luminance, pattern, edge] = KNOBS.map(knobUniform);
  return {
    id: STAGE_ID,
    name: "Moiré Reduction",
    phase: "decode",
    priority: 50,
    presetScope: "per-image",
    uniforms: [amount, luminance, pattern, edge, MASK_ON],
    textures: [{ key: "mask", kind: "coverage" }],
    passes: [
      { glsl: PASS_GLSL, helpers: PASS_HELPERS, iterations: LEVELS, uniforms: [pattern, edge] },
    ],
    glsl: INLINE_GLSL,
  };
}
