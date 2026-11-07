// Moiré Reduction — Safelight extension entry point.
//
// One GPU stage (stage.ts) does the filtering; the panel (Panel.ts) drives its
// params through the develop param bag; the overlay (Overlay.ts) is the canvas
// tool held while the brush is armed and paints the optional mask into the bag
// as a dab list that core bakes into coverage. Core provides only generic
// hooks — the stage framework with a coverage-kind texture and the canvas tool
// with image-space pointer mapping — so everything moiré-specific, the brush
// included, lives here.

import type { SafelightAPI } from "./safelight";
import { api, initRuntime } from "./runtime";
import { initStore, store } from "./store";
import { buildStage, EXT_ID, STAGE_ID } from "./stage";
import { inDevelop } from "./keys";
import { MOIRE_TOOL } from "./Overlay";
import { MoirePanel } from "./Panel";
import { resetAll } from "./persistence";

let unfollow: (() => void) | null = null;

export function activate(host: SafelightAPI): void {
  initRuntime(host);
  initStore();
  host.registerProcessingStage(buildStage());

  // The brush armed holds the canvas; disarmed lets it go.
  unfollow = store().subscribe((s, prev) => {
    if (s.armed !== prev.armed) host.develop.setCanvasTool(s.armed ? MOIRE_TOOL : null);
  });

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

  host.registerPanel({
    id: `${EXT_ID}.panel`,
    title: "Moiré Reduction",
    component: MoirePanel,
    defaultDock: { module: "develop", direction: "right", order: 8, width: 250 },
    onReset: () => void resetAll(),
  });
}

export function deactivate(): void {
  // The host sweeps the panel, keybinding, canvas tool and stage on
  // disable/uninstall and recompiles the develop shader without it; this makes
  // their removal explicit and drops the armed state so a re-enable starts
  // clean.
  try {
    store().getState().setArmed(false);
    unfollow?.();
    unfollow = null;
    api().develop.setCanvasTool(null);
    api().unregisterProcessingStage(STAGE_ID);
  } catch {
    /* activate() never ran — nothing to tear down */
  }
}
