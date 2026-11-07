// Session state: whether the brush is armed and the brush's own settings. Not
// part of the photo's edit — the mask itself lives in the paramBag
// (persistence.ts).

import type { BrushState } from "./brush";
import type { StoreApi } from "./safelight";
import { api } from "./runtime";

export interface MoireState extends BrushState {
  armed: boolean;
  /** A brush slider is being dragged: the overlay shows the brush at the
   *  view's centre. */
  brushPreview: boolean;
  setArmed(v: boolean): void;
  toggleArmed(): void;
  setBrushSize(v: number): void;
  setBrushFeather(v: number): void;
  setBrushOpacity(v: number): void;
  setBrushFlow(v: number): void;
  setBrushErase(v: boolean): void;
  setBrushPreview(v: boolean): void;
}

let instance: StoreApi<MoireState> | null = null;

export function initStore(): StoreApi<MoireState> {
  instance = api().stores.create<MoireState>((set) => ({
    armed: false,
    brushSize: 0.08,
    brushFeather: 0.5,
    brushOpacity: 1,
    brushFlow: 1,
    brushErase: false,
    brushPreview: false,
    setArmed: (armed) => set({ armed }),
    toggleArmed: () => set((s) => ({ armed: !s.armed })),
    setBrushSize: (brushSize) => set({ brushSize }),
    setBrushFeather: (brushFeather) => set({ brushFeather }),
    setBrushOpacity: (brushOpacity) => set({ brushOpacity }),
    setBrushFlow: (brushFlow) => set({ brushFlow }),
    setBrushErase: (brushErase) => set({ brushErase }),
    setBrushPreview: (brushPreview) => set({ brushPreview }),
  }));
  return instance;
}

export function store(): StoreApi<MoireState> {
  if (!instance) throw new Error("[moire-reduction] store used before activate()");
  return instance;
}
