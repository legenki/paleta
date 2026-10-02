/* Hex color support for the editor: a color picker popover, inline swatches next to
 * every #RRGGBB code, per-field swatch strips and "recolor everywhere".
 * Exposed as window.Colors; no dependencies. */
(() => {
  "use strict";

  const FIELD_SELECTOR = "textarea, input[type=text]:not(.key)";
  const hexRe = () => /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])/g;
  const PH_RE = /(\{[A-Z0-9_]+\})/;
  const DEFAULT_COLOR = "#A9C4B2";

  /* ---------- color math ---------- */

  function parseHex(text) {
    let t = String(text).trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(t)) t = t.split("").map((c) => c + c).join("");
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(t)) return null;
    return {
      r: parseInt(t.slice(0, 2), 16),
      g: parseInt(t.slice(2, 4), 16),
      b: parseInt(t.slice(4, 6), 16),
      a: t.length === 8 ? parseInt(t.slice(6, 8), 16) / 255 : 1,
    };
  }

  const byte = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0").toUpperCase();

  function toHex({ r, g, b, a }) {
    return "#" + byte(r) + byte(g) + byte(b) + (a < 1 ? byte(a * 255) : "");
  }

  function rgbToHsv({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: max ? d / max : 0, v: max };
  }

  function hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
  }

  const normalize = (hex) => {
    const p = parseHex(hex);
    return p ? toHex(p) : null;
  };

  /* ---------- tiny DOM helper ---------- */

  function el(tag, attrs = {}, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  function swatchBox(hex, cls) {
    const box = el("span", { class: cls });
    box.style.setProperty("--c", hex);
    return box;
  }

  /* ---------- rich text: placeholders + inline swatches ---------- */

  // Splits text into text nodes, {VAR} spans and clickable inline swatches before each hex code.
  function richNodes(text) {
    const out = [];
    for (const part of String(text).split(PH_RE)) {
      if (!part) continue;
      if (PH_RE.test(part)) { out.push(el("span", { class: "ph" }, part)); continue; }
      let last = 0;
      for (const m of part.matchAll(hexRe())) {
        if (m.index > last) out.push(part.slice(last, m.index));
        out.push(el("button", { type: "button", class: "sw-inline", "data-hex": m[0], title: "Change color everywhere it is used", "aria-label": "Edit color " + m[0] }));
        out[out.length - 1].style.setProperty("--c", m[0]);
        out.push(m[0]);
        last = m.index + m[0].length;
      }
      if (last < part.length) out.push(part.slice(last));
    }
    return out;
  }

  /* ---------- picker popover ---------- */

  let picker = null;
  let session = null; // { onChange, anchor }

  function buildPicker() {
    const sv = el("div", { class: "cp-sv", tabindex: "0", role: "slider", "aria-label": "Saturation and brightness" }, el("span", { class: "cp-handle" }));
    const hue = el("input", { class: "cp-hue", type: "range", min: "0", max: "360", step: "1", "aria-label": "Hue" });
    const alpha = el("input", { class: "cp-alpha", type: "range", min: "0", max: "100", step: "1", "aria-label": "Opacity" });
    const prev = el("span", { class: "cp-prev" });
    const input = el("input", { class: "cp-hex", type: "text", spellcheck: "false", maxlength: "9", "aria-label": "Hex color" });
    const eye = el("button", { type: "button", class: "cp-eye", title: "Pick a color from the screen", "aria-label": "Pick from screen" }, "◎");
    const pal = el("div", { class: "cp-pal" });
    const root = el("div", { class: "cp", role: "dialog", "aria-label": "Color picker", hidden: true },
      sv, el("div", { class: "cp-sliders" }, hue, el("div", { class: "cp-alpha-wrap" }, alpha)),
      el("div", { class: "cp-row" }, prev, input, window.EyeDropper ? eye : null),
      pal);
    document.body.append(root);

    const s = { h: 0, s: 0, v: 1, a: 1 };

    function paint(skipInput) {
      const rgb = hsvToRgb(s.h, s.s, s.v);
      const hex = toHex({ ...rgb, a: s.a });
      root.style.setProperty("--hue", `hsl(${s.h}, 100%, 50%)`);
      root.style.setProperty("--c", toHex({ ...rgb, a: 1 }));
      root.style.setProperty("--ca", hex);
      sv.firstChild.style.left = s.s * 100 + "%";
      sv.firstChild.style.top = (1 - s.v) * 100 + "%";
      hue.value = String(Math.round(s.h));
      alpha.value = String(Math.round(s.a * 100));
      if (!skipInput) input.value = hex;
      return hex;
    }

    function emit(skipInput) {
      const hex = paint(skipInput);
      if (session) session.onChange(hex);
    }

    function setFromHex(hex, silent) {
      const p = parseHex(hex);
      if (!p) return false;
      const hsv = rgbToHsv(p);
      // keep the hue when the color is gray, so the slider does not jump
      s.h = hsv.s === 0 || hsv.v === 0 ? s.h : hsv.h;
      s.s = hsv.s; s.v = hsv.v; s.a = p.a;
      silent ? paint() : emit();
      return true;
    }

    function fromPointer(e) {
      const r = sv.getBoundingClientRect();
      s.s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      s.v = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      emit();
    }

    sv.addEventListener("pointerdown", (e) => {
      sv.setPointerCapture(e.pointerId);
      fromPointer(e);
      const move = (ev) => fromPointer(ev);
      const up = () => { sv.removeEventListener("pointermove", move); sv.removeEventListener("pointerup", up); };
      sv.addEventListener("pointermove", move);
      sv.addEventListener("pointerup", up);
    });
    sv.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 0.1 : 0.01;
      const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      if (!map[e.key]) return;
      e.preventDefault();
      s.s = Math.max(0, Math.min(1, s.s + map[e.key][0]));
      s.v = Math.max(0, Math.min(1, s.v + map[e.key][1]));
      emit();
    });
    hue.addEventListener("input", () => { s.h = Number(hue.value); emit(); });
    alpha.addEventListener("input", () => { s.a = Number(alpha.value) / 100; emit(); });
    input.addEventListener("input", () => {
      const text = input.value.trim();
      const withHash = text.startsWith("#") ? text : "#" + text;
      const p = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(withHash) ? parseHex(withHash) : null;
      if (!p) return;
      const hsv = rgbToHsv(p);
      s.h = hsv.s === 0 || hsv.v === 0 ? s.h : hsv.h;
      s.s = hsv.s; s.v = hsv.v; s.a = p.a;
      emit(true); // keep what the user is typing in the field
    });
    input.addEventListener("blur", () => { input.value = toHex({ ...hsvToRgb(s.h, s.s, s.v), a: s.a }); });
    eye.addEventListener("click", async () => {
      try {
        const result = await new window.EyeDropper().open();
        setFromHex(result.sRGBHex, false);
      } catch { /* cancelled */ }
    });

    function renderPalette() {
      pal.replaceChildren();
      const seen = new Set();
      for (const field of document.querySelectorAll("#sections " + FIELD_SELECTOR.replace(/, /g, ", #sections "))) {
        for (const m of field.value.matchAll(hexRe())) {
          const n = normalize(m[0]);
          if (n) seen.add(n);
        }
      }
      for (const hex of [...seen].slice(0, 24)) {
        const b = el("button", { type: "button", class: "cp-chip", title: hex, "aria-label": hex, onclick: () => setFromHex(hex, false) });
        b.style.setProperty("--c", hex);
        pal.append(b);
      }
      pal.hidden = seen.size === 0;
    }

    root._api = { setFromHex, renderPalette, input };
    return root;
  }

  function closePicker() {
    if (!picker || picker.hidden) return;
    picker.hidden = true;
    const anchor = session && session.anchor;
    session = null;
    if (anchor && anchor.isConnected) anchor.focus({ preventScroll: true });
  }

  function openPicker(anchor, hex, onChange) {
    if (!picker) picker = buildPicker();
    session = null; // do not emit while initialising
    picker._api.setFromHex(normalize(hex) || DEFAULT_COLOR, true);
    picker._api.renderPalette();
    picker.hidden = false;
    const r = anchor.getBoundingClientRect();
    const w = picker.offsetWidth || 244;
    const h = picker.offsetHeight || 300;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
    picker.style.left = left + "px";
    picker.style.top = top + "px";
    session = { onChange, anchor };
    picker._api.input.focus({ preventScroll: true });
    picker._api.input.select();
  }

  document.addEventListener("pointerdown", (e) => {
    if (!picker || picker.hidden) return;
    if (picker.contains(e.target)) return;
    if (session && session.anchor && session.anchor.contains(e.target)) return;
    closePicker();
  }, true);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && picker && !picker.hidden) { e.stopPropagation(); closePicker(); }
  }, true);

  window.addEventListener("resize", closePicker);

  /* ---------- replacing hex codes inside fields ---------- */

  function tokensOf(value) {
    return [...value.matchAll(hexRe())].map((m) => ({ i: m.index, s: m[0] }));
  }

  function replaceOrdinals(field, ordinals, newHex) {
    const value = field.value;
    const toks = tokensOf(value);
    let out = "";
    let last = 0;
    for (const ord of [...ordinals].sort((a, b) => a - b)) {
      const t = toks[ord];
      if (!t) continue;
      out += value.slice(last, t.i) + newHex;
      last = t.i + t.s.length;
    }
    out += value.slice(last);
    if (out === value) return;
    field.value = out;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // Clicking an inline swatch (JSON view, prompt preview) recolors every field that uses that exact code.
  document.addEventListener("click", (e) => {
    const sw = e.target.closest(".sw-inline");
    if (!sw) return;
    e.preventDefault();
    const hex = sw.dataset.hex;
    const key = hex.toLowerCase();
    const targets = [];
    for (const field of document.querySelectorAll("#sections " + FIELD_SELECTOR.replace(/, /g, ", #sections "))) {
      const ords = [];
      tokensOf(field.value).forEach((t, i) => { if (t.s.toLowerCase() === key) ords.push(i); });
      if (ords.length) targets.push({ field, ords });
    }
    openPicker(sw, hex, (next) => { for (const t of targets) replaceOrdinals(t.field, t.ords, next); });
  });

  /* ---------- per-field swatch strips ---------- */

  function decorateField(field) {
    if (field.dataset.cf) return;
    field.dataset.cf = "1";
    const target = field.closest(".hl-wrap") || field;
    const wrap = el("div", { class: "cf" });
    target.replaceWith(wrap);
    const strip = el("div", { class: "sw-strip" });
    wrap.append(target, strip);

    let lastSel = null;
    const remember = () => { lastSel = [field.selectionStart, field.selectionEnd]; };
    field.addEventListener("keyup", remember);
    field.addEventListener("mouseup", remember);
    field.addEventListener("blur", remember);

    function refresh() {
      strip.replaceChildren();
      tokensOf(field.value).forEach((t, i) => {
        const b = el("button", { type: "button", class: "sw", title: "Click to change this color", "aria-label": "Edit color " + t.s },
          el("i"), t.s);
        $i(b).style.setProperty("--c", t.s);
        b.addEventListener("click", () => openPicker(b, t.s, (next) => replaceOrdinals(field, [i], next)));
        strip.append(b);
      });
      const add = el("button", { type: "button", class: "add-color", title: "Insert a color at the cursor" }, "+ color");
      add.addEventListener("mousedown", (e) => e.preventDefault());
      add.addEventListener("click", () => {
        const [start, end] = lastSel || [field.value.length, field.value.length];
        const before = field.value.slice(0, start);
        const needsSpace = before && !/\s$/.test(before);
        const insert = (needsSpace ? " " : "") + DEFAULT_COLOR;
        field.value = before + insert + field.value.slice(end);
        const ord = tokensOf(field.value).findIndex((t) => t.i === start + (needsSpace ? 1 : 0));
        field.dispatchEvent(new Event("input", { bubbles: true }));
        const swatches = strip.querySelectorAll(".sw");
        openPicker(swatches[ord] || add, DEFAULT_COLOR, (next) => replaceOrdinals(field, [ord], next));
      });
      strip.append(add);
    }
    const $i = (b) => b.firstChild;
    field.addEventListener("input", refresh);
    refresh();
  }

  function decorate(root) {
    for (const field of root.querySelectorAll(FIELD_SELECTOR)) decorateField(field);
  }

  function observe(root) {
    decorate(root);
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; decorate(root); });
    }).observe(root, { childList: true, subtree: true });
  }

  window.Colors = { hexRe, parseHex, toHex, normalize, richNodes, openPicker, closePicker, observe, decorate };
})();
