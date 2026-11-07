// Activation smoke test: the entry point wires the stage, panel and shortcut
// against a stand-in API in node, the shortcut only arms the brush in Develop
// with a photo loaded, and the brush holds the canvas tool while it's on. No
// React render — the components are exercised by the in-app checks; this pins
// the contract activate() makes.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activate, deactivate } from "../src/index";
import { store } from "../src/store";
import type {
  CanvasTool,
  DevelopStoreState,
  KeyActionContribution,
  PanelContribution,
  ProcessingStageContribution,
  SafelightAPI,
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
  keys: KeyActionContribution[];
  unregistered: string[];
  tools: (CanvasTool | null)[];
}

function fakeApi(): { api: SafelightAPI; registered: Registered; develop: StoreApi<DevelopStoreState>; ui: StoreApi<UIStoreState> } {
  const registered: Registered = { stages: [], panels: [], keys: [], unregistered: [], tools: [] };
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
    registerKeybinding: (c: KeyActionContribution) => void registered.keys.push(c),
    stores: { create: fakeStore, useDevelopStore: develop, useUIStore: ui },
    develop: { setCanvasTool: (t: CanvasTool | null) => void registered.tools.push(t) },
  } as Partial<SafelightAPI> as SafelightAPI;
  return { api, registered, develop, ui };
}

describe("activate", () => {
  beforeEach(() => {
    // inDevelop() reads the detached-window query string.
    Object.assign(globalThis, { window: { location: { search: "" } } });
  });

  afterEach(() => {
    deactivate();
    delete (globalThis as { window?: unknown }).window;
  });

  it("registers the stage, panel and shortcut under the extension id", () => {
    const { api, registered } = fakeApi();
    activate(api);
    expect(registered.stages.map((s) => s.id)).toEqual(["moire-reduction.reduce"]);
    expect(registered.panels.map((p) => p.id)).toEqual(["moire-reduction.panel"]);
    expect(registered.panels[0].defaultDock?.module).toBe("develop");
    expect(registered.keys).toMatchObject([{ id: "moire-reduction.paint", defaultCombo: "Shift+M", category: "Develop" }]);
  });

  it("starts with the brush off and a brush of its own at the masking defaults", () => {
    const { api } = fakeApi();
    activate(api);
    expect(store().getState()).toMatchObject({
      armed: false,
      brushSize: 0.08,
      brushFeather: 0.5,
      brushOpacity: 1,
      brushFlow: 1,
      brushErase: false,
      brushPreview: false,
    });
  });

  it("keeps the brush settings in its own store", () => {
    const { api } = fakeApi();
    activate(api);
    const s = store().getState();
    s.setBrushSize(0.2);
    s.setBrushFeather(0.1);
    s.setBrushFlow(0.3);
    s.setBrushOpacity(0.4);
    s.setBrushErase(true);
    s.setBrushPreview(true);
    expect(store().getState()).toMatchObject({
      brushSize: 0.2,
      brushFeather: 0.1,
      brushFlow: 0.3,
      brushOpacity: 0.4,
      brushErase: true,
      brushPreview: true,
    });
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

  it("holds the canvas tool while the brush is on and lets it go when off", () => {
    const { api, registered } = fakeApi();
    activate(api);
    store().getState().setArmed(true);
    store().getState().setArmed(false);
    expect(registered.tools.map((t) => t !== null)).toEqual([true, false]);
  });

  it("takes core's brush shortcuts while it holds the canvas", () => {
    const { api, registered } = fakeApi();
    activate(api);
    store().getState().setArmed(true);
    const tool = registered.tools[0];
    expect(tool?.zoomable).toBe(true);
    expect(tool?.wants?.("brush.larger")).toBe(true);
    expect(tool?.onAction?.("brush.larger")).toBe(true);
    expect(store().getState().brushSize).toBe(0.09);
    expect(tool?.wants?.("mask.delete")).toBe(false);
    expect(tool?.onAction?.("mask.delete")).toBe(false);
    tool?.onEscape?.();
    expect(store().getState().armed).toBe(false);
  });

  it("disarms, lets the canvas go and drops the stage on deactivate", () => {
    const { api, registered } = fakeApi();
    activate(api);
    store().getState().setArmed(true);
    deactivate();
    expect(store().getState().armed).toBe(false);
    expect(registered.unregistered).toEqual(["moire-reduction.reduce"]);
    expect(registered.tools[registered.tools.length - 1]).toBeNull();
  });
});
