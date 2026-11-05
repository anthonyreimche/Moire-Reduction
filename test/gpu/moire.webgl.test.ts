// The stage on the real renderer (run via `npm run test:gpu`): the pass program
// compiles on a real GLSL ES 3.00 driver, the rendered change matches the CPU
// reference through the host's prepass plumbing and coverage bake, a painted
// mask confines it, and an untouched photo is a bit-exact no-op.

import { describe, expect, it } from "vitest";
import { buildStage, PARAM } from "@moire/stage";
import { applyMoire, type RgbImage } from "@moire/filter";
import { bandAmplitude, makeScene, type Span } from "@moire-test/scene";
import { CURRENT_PROCESS_VERSION, DEFAULT_GRAIN, DEFAULT_VIGNETTE } from "@/catalog/types";
import type { ProcessingStageContribution } from "@/extensions/types";
import type { WebGLRenderer } from "@/rendering/webgl/renderer";
import type { ResolvedPipeline } from "@/extensions/pipelines";
import {
  LINEAR_PROBE_PIPELINE,
  NEGATING_PIPELINE,
  type FloatImage,
  type Frame,
  builtinStages,
  floatImage,
  identityParams,
  rendererBuildError,
  toHalf,
  withRenderer,
} from "@/rendering/webgl/webgl.test-support";

const W = 1024;
const H = 256;
const scene = makeScene(W, H, { bandPeriod: 20 });
const SOURCE = floatImage(W, H, (x, y) => {
  const o = (y * W + x) * 3;
  return [scene.data[o], scene.data[o + 1], scene.data[o + 2]];
});
const STAGE = buildStage();
const STRONG = {
  [PARAM.amount]: 100,
  [PARAM.luminance]: 0,
  [PARAM.pattern]: 100,
  [PARAM.edge]: 50,
};
const TOP: Span = [8, 120];
const COLS: Span = [64, 960];

function frame(
  bag: Record<string, unknown> | null,
  source: FloatImage = SOURCE,
  pipeline: ResolvedPipeline = LINEAR_PROBE_PIPELINE,
  processVersion = 1,
): Frame {
  return withRenderer(
    { stages: bag ? [STAGE] : [], pipeline },
    (renderer: WebGLRenderer) => {
      renderer.setImage(source);
      renderer.setParams(identityParams({ processVersion }));
      if (bag) renderer.setContributedParams(bag);
      const f = renderer.captureFloatFrame();
      if (!f) throw new Error("captureFloatFrame returned null");
      return f;
    },
  );
}

function toRgb(f: Frame): RgbImage {
  const data = new Float32Array(f.width * f.height * 3);
  for (let i = 0; i < f.width * f.height; i++) {
    data[i * 3] = f.data[i * 4];
    data[i * 3 + 1] = f.data[i * 4 + 1];
    data[i * 3 + 2] = f.data[i * 4 + 2];
  }
  return { width: f.width, height: f.height, data };
}

describe("moiré reduction on the GPU", () => {
  it("compiles with the coverage texture", () => {
    expect(rendererBuildError({ stages: [STAGE] })).toBeNull();
  });

  it("is a bit-exact no-op at Amount 0", () => {
    const off = frame({ ...STRONG, [PARAM.amount]: 0 });
    const plain = frame(null);
    expect(off.data).toEqual(plain.data);
  });

  it("matches the CPU reference and removes the colour bands", () => {
    const gpu = toRgb(frame(STRONG));
    const cpu = applyMoire(scene, { amount: 100, luminance: 0, pattern: 100, edge: 50 }, W);
    let maxErr = 0;
    for (let y = TOP[0]; y < TOP[1]; y++) {
      for (let x = COLS[0]; x < COLS[1]; x++) {
        const o = (y * W + x) * 3;
        for (let ch = 0; ch < 3; ch++) {
          maxErr = Math.max(maxErr, Math.abs(gpu.data[o + ch] - cpu.data[o + ch]));
        }
      }
    }
    expect(maxErr).toBeLessThan(0.02);
    expect(bandAmplitude(gpu, TOP, COLS) / bandAmplitude(scene, TOP, COLS)).toBeLessThan(0.25);
  });

  it("confines the change to the painted area", () => {
    const plain = frame(null);
    const masked = frame({
      ...STRONG,
      [PARAM.maskOn]: 1,
      [PARAM.mask]: [
        { x: 0.25, y: 0.5, radius: 1.2, erase: false, feather: 0, opacity: 1, flow: 1 },
      ],
    });
    // radius 1.2 (image heights) at aspect 4 spans x ∈ [−0.05, 0.55]: the
    // right 40 % is untouched, the left 45 % is fully covered.
    let changed = 0;
    for (let y = 16; y < H; y += 32) {
      const right = (y * W + 900) * 4;
      expect(masked.data[right]).toBe(plain.data[right]);
      expect(masked.data[right + 1]).toBe(plain.data[right + 1]);
      const left = (y * W + 200) * 4;
      if (Math.abs(masked.data[left] - plain.data[left]) > 1e-4) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });

  // A RAW decode keeps colours outside sRGB as negative channels; this deep
  // blue (ACES AP0 (0, 0, 0.1) in linear sRGB) has a luma below zero. Smoothing
  // the luminance of a flat field of it has nothing to smooth: the linear probe
  // reads its blue, the negating transform its below-black red and green.
  const DEEP_BLUE = floatImage(16, 16, () => [-0.0388, -0.0096, 0.1168]);
  for (const pipeline of [LINEAR_PROBE_PIPELINE, NEGATING_PIPELINE]) {
    it(`leaves a flat below-black deep blue as decoded at Luminance 100 on version 2 (${pipeline.id})`, () => {
      const plain = frame(null, DEEP_BLUE, pipeline, CURRENT_PROCESS_VERSION);
      const out = frame({ ...STRONG, [PARAM.amount]: 0, [PARAM.luminance]: 100 }, DEEP_BLUE, pipeline, CURRENT_PROCESS_VERSION);
      let maxErr = 0;
      let probed = 0;
      for (let i = 0; i < out.data.length; i++) {
        if (i % 4 === 3) continue;
        expect(Number.isFinite(out.data[i])).toBe(true);
        maxErr = Math.max(maxErr, Math.abs(out.data[i] - plain.data[i]));
        probed = Math.max(probed, plain.data[i]);
      }
      expect(probed).toBeGreaterThan(0.02);
      expect(maxErr).toBeLessThan(0.01);
    });
  }

  // Version 2 keeps the full range from the decode to the output, which clips
  // the capture to [0, 1]. A last stage maps [−0.75, 1.75] into it, so a clip
  // anywhere upstream, past white or below black, shows in the capture even
  // behind the core Vignette and Grain; it declares a space, so it adds no clip
  // of its own. The core shoulder would keep a grey under white, so the probe
  // skips it. A no-space display stage, which the host clips ahead of, is the
  // positive control: it must move the frame, or the field doesn't reach the
  // output over range and the test proves nothing.
  const OPEN_PROBE: ResolvedPipeline = { ...LINEAR_PROBE_PIPELINE, id: "test.open-probe", sig: "test.open-probe", skipToneShoulder: true };
  const SQUEEZE: ProcessingStageContribution = {
    id: "test.squeeze",
    name: "Squeeze",
    phase: "output-encode",
    priority: 1000,
    glsl: "c = c * 0.4 + 0.3;",
    uniforms: [],
    space: { encoding: "perceptual" },
  };
  const CLIPS_AHEAD: ProcessingStageContribution = {
    id: "test.clips-ahead",
    name: "Clips ahead",
    phase: "display-adjust",
    glsl: "c = c;",
    uniforms: [],
  };
  const V2_WITH_EFFECTS = {
    processVersion: CURRENT_PROCESS_VERSION,
    vignette: { ...DEFAULT_VIGNETTE, amount: 30 },
    grain: { ...DEFAULT_GRAIN, amount: 100 },
  };
  const openFrame = (stages: ProcessingStageContribution[], bag: Record<string, unknown>, source: FloatImage): Frame =>
    withRenderer({ stages: [...builtinStages(), SQUEEZE, ...stages], pipeline: OPEN_PROBE }, (renderer) => {
      renderer.setImage(source);
      renderer.setParams(identityParams(V2_WITH_EFFECTS));
      renderer.setContributedParams(bag);
      const f = renderer.captureFloatFrame();
      if (!f) throw new Error("captureFloatFrame returned null");
      return f;
    });

  const SIGNED_FIELDS: [number, number, number][] = [
    [-0.0388, -0.0096, 0.1168],
    [1.4, -0.1, 0.2],
    [-0.2, 0.6, -0.05],
  ];
  for (const rgb of SIGNED_FIELDS) {
    it(`leaves a flat (${rgb.join(", ")}) as decoded at Amount 100 on version 2`, () => {
      const field = floatImage(16, 16, () => rgb);
      const bare = openFrame([], {}, field);
      const clipped = openFrame([CLIPS_AHEAD], {}, field);
      let moved = 0;
      for (let i = 0; i < bare.data.length; i++) if (bare.data[i] !== clipped.data[i]) moved++;
      expect(moved).toBeGreaterThan(16 * 16 * 0.1);
      const out = openFrame([STAGE], STRONG, field);
      let maxErr = 0;
      for (let i = 0; i < out.data.length; i++) {
        if (i % 4 === 3) continue;
        expect(Number.isFinite(out.data[i])).toBe(true);
        maxErr = Math.max(maxErr, Math.abs(out.data[i] - bare.data[i]));
      }
      console.log(`[moire-gpu] flat (${rgb.join(", ")}) at Amount 100: max change ${maxErr.toExponential(2)}`);
      expect(maxErr).toBeLessThan(2e-3);
    });
  }

  // Version 1 photos keep 1.0.0's maths: the prepass clipped every sample
  // below black and the blend took the luma ratio of the clipped smoothing, so
  // Amount 100 over a flat (0.6, -0.1, 0.3) scales red and blue by about 0.52
  // (the CPU model's version 1 path). Version 2 leaves the field as decoded.
  // The version 1 display transform clips the green either way, so the read is
  // of red and blue, as the signed `c` the output stage receives.
  it("darkens a flat field with a below-black channel at Amount 100 on version 1, as 1.0.0 did, and not on version 2", () => {
    const field = floatImage(16, 16, () => [0.6, -0.1, 0.3]);
    const signedFrame = (stages: ProcessingStageContribution[], bag: Record<string, unknown>, processVersion: number): Frame =>
      withRenderer({ stages: [...builtinStages(), ...stages], pipeline: OPEN_PROBE }, (renderer) => {
        renderer.setImage(field);
        renderer.setParams(identityParams({ processVersion }));
        renderer.setContributedParams(bag);
        const f = renderer.readFloatFrame("pre-output", Infinity, { encoding: "perceptual" });
        if (!f) throw new Error("readFloatFrame returned null");
        return f;
      });
    for (const version of [1, CURRENT_PROCESS_VERSION]) {
      const bare = signedFrame([], {}, version);
      const out = signedFrame([STAGE], STRONG, version);
      let least = Infinity;
      let most = 0;
      for (let p = 0; p < 16 * 16; p++) {
        for (const ch of [0, 2]) {
          const drop = bare.data[p * 4 + ch] - out.data[p * 4 + ch];
          least = Math.min(least, drop);
          most = Math.max(most, Math.abs(drop));
        }
      }
      console.log(`[moire-gpu] v${version} flat (0.6, -0.1, 0.3) at Amount 100: red and blue drop ${least.toExponential(2)} to ${most.toExponential(2)}`);
      if (version === 1) expect(least).toBeGreaterThan(0.1);
      else expect(most).toBeLessThan(2e-3);
    }
  });

  // Version 2 averages the chroma ratio by the luma squared. Read at the scene
  // point, the signed working colour the display transform receives.
  const sceneFrame = (bag: Record<string, unknown>, source: FloatImage): Frame =>
    withRenderer({ stages: [STAGE], pipeline: OPEN_PROBE }, (renderer) => {
      renderer.setImage(source);
      renderer.setParams(identityParams({ processVersion: CURRENT_PROCESS_VERSION }));
      renderer.setContributedParams(bag);
      const f = renderer.readFloatFrame("scene");
      if (!f) throw new Error("readFloatFrame returned null");
      return f;
    });

  it("matches the CPU reference and removes the colour bands on version 2", () => {
    const gpu = toRgb(sceneFrame(STRONG, SOURCE));
    const cpu = applyMoire(scene, { amount: 100, luminance: 0, pattern: 100, edge: 50 }, W);
    let maxErr = 0;
    for (let y = TOP[0]; y < TOP[1]; y++) {
      for (let x = COLS[0]; x < COLS[1]; x++) {
        const o = (y * W + x) * 3;
        for (let ch = 0; ch < 3; ch++) {
          maxErr = Math.max(maxErr, Math.abs(gpu.data[o + ch] - cpu.data[o + ch]));
        }
      }
    }
    const residual = bandAmplitude(gpu, TOP, COLS) / bandAmplitude(scene, TOP, COLS);
    console.log(`[moire-gpu] v2 scene: max error ${maxErr.toExponential(2)}, band residual ${residual.toFixed(4)}`);
    expect(maxErr).toBeLessThan(0.02);
    expect(residual).toBeLessThan(0.25);
  });

  // A dark pixel whose signed colour has almost no light, (−0.002, −0.001,
  // 0.0005), is a ratio of (−20, −10, 5) over its floored luma; in a
  // checkerboard with a grey of the same magnitude it must not tint the grey.
  it("keeps a grey beside dark, strongly coloured pixels grey on version 2", () => {
    const BW = 1024;
    const BH = 16;
    const GREY = 0.002;
    const DARK: [number, number, number] = [-0.002, -0.001, 0.0005];
    const isGrey = (x: number, y: number) => (x + y) % 2 === 0;
    const board = floatImage(BW, BH, (x, y) => (isGrey(x, y) ? [GREY, GREY, GREY] : DARK));
    const gpu = sceneFrame({ ...STRONG, [PARAM.pattern]: 50, [PARAM.edge]: 0 }, board);
    const cpu = applyMoire(
      {
        width: BW,
        height: BH,
        data: Float32Array.from({ length: BW * BH * 3 }, (_, i) => {
          const p = Math.floor(i / 3);
          return toHalf(isGrey(p % BW, Math.floor(p / BW)) ? GREY : DARK[i % 3]);
        }),
      },
      { amount: 100, luminance: 0, pattern: 50, edge: 0 },
      BW,
    );
    let worst = 0;
    let maxErr = 0;
    for (let y = 0; y < BH; y++) {
      for (let x = 64; x < BW - 64; x++) {
        if (!isGrey(x, y)) continue;
        for (let ch = 0; ch < 3; ch++) {
          const v = gpu.data[(y * BW + x) * 4 + ch];
          worst = Math.max(worst, Math.abs(v - GREY));
          maxErr = Math.max(maxErr, Math.abs(v - cpu.data[(y * BW + x) * 3 + ch]));
        }
      }
    }
    console.log(`[moire-gpu] v2 checkerboard: grey moves ${worst.toExponential(2)}, CPU error ${maxErr.toExponential(2)}`);
    expect(maxErr).toBeLessThan(3e-4);
    expect(worst).toBeLessThan(2.5e-3);
  });
});
