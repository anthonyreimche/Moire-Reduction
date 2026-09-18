// Keyboard handling while the brush is armed. Core's rebindable brush shortcuts
// (Preferences ▸ Shortcuts) are reused rather than re-registered: their live
// combos are read through api.keybindings.getBinding and matched here, in the
// capture phase, because core's own handler only acts on them while a core
// brush tool is active. Esc disarms. Steps and limits mirror core's handler.

import type { DevelopStoreState } from "./safelight";
import { api } from "./runtime";
import { store } from "./store";

interface BrushKeyAction {
  def: string;
  /** What most keyboards emit for the shifted default (Shift+[ → Shift+{). */
  alts: readonly string[];
  apply(s: DevelopStoreState): void;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const round2 = (v: number): number => Math.round(v * 100) / 100;

export const BRUSH_ACTIONS: Readonly<Record<string, BrushKeyAction>> = {
  "brush.smaller": {
    def: "[",
    alts: [],
    apply: (s) => s.setBrushSize(clamp(s.brushSize - 0.01, 0.01, 0.5)),
  },
  "brush.larger": {
    def: "]",
    alts: [],
    apply: (s) => s.setBrushSize(clamp(s.brushSize + 0.01, 0.01, 0.5)),
  },
  "brush.featherDown": {
    def: "Shift+[",
    alts: ["Shift+{"],
    apply: (s) => s.setBrushFeather(clamp(round2(s.brushFeather - 0.05), 0, 1)),
  },
  "brush.featherUp": {
    def: "Shift+]",
    alts: ["Shift+}"],
    apply: (s) => s.setBrushFeather(clamp(round2(s.brushFeather + 0.05), 0, 1)),
  },
  "brush.opacityDown": {
    def: ",",
    alts: [],
    apply: (s) => s.setBrushOpacity(clamp(round2(s.brushOpacity - 0.1), 0.01, 1)),
  },
  "brush.opacityUp": {
    def: ".",
    alts: [],
    apply: (s) => s.setBrushOpacity(clamp(round2(s.brushOpacity + 0.1), 0.01, 1)),
  },
  "brush.flowDown": {
    def: "Shift+,",
    alts: ["Shift+<"],
    apply: (s) => s.setBrushFlow(clamp(round2(s.brushFlow - 0.1), 0.01, 1)),
  },
  "brush.flowUp": {
    def: "Shift+.",
    alts: ["Shift+>"],
    apply: (s) => s.setBrushFlow(clamp(round2(s.brushFlow + 0.1), 0.01, 1)),
  },
};

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function comboFromEvent(e: KeyLike): string | null {
  const k = e.key;
  if (k === "Control" || k === "Shift" || k === "Alt" || k === "Meta") return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  parts.push(k.length === 1 ? k.toUpperCase() : k);
  return parts.join("+");
}

export function matchBrushAction(
  combo: string,
  getBinding: (id: string) => string,
): string | null {
  for (const [id, action] of Object.entries(BRUSH_ACTIONS)) {
    const bound = getBinding(id);
    if (combo === bound || (bound === action.def && action.alts.includes(combo))) return id;
  }
  return null;
}

export function applyBrushAction(id: string, s: DevelopStoreState): void {
  BRUSH_ACTIONS[id]?.apply(s);
}

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  if (t instanceof HTMLInputElement) {
    return !["range", "checkbox", "radio", "button", "color", "file", "submit", "reset"].includes(
      t.type,
    );
  }
  return t.isContentEditable;
}

export function inDevelop(): boolean {
  const detached = new URLSearchParams(window.location.search).get("detached");
  return (
    api().stores.useUIStore.getState().activeModule === "develop" || detached === "develop"
  );
}

export function initKeys(): () => void {
  const handler = (e: KeyboardEvent) => {
    if (!store().getState().armed || !inDevelop()) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      store().getState().setArmed(false);
      return;
    }
    if (isEditableTarget(e.target)) return;
    const combo = comboFromEvent(e);
    if (!combo) return;
    const id = matchBrushAction(combo, (actionId) => api().keybindings.getBinding(actionId));
    if (!id) return;
    e.preventDefault();
    applyBrushAction(id, api().stores.useDevelopStore.getState());
  };
  window.addEventListener("keydown", handler, true);
  return () => window.removeEventListener("keydown", handler, true);
}
