import { describe, expect, it } from "vitest";
import { applyBrushAction, comboFromEvent, matchBrushAction, type KeyLike } from "../src/keys";
import type { DevelopStoreState } from "../src/safelight";

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("comboFromEvent", () => {
  it("formats modifiers the way Preferences ▸ Shortcuts stores them", () => {
    expect(comboFromEvent(key("["))).toBe("[");
    expect(comboFromEvent(key("{", { shiftKey: true }))).toBe("Shift+{");
    expect(comboFromEvent(key("m", { ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+M");
    expect(comboFromEvent(key("Shift", { shiftKey: true }))).toBeNull();
  });
});

describe("matchBrushAction", () => {
  const defaults: Record<string, string> = {
    "brush.smaller": "[",
    "brush.larger": "]",
    "brush.featherDown": "Shift+[",
    "brush.featherUp": "Shift+]",
    "brush.opacityDown": ",",
    "brush.opacityUp": ".",
    "brush.flowDown": "Shift+,",
    "brush.flowUp": "Shift+.",
  };
  const bound =
    (over: Record<string, string> = {}) =>
    (id: string) =>
      over[id] ?? defaults[id] ?? "";

  it("matches the live binding", () => {
    expect(matchBrushAction("]", bound())).toBe("brush.larger");
    expect(matchBrushAction("Ctrl+]", bound({ "brush.larger": "Ctrl+]" }))).toBe("brush.larger");
    expect(matchBrushAction("]", bound({ "brush.larger": "Ctrl+]" }))).toBeNull();
  });

  it("honours the shifted-key alias only while the binding is at its default", () => {
    expect(matchBrushAction("Shift+}", bound())).toBe("brush.featherUp");
    expect(matchBrushAction("Shift+}", bound({ "brush.featherUp": "F" }))).toBeNull();
  });
});

describe("applyBrushAction", () => {
  interface Probe {
    log: string[];
    state: DevelopStoreState;
  }

  // Only the brush fields and setters are exercised; the rest of the store
  // shape is irrelevant to these steps, hence the partial cast.
  function probe(): Probe {
    const log: string[] = [];
    const state = {
      brushSize: 0.5,
      brushFeather: 0.97,
      brushOpacity: 0.05,
      brushFlow: 1,
      setBrushSize: (v: number) => log.push(`size ${v}`),
      setBrushFeather: (v: number) => log.push(`feather ${v}`),
      setBrushOpacity: (v: number) => log.push(`opacity ${v}`),
      setBrushFlow: (v: number) => log.push(`flow ${v}`),
    } as Partial<DevelopStoreState> as DevelopStoreState;
    return { log, state };
  }

  it("steps core's brush fields by core's increments and clamps at core's limits", () => {
    const { log, state } = probe();
    applyBrushAction("brush.larger", state);
    applyBrushAction("brush.featherUp", state);
    applyBrushAction("brush.opacityDown", state);
    applyBrushAction("brush.flowUp", state);
    expect(log).toEqual(["size 0.5", "feather 1", "opacity 0.01", "flow 1"]);
  });

  it("ignores unknown action ids", () => {
    const { log, state } = probe();
    applyBrushAction("brush.unknown", state);
    expect(log).toEqual([]);
  });
});
