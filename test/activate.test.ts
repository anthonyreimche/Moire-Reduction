// Activation smoke test: the entry point wires the stage, panel, overlay slot
// and shortcut against a stand-in API in node, and the shortcut only arms the
// brush in Develop with a photo loaded. No React render — the components are
// exercised by the in-app checks; this pins the contract activate() makes.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activate, deactivate } from "../src/index";
import { store } from "../src/store";
import type {
  DevelopStoreState,
  KeyActionContribution,
  PanelContribution,
  ProcessingStageContribution,
  SafelightAPI,
  SlotContribution,
  StateCreator,
  StoreApi,
  UIStoreState,
} from "../src/safelight";

function fakeStore<T extends object>(init: StateCreator<T> | T): StoreApi<T> {
  let state: T;
  const listeners = new Set<(s: T, prev: T) => void>();
  const set = (partial: Partial<T> | ((s: T) => Partial<T>)) => {
    const prev = state;
    state = { ...state, ...(typeof partial === "function" ? partial(state) : partial) };
    for (const l of listeners) l(state, prev);
  };
  const get = () => state;
  state = typeof init === "function" ? (init as StateCreator<T>)(set, get) : init;
  const hook = ((selector?: (s: T) => unknown) => (selector ? selector(state) : state)) as StoreApi<T>;
  hook.getState = get;
  hook.setState = set;
  hook.subscribe = (l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  return hook;
}

interface Registered {
  stages: ProcessingStageContribution[];
  panels: PanelContribution[];
  slots: SlotContribution[];
  keys: KeyActionContribution[];
  unregistered: string[];
}

function fakeApi(): { api: SafelightAPI; registered: Registered; develop: StoreApi<DevelopStoreState>; ui: StoreApi<UIStoreState> } {
  const registered: Registered = { stages: [], panels: [], slots: [], keys: [], unregistered: [] };
  // Only the members activate() touches are populated; the rest of the store
  // surface is irrelevant here, hence the partial cast.
  const develop = fakeStore<DevelopStoreState>({ photoId: null } as Partial<DevelopStoreState> as DevelopStoreState);
  const ui = fakeStore<UIStoreState>({ activeModule: "library" });
  const api = {
    version: 1,
    extensionId: "moire-reduction",
    registerProcessingStage: (c: ProcessingStageContribution) => void registered.stages.push(c),
    unregisterProcessingStage: (id: string) => void registered.unregistered.push(id),
    registerPanel: (c: PanelContribution) => void registered.panels.push(c),
    registerSlot: (c: SlotContribution) => void registered.slots.push(c),
    registerKeybinding: (c: KeyActionContribution) => void registered.keys.push(c),
    stores: { create: fakeStore, useDevelopStore: develop, useUIStore: ui },
  } as Partial<SafelightAPI> as SafelightAPI;
  return { api, registered, develop, ui };
}

describe("activate", () => {
  const listeners: string[] = [];

  beforeEach(() => {
    // keys.ts binds to window in the capture phase; node has no window.
    Object.assign(globalThis, {
      window: {
        addEventListener: (type: string) => void listeners.push(`add ${type}`),
        removeEventListener: (type: string) => void listeners.push(`remove ${type}`),
        location: { search: "" },
      },
    });
  });

  afterEach(() => {
    deactivate();
    listeners.length = 0;
    delete (globalThis as { window?: unknown }).window;
  });

  it("registers the stage, panel, overlay slot and shortcut under the extension id", () => {
    const { api, registered } = fakeApi();
    activate(api);
    expect(registered.stages.map((s) => s.id)).toEqual(["moire-reduction.reduce"]);
    expect(registered.panels.map((p) => p.id)).toEqual(["moire-reduction.panel"]);
    expect(registered.panels[0].defaultDock?.module).toBe("develop");
    expect(registered.slots).toMatchObject([{ id: "moire-reduction.overlay", slot: "develop-canvas-overlay" }]);
    expect(registered.keys).toMatchObject([{ id: "moire-reduction.paint", defaultCombo: "Shift+M", category: "Develop" }]);
    expect(listeners).toEqual(["add keydown"]);
  });

  it("arms the brush from the shortcut only in Develop with a photo open", () => {
    const { api, registered, develop, ui } = fakeApi();
    activate(api);
    const paint = registered.keys[0];
    paint.handler();
    expect(store().getState().armed).toBe(false);
    ui.setState({ activeModule: "develop" });
    paint.handler();
    expect(store().getState().armed).toBe(false);
    develop.setState({ photoId: "p1" });
    paint.handler();
    expect(store().getState().armed).toBe(true);
  });

  it("disarms, unbinds the keys and drops the stage on deactivate", () => {
    const { api, registered } = fakeApi();
    activate(api);
    store().getState().setArmed(true);
    deactivate();
    expect(store().getState().armed).toBe(false);
    expect(registered.unregistered).toEqual(["moire-reduction.reduce"]);
    expect(listeners).toEqual(["add keydown", "remove keydown"]);
  });
});
