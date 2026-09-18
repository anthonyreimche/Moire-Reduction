// Moiré Reduction — Safelight extension entry point.
//
// One GPU stage (stage.ts) does the filtering; the panel (Panel.ts) drives its
// params through the develop param bag; the overlay (Overlay.ts) paints the
// optional mask into the bag as a dab list that core bakes into coverage. Core
// provides only generic hooks — the stage framework with a coverage-kind
// texture, a canvas-overlay slot with image-space pointer mapping, and the
// shared brush state — so everything moiré-specific lives here.

import type { SafelightAPI } from "./safelight";
import { api, initRuntime } from "./runtime";
import { initStore, store } from "./store";
import { buildStage, EXT_ID, STAGE_ID } from "./stage";
import { inDevelop, initKeys } from "./keys";
import { MoireOverlay } from "./Overlay";
import { MoirePanel } from "./Panel";
import { resetAll } from "./persistence";

let unbindKeys: (() => void) | null = null;

export function activate(host: SafelightAPI): void {
  initRuntime(host);
  initStore();
  host.registerProcessingStage(buildStage());
  unbindKeys = initKeys();

  host.registerKeybinding({
    id: `${EXT_ID}.paint`,
    label: "Paint moiré mask",
    category: "Develop",
    defaultCombo: "Shift+M",
    handler: () => {
      if (inDevelop() && host.stores.useDevelopStore.getState().photoId) {
        store().getState().toggleArmed();
      }
    },
  });

  host.registerSlot({
    id: `${EXT_ID}.overlay`,
    slot: "develop-canvas-overlay",
    component: MoireOverlay,
    order: 45,
  });

  host.registerPanel({
    id: `${EXT_ID}.panel`,
    title: "Moiré Reduction",
    component: MoirePanel,
    defaultDock: { module: "develop", direction: "right", order: 8, width: 250 },
    onReset: () => void resetAll(),
  });
}

export function deactivate(): void {
  unbindKeys?.();
  unbindKeys = null;
  // The host sweeps the panel, slot, keybinding and stage on disable/uninstall
  // and recompiles the develop shader without it; this only makes the stage
  // removal explicit and drops the armed state so a re-enable starts clean.
  try {
    store().getState().setArmed(false);
    api().unregisterProcessingStage(STAGE_ID);
  } catch {
    /* activate() never ran — nothing to tear down */
  }
}
