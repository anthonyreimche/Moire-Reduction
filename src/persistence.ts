// The mask lives in the photo's paramBag as a dab list under the stage's
// coverage key, next to a maskOn switch the inline GLSL gates on. Writing it
// through setDynParams gives undo/redo, the sidecar, photo switches and
// paste-settings for free; core bakes the coverage per render.

import type { Dab } from "./brush";
import { api } from "./runtime";
import { KNOB_DEFAULTS, PARAM } from "./stage";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// The bag comes back from sidecar JSON, so a dab is checked field by field.
function isDab(value: unknown): value is Dab {
  if (typeof value !== "object" || value === null) return false;
  const d = value as Partial<Record<keyof Dab, unknown>>;
  return (
    finite(d.x) &&
    finite(d.y) &&
    finite(d.radius) &&
    finite(d.feather) &&
    finite(d.opacity) &&
    finite(d.flow) &&
    typeof d.erase === "boolean"
  );
}

export function isDabList(value: unknown): value is Dab[] {
  return Array.isArray(value) && value.every(isDab);
}

export function readMask(bag: Record<string, unknown>): Dab[] {
  const value = bag[PARAM.mask];
  return isDabList(value) ? value : [];
}

export function maskPatch(dabs: Dab[]): Record<string, unknown> {
  return { [PARAM.mask]: dabs, [PARAM.maskOn]: dabs.length > 0 ? 1 : 0 };
}

function develop() {
  return api().stores.useDevelopStore.getState();
}

/** Append dabs live (no history entry); the overlay commits at pointer-up. */
export function appendDabs(dabs: Dab[]): void {
  const d = develop();
  d.setDynParams(maskPatch([...readMask(d.paramBag), ...dabs]));
}

export function hasMask(bag: Record<string, unknown>): boolean {
  return readMask(bag).length > 0;
}

export async function clearMask(): Promise<void> {
  const d = develop();
  d.setDynParams(maskPatch([]));
  await d.commitEdit("Clear Moiré Mask");
}

export async function resetAll(): Promise<void> {
  const d = develop();
  d.setDynParams({
    [PARAM.amount]: KNOB_DEFAULTS.amount,
    [PARAM.luminance]: KNOB_DEFAULTS.luminance,
    [PARAM.pattern]: KNOB_DEFAULTS.pattern,
    [PARAM.edge]: KNOB_DEFAULTS.edge,
    ...maskPatch([]),
  });
  await d.commitEdit("Reset Moiré Reduction");
}
