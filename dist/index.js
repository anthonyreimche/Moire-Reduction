//#region src/runtime.ts
var e = null;
function t(t) {
	e = t;
}
function n() {
	if (!e) throw Error("[moire-reduction] api() called before activate()");
	return e;
}
function r(e, t, ...r) {
	return n().react.createElement(e, t, ...r);
}
//#endregion
//#region src/store.ts
var i = null;
function a() {
	let { defaults: e } = n().develop.brush;
	return i = n().stores.create((t) => ({
		armed: !1,
		brushSize: e.size,
		brushFeather: e.feather,
		brushOpacity: e.opacity,
		brushFlow: e.flow,
		brushErase: !1,
		brushPreview: !1,
		setArmed: (e) => t({ armed: e }),
		toggleArmed: () => t((e) => ({ armed: !e.armed })),
		setBrushSize: (e) => t({ brushSize: e }),
		setBrushFeather: (e) => t({ brushFeather: e }),
		setBrushOpacity: (e) => t({ brushOpacity: e }),
		setBrushFlow: (e) => t({ brushFlow: e }),
		setBrushErase: (e) => t({ brushErase: e }),
		setBrushPreview: (e) => t({ brushPreview: e })
	})), i;
}
function o() {
	if (!i) throw Error("[moire-reduction] store used before activate()");
	return i;
}
//#endregion
//#region src/filter.ts
var s = 4096, c = 1.5, l = 1.5, u = .04, d = 1.5, f = Math.sqrt(85), p = 1e-4, m = .07, h = "moire-reduction", g = `${h}.reduce`, _ = [
	{
		key: "amount",
		label: "Amount",
		min: 0,
		max: 100,
		step: 1,
		default: 0,
		viz: 4
	},
	{
		key: "luminance",
		label: "Luminance",
		min: 0,
		max: 100,
		step: 1,
		default: 0,
		viz: 3
	},
	{
		key: "pattern",
		label: "Pattern",
		min: 0,
		max: 100,
		step: 1,
		default: 50,
		viz: 4
	},
	{
		key: "edge",
		label: "Edge protection",
		min: 0,
		max: 100,
		step: 1,
		default: 50,
		viz: 4
	}
], v = {
	amount: 0,
	luminance: 0,
	pattern: 50,
	edge: 50
}, y = {
	amount: `${g}.amount`,
	luminance: `${g}.luminance`,
	pattern: `${g}.pattern`,
	edge: `${g}.edge`,
	maskOn: `${g}.maskOn`,
	mask: `${g}.mask`
}, b = (e) => ({
	key: e.key,
	glslType: "float",
	default: e.default,
	range: {
		min: e.min,
		max: e.max,
		step: e.step
	},
	label: e.label
}), x = {
	key: "maskOn",
	glslType: "float",
	default: 0
}, S = (e) => Number.isInteger(e) ? `${e}.0` : String(e), C = "float b3w(int d) { d = d < 0 ? -d : d; return d == 0 ? 0.375 : (d == 1 ? 0.25 : 0.0625); }", w = `
{
  vec2 res = 1.0 / uTexel;
  float anchor = max(res.x, res.y) / ${S(s)};
  float sigmaRef = ${S(c)} * pow(${S(16)}, clamp(pattern, 0.0, 100.0) / 100.0);
  float stride = sigmaRef * anchor / ${S(f)} * exp2(float(uPassIndex));
  float sL = ${S(l)} * pow(${S(u)}, clamp(edge, 0.0, 100.0) / 100.0);
  float sC = ${S(d)} * sL;
  float Lc = max(luma(max(c, 0.0)), ${S(p)});
  float accL = 0.0;
  float wL = 0.0;
  vec3 accR = vec3(0.0);
  float wC = 0.0;
  for (int dy = -2; dy <= 2; dy++) {
    for (int dx = -2; dx <= 2; dx++) {
#if SL_PROCESS_VERSION >= 2
      vec3 s = readPrev(vUv + vec2(float(dx), float(dy)) * stride * uTexel);
      // Clipped for the luma alone, which the log weights need positive; the
      // ratio keeps the sign, so colours outside sRGB survive the smoothing.
      float Ls = max(luma(max(s, 0.0)), ${S(p)});
#else
      vec3 s = max(readPrev(vUv + vec2(float(dx), float(dy)) * stride * uTexel), 0.0);
      float Ls = max(luma(s), ${S(p)});
#endif
      float sp = b3w(dx) * b3w(dy);
      float dl = log(Ls / Lc);
      float eL = exp(-(dl * dl) / (sL * sL));
      float eC = exp(-(dl * dl) / (sC * sC));
      accL += Ls * sp * eL;
      wL += sp * eL;
#if SL_PROCESS_VERSION >= 2
      // The ratio averages by the luma squared, so each colour counts by its
      // own light: a dark signed colour over its floored luma is a ratio many
      // times a grey's, and at a plain weight would tint its brighter neighbours.
      float wS = Ls * sp * eC;
      accR += s * wS;
      wC += Ls * wS;
#else
      accR += (s / Ls) * sp * eC;
      wC += sp * eC;
#endif
    }
  }
  c = (accR / wC) * (accL / wL);
}`, T = `
float cov = maskOn > 0.5 ? mask(srcUv) : 1.0;
float ca = clamp(amount, 0.0, 100.0) / 100.0 * cov;
float la = clamp(luminance, 0.0, 100.0) / 100.0 * cov;
if (ca > 0.0005 || la > 0.0005) {
#if SL_PROCESS_VERSION >= 2
  // Signed lin (RAW outside sRGB), and the smoothed colour carrying it, can
  // have luma near or below zero: floor both at the share of the peak channel
  // any non-negative colour keeps (no-op there).
  float L0 = max(luma(lin), max(1e-6, ${S(m)} * max(abs(lin.r), max(abs(lin.g), abs(lin.b)))));
  float Ls = max(luma(stageResult), max(1e-6, ${S(m)} * max(abs(stageResult.r), max(abs(stageResult.g), abs(stageResult.b)))));
#else
  float L0 = max(luma(lin), 1e-6);
  float Ls = max(luma(stageResult), 1e-6);
#endif
  lin = mix(lin / L0, stageResult / Ls, ca) * mix(L0, Ls, la);
}`;
function E() {
	let [e, t, n, r] = _.map(b);
	return {
		id: g,
		name: "Moiré Reduction",
		phase: "decode",
		priority: 50,
		presetScope: "per-image",
		uniforms: [
			e,
			t,
			n,
			r,
			x
		],
		textures: [{
			key: "mask",
			kind: "coverage"
		}],
		passes: [{
			glsl: w,
			helpers: C,
			iterations: 4,
			uniforms: [n, r]
		}],
		glsl: T
	};
}
//#endregion
//#region src/brush.ts
var D = .25;
function O(e, t, n) {
	return {
		x: e.x,
		y: e.y,
		radius: t.brushSize,
		erase: n || t.brushErase,
		feather: t.brushFeather,
		opacity: t.brushOpacity,
		flow: t.brushFlow
	};
}
function k(e, t, n) {
	return Math.hypot((t.x - e.x) * n, t.y - e.y);
}
function A(e, t, n, r) {
	return k(e, t, r) >= n.brushSize * D;
}
function j(e, t, n, r, i) {
	let a = Math.max(1, Math.ceil(k(e, t, r) / (n.brushSize * D))), o = [];
	for (let r = 1; r <= a; r++) {
		let s = r / a;
		o.push(O({
			x: e.x + (t.x - e.x) * s,
			y: e.y + (t.y - e.y) * s
		}, n, i));
	}
	return o;
}
//#endregion
//#region src/persistence.ts
var M = (e) => typeof e == "number" && Number.isFinite(e);
function N(e) {
	if (typeof e != "object" || !e) return !1;
	let t = e;
	return M(t.x) && M(t.y) && M(t.radius) && M(t.feather) && M(t.opacity) && M(t.flow) && typeof t.erase == "boolean";
}
function P(e) {
	return Array.isArray(e) && e.every(N);
}
function F(e) {
	let t = e[y.mask];
	return P(t) ? t : [];
}
function I(e) {
	return {
		[y.mask]: e,
		[y.maskOn]: +(e.length > 0)
	};
}
function L() {
	return n().stores.useDevelopStore.getState();
}
function R(e) {
	let t = L();
	t.setDynParams(I([...F(t.paramBag), ...e]));
}
function z(e) {
	return F(e).length > 0;
}
async function B() {
	let e = L();
	e.setDynParams(I([])), await e.commitEdit("Clear Moiré Mask");
}
async function V() {
	let e = L();
	e.setDynParams({
		[y.amount]: v.amount,
		[y.luminance]: v.luminance,
		[y.pattern]: v.pattern,
		[y.edge]: v.edge,
		...I([])
	}), await e.commitEdit("Reset Moiré Reduction");
}
//#endregion
//#region src/wash.ts
var H = "230, 64, 64", U = .5;
function W(e, t) {
	let n = t.radiusToScreen(e.radius);
	if (n < .3) return null;
	let { x: r, y: i } = t.toScreen(e.x, e.y);
	return {
		x: r,
		y: i,
		r: n
	};
}
function G(e, t, n, r, i) {
	e.setTransform(1, 0, 0, 1, 0, 0), e.globalCompositeOperation = "source-over", e.clearRect(0, 0, r, i);
	for (let r of t) {
		let t = W(r, n);
		if (!t) continue;
		let i = Math.max(0, Math.min(1, 1 - r.feather)), a = Math.max(0, Math.min(1, r.flow * (r.erase ? 1 : r.opacity))), o = e.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r);
		o.addColorStop(0, `rgba(255,255,255,${a})`), o.addColorStop(i, `rgba(255,255,255,${a})`), o.addColorStop(1, "rgba(255,255,255,0)"), e.globalCompositeOperation = r.erase ? "destination-out" : "source-over", e.fillStyle = o, e.beginPath(), e.arc(t.x, t.y, t.r, 0, Math.PI * 2), e.fill();
	}
	e.globalCompositeOperation = "source-in", e.fillStyle = `rgba(${H}, ${U})`, e.fillRect(0, 0, r, i), e.globalCompositeOperation = "source-over";
}
//#endregion
//#region src/Overlay.ts
var K = {
	size: "brushSize",
	feather: "brushFeather",
	opacity: "brushOpacity",
	flow: "brushFlow"
};
function q(e) {
	let { brushSize: t, brushFeather: n, brushOpacity: r, brushFlow: i, brushErase: a } = e;
	return {
		brushSize: t,
		brushFeather: n,
		brushOpacity: r,
		brushFlow: i,
		brushErase: a
	};
}
function J() {
	let e = n().react, t = n().stores.useDevelopStore, i = o()((e) => e.armed), a = t((e) => e.photoId), s = o()((e) => e.brushSize), c = o()((e) => e.brushFeather), l = o()((e) => e.brushErase), u = o()((e) => e.brushPreview), d = t((e) => e.paramBag[y.mask]), { rect: f, imageRect: p, nonce: m, toImage: h, toScreen: g, radiusToScreen: _ } = n().develop.useDevelopOverlay(), [v, b] = e.useState(!1), [x, S] = e.useState(null), C = e.useRef(null), w = e.useRef(null), T = e.useRef(null), E = e.useRef(null), D = i && !!f && !!a && !!h && !!g && !!_, k = p && p.h > 0 ? p.w / p.h : 1;
	return e.useEffect(() => {
		if (!D) return;
		let e = w.current, n = C.current;
		if (!e || !n || !g || !_) return;
		let r = Math.max(1, Math.round(n.clientWidth)), i = Math.max(1, Math.round(n.clientHeight));
		(e.width !== r || e.height !== i) && (e.width = r, e.height = i);
		let a = e.getContext("2d");
		a && G(a, F(t.getState().paramBag), {
			toScreen: g,
			radiusToScreen: _
		}, r, i);
	}, [
		D,
		m,
		d,
		g,
		_,
		t
	]), D ? r("div", {
		ref: C,
		onPointerDown: (e) => {
			if (!D || e.button !== 0 || !h) return;
			let t = n().develop.framePoint(e.currentTarget, e.clientX, e.clientY), r = h(t.x, t.y);
			e.preventDefault(), e.stopPropagation(), e.currentTarget.setPointerCapture(e.pointerId);
			let i = q(o().getState());
			R(e.shiftKey && E.current ? j(E.current, r, i, k, e.altKey) : [O(r, i, e.altKey)]), E.current = r, T.current = { last: r }, S(t);
		},
		onPointerMove: (e) => {
			if (!D || !h) return;
			let t = n().develop.framePoint(e.currentTarget, e.clientX, e.clientY);
			S(t), b(e.altKey);
			let r = T.current;
			if (!r) return;
			let i = h(t.x, t.y), a = q(o().getState());
			A(r.last, i, a, k) && (R([O(i, a, e.altKey)]), r.last = i, E.current = i);
		},
		onPointerUp: (e) => {
			T.current && (T.current = null, e.currentTarget.releasePointerCapture(e.pointerId), t.getState().commitEdit("Moiré Mask"));
		},
		onPointerLeave: () => {
			T.current || S(null);
		},
		style: {
			position: "absolute",
			inset: 0,
			touchAction: "none",
			cursor: n().cursors.resolve("crosshair"),
			overflow: "hidden"
		}
	}, r("canvas", {
		ref: w,
		style: {
			position: "absolute",
			inset: 0,
			pointerEvents: "none"
		}
	}), r(n().develop.BrushCursor, {
		at: u ? "centre" : x,
		size: s,
		feather: c,
		erase: v || l
	})) : null;
}
function Y(e, t) {
	let r = o().getState(), i = n().develop.brush.step(e, {
		size: r.brushSize,
		feather: r.brushFeather,
		opacity: r.brushOpacity,
		flow: r.brushFlow
	});
	return i ? (t && o().setState({ [K[i.key]]: i.value }), !0) : !1;
}
var X = {
	overlay: J,
	zoomable: !0,
	onEscape: () => o().getState().setArmed(!1),
	onAction: (e) => Y(e, !0),
	wants: (e) => Y(e, !1)
}, Z = {
	fontSize: "10px",
	color: "var(--color-text-muted)",
	lineHeight: 1.4
};
function Q() {
	let e = n(), t = e.components.Slider, { Button: i, Toggle: a, Row: s, Stack: c } = e.ui, l = e.stores.useDevelopStore, u = e.react, d = o()((e) => e.armed), f = l((e) => e.paramBag), p = o()((e) => e.brushSize), m = o()((e) => e.brushFeather), h = o()((e) => e.brushOpacity), g = o()((e) => e.brushFlow), v = o()((e) => e.brushErase), b = e.develop.useCanvasToolHeld(), x = z(f);
	u.useEffect(() => {
		d && !b && o().getState().setArmed(!1);
	}, [d, b]);
	let S = (e) => {
		let n = y[e.key], i = f[n], a = typeof i == "number" ? i : e.default;
		return r(t, {
			key: e.key,
			label: e.label,
			value: a,
			min: e.min,
			max: e.max,
			step: e.step,
			defaultValue: e.default,
			onChange: (e) => l.getState().setDynParam(n, e),
			onCommit: () => void l.getState().commitEdit(`Moiré ${e.label}`),
			onModifierPreview: (t) => l.getState().setSharpenViz(t ? e.viz : 0)
		});
	}, C = (e, n, i, a, s, c) => r(t, {
		key: e,
		label: e,
		value: Math.round(n * 100),
		min: i,
		max: a,
		step: 1,
		defaultValue: s,
		onChange: (e) => {
			c(e / 100), o().getState().setBrushPreview(!0);
		},
		onCommit: () => o().getState().setBrushPreview(!1)
	}), w = o().getState();
	return r(c, {
		gap: 6,
		style: { padding: "6px 8px 8px" }
	}, r("div", { style: {
		display: "flex",
		flexDirection: "column",
		gap: "1px"
	} }, _.map(S)), r(s, {
		gap: 6,
		style: { marginTop: "4px" }
	}, r(i, {
		size: "sm",
		active: d,
		onClick: () => o().getState().toggleArmed()
	}, d ? "Done" : "Paint mask"), r(i, {
		size: "sm",
		variant: "ghost",
		disabled: !x,
		onClick: () => void B()
	}, "Clear mask"), r("span", { style: {
		...Z,
		marginLeft: "auto"
	} }, x ? "Painted area" : "Whole image")), d ? r(c, {
		gap: 2,
		style: {
			padding: "6px",
			borderRadius: "4px",
			background: "var(--color-surface-2)"
		}
	}, C("Size", p, 1, 50, 8, (e) => w.setBrushSize(e)), C("Feather", m, 0, 100, 50, (e) => w.setBrushFeather(e)), C("Opacity", h, 1, 100, 100, (e) => w.setBrushOpacity(e)), C("Flow", g, 1, 100, 100, (e) => w.setBrushFlow(e)), r(s, {
		gap: 8,
		style: { marginTop: "4px" }
	}, r(a, {
		checked: v,
		onChange: (e) => w.setBrushErase(e),
		label: "Erase"
	}))) : null);
}
//#endregion
//#region src/index.ts
var $ = null;
function ee(e) {
	t(e), a(), e.registerProcessingStage(E()), $ = o().subscribe((t, n) => {
		t.armed !== n.armed && e.develop.setCanvasTool(t.armed ? X : null);
	}), e.registerKeybinding({
		id: `${h}.paint`,
		label: "Paint moiré mask",
		category: "Develop",
		defaultCombo: "Shift+M",
		handler: () => {
			e.navigation.current() === "develop" && e.stores.useDevelopStore.getState().photoId && o().getState().toggleArmed();
		}
	}), e.registerPanel({
		id: `${h}.panel`,
		title: "Moiré Reduction",
		component: Q,
		defaultDock: {
			module: "develop",
			direction: "right",
			order: 8,
			width: 250
		},
		modules: ["develop"],
		onReset: () => void V()
	});
}
function te() {
	try {
		o().getState().setArmed(!1), $?.(), $ = null, n().develop.setCanvasTool(null), n().unregisterProcessingStage(g);
	} catch {}
}
//#endregion
export { ee as activate, te as deactivate };

//# sourceMappingURL=index.js.map