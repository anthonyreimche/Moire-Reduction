// The canvas tool held while the brush is armed (MOIRE_TOOL), so crop, masks
// and heal never paint at the same time. It captures the pointer, maps it to source-UV
// through api.develop's overlay helpers (framePoint, then toImage), stamps dabs
// into the paramBag at the masking panel's spacing, and commits one history
// entry per stroke. It shows the official brush ring and the coverage wash;
// Ctrl, Cmd or Space held hands the pointer to the canvas's pan and zoom, which
// core does for a zoomable tool.

import type { PointerEvent as ReactPointerEvent } from "react";
import { lineDabs, makeDab, shouldStamp, type BrushState, type Dab, type Point } from "./brush";
import { appendDabs, readMask } from "./persistence";
import { api, h } from "./runtime";
import type { BrushSetting, CanvasTool } from "./safelight";
import { PARAM } from "./stage";
import { store } from "./store";
import { paintWash } from "./wash";

const BRUSH_KEY = {
  size: "brushSize",
  feather: "brushFeather",
  opacity: "brushOpacity",
  flow: "brushFlow",
} as const satisfies Record<BrushSetting, keyof BrushState>;

function brushState(s: BrushState): BrushState {
  const { brushSize, brushFeather, brushOpacity, brushFlow, brushErase } = s;
  return { brushSize, brushFeather, brushOpacity, brushFlow, brushErase };
}

export function MoireOverlay() {
  const react = api().react;
  const dev = api().stores.useDevelopStore;
  const armed = store()((s) => s.armed);
  const photoId = dev((s) => s.photoId);
  const brushSize = store()((s) => s.brushSize);
  const brushFeather = store()((s) => s.brushFeather);
  const brushErase = store()((s) => s.brushErase);
  const brushPreview = store()((s) => s.brushPreview);
  const maskValue = dev((s) => s.paramBag[PARAM.mask]);
  const { rect, imageRect, nonce, toImage, toScreen, radiusToScreen } =
    api().develop.useDevelopOverlay();

  const [alt, setAlt] = react.useState(false);
  const [pointer, setPointer] = react.useState<Point | null>(null);
  const rootRef = react.useRef<HTMLDivElement | null>(null);
  const washRef = react.useRef<HTMLCanvasElement | null>(null);
  const stroke = react.useRef<{ last: Point } | null>(null);
  const lastPoint = react.useRef<Point | null>(null);

  const visible =
    armed &&
    !!rect &&
    !!photoId &&
    !!toImage &&
    !!toScreen &&
    !!radiusToScreen;
  const aspect = imageRect && imageRect.h > 0 ? imageRect.w / imageRect.h : 1;

  react.useEffect(() => {
    if (!visible) return;
    const el = washRef.current;
    const root = rootRef.current;
    if (!el || !root || !toScreen || !radiusToScreen) return;
    const w = Math.max(1, Math.round(root.clientWidth));
    const hgt = Math.max(1, Math.round(root.clientHeight));
    if (el.width !== w || el.height !== hgt) {
      el.width = w;
      el.height = hgt;
    }
    const ctx = el.getContext("2d");
    if (!ctx) return;
    paintWash(ctx, readMask(dev.getState().paramBag), { toScreen, radiusToScreen }, w, hgt);
  }, [visible, nonce, maskValue, toScreen, radiusToScreen, dev]);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!visible || e.button !== 0 || !toImage) return;
    const at = api().develop.framePoint(e.currentTarget, e.clientX, e.clientY);
    const p = toImage(at.x, at.y);
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const brush = brushState(store().getState());
    const dabs: Dab[] =
      e.shiftKey && lastPoint.current
        ? lineDabs(lastPoint.current, p, brush, aspect, e.altKey)
        : [makeDab(p, brush, e.altKey)];
    appendDabs(dabs);
    lastPoint.current = p;
    stroke.current = { last: p };
    setPointer(at);
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!visible || !toImage) return;
    const at = api().develop.framePoint(e.currentTarget, e.clientX, e.clientY);
    setPointer(at);
    setAlt(e.altKey);
    const s = stroke.current;
    if (!s) return;
    const p = toImage(at.x, at.y);
    const brush = brushState(store().getState());
    if (!shouldStamp(s.last, p, brush, aspect)) return;
    appendDabs([makeDab(p, brush, e.altKey)]);
    s.last = p;
    lastPoint.current = p;
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!stroke.current) return;
    stroke.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    void dev.getState().commitEdit("Moiré Mask");
  };

  if (!visible) return null;

  return h(
    "div",
    {
      ref: rootRef,
      onPointerDown: onDown,
      onPointerMove: onMove,
      onPointerUp: onUp,
      onPointerLeave: () => {
        if (!stroke.current) setPointer(null);
      },
      style: {
        position: "absolute",
        inset: 0,
        touchAction: "none",
        cursor: api().cursors.resolve("crosshair"),
        overflow: "hidden",
      },
    },
    h("canvas", {
      ref: washRef,
      style: { position: "absolute", inset: 0, pointerEvents: "none" },
    }),
    h(api().develop.BrushCursor, {
      at: brushPreview ? "centre" : pointer,
      size: brushSize,
      feather: brushFeather,
      erase: alt || brushErase,
    }),
  );
}

/** Steps the brush by `action` (one of Develop's brush shortcuts) when `run`;
 *  whether it is one. */
function takeAction(action: string, run: boolean): boolean {
  const s = store().getState();
  const step = api().develop.brush.step(action, {
    size: s.brushSize,
    feather: s.brushFeather,
    opacity: s.brushOpacity,
    flow: s.brushFlow,
  });
  if (!step) return false;
  if (run) store().setState({ [BRUSH_KEY[step.key]]: step.value });
  return true;
}

/** The tool held while the brush is armed. Develop's brush shortcuts set the
 *  brush; Escape disarms. */
export const MOIRE_TOOL: CanvasTool = {
  overlay: MoireOverlay,
  zoomable: true,
  onEscape: () => store().getState().setArmed(false),
  onAction: (action) => takeAction(action, true),
  wants: (action) => takeAction(action, false),
};
