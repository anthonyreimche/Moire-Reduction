// The interactive layer, mounted into the click-through "develop-canvas-overlay"
// slot. While the brush is armed it captures the pointer, maps it to source-UV
// through api.develop's overlay helpers (client px → layout px by the
// Interface-scale zoom → toImage; never offsetX/Y, which break under Windows
// display scaling), stamps dabs into the paramBag at the masking panel's
// spacing, and commits one history entry per stroke. It draws its own brush
// ring (the native cursor is hidden), a centred reference ring while a brush
// slider is dragged, and the coverage wash.

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { lineDabs, makeDab, shouldStamp, type BrushState, type Dab, type Point } from "./brush";
import { appendDabs, readMask } from "./persistence";
import { api, h } from "./runtime";
import { PARAM } from "./stage";
import { store } from "./store";
import { paintWash } from "./wash";

const RING_STYLE: CSSProperties = {
  position: "absolute",
  display: "none",
  transform: "translate(-50%, -50%)",
  borderRadius: "50%",
  boxShadow: "0 0 0 1px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.35)",
  pointerEvents: "none",
};

function brushState(s: BrushState): BrushState {
  const { brushSize, brushFeather, brushOpacity, brushFlow, brushErase } = s;
  return { brushSize, brushFeather, brushOpacity, brushFlow, brushErase };
}

function isEditable(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLElement &&
    (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
  );
}

export function MoireOverlay() {
  const react = api().react;
  const dev = api().stores.useDevelopStore;
  const armed = store()((s) => s.armed);
  const cropping = dev((s) => s.cropping);
  const activeTool = dev((s) => s.activeTool);
  const photoId = dev((s) => s.photoId);
  const brushSize = dev((s) => s.brushSize);
  const brushFeather = dev((s) => s.brushFeather);
  const brushErase = dev((s) => s.brushErase);
  const brushPreview = dev((s) => s.brushPreview);
  const maskValue = dev((s) => s.paramBag[PARAM.mask]);
  const { rect, imageRect, nonce, toImage, toScreen, radiusToScreen } =
    api().develop.useDevelopOverlay();

  const [gesture, setGesture] = react.useState(false);
  const [alt, setAlt] = react.useState(false);
  const gestureRef = react.useRef(false);
  const rootRef = react.useRef<HTMLDivElement | null>(null);
  const ringRef = react.useRef<HTMLDivElement | null>(null);
  const innerRef = react.useRef<HTMLDivElement | null>(null);
  const washRef = react.useRef<HTMLCanvasElement | null>(null);
  const stroke = react.useRef<{ last: Point } | null>(null);
  const lastPoint = react.useRef<Point | null>(null);
  const cursor = react.useRef({ lx: 0, ly: 0, shown: false });

  const visible =
    armed &&
    !cropping &&
    activeTool === "none" &&
    !!rect &&
    !!photoId &&
    !!toImage &&
    !!toScreen &&
    !!radiusToScreen;
  const aspect = imageRect && imageRect.h > 0 ? imageRect.w / imageRect.h : 1;
  const setGestureState = (v: boolean) => {
    gestureRef.current = v;
    setGesture(v);
  };

  react.useEffect(() => {
    if (!visible || gesture) return;
    return api().develop.setCanvasCursor("none", { priority: 20 });
  }, [visible, gesture]);

  // Ctrl/⌘ or Space held → click-through so the canvas pans/zooms underneath;
  // Alt tracked for the erase look of the ring.
  react.useEffect(() => {
    if (!visible) {
      setGestureState(false);
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      if (e.code === "Space" || e.ctrlKey || e.metaKey) setGestureState(true);
      if (e.altKey) setAlt(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" || !(e.ctrlKey || e.metaKey)) setGestureState(false);
      if (!e.altKey) setAlt(false);
    };
    const onBlur = () => {
      setGestureState(false);
      setAlt(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      setGestureState(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const placeRing = (lx: number, ly: number, show: boolean) => {
    cursor.current = { lx, ly, shown: show };
    const s = dev.getState();
    const px = radiusToScreen ? radiusToScreen(s.brushSize) : 0;
    const place = (el: HTMLDivElement | null, d: number, vis: boolean) => {
      if (!el) return;
      el.style.display = vis ? "block" : "none";
      el.style.width = `${d}px`;
      el.style.height = `${d}px`;
      el.style.left = `${lx}px`;
      el.style.top = `${ly}px`;
    };
    place(ringRef.current, Math.max(3, px) * 2, show);
    place(innerRef.current, Math.max(1, px * (1 - s.brushFeather)) * 2, show);
  };

  // Resize the ring the instant a shortcut or slider changes the brush, not
  // only on the next pointer move.
  react.useEffect(() => {
    if (cursor.current.shown) placeRing(cursor.current.lx, cursor.current.ly, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brushSize, brushFeather]);

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

  // Entering pan/zoom mode mid-stroke ends the stroke (committing what's
  // there) and hides the ring so the overlay visibly hands off to the canvas.
  react.useEffect(() => {
    if (!gesture || !stroke.current) return;
    stroke.current = null;
    void dev.getState().commitEdit("Moiré Mask");
    placeRing(0, 0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gesture]);

  const localPoint = (e: ReactPointerEvent<HTMLDivElement>): { lx: number; ly: number } => {
    const r = e.currentTarget.getBoundingClientRect();
    const zoom = api().stores.useSettings.getState().uiScale || 1;
    return { lx: (e.clientX - r.left) / zoom, ly: (e.clientY - r.top) / zoom };
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!visible || gestureRef.current || e.button !== 0 || !toImage) return;
    const { lx, ly } = localPoint(e);
    const p = toImage(lx, ly);
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const brush = brushState(dev.getState());
    const dabs: Dab[] =
      e.shiftKey && lastPoint.current
        ? lineDabs(lastPoint.current, p, brush, aspect, e.altKey)
        : [makeDab(p, brush, e.altKey)];
    appendDabs(dabs);
    lastPoint.current = p;
    stroke.current = { last: p };
    placeRing(lx, ly, true);
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!visible || gestureRef.current || !toImage) return;
    const { lx, ly } = localPoint(e);
    placeRing(lx, ly, true);
    setAlt(e.altKey);
    const s = stroke.current;
    if (!s) return;
    const p = toImage(lx, ly);
    const brush = brushState(dev.getState());
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

  const erasing = alt || brushErase;
  const ringColor = erasing ? "rgba(255,107,107,0.95)" : "rgba(255,255,255,0.9)";
  const ringBorder = `1.5px ${erasing ? "dashed" : "solid"} ${ringColor}`;
  const refPx = rect && radiusToScreen ? radiusToScreen(brushSize) : 0;
  const centred = (d: number, border: string): CSSProperties => ({
    ...RING_STYLE,
    display: "block",
    border,
    left: `${rect ? rect.x + rect.w / 2 : 0}px`,
    top: `${rect ? rect.y + rect.h / 2 : 0}px`,
    width: `${d}px`,
    height: `${d}px`,
  });

  return h(
    "div",
    {
      ref: rootRef,
      onPointerDown: onDown,
      onPointerMove: onMove,
      onPointerUp: onUp,
      onPointerLeave: () => {
        if (!stroke.current) placeRing(0, 0, false);
      },
      style: {
        position: "absolute",
        inset: 0,
        pointerEvents: gesture ? "none" : "auto",
        touchAction: "none",
        cursor: gesture ? "default" : "none",
        overflow: "hidden",
      },
    },
    h("canvas", {
      ref: washRef,
      style: { position: "absolute", inset: 0, pointerEvents: "none" },
    }),
    h("div", { ref: ringRef, style: { ...RING_STYLE, border: ringBorder } }),
    h("div", { ref: innerRef, style: { ...RING_STYLE, border: "1px solid rgba(255,255,255,0.45)" } }),
    brushPreview && rect
      ? h(
          "div",
          { style: { position: "absolute", inset: 0, pointerEvents: "none" } },
          h("div", { style: centred(Math.max(3, refPx) * 2, "1.5px solid rgba(255,255,255,0.9)") }),
          h("div", {
            style: centred(
              Math.max(1, refPx * (1 - brushFeather)) * 2,
              "1px solid rgba(255,255,255,0.45)",
            ),
          }),
        )
      : null,
  );
}
