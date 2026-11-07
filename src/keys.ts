// Core's rebindable brush shortcuts (Preferences ▸ Shortcuts), as the held
// canvas tool receives them: each steps one brush setting. Steps and limits
// mirror core's own brush. inDevelop() gates the Shift+M shortcut.

import type { BrushState } from "./brush";
import { api } from "./runtime";

type NumericSetting = "brushSize" | "brushFeather" | "brushOpacity" | "brushFlow";

interface Step {
  key: NumericSetting;
  step: number;
  min: number;
  max: number;
}

const STEPS: Readonly<Record<string, Step>> = {
  "brush.smaller": { key: "brushSize", step: -0.01, min: 0.01, max: 0.5 },
  "brush.larger": { key: "brushSize", step: 0.01, min: 0.01, max: 0.5 },
  "brush.featherDown": { key: "brushFeather", step: -0.05, min: 0, max: 1 },
  "brush.featherUp": { key: "brushFeather", step: 0.05, min: 0, max: 1 },
  "brush.opacityDown": { key: "brushOpacity", step: -0.1, min: 0.01, max: 1 },
  "brush.opacityUp": { key: "brushOpacity", step: 0.1, min: 0.01, max: 1 },
  "brush.flowDown": { key: "brushFlow", step: -0.1, min: 0.01, max: 1 },
  "brush.flowUp": { key: "brushFlow", step: 0.1, min: 0.01, max: 1 },
};

/** The brush after `action`'s step, or null for an action that isn't one. */
export function brushStep(action: string, brush: BrushState): Partial<BrushState> | null {
  const s = STEPS[action];
  if (!s) return null;
  const v = Math.round((brush[s.key] + s.step) * 100) / 100;
  return { [s.key]: Math.max(s.min, Math.min(s.max, v)) };
}

export function inDevelop(): boolean {
  const detached = new URLSearchParams(window.location.search).get("detached");
  return (
    api().stores.useUIStore.getState().activeModule === "develop" || detached === "develop"
  );
}
