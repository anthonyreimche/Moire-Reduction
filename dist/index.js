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
var s = 4096, c = 1.5, l = 1.5, u = .04, d = 1.5, f = Math.sqrt(85), p = 1e-4, m = "moire-reduction", h = `${m}.reduce`, g = [
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
], _ = {
	amount: 0,
	luminance: 0,
	pattern: 50,
	edge: 50
}, v = {
	amount: `${h}.amount`,
	luminance: `${h}.luminance`,
	pattern: `${h}.pattern`,
	edge: `${h}.edge`,
	maskOn: `${h}.maskOn`,
	mask: `${h}.mask`
}, y = (e) => ({
	key: e.key,
	glslType: "float",
	default: e.default,
	range: {
		min: e.min,
		max: e.max,
		step: e.step
	},
	label: e.label
}), b = {
	key: "maskOn",
	glslType: "float",
	default: 0
}, x = (e) => Number.isInteger(e) ? `${e}.0` : String(e), S = "float b3w(int d) { d = d < 0 ? -d : d; return d == 0 ? 0.375 : (d == 1 ? 0.25 : 0.0625); }", C = `
{
  vec2 res = 1.0 / uTexel;
  float anchor = max(res.x, res.y) / ${x(s)};
  float sigmaRef = ${x(c)} * pow(${x(16)}, clamp(pattern, 0.0, 100.0) / 100.0);
  float stride = sigmaRef * anchor / ${x(f)} * exp2(float(uPassIndex));
  float sL = ${x(l)} * pow(${x(u)}, clamp(edge, 0.0, 100.0) / 100.0);
  float sC = ${x(d)} * sL;
  vec3 ctr = max(c, 0.0);
  float Lc = max(luma(ctr), ${x(p)});
  float accL = 0.0;
  float wL = 0.0;
  vec3 accR = vec3(0.0);
  float wC = 0.0;
  for (int dy = -2; dy <= 2; dy++) {
    for (int dx = -2; dx <= 2; dx++) {
      vec3 s = max(readPrev(vUv + vec2(float(dx), float(dy)) * stride * uTexel), 0.0);
      float Ls = max(luma(s), ${x(p)});
      float sp = b3w(dx) * b3w(dy);
      float dl = log(Ls / Lc);
      float eL = exp(-(dl * dl) / (sL * sL));
      float eC = exp(-(dl * dl) / (sC * sC));
      accL += Ls * sp * eL;
      wL += sp * eL;
      accR += (s / Ls) * sp * eC;
      wC += sp * eC;
    }
  }
  c = (accR / wC) * (accL / wL);
}`, w = "\nfloat cov = maskOn > 0.5 ? mask(srcUv) : 1.0;\nfloat ca = clamp(amount, 0.0, 100.0) / 100.0 * cov;\nfloat la = clamp(luminance, 0.0, 100.0) / 100.0 * cov;\nif (ca > 0.0005 || la > 0.0005) {\n  float L0 = max(luma(lin), 1e-6);\n  float Ls = max(luma(stageResult), 1e-6);\n  lin = mix(lin / L0, stageResult / Ls, ca) * mix(L0, Ls, la);\n}";
function T() {
	let [e, t, n, r] = g.map(y);
	return {
		id: h,
		name: "Moiré Reduction",
		phase: "decode",
		priority: 50,
		presetScope: "per-image",
		uniforms: [
			e,
			t,
			n,
			r,
			b
		],
		textures: [{
			key: "mask",
			kind: "coverage"
		}],
		passes: [{
			glsl: C,
			helpers: S,
			iterations: 4,
			uniforms: [n, r]
		}],
		glsl: w
	};
}
//#endregion
//#region src/keys.ts
var E = (e, t, n) => e < t ? t : e > n ? n : e, D = (e) => Math.round(e * 100) / 100, O = {
	"brush.smaller": {
		def: "[",
		alts: [],
		apply: (e) => e.setBrushSize(E(e.brushSize - .01, .01, .5))
	},
	"brush.larger": {
		def: "]",
		alts: [],
		apply: (e) => e.setBrushSize(E(e.brushSize + .01, .01, .5))
	},
	"brush.featherDown": {
		def: "Shift+[",
		alts: ["Shift+{"],
		apply: (e) => e.setBrushFeather(E(D(e.brushFeather - .05), 0, 1))
	},
	"brush.featherUp": {
		def: "Shift+]",
		alts: ["Shift+}"],
		apply: (e) => e.setBrushFeather(E(D(e.brushFeather + .05), 0, 1))
	},
	"brush.opacityDown": {
		def: ",",
		alts: [],
		apply: (e) => e.setBrushOpacity(E(D(e.brushOpacity - .1), .01, 1))
	},
	"brush.opacityUp": {
		def: ".",
		alts: [],
		apply: (e) => e.setBrushOpacity(E(D(e.brushOpacity + .1), .01, 1))
	},
	"brush.flowDown": {
		def: "Shift+,",
		alts: ["Shift+<"],
		apply: (e) => e.setBrushFlow(E(D(e.brushFlow - .1), .01, 1))
	},
	"brush.flowUp": {
		def: "Shift+.",
		alts: ["Shift+>"],
		apply: (e) => e.setBrushFlow(E(D(e.brushFlow + .1), .01, 1))
	}
};
function k(e) {
	let t = e.key;
	if (t === "Control" || t === "Shift" || t === "Alt" || t === "Meta") return null;
	let n = [];
	return (e.ctrlKey || e.metaKey) && n.push("Ctrl"), e.shiftKey && n.push("Shift"), e.altKey && n.push("Alt"), n.push(t.length === 1 ? t.toUpperCase() : t), n.join("+");
}
function A(e, t) {
	for (let [n, r] of Object.entries(O)) {
		let i = t(n);
		if (e === i || i === r.def && r.alts.includes(e)) return n;
	}
	return null;
}
function j(e, t) {
	O[e]?.apply(t);
}
function M(e) {
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
function N() {
	let e = new URLSearchParams(window.location.search).get("detached");
	return n().stores.useUIStore.getState().activeModule === "develop" || e === "develop";
}
function P() {
	let e = (e) => {
		if (!o().getState().armed || !N()) return;
		if (e.key === "Escape") {
			e.preventDefault(), e.stopImmediatePropagation(), o().getState().setArmed(!1);
			return;
		}
		if (M(e.target)) return;
		let t = k(e);
		if (!t) return;
		let r = A(t, (e) => n().keybindings.getBinding(e));
		r && (e.preventDefault(), j(r, n().stores.useDevelopStore.getState()));
	};
	return window.addEventListener("keydown", e, !0), () => window.removeEventListener("keydown", e, !0);
}
//#endregion
//#region src/brush.ts
var F = .25;
function I(e, t, n) {
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
function L(e, t, n) {
	return Math.hypot((t.x - e.x) * n, t.y - e.y);
}
function R(e, t, n, r) {
	return L(e, t, r) >= n.brushSize * F;
}
function z(e, t, n, r, i) {
	let a = Math.max(1, Math.ceil(L(e, t, r) / (n.brushSize * F))), o = [];
	for (let r = 1; r <= a; r++) {
		let s = r / a;
		o.push(I({
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
	let t = e[v.mask];
	return H(t) ? t : [];
}
function W(e) {
	return {
		[v.mask]: e,
		[v.maskOn]: +(e.length > 0)
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
		[v.amount]: _.amount,
		[v.luminance]: _.luminance,
		[v.pattern]: _.pattern,
		[v.edge]: _.edge,
		...W([])
	}), await e.commitEdit("Reset Moiré Reduction");
}
//#endregion
//#region src/wash.ts
var X = "230, 64, 64", ee = .5;
function te(e, t) {
	let n = t.radiusToScreen(e.radius);
	if (n < .3) return null;
	let { x: r, y: i } = t.toScreen(e.x, e.y);
	return {
		x: r,
		y: i,
		r: n
	};
}
function ne(e, t, n, r, i) {
	e.setTransform(1, 0, 0, 1, 0, 0), e.globalCompositeOperation = "source-over", e.clearRect(0, 0, r, i);
	for (let r of t) {
		let t = te(r, n);
		if (!t) continue;
		let i = Math.max(0, Math.min(1, 1 - r.feather)), a = Math.max(0, Math.min(1, r.flow * (r.erase ? 1 : r.opacity))), o = e.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r);
		o.addColorStop(0, `rgba(255,255,255,${a})`), o.addColorStop(i, `rgba(255,255,255,${a})`), o.addColorStop(1, "rgba(255,255,255,0)"), e.globalCompositeOperation = r.erase ? "destination-out" : "source-over", e.fillStyle = o, e.beginPath(), e.arc(t.x, t.y, t.r, 0, Math.PI * 2), e.fill();
	}
	e.globalCompositeOperation = "source-in", e.fillStyle = `rgba(${X}, ${ee})`, e.fillRect(0, 0, r, i), e.globalCompositeOperation = "source-over";
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
function re(e) {
	return e instanceof HTMLElement && (e.tagName === "INPUT" || e.tagName === "TEXTAREA" || e.isContentEditable);
}
function ie() {
	let e = n().react, t = n().stores.useDevelopStore, i = o()((e) => e.armed), a = t((e) => e.cropping), s = t((e) => e.activeTool), c = t((e) => e.photoId), l = t((e) => e.brushSize), u = t((e) => e.brushFeather), d = t((e) => e.brushErase), f = t((e) => e.brushPreview), p = t((e) => e.paramBag[v.mask]), { rect: m, imageRect: h, nonce: g, toImage: _, toScreen: y, radiusToScreen: b } = n().develop.useDevelopOverlay(), [x, S] = e.useState(!1), [C, w] = e.useState(!1), T = e.useRef(!1), E = e.useRef(null), D = e.useRef(null), O = e.useRef(null), k = e.useRef(null), A = e.useRef(null), j = e.useRef(null), M = e.useRef({
		lx: 0,
		ly: 0,
		shown: !1
	}), N = i && !a && s === "none" && !!m && !!c && !!_ && !!y && !!b, P = h && h.h > 0 ? h.w / h.h : 1, F = (e) => {
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
			re(e.target) || ((e.code === "Space" || e.ctrlKey || e.metaKey) && F(!0), e.altKey && w(!0));
		}, t = (e) => {
			(e.code === "Space" || !(e.ctrlKey || e.metaKey)) && F(!1), e.altKey || w(!1);
		}, n = () => {
			F(!1), w(!1);
		};
		return window.addEventListener("keydown", e, !0), window.addEventListener("keyup", t, !0), window.addEventListener("blur", n), () => {
			window.removeEventListener("keydown", e, !0), window.removeEventListener("keyup", t, !0), window.removeEventListener("blur", n), F(!1);
		};
	}, [N]);
	let L = (e, n, r) => {
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
		M.current.shown && L(M.current.lx, M.current.ly, !0);
	}, [l, u]), e.useEffect(() => {
		if (!N) return;
		let e = k.current, n = E.current;
		if (!e || !n || !y || !b) return;
		let r = Math.max(1, Math.round(n.clientWidth)), i = Math.max(1, Math.round(n.clientHeight));
		(e.width !== r || e.height !== i) && (e.width = r, e.height = i);
		let a = e.getContext("2d");
		a && ne(a, U(t.getState().paramBag), {
			toScreen: y,
			radiusToScreen: b
		}, r, i);
	}, [
		N,
		g,
		p,
		y,
		b,
		t
	]), e.useEffect(() => {
		x && A.current && (A.current = null, t.getState().commitEdit("Moiré Mask"), L(0, 0, !1));
	}, [x]);
	let B = (e) => {
		let t = e.currentTarget.getBoundingClientRect(), r = n().stores.useSettings.getState().uiScale || 1;
		return {
			lx: (e.clientX - t.left) / r,
			ly: (e.clientY - t.top) / r
		};
	}, V = (e) => {
		if (!N || T.current || e.button !== 0 || !_) return;
		let { lx: n, ly: r } = B(e), i = _(n, r);
		e.preventDefault(), e.stopPropagation(), e.currentTarget.setPointerCapture(e.pointerId);
		let a = Q(t.getState());
		K(e.shiftKey && j.current ? z(j.current, i, a, P, e.altKey) : [I(i, a, e.altKey)]), j.current = i, A.current = { last: i }, L(n, r, !0);
	}, H = (e) => {
		if (!N || T.current || !_) return;
		let { lx: n, ly: r } = B(e);
		L(n, r, !0), w(e.altKey);
		let i = A.current;
		if (!i) return;
		let a = _(n, r), o = Q(t.getState());
		R(i.last, a, o, P) && (K([I(a, o, e.altKey)]), i.last = a, j.current = a);
	}, W = (e) => {
		A.current && (A.current = null, e.currentTarget.releasePointerCapture(e.pointerId), t.getState().commitEdit("Moiré Mask"));
	};
	if (!N) return null;
	let G = C || d, q = `1.5px ${G ? "dashed" : "solid"} ${G ? "rgba(255,107,107,0.95)" : "rgba(255,255,255,0.9)"}`, J = m && b ? b(l) : 0, Y = (e, t) => ({
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
		onPointerDown: V,
		onPointerMove: H,
		onPointerUp: W,
		onPointerLeave: () => {
			A.current || L(0, 0, !1);
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
			border: q
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
	} }, r("div", { style: Y(Math.max(3, J) * 2, "1.5px solid rgba(255,255,255,0.9)") }), r("div", { style: Y(Math.max(1, J * (1 - u)) * 2, "1px solid rgba(255,255,255,0.45)") })) : null);
}
//#endregion
//#region src/Panel.ts
var ae = {
	fontSize: "10px",
	color: "var(--color-text-muted)",
	lineHeight: 1.4
};
function oe() {
	let e = n(), t = e.components.Slider, { Button: i, Toggle: a, Row: s, Stack: c } = e.ui, l = e.stores.useDevelopStore, u = o()((e) => e.armed), d = l((e) => e.paramBag), f = l((e) => e.brushSize), p = l((e) => e.brushFeather), m = l((e) => e.brushOpacity), h = l((e) => e.brushFlow), _ = l((e) => e.brushErase), y = q(d), b = (e) => {
		let n = v[e.key], i = d[n], a = typeof i == "number" ? i : e.default;
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
	} }, g.map(b)), r(s, {
		gap: 6,
		style: { marginTop: "4px" }
	}, r(i, {
		size: "sm",
		active: u,
		onClick: () => o().getState().toggleArmed()
	}, u ? "Done" : "Paint mask"), r(i, {
		size: "sm",
		variant: "ghost",
		disabled: !y,
		onClick: () => void J()
	}, "Clear mask"), r("span", { style: {
		...ae,
		marginLeft: "auto"
	} }, y ? "Painted area" : "Whole image")), u ? r(c, {
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
		checked: _,
		onChange: (e) => S.setBrushErase(e),
		label: "Erase"
	}))) : null);
}
//#endregion
//#region src/index.ts
var $ = null;
function se(e) {
	t(e), a(), e.registerProcessingStage(T()), $ = P(), e.registerKeybinding({
		id: `${m}.paint`,
		label: "Paint moiré mask",
		category: "Develop",
		defaultCombo: "Shift+M",
		handler: () => {
			N() && e.stores.useDevelopStore.getState().photoId && o().getState().toggleArmed();
		}
	}), e.registerSlot({
		id: `${m}.overlay`,
		slot: "develop-canvas-overlay",
		component: ie,
		order: 45
	}), e.registerPanel({
		id: `${m}.panel`,
		title: "Moiré Reduction",
		component: oe,
		defaultDock: {
			module: "develop",
			direction: "right",
			order: 8,
			width: 250
		},
		onReset: () => void Y()
	});
}
function ce() {
	$?.(), $ = null;
	try {
		o().getState().setArmed(!1), n().unregisterProcessingStage(h);
	} catch {}
}
//#endregion
export { se as activate, ce as deactivate };

//# sourceMappingURL=index.js.map