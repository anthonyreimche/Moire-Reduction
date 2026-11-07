// The slice of Safelight's extension API this extension touches, mirrored from
// the app's src/extensions/types.ts, src/extensions/develop-host.tsx and
// src/state/develop-store.ts. Extensions are standalone bundles, so the host's
// source is not on the type path; React types come from @types/react (dev only).

import type { ComponentType, CSSProperties, ReactNode } from "react";

/** One freehand brush dab in source-UV; radius in image-height units. */
export interface BrushDab {
  x: number;
  y: number;
  radius: number;
  erase: boolean;
  feather: number;
  opacity?: number;
  flow?: number;
}

export interface StoreApi<T> {
  (): T;
  <U>(selector: (state: T) => U): U;
  getState(): T;
  setState(partial: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(listener: (state: T, prev: T) => void): () => void;
}

export type StateCreator<T> = (
  set: (partial: Partial<T> | ((s: T) => Partial<T>)) => void,
  get: () => T,
) => T;

export interface DevelopStoreState {
  photoId: string | null;
  /** Extension stage params by qualified key. Values are whatever the owning
   *  stage wrote and come back from sidecar JSON — a runtime boundary. */
  paramBag: Record<string, unknown>;
  setSharpenViz(mode: number): void;
  setDynParam(key: string, value: unknown): void;
  setDynParams(patch: Record<string, unknown>): void;
  commitEdit(label: string): Promise<void>;
}

export interface UIStoreState {
  activeModule: "library" | "develop";
}

export interface AppSettings {
  /** Interface scale — the <body> CSS zoom that client-px coordinates must be
   *  divided by to reach layout px. */
  uiScale: number;
}

export interface OverlayRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OverlayPoint {
  x: number;
  y: number;
}

export interface DevelopOverlayState {
  rect: OverlayRect | null;
  imageRect: OverlayRect | null;
  nonce: number;
  toScreen: ((u: number, v: number) => OverlayPoint) | null;
  toImage: ((x: number, y: number) => OverlayPoint) | null;
  radiusToScreen: ((r: number) => number) | null;
  radiusToImage: ((px: number) => number) | null;
}

export type GlslType = "float" | "int" | "bool" | "vec2" | "vec3" | "vec4" | "sampler2D";

export interface UniformDeclaration {
  key: string;
  glslType: GlslType;
  default: number | number[] | boolean;
  range?: { min: number; max: number; step?: number };
  label?: string;
}

export interface StagePass {
  glsl: string;
  helpers?: string;
  iterations?: number;
  uniforms?: UniformDeclaration[];
}

export type ProcessingPhase =
  | "geometry"
  | "decode"
  | "noise-reduction"
  | "scene-linear"
  | "tone-map"
  | "display-adjust"
  | "effects"
  | "output-encode";

export interface TextureRequirement {
  key: string;
  kind: "lut" | "coverage" | "dynamic";
}

export interface ProcessingStageContribution {
  id: string;
  name: string;
  phase: ProcessingPhase;
  priority?: number;
  glsl: string;
  helpers?: string;
  uniforms: UniformDeclaration[];
  passes?: StagePass[];
  textures?: TextureRequirement[];
  presetScope?: "global" | "per-image";
}

export interface PanelContribution {
  id: string;
  title: string;
  component: ComponentType;
  defaultDock?: {
    module: "library" | "develop";
    direction: "left" | "right" | "bottom";
    order?: number;
    width?: number;
    height?: number;
  };
  onReset?: () => void;
}

export interface KeyActionContribution {
  id: string;
  label: string;
  category?: "General" | "Develop" | "Library";
  defaultCombo: string;
  handler(): void;
}

export interface CursorContribution {
  id: string;
  css?: string;
  image?: string;
  hotspotX?: number;
  hotspotY?: number;
  fallback?: string;
}

export interface SliderProps {
  label: string;
  value: number;
  onChange(value: number): void;
  onCommit?(): void;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  hideValue?: boolean;
  compact?: boolean;
  onModifierPreview?(active: boolean): void;
}

export interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  active?: boolean;
  full?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?(): void;
  children?: ReactNode;
}

export interface ToggleProps {
  checked: boolean;
  onChange(checked: boolean): void;
  label?: ReactNode;
  ariaLabel?: string;
}

export interface RowProps {
  children?: ReactNode;
  gap?: number;
  align?: CSSProperties["alignItems"];
  justify?: CSSProperties["justifyContent"];
  wrap?: boolean;
  style?: CSSProperties;
}

export interface StackProps {
  children?: ReactNode;
  gap?: number;
  style?: CSSProperties;
}

export interface UiKit {
  Button: ComponentType<ButtonProps>;
  Toggle: ComponentType<ToggleProps>;
  Row: ComponentType<RowProps>;
  Stack: ComponentType<StackProps>;
  tokens: Readonly<Record<string, string>>;
}

/** An extension's on-image tool that takes the canvas over while it is held. */
export interface CanvasTool {
  overlay: ComponentType<{ rect: OverlayRect }>;
  /** Whether zoom and pan still reach the canvas under the overlay. */
  zoomable?: boolean;
  /** Escape was pressed: core lets the tool go after this. */
  onEscape?(): void;
  /** A shortcut's action (keybinding id) pressed while the tool is held:
   *  whether the tool took it. */
  onAction?(action: string): boolean;
  /** Whether the tool would take `action` now, without acting. */
  wants?(action: string): boolean;
}

export interface SafelightAPI {
  version: 1;
  extensionId: string;
  react: typeof import("react");
  registerProcessingStage(c: ProcessingStageContribution): void;
  unregisterProcessingStage(id: string): void;
  registerPanel(c: PanelContribution): void;
  registerKeybinding(c: KeyActionContribution): void;
  components: { Slider: ComponentType<SliderProps> };
  ui: UiKit;
  stores: {
    create<T>(init: StateCreator<T>): StoreApi<T>;
    useDevelopStore: StoreApi<DevelopStoreState>;
    useUIStore: StoreApi<UIStoreState>;
    useSettings: StoreApi<AppSettings>;
  };
  develop: {
    useDevelopOverlay(): DevelopOverlayState;
    setCanvasCursor(
      cursor: string | CursorContribution | null,
      opts?: { priority?: number },
    ): () => void;
    /** Hold the develop canvas with an on-image tool, or with null let go of
     *  it. One extension holds it at a time: the last to set it. */
    setCanvasTool(tool: CanvasTool | null): void;
    /** React hook: whether this extension holds the canvas tool. */
    useCanvasToolHeld(): boolean;
  };
}
