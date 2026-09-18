import { describe, expect, it } from "vitest";
import { isDabList, maskPatch, readMask } from "../src/persistence";
import { PARAM } from "../src/stage";
import type { Dab } from "../src/brush";

const dab: Dab = { x: 0.5, y: 0.5, radius: 0.08, erase: false, feather: 0.5, opacity: 1, flow: 1 };

describe("readMask", () => {
  it("reads a painted list back", () => {
    expect(readMask({ [PARAM.mask]: [dab] })).toEqual([dab]);
  });

  it("reads absent or foreign values as no mask", () => {
    expect(readMask({})).toEqual([]);
    expect(readMask({ [PARAM.mask]: "x" })).toEqual([]);
    expect(readMask({ [PARAM.mask]: [{ x: 1 }] })).toEqual([]);
    expect(isDabList([dab, { ...dab, opacity: undefined }])).toBe(false);
  });
});

describe("maskPatch", () => {
  it("writes the list and derives the mask switch from it", () => {
    expect(maskPatch([dab])).toEqual({ [PARAM.mask]: [dab], [PARAM.maskOn]: 1 });
    expect(maskPatch([])).toEqual({ [PARAM.mask]: [], [PARAM.maskOn]: 0 });
  });
});
