// The stage on the real renderer (run via `npm run test:gpu`): the pass program
// compiles on a real GLSL ES 3.00 driver, the rendered change matches the CPU
// reference through the host's prepass plumbing and coverage bake, a painted
// mask confines it, and an untouched photo is a bit-exact no-op.

import { describe, expect, it } from "vitest";
import { buildStage, PARAM } from "@moire/stage";
import { applyMoire, type RgbImage } from "@moire/filter";
import { bandAmplitude, makeScene, type Span } from "@moire-test/scene";
import type { WebGLRenderer } from "@/rendering/webgl/renderer";
import {
  LINEAR_PROBE_PIPELINE,
  type Frame,
  floatImage,
  identityParams,
  rendererBuildError,
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

function frame(bag: Record<string, unknown> | null): Frame {
  return withRenderer(
    { stages: bag ? [STAGE] : [], pipeline: LINEAR_PROBE_PIPELINE },
    (renderer: WebGLRenderer) => {
      renderer.setImage(SOURCE);
      renderer.setParams(identityParams());
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
});
