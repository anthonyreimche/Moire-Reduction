# Moiré Reduction for Safelight

Reduce colour and luminance moiré — the rainbow bands and interference fringes
that fine repetitive patterns (fabric weaves, screens, roof tiles, feathers)
leave after demosaicing — with four sliders and, when the problem is local, a
brush that confines the reduction to a painted area.

It registers one GPU processing stage that runs at the noise-reduction point of
the pipeline (before exposure, so the smoothing is scene-referred and core noise
reduction keeps working), a **Develop ▸ Moiré Reduction** panel, and a canvas
brush.

## Controls

| Control | Effect |
| --- | --- |
| Amount | Colour moiré: smooths chroma at the pattern scale while luminance stays sharp. Hold Alt/Ctrl while dragging to see the chroma alone. |
| Luminance | Luminance moiré: smooths luminance at the pattern scale. Softens the texture, so it is off by default and best used with the brush. |
| Pattern | The scale of the bands the filter targets (log-spaced, from very fine to about 24 px at a 4096-px long edge). Anchored to the image, so Develop, thumbnails and export match. |
| Edge protection | How strongly real luminance edges stop the smoothing from bleeding across object boundaries. |

**Paint mask** arms the brush (also **Shift+M**, rebindable). Until you paint,
the sliders apply to the whole image; the first stroke confines them to the
painted area, and **Clear mask** returns to the whole image. The brush shares
Safelight's brush settings and shortcuts: `[` `]` size, `Shift+[` `]` feather,
`,` `.` opacity, `Shift+,` `.` flow, Alt to erase, Shift+click for a straight
line, Ctrl/⌘ or Space to pan and zoom, Esc when done. Each stroke is one undo
step; the mask is saved with the photo.

## How it works

One prepass, four à trous iterations of an edge-aware 5×5 B3-spline kernel
(26 texture fetches per draw). Each iteration splits the previous result into
luminance and chroma, smooths luminance under the Edge-protection threshold and
chroma under a looser one — so chroma crosses the fine weave edges that carry
the false colour but stops at object boundaries — and recombines. The inline
blend mixes original and smoothed chroma (Amount) and luminance (Luminance)
independently, scaled by the painted coverage.

Colours outside sRGB (negative channels in a RAW decode) and values past white
keep their range: the luminance that steers the smoothing is measured on the
colour clipped at black, but the chroma it smooths keeps its sign, so a flat
patch comes back as it went in at any Amount.

## Requirements

Safelight 2.5.5 or newer (painted coverage textures for extension stages).
Float render targets (`EXT_color_buffer_float`) are used when available;
without them the prepass falls back to 8-bit and clips highlights above 1.0.

## Build

```sh
npm install --legacy-peer-deps
npm run build      # → dist/index.js
npm test           # CPU reference, brush model, GPU fetch budget, activation
npm run test:gpu   # the stage on the real renderer (needs a Safelight checkout)
```

`--legacy-peer-deps` sidesteps an npm 10.9 resolver crash on vitest 4's
optional browser peers; nothing in the extension depends on peers.

Install the folder through Safelight's Extensions store or your dev plugins
folder.

## Licence

MIT
