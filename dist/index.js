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
	return i = n().stores.create((e) => ({
		armed: !1,
		setArmed: (t) => e({ armed: t }),
		toggleArmed: () => e((e) => ({ armed: !e.armed }))
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
//#region src/keys.ts
var D = (e, t, n) => e < t ? t : e > n ? n : e, O = (e) => Math.round(e * 100) / 100, k = {
	"brush.smaller": {
		def: "[",
		alts: [],
		apply: (e) => e.setBrushSize(D(e.brushSize - .01, .01, .5))
	},
	"brush.larger": {
		def: "]",
		alts: [],
		apply: (e) => e.setBrushSize(D(e.brushSize + .01, .01, .5))
	},
	"brush.featherDown": {
		def: "Shift+[",
		alts: ["Shift+{"],
		apply: (e) => e.setBrushFeather(D(O(e.brushFeather - .05), 0, 1))
	},
	"brush.featherUp": {
		def: "Shift+]",
		alts: ["Shift+}"],
		apply: (e) => e.setBrushFeather(D(O(e.brushFeather + .05), 0, 1))
	},
	"brush.opacityDown": {
		def: ",",
		alts: [],
		apply: (e) => e.setBrushOpacity(D(O(e.brushOpacity - .1), .01, 1))
	},
	"brush.opacityUp": {
		def: ".",
		alts: [],
		apply: (e) => e.setBrushOpacity(D(O(e.brushOpacity + .1), .01, 1))
	},
	"brush.flowDown": {
		def: "Shift+,",
		alts: ["Shift+<"],
		apply: (e) => e.setBrushFlow(D(O(e.brushFlow - .1), .01, 1))
	},
	"brush.flowUp": {
		def: "Shift+.",
		alts: ["Shift+>"],
		apply: (e) => e.setBrushFlow(D(O(e.brushFlow + .1), .01, 1))
	}
};
function A(e) {
	let t = e.key;
	if (t === "Control" || t === "Shift" || t === "Alt" || t === "Meta") return null;
	let n = [];
	return (e.ctrlKey || e.metaKey) && n.push("Ctrl"), e.shiftKey && n.push("Shift"), e.altKey && n.push("Alt"), n.push(t.length === 1 ? t.toUpperCase() : t), n.join("+");
}
function j(e, t) {
	for (let [n, r] of Object.entries(k)) {
		let i = t(n);
		if (e === i || i === r.def && r.alts.includes(e)) return n;
	}
	return null;
}
function M(e, t) {
	k[e]?.apply(t);
}
function N(e) {
	return e instanceof HTMLElement ? e instanceof HTMLTextAreaElement || e instanceof HTMLSelectElement ? !0 : e instanceof HTMLInputElement ? ![
		"range",
		"checkbox",
		"radio",
		"button",
		"color",
		"file",
		"submit",
		"reset"
	].includes(e.type) : e.isContentEditable : !1;
}
function P() {
	let e = new URLSearchParams(window.location.search).get("detached");
	return n().stores.useUIStore.getState().activeModule === "develop" || e === "develop";
}
function F() {
	let e = (e) => {
		if (!o().getState().armed || !P()) return;
		if (e.key === "Escape") {
			e.preventDefault(), e.stopImmediatePropagation(), o().getState().setArmed(!1);
			return;
		}
		if (N(e.target)) return;
		let t = A(e);
		if (!t) return;
		let r = j(t, (e) => n().keybindings.getBinding(e));
		r && (e.preventDefault(), M(r, n().stores.useDevelopStore.getState()));
	};
	return window.addEventListener("keydown", e, !0), () => window.removeEventListener("keydown", e, !0);
}
//#endregion
//#region src/brush.ts
var I = .25;
function L(e, t, n) {
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
function R(e, t, n) {
	return Math.hypot((t.x - e.x) * n, t.y - e.y);
}
function ee(e, t, n, r) {
	return R(e, t, r) >= n.brushSize * I;
}
function z(e, t, n, r, i) {
	let a = Math.max(1, Math.ceil(R(e, t, r) / (n.brushSize * I))), o = [];
	for (let r = 1; r <= a; r++) {
		let s = r / a;
		o.push(L({
			x: e.x + (t.x - e.x) * s,
			y: e.y + (t.y - e.y) * s
		}, n, i));
	}
	return o;
}
//#endregion
//#region src/persistence.ts
var B = (e) => typeof e == "number" && Number.isFinite(e);
function V(e) {
	if (typeof e != "object" || !e) return !1;
	let t = e;
	return B(t.x) && B(t.y) && B(t.radius) && B(t.feather) && B(t.opacity) && B(t.flow) && typeof t.erase == "boolean";
}
function H(e) {
	return Array.isArray(e) && e.every(V);
}
function U(e) {
	let t = e[y.mask];
	return H(t) ? t : [];
}
function W(e) {
	return {
		[y.mask]: e,
		[y.maskOn]: +(e.length > 0)
	};
}
function G() {
	return n().stores.useDevelopStore.getState();
}
function K(e) {
	let t = G();
	t.setDynParams(W([...U(t.paramBag), ...e]));
}
function q(e) {
	return U(e).length > 0;
}
async function J() {
	let e = G();
	e.setDynParams(W([])), await e.commitEdit("Clear Moiré Mask");
}
async function Y() {
	let e = G();
	e.setDynParams({
		[y.amount]: v.amount,
		[y.luminance]: v.luminance,
		[y.pattern]: v.pattern,
		[y.edge]: v.edge,
		...W([])
	}), await e.commitEdit("Reset Moiré Reduction");
}
//#endregion
//#region src/wash.ts
var X = "230, 64, 64", te = .5;
function ne(e, t) {
	let n = t.radiusToScreen(e.radius);
	if (n < .3) return null;
	let { x: r, y: i } = t.toScreen(e.x, e.y);
	return {
		x: r,
		y: i,
		r: n
	};
}
function re(e, t, n, r, i) {
	e.setTransform(1, 0, 0, 1, 0, 0), e.globalCompositeOperation = "source-over", e.clearRect(0, 0, r, i);
	for (let r of t) {
		let t = ne(r, n);
		if (!t) continue;
		let i = Math.max(0, Math.min(1, 1 - r.feather)), a = Math.max(0, Math.min(1, r.flow * (r.erase ? 1 : r.opacity))), o = e.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r);
		o.addColorStop(0, `rgba(255,255,255,${a})`), o.addColorStop(i, `rgba(255,255,255,${a})`), o.addColorStop(1, "rgba(255,255,255,0)"), e.globalCompositeOperation = r.erase ? "destination-out" : "source-over", e.fillStyle = o, e.beginPath(), e.arc(t.x, t.y, t.r, 0, Math.PI * 2), e.fill();
	}
	e.globalCompositeOperation = "source-in", e.fillStyle = `rgba(${X}, ${te})`, e.fillRect(0, 0, r, i), e.globalCompositeOperation = "source-over";
}
//#endregion
//#region src/Overlay.ts
var Z = {
	position: "absolute",
	display: "none",
	transform: "translate(-50%, -50%)",
	borderRadius: "50%",
	boxShadow: "0 0 0 1px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.35)",
	pointerEvents: "none"
};
function Q(e) {
	let { brushSize: t, brushFeather: n, brushOpacity: r, brushFlow: i, brushErase: a } = e;
	return {
		brushSize: t,
		brushFeather: n,
		brushOpacity: r,
		brushFlow: i,
		brushErase: a
	};
}
function ie(e) {
	return e instanceof HTMLElement && (e.tagName === "INPUT" || e.tagName === "TEXTAREA" || e.isContentEditable);
}
function ae() {
	let e = n().react, t = n().stores.useDevelopStore, i = o()((e) => e.armed), a = t((e) => e.cropping), s = t((e) => e.activeTool), c = t((e) => e.photoId), l = t((e) => e.brushSize), u = t((e) => e.brushFeather), d = t((e) => e.brushErase), f = t((e) => e.brushPreview), p = t((e) => e.paramBag[y.mask]), { rect: m, imageRect: h, nonce: g, toImage: _, toScreen: v, radiusToScreen: b } = n().develop.useDevelopOverlay(), [x, S] = e.useState(!1), [C, w] = e.useState(!1), T = e.useRef(!1), E = e.useRef(null), D = e.useRef(null), O = e.useRef(null), k = e.useRef(null), A = e.useRef(null), j = e.useRef(null), M = e.useRef({
		lx: 0,
		ly: 0,
		shown: !1
	}), N = i && !a && s === "none" && !!m && !!c && !!_ && !!v && !!b, P = h && h.h > 0 ? h.w / h.h : 1, F = (e) => {
		T.current = e, S(e);
	};
	e.useEffect(() => {
		if (N && !x) return n().develop.setCanvasCursor("none", { priority: 20 });
	}, [N, x]), e.useEffect(() => {
		if (!N) {
			F(!1);
			return;
		}
		let e = (e) => {
			ie(e.target) || ((e.code === "Space" || e.ctrlKey || e.metaKey) && F(!0), e.altKey && w(!0));
		}, t = (e) => {
			(e.code === "Space" || !(e.ctrlKey || e.metaKey)) && F(!1), e.altKey || w(!1);
		}, n = () => {
			F(!1), w(!1);
		};
		return window.addEventListener("keydown", e, !0), window.addEventListener("keyup", t, !0), window.addEventListener("blur", n), () => {
			window.removeEventListener("keydown", e, !0), window.removeEventListener("keyup", t, !0), window.removeEventListener("blur", n), F(!1);
		};
	}, [N]);
	let I = (e, n, r) => {
		M.current = {
			lx: e,
			ly: n,
			shown: r
		};
		let i = t.getState(), a = b ? b(i.brushSize) : 0, o = (t, r, i) => {
			t && (t.style.display = i ? "block" : "none", t.style.width = `${r}px`, t.style.height = `${r}px`, t.style.left = `${e}px`, t.style.top = `${n}px`);
		};
		o(D.current, Math.max(3, a) * 2, r), o(O.current, Math.max(1, a * (1 - i.brushFeather)) * 2, r);
	};
	e.useEffect(() => {
		M.current.shown && I(M.current.lx, M.current.ly, !0);
	}, [l, u]), e.useEffect(() => {
		if (!N) return;
		let e = k.current, n = E.current;
		if (!e || !n || !v || !b) return;
		let r = Math.max(1, Math.round(n.clientWidth)), i = Math.max(1, Math.round(n.clientHeight));
		(e.width !== r || e.height !== i) && (e.width = r, e.height = i);
		let a = e.getContext("2d");
		a && re(a, U(t.getState().paramBag), {
			toScreen: v,
			radiusToScreen: b
		}, r, i);
	}, [
		N,
		g,
		p,
		v,
		b,
		t
	]), e.useEffect(() => {
		x && A.current && (A.current = null, t.getState().commitEdit("Moiré Mask"), I(0, 0, !1));
	}, [x]);
	let R = (e) => {
		let t = e.currentTarget.getBoundingClientRect(), r = n().stores.useSettings.getState().uiScale || 1;
		return {
			lx: (e.clientX - t.left) / r,
			ly: (e.clientY - t.top) / r
		};
	}, B = (e) => {
		if (!N || T.current || e.button !== 0 || !_) return;
		let { lx: n, ly: r } = R(e), i = _(n, r);
		e.preventDefault(), e.stopPropagation(), e.currentTarget.setPointerCapture(e.pointerId);
		let a = Q(t.getState());
		K(e.shiftKey && j.current ? z(j.current, i, a, P, e.altKey) : [L(i, a, e.altKey)]), j.current = i, A.current = { last: i }, I(n, r, !0);
	}, V = (e) => {
		if (!N || T.current || !_) return;
		let { lx: n, ly: r } = R(e);
		I(n, r, !0), w(e.altKey);
		let i = A.current;
		if (!i) return;
		let a = _(n, r), o = Q(t.getState());
		ee(i.last, a, o, P) && (K([L(a, o, e.altKey)]), i.last = a, j.current = a);
	}, H = (e) => {
		A.current && (A.current = null, e.currentTarget.releasePointerCapture(e.pointerId), t.getState().commitEdit("Moiré Mask"));
	};
	if (!N) return null;
	let W = C || d, G = `1.5px ${W ? "dashed" : "solid"} ${W ? "rgba(255,107,107,0.95)" : "rgba(255,255,255,0.9)"}`, q = m && b ? b(l) : 0, J = (e, t) => ({
		...Z,
		display: "block",
		border: t,
		left: `${m ? m.x + m.w / 2 : 0}px`,
		top: `${m ? m.y + m.h / 2 : 0}px`,
		width: `${e}px`,
		height: `${e}px`
	});
	return r("div", {
		ref: E,
		onPointerDown: B,
		onPointerMove: V,
		onPointerUp: H,
		onPointerLeave: () => {
			A.current || I(0, 0, !1);
		},
		style: {
			position: "absolute",
			inset: 0,
			pointerEvents: x ? "none" : "auto",
			touchAction: "none",
			cursor: x ? "default" : "none",
			overflow: "hidden"
		}
	}, r("canvas", {
		ref: k,
		style: {
			position: "absolute",
			inset: 0,
			pointerEvents: "none"
		}
	}), r("div", {
		ref: D,
		style: {
			...Z,
			border: G
		}
	}), r("div", {
		ref: O,
		style: {
			...Z,
			border: "1px solid rgba(255,255,255,0.45)"
		}
	}), f && m ? r("div", { style: {
		position: "absolute",
		inset: 0,
		pointerEvents: "none"
	} }, r("div", { style: J(Math.max(3, q) * 2, "1.5px solid rgba(255,255,255,0.9)") }), r("div", { style: J(Math.max(1, q * (1 - u)) * 2, "1px solid rgba(255,255,255,0.45)") })) : null);
}
//#endregion
//#region src/Panel.ts
var oe = {
	fontSize: "10px",
	color: "var(--color-text-muted)",
	lineHeight: 1.4
};
function se() {
	let e = n(), t = e.components.Slider, { Button: i, Toggle: a, Row: s, Stack: c } = e.ui, l = e.stores.useDevelopStore, u = o()((e) => e.armed), d = l((e) => e.paramBag), f = l((e) => e.brushSize), p = l((e) => e.brushFeather), m = l((e) => e.brushOpacity), h = l((e) => e.brushFlow), g = l((e) => e.brushErase), v = q(d), b = (e) => {
		let n = y[e.key], i = d[n], a = typeof i == "number" ? i : e.default;
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
	}, x = (e, n, i, a, o, s) => r(t, {
		key: e,
		label: e,
		value: Math.round(n * 100),
		min: i,
		max: a,
		step: 1,
		defaultValue: o,
		onChange: (e) => {
			s(e / 100), l.getState().setBrushPreview(!0);
		},
		onCommit: () => l.getState().setBrushPreview(!1)
	}), S = l.getState();
	return r(c, {
		gap: 6,
		style: { padding: "6px 8px 8px" }
	}, r("div", { style: {
		display: "flex",
		flexDirection: "column",
		gap: "1px"
	} }, _.map(b)), r(s, {
		gap: 6,
		style: { marginTop: "4px" }
	}, r(i, {
		size: "sm",
		active: u,
		onClick: () => o().getState().toggleArmed()
	}, u ? "Done" : "Paint mask"), r(i, {
		size: "sm",
		variant: "ghost",
		disabled: !v,
		onClick: () => void J()
	}, "Clear mask"), r("span", { style: {
		...oe,
		marginLeft: "auto"
	} }, v ? "Painted area" : "Whole image")), u ? r(c, {
		gap: 2,
		style: {
			padding: "6px",
			borderRadius: "4px",
			background: "var(--color-surface-2)"
		}
	}, x("Size", f, 1, 50, 8, (e) => S.setBrushSize(e)), x("Feather", p, 0, 100, 50, (e) => S.setBrushFeather(e)), x("Opacity", m, 1, 100, 100, (e) => S.setBrushOpacity(e)), x("Flow", h, 1, 100, 100, (e) => S.setBrushFlow(e)), r(s, {
		gap: 8,
		style: { marginTop: "4px" }
	}, r(a, {
		checked: g,
		onChange: (e) => S.setBrushErase(e),
		label: "Erase"
	}))) : null);
}
//#endregion
//#region src/index.ts
var $ = null;
function ce(e) {
	t(e), a(), e.registerProcessingStage(E()), $ = F(), e.registerKeybinding({
		id: `${h}.paint`,
		label: "Paint moiré mask",
		category: "Develop",
		defaultCombo: "Shift+M",
		handler: () => {
			P() && e.stores.useDevelopStore.getState().photoId && o().getState().toggleArmed();
		}
	}), e.registerSlot({
		id: `${h}.overlay`,
		slot: "develop-canvas-overlay",
		component: ae,
		order: 45
	}), e.registerPanel({
		id: `${h}.panel`,
		title: "Moiré Reduction",
		component: se,
		defaultDock: {
			module: "develop",
			direction: "right",
			order: 8,
			width: 250
		},
		onReset: () => void Y()
	});
}
function le() {
	$?.(), $ = null;
	try {
		o().getState().setArmed(!1), n().unregisterProcessingStage(g);
	} catch {}
}
//#endregion
export { ce as activate, le as deactivate };

//# sourceMappingURL=index.js.map