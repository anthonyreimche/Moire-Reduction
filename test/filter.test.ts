import { describe, expect, it } from "vitest";
import {
  applyMoire,
  baseStride,
  blurSigmaRef,
  chromaSigma,
  lumaSigma,
  LEVEL_SIGMA,
  LEVELS,
  REF_LONG_EDGE,
  SIGMA_MIN,
} from "../src/filter";
import { bandAmplitude, makeScene, meanRatio, stripeAmplitude, type Span } from "./scene";

const W = 256;
const H = 128;
const scene = makeScene(W, H);
const TOP: Span = [8, 56];
const BOTTOM: Span = [72, 120];
const COLS: Span = [40, 216];
const base = { amount: 0, luminance: 0, pattern: 75, edge: 50 };

describe("parameter mappings", () => {
  it("maps Pattern log-spaced from 1.5 to 24 reference pixels", () => {
    expect(blurSigmaRef(0)).toBeCloseTo(SIGMA_MIN, 6);
    expect(blurSigmaRef(50)).toBeCloseTo(6, 6);
    expect(blurSigmaRef(100)).toBeCloseTo(24, 6);
  });

  it("anchors the stride to the reference long edge", () => {
    expect(baseStride(50, REF_LONG_EDGE)).toBeCloseTo(6 / LEVEL_SIGMA, 6);
    expect(baseStride(50, REF_LONG_EDGE / 4)).toBeCloseTo(1.5 / LEVEL_SIGMA, 6);
    expect(LEVELS).toBe(4);
  });

  it("maps Edge protection to a log-luma threshold, chroma looser than luma", () => {
    expect(lumaSigma(0)).toBeCloseTo(1.5, 6);
    expect(lumaSigma(50)).toBeCloseTo(0.3, 6);
    expect(lumaSigma(100)).toBeCloseTo(0.06, 6);
    expect(chromaSigma(50)).toBeCloseTo(0.45, 6);
  });
});

describe("colour moiré", () => {
  it("removes most of the colour bands while keeping the luminance stripes", () => {
    const out = applyMoire(scene, { ...base, amount: 100 }, REF_LONG_EDGE);
    expect(bandAmplitude(out, TOP, COLS) / bandAmplitude(scene, TOP, COLS)).toBeLessThan(0.2);
    expect(stripeAmplitude(out, TOP, COLS) / stripeAmplitude(scene, TOP, COLS)).toBeGreaterThan(0.95);
  });

  it("removes more of the bands as Pattern grows", () => {
    const residual = [20, 40, 60, 80].map((pattern) =>
      bandAmplitude(applyMoire(scene, { ...base, amount: 100, pattern }, REF_LONG_EDGE), TOP, COLS),
    );
    for (let i = 1; i < residual.length; i++) expect(residual[i]).toBeLessThan(residual[i - 1]);
  });

  it("keeps the colour on each side of a strong luminance boundary", () => {
    const out = applyMoire(scene, { ...base, amount: 100 }, REF_LONG_EDGE);
    const sides: Span[] = [
      [56, 64],
      [64, 72],
    ];
    for (const rows of sides) {
      const before = meanRatio(scene, rows, COLS);
      const after = meanRatio(out, rows, COLS);
      expect(Math.abs(after[0] - before[0]) / before[0]).toBeLessThan(0.05);
      expect(Math.abs(after[1] - before[1]) / before[1]).toBeLessThan(0.05);
    }
  });
});

describe("luminance moiré", () => {
  it("smooths the stripes only when Luminance is raised", () => {
    const out = applyMoire(scene, { ...base, luminance: 100 }, REF_LONG_EDGE);
    expect(stripeAmplitude(out, BOTTOM, COLS) / stripeAmplitude(scene, BOTTOM, COLS)).toBeLessThan(0.5);
  });
});

describe("blend", () => {
  it("is the identity at Amount 0 and Luminance 0", () => {
    const out = applyMoire(scene, base, REF_LONG_EDGE);
    expect(out.data).toEqual(scene.data);
  });

  it("scales the change linearly with coverage", () => {
    const full = applyMoire(scene, { ...base, amount: 100 }, REF_LONG_EDGE);
    const half = applyMoire(scene, { ...base, amount: 100 }, REF_LONG_EDGE, () => 0.5);
    for (let i = 0; i < scene.data.length; i += 997) {
      expect(half.data[i]).toBeCloseTo((scene.data[i] + full.data[i]) / 2, 6);
    }
  });

  // A RAW decode keeps colours outside sRGB as negative channels; this deep
  // blue (ACES AP0 (0, 0, 0.1) in linear sRGB) has a luma below zero. Smoothing
  // the luminance of a flat field of it has nothing to smooth.
  it("leaves a flat below-black deep blue as decoded at Luminance 100", () => {
    const blue = [-0.0388, -0.0096, 0.1168];
    const field = { width: 16, height: 16, data: Float32Array.from({ length: 16 * 16 * 3 }, (_, i) => blue[i % 3]) };
    const out = applyMoire(field, { ...base, luminance: 100 }, REF_LONG_EDGE);
    let maxErr = 0;
    for (let i = 0; i < out.data.length; i++) maxErr = Math.max(maxErr, Math.abs(out.data[i] - field.data[i]));
    expect(maxErr).toBeLessThan(0.01);
  });
});
