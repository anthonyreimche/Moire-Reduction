// A synthetic moiré scene: a 3-px luminance weave (the aliased texture),
// 40-px colour bands riding on it (the false colour), and a 4:1 luminance
// boundary between two differently tinted halves. The metrics isolate each
// ingredient so a test can say "the bands went, the weave stayed, the
// boundary held".

import type { RgbImage } from "../src/filter";
import { luma } from "../src/filter";

export interface SceneOptions {
  stripePeriod?: number;
  bandPeriod?: number;
  /** Peak luminance modulation of the weave, relative. */
  stripeContrast?: number;
  /** Peak chroma modulation of the bands, relative. */
  bandAmplitude?: number;
}

// Zero-luma chroma direction (0.2126·1 + 0.7152·g + 0.0722·(−1) = 0).
const V = [1, -(0.2126 - 0.0722) / 0.7152, -1] as const;
const TINT_TOP = [1.1, 0.98, 0.85] as const;
const TINT_BOTTOM = [0.85, 1.0, 1.2] as const;

export function makeScene(width: number, height: number, opts: SceneOptions = {}): RgbImage {
  const stripePeriod = opts.stripePeriod ?? 3;
  const bandPeriod = opts.bandPeriod ?? 40;
  const stripeContrast = opts.stripeContrast ?? 0.3;
  const bandAmplitude = opts.bandAmplitude ?? 0.25;
  const boundary = height / 2;
  const data = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const top = y < boundary;
    const base = top ? 0.6 : 0.15;
    const tint = top ? TINT_TOP : TINT_BOTTOM;
    const tintLuma = luma(tint[0], tint[1], tint[2]);
    for (let x = 0; x < width; x++) {
      const L = base * (1 + stripeContrast * Math.sin((2 * Math.PI * x) / stripePeriod));
      const band = bandAmplitude * Math.sin((2 * Math.PI * x) / bandPeriod);
      const o = (y * width + x) * 3;
      for (let ch = 0; ch < 3; ch++) {
        data[o + ch] = (L * tint[ch] * (1 + band * V[ch])) / tintLuma;
      }
    }
  }
  return { width, height, data };
}

export type Span = [number, number];

/** Std-dev, averaged over rows, of the chroma signal (r − b) / L along x —
 *  the weave divides out, so this reads the colour bands alone. */
export function bandAmplitude(img: RgbImage, rows: Span, cols: Span): number {
  let total = 0;
  for (let y = rows[0]; y < rows[1]; y++) {
    const q: number[] = [];
    for (let x = cols[0]; x < cols[1]; x++) {
      const o = (y * img.width + x) * 3;
      const L = Math.max(luma(img.data[o], img.data[o + 1], img.data[o + 2]), 1e-6);
      q.push((img.data[o] - img.data[o + 2]) / L);
    }
    const mean = q.reduce((a, b) => a + b, 0) / q.length;
    total += Math.sqrt(q.reduce((a, b) => a + (b - mean) ** 2, 0) / q.length);
  }
  return total / (rows[1] - rows[0]);
}

/** RMS of luminance minus its 3-px box average — the weave alone. */
export function stripeAmplitude(img: RgbImage, rows: Span, cols: Span): number {
  let total = 0;
  let n = 0;
  const L = (x: number, y: number): number => {
    const o = (y * img.width + x) * 3;
    return luma(img.data[o], img.data[o + 1], img.data[o + 2]);
  };
  for (let y = rows[0]; y < rows[1]; y++) {
    for (let x = cols[0] + 1; x < cols[1] - 1; x++) {
      const d = L(x, y) - (L(x - 1, y) + L(x, y) + L(x + 1, y)) / 3;
      total += d * d;
      n++;
    }
  }
  return Math.sqrt(total / n);
}

/** Mean (r/L, b/L) over a region — the tint, independent of the weave. */
export function meanRatio(img: RgbImage, rows: Span, cols: Span): [number, number] {
  let r = 0;
  let b = 0;
  let n = 0;
  for (let y = rows[0]; y < rows[1]; y++) {
    for (let x = cols[0]; x < cols[1]; x++) {
      const o = (y * img.width + x) * 3;
      const L = Math.max(luma(img.data[o], img.data[o + 1], img.data[o + 2]), 1e-6);
      r += img.data[o] / L;
      b += img.data[o + 2] / L;
      n++;
    }
  }
  return [r / n, b / n];
}
