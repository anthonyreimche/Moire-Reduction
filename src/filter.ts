// The moiré filter's constants and a CPU transcription of its GPU prepass +
// inline blend. stage.ts interpolates these constants into the GLSL, and the
// tests (node and the GPU spec) compare the shader against this reference, so
// the two cannot drift apart.
//
// Model: four à trous iterations of an edge-aware 5×5 B3-spline kernel. Each
// iteration splits the previous result into luminance L and chroma ratio c/L,
// smooths L with the Edge-protection threshold and the ratio with a looser one
// (so chroma crosses the fine weave edges that carry false colour but stops at
// object boundaries), each sample's ratio weighed by its luma squared, and
// recombines. The blend mixes original and smoothed
// ratio (Amount) and luminance (Luminance) independently, scaled by coverage.

export const REF_LONG_EDGE = 4096;
export const LEVELS = 4;
/** Blur width (px at REF_LONG_EDGE) at Pattern 0; ×SIGMA_RANGE at Pattern 100. */
export const SIGMA_MIN = 1.5;
export const SIGMA_RANGE = 16;
/** Log-luma difference that stops luminance smoothing at Edge protection 0;
 *  ×EDGE_SIGMA_RATIO at 100. */
export const EDGE_SIGMA_MAX = 1.5;
export const EDGE_SIGMA_RATIO = 0.04;
export const CHROMA_SIGMA_SCALE = 1.5;
/** σ (in base strides) of the four cascaded B3 levels at dilations 1, 2, 4, 8. */
export const LEVEL_SIGMA = Math.sqrt(1 + 4 + 16 + 64);
export const LUMA_FLOOR = 1e-4;
/** A colour with no channel below black has luma ≥ 0.0722 × its peak channel
 *  (the blue weight). The blend floors the original's and the smoothed colour's
 *  luma at this share of the peak |channel| so a signed colour (a RAW decode
 *  outside sRGB, luma near or below zero) keeps its luma-normalized ratio as
 *  bounded as an in-gamut one; a no-op for the rest. */
export const PEAK_LUMA_FLOOR = 0.07;

export const B3 = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16] as const;
export const LUMA_WEIGHTS = [0.2126, 0.7152, 0.0722] as const;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function blurSigmaRef(pattern: number): number {
  return SIGMA_MIN * Math.pow(SIGMA_RANGE, clamp01(pattern / 100));
}

/** Base texel stride for a pass whose long edge is `longEdge` px. */
export function baseStride(pattern: number, longEdge: number): number {
  return (blurSigmaRef(pattern) * (longEdge / REF_LONG_EDGE)) / LEVEL_SIGMA;
}

export function lumaSigma(edge: number): number {
  return EDGE_SIGMA_MAX * Math.pow(EDGE_SIGMA_RATIO, clamp01(edge / 100));
}

export function chromaSigma(edge: number): number {
  return CHROMA_SIGMA_SCALE * lumaSigma(edge);
}

export interface RgbImage {
  width: number;
  height: number;
  /** RGB interleaved, row-major, top-down. */
  data: Float32Array;
}

export interface FilterParams {
  amount: number;
  luminance: number;
  pattern: number;
  edge: number;
}

export function luma(r: number, g: number, b: number): number {
  return r * LUMA_WEIGHTS[0] + g * LUMA_WEIGHTS[1] + b * LUMA_WEIGHTS[2];
}

// texture() with LINEAR filtering and CLAMP_TO_EDGE, sampled at a fractional
// texel offset from a pixel centre — what readPrev(vUv + o * uTexel) does.
function bilinear(img: RgbImage, fx: number, fy: number, out: Float32Array): void {
  const { width, height, data } = img;
  const cx = Math.min(Math.max(fx, 0), width - 1);
  const cy = Math.min(Math.max(fy, 0), height - 1);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const tx = cx - x0;
  const ty = cy - y0;
  for (let ch = 0; ch < 3; ch++) {
    const a = data[(y0 * width + x0) * 3 + ch];
    const b = data[(y0 * width + x1) * 3 + ch];
    const c = data[(y1 * width + x0) * 3 + ch];
    const d = data[(y1 * width + x1) * 3 + ch];
    out[ch] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
}

/** One à trous iteration at texel dilation `stride`. Version 2 averages the
 *  chroma ratio weighted by each sample's luma squared, so a dark sample whose
 *  signed colour makes a large ratio over its floored luma adds only as much
 *  colour as it has light. Process version 1 clips each sample below black,
 *  ratio included, and averages the ratio with plain weights, as 1.0.0 did. */
export function smoothPass(
  src: RgbImage,
  stride: number,
  sigmaL: number,
  sigmaC: number,
  processVersion = 2,
): RgbImage {
  const { width, height, data } = src;
  const out = new Float32Array(data.length);
  const s = new Float32Array(3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 3;
      const Lc = Math.max(
        luma(Math.max(data[o], 0), Math.max(data[o + 1], 0), Math.max(data[o + 2], 0)),
        LUMA_FLOOR,
      );
      let accL = 0;
      let wL = 0;
      let accR0 = 0;
      let accR1 = 0;
      let accR2 = 0;
      let wC = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          bilinear(src, x + dx * stride, y + dy * stride, s);
          if (processVersion < 2) for (let ch = 0; ch < 3; ch++) s[ch] = Math.max(s[ch], 0);
          const Ls = Math.max(luma(Math.max(s[0], 0), Math.max(s[1], 0), Math.max(s[2], 0)), LUMA_FLOOR);
          const sp = B3[dx + 2] * B3[dy + 2];
          const dl = Math.log(Ls / Lc);
          const eL = Math.exp(-(dl * dl) / (sigmaL * sigmaL));
          const eC = Math.exp(-(dl * dl) / (sigmaC * sigmaC));
          accL += Ls * sp * eL;
          wL += sp * eL;
          if (processVersion < 2) {
            accR0 += (s[0] / Ls) * sp * eC;
            accR1 += (s[1] / Ls) * sp * eC;
            accR2 += (s[2] / Ls) * sp * eC;
            wC += sp * eC;
          } else {
            const wS = Ls * sp * eC;
            accR0 += s[0] * wS;
            accR1 += s[1] * wS;
            accR2 += s[2] * wS;
            wC += Ls * wS;
          }
        }
      }
      const Lp = accL / wL;
      out[o] = (accR0 / wC) * Lp;
      out[o + 1] = (accR1 / wC) * Lp;
      out[o + 2] = (accR2 / wC) * Lp;
    }
  }
  return { width, height, data: out };
}

/** The full prepass chain: LEVELS iterations at doubling strides. */
export function prepass(src: RgbImage, params: FilterParams, longEdge: number, processVersion = 2): RgbImage {
  const stride = baseStride(params.pattern, longEdge);
  const sL = lumaSigma(params.edge);
  const sC = chromaSigma(params.edge);
  let cur = src;
  for (let level = 0; level < LEVELS; level++) {
    cur = smoothPass(cur, stride * 2 ** level, sL, sC, processVersion);
  }
  return cur;
}

/** The blend's luma of the colour at `o`, floored at PEAK_LUMA_FLOOR of its
 *  peak |channel|; at 1e-6 alone on process version 1, as 1.0.0 did. */
function flooredLuma(data: Float32Array, o: number, processVersion: number): number {
  if (processVersion < 2) return Math.max(luma(data[o], data[o + 1], data[o + 2]), 1e-6);
  const peak = Math.max(Math.abs(data[o]), Math.abs(data[o + 1]), Math.abs(data[o + 2]));
  return Math.max(luma(data[o], data[o + 1], data[o + 2]), 1e-6, PEAK_LUMA_FLOOR * peak);
}

/** Prepass + inline blend. `coverage(x, y)` is the painted mask (1 = whole
 *  image when absent), sampled at pixel coordinates. `processVersion` is the
 *  photo's: version 1 keeps 1.0.0's clipping maths. */
export function applyMoire(
  src: RgbImage,
  params: FilterParams,
  longEdge: number,
  coverage?: (x: number, y: number) => number,
  processVersion = 2,
): RgbImage {
  const ca0 = clamp01(params.amount / 100);
  const la0 = clamp01(params.luminance / 100);
  const out = new Float32Array(src.data);
  if (ca0 <= 0 && la0 <= 0) return { width: src.width, height: src.height, data: out };
  const smooth = prepass(src, params, longEdge, processVersion);
  const { width, height, data } = src;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cov = coverage ? coverage(x, y) : 1;
      const ca = ca0 * cov;
      const la = la0 * cov;
      if (ca <= 0.0005 && la <= 0.0005) continue;
      const o = (y * width + x) * 3;
      const L0 = flooredLuma(data, o, processVersion);
      const Ls = flooredLuma(smooth.data, o, processVersion);
      const L = L0 + (Ls - L0) * la;
      for (let ch = 0; ch < 3; ch++) {
        const r0 = data[o + ch] / L0;
        const rs = smooth.data[o + ch] / Ls;
        out[o + ch] = (r0 + (rs - r0) * ca) * L;
      }
    }
  }
  return { width, height, data: out };
}
