// Session state: whether the brush is armed. Not part of the photo's edit — the
// mask itself lives in the paramBag (persistence.ts).

import type { StoreApi } from "./safelight";
import { api } from "./runtime";

export interface MoireState {
  armed: boolean;
  setArmed(v: boolean): void;
  toggleArmed(): void;
}

let instance: StoreApi<MoireState> | null = null;

export function initStore(): StoreApi<MoireState> {
  instance = api().stores.create<MoireState>((set) => ({
    armed: false,
    setArmed: (armed) => set({ armed }),
    toggleArmed: () => set((s) => ({ armed: !s.armed })),
  }));
  return instance;
}

export function store(): StoreApi<MoireState> {
  if (!instance) throw new Error("[moire-reduction] store used before activate()");
  return instance;
}
