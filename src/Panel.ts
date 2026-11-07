// The Develop panel: the four filter sliders, the mask row, and — while the
// brush is armed — the brush's own settings. Sliders write the paramBag by
// qualified key and commit on release; Alt/Ctrl-drag previews reuse core's
// sharpenViz modes (chroma reveal for the colour knobs, luminance for
// Luminance). Generic controls come from api.ui; text stays selectable.

import type { CSSProperties } from "react";
import { clearMask, hasMask } from "./persistence";
import { api, h } from "./runtime";
import { KNOBS, PARAM, type Knob } from "./stage";
import { store } from "./store";

const HINT: CSSProperties = {
  fontSize: "10px",
  color: "var(--color-text-muted)",
  lineHeight: 1.4,
};

export function MoirePanel() {
  const a = api();
  const Slider = a.components.Slider;
  const { Button, Toggle, Row, Stack } = a.ui;
  const dev = a.stores.useDevelopStore;
  const react = a.react;

  const armed = store()((s) => s.armed);
  const paramBag = dev((s) => s.paramBag);
  const brushSize = store()((s) => s.brushSize);
  const brushFeather = store()((s) => s.brushFeather);
  const brushOpacity = store()((s) => s.brushOpacity);
  const brushFlow = store()((s) => s.brushFlow);
  const brushErase = store()((s) => s.brushErase);
  const held = a.develop.useCanvasToolHeld();
  const painted = hasMask(paramBag);

  // Another tool took the canvas (crop, masks, heal): the brush goes off.
  react.useEffect(() => {
    if (armed && !held) store().getState().setArmed(false);
  }, [armed, held]);

  const knobRow = (knob: Knob) => {
    const qk = PARAM[knob.key];
    const raw = paramBag[qk];
    const value = typeof raw === "number" ? raw : knob.default;
    return h(Slider, {
      key: knob.key,
      label: knob.label,
      value,
      min: knob.min,
      max: knob.max,
      step: knob.step,
      defaultValue: knob.default,
      onChange: (v: number) => dev.getState().setDynParam(qk, v),
      onCommit: () => void dev.getState().commitEdit(`Moiré ${knob.label}`),
      onModifierPreview: (active: boolean) => dev.getState().setSharpenViz(active ? knob.viz : 0),
    });
  };

  // Brush settings, shown as percentages like the masking panel does.
  const brushSlider = (
    label: string,
    value: number,
    min: number,
    max: number,
    defaultValue: number,
    set: (v: number) => void,
  ) =>
    h(Slider, {
      key: label,
      label,
      value: Math.round(value * 100),
      min,
      max,
      step: 1,
      defaultValue,
      onChange: (v: number) => {
        set(v / 100);
        store().getState().setBrushPreview(true);
      },
      onCommit: () => store().getState().setBrushPreview(false),
    });

  const d = store().getState();
  return h(
    Stack,
    { gap: 6, style: { padding: "6px 8px 8px" } },
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: "1px" } },
      KNOBS.map(knobRow),
    ),
    h(
      Row,
      { gap: 6, style: { marginTop: "4px" } },
      h(
        Button,
        { size: "sm", active: armed, onClick: () => store().getState().toggleArmed() },
        armed ? "Done" : "Paint mask",
      ),
      h(
        Button,
        { size: "sm", variant: "ghost", disabled: !painted, onClick: () => void clearMask() },
        "Clear mask",
      ),
      h("span", { style: { ...HINT, marginLeft: "auto" } }, painted ? "Painted area" : "Whole image"),
    ),
    armed
      ? h(
          Stack,
          {
            gap: 2,
            style: { padding: "6px", borderRadius: "4px", background: "var(--color-surface-2)" },
          },
          brushSlider("Size", brushSize, 1, 50, 8, (v) => d.setBrushSize(v)),
          brushSlider("Feather", brushFeather, 0, 100, 50, (v) => d.setBrushFeather(v)),
          brushSlider("Opacity", brushOpacity, 1, 100, 100, (v) => d.setBrushOpacity(v)),
          brushSlider("Flow", brushFlow, 1, 100, 100, (v) => d.setBrushFlow(v)),
          h(
            Row,
            { gap: 8, style: { marginTop: "4px" } },
            h(Toggle, { checked: brushErase, onChange: (v: boolean) => d.setBrushErase(v), label: "Erase" }),
          ),
        )
      : null,
  );
}
