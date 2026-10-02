/* style.json editor: static, no build step.
 * Mirrors the rules in scripts/validate-style-json.py and schemas/style-v2.1.schema.json.
 * Aspect ratio is deliberately NOT part of style.json: it is chosen manually in the generator. */
(() => {
  "use strict";

  const DRAFT_KEY = "cookbook-editor-draft-v1";
  const CATEGORIES = [
    "Photo + Doodle",
    "Zine + Collage",
    "Type Posters",
    "Travel + City",
    "Editorial + Minimal",
    "Product + Campaign",
  ];

  const REQUIRED_ENV = {
    SUBJECT: "main subject",
    SUBJECT_ACTION: "main action or pose",
    PRODUCT_OR_PROP: "object, product, prop, or visual anchor",
    LOCATION: "environment or setting",
    BACKGROUND_ELEMENTS: "secondary scene details and visual texture",
    MAIN_TEXT: "main headline or graphic text",
    SECONDARY_TEXT: "small supporting text or microcopy",
    ACCENT_SYMBOL: "separator, sticker, symbol, or decorative mark",
    WARDROBE_STYLE: "styling, clothing, character, or visual treatment",
  };
  const RUNTIME_ENV = {
    STYLE_FIDELITY_ANCHORS: "Runtime ordered CORE and FLEX style anchors",
    SOURCE_CONTENT_TO_AVOID: "Runtime source identities and content to replace",
  };
  const OPTIONAL_ENV = ["DESIGN_DIRECTION", "PALETTE", "FOCAL_DETAIL", "SERIES_TEXT", "LANDSCAPE_DIRECTION", "PORTRAIT_DIRECTION"];
  const FORBIDDEN_KEYS = new Set([
    "ASPECT_RATIO", "prompt_9x16", "prompt_16x9", "9x16_prompt", "16x9_prompt",
    "prompt_vertical", "prompt_horizontal", "full_prompt", "rendered_prompt", "final_prompt",
  ]);
  const GENERIC_VALUES = new Set(Object.values(REQUIRED_ENV));
  const GENERIC_SNIPPETS = ["provided variable value", "lorem ipsum", "todo", "tbd", "fixme"];
  const LIST_MIN = { style_fidelity_anchors: 6, source_content_to_avoid: 4, design_rules: 4, do: 3, avoid: 3 };
  const TOP_LEVEL = new Set([
    "style_name", "style_slug", "style_version", "style_summary", "category", "environment_variables",
    "style_fidelity_anchors", "source_content_to_avoid", "visual_deconstruction", "image_treatment",
    "photographic_direction", "composition", "typography", "color_palette", "design_rules", "do", "avoid",
    "prompt_template", "negative_prompt", "examples",
  ]);

  const SECTION_DEFS = [
    {
      key: "visual_deconstruction",
      label: "Visual deconstruction",
      desc: "What makes the style recognisable. At least 3 fields.",
      keys: ["subject_placement", "composition_logic", "graphic_elements", "lighting", "mood", "texture_and_finish"],
    },
    {
      key: "treatment",
      label: "Image treatment",
      desc: "Rendering, texture, finish. At least 2 fields. Use “photographic direction” for photo-based styles.",
      keys: ["lighting", "texture", "finish", "rendering_mode", "depth", "surface", "linework"],
    },
    {
      key: "composition",
      label: "Composition",
      desc: "Layout and hierarchy. At least 2 fields.",
      keys: ["layout", "hierarchy", "subject", "scene", "text", "negative_space", "depth"],
    },
    {
      key: "typography",
      label: "Typography",
      desc: "Headline and secondary text behaviour. At least 2 fields (or 2 list items).",
      keys: ["headline", "secondary", "placement", "text_behavior", "microcopy"],
    },
    {
      key: "color_palette",
      label: "Color palette",
      desc: "Dominant colors and how they relate. At least 2 fields.",
      keys: ["dominant", "accents", "background", "proportions", "behavior"],
    },
  ];

  const PLACEHOLDER_RE = /\{([A-Z0-9_]+)\}/g;
  const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  /* ---------- state ---------- */

  function emptySection() {
    return { mode: "fields", rows: [{ k: "", v: "" }, { k: "", v: "" }], text: "" };
  }

  function newState() {
    const env = [];
    for (const [k, v] of Object.entries(REQUIRED_ENV)) env.push({ k, v });
    for (const [k, v] of Object.entries(RUNTIME_ENV)) env.push({ k, v });
    const sections = {};
    for (const def of SECTION_DEFS) sections[def.key] = emptySection();
    return {
      style_name: "",
      style_slug: "",
      slugTouched: false,
      style_version: "1.0.0",
      style_summary: "",
      category: CATEGORIES[0],
      env,
      lists: { style_fidelity_anchors: "", source_content_to_avoid: "", design_rules: "", do: "", avoid: "" },
      sections,
      treatmentKey: "image_treatment",
      prompt_template:
        "Create one finished poster. Prioritized visual anchors: {STYLE_FIDELITY_ANCHORS}\n" +
        "Subject: {SUBJECT}. Action: {SUBJECT_ACTION}. Key prop: {PRODUCT_OR_PROP}. Location: {LOCATION}. " +
        "Background: {BACKGROUND_ELEMENTS}.\n" +
        "Exact headline text: \"{MAIN_TEXT}\". Small supporting text: \"{SECONDARY_TEXT}\". Accent mark: {ACCENT_SYMBOL}. " +
        "Styling: {WARDROBE_STYLE}.\n" +
        "Replace source content: {SOURCE_CONTENT_TO_AVOID}",
      negative_prompt: "watermark, QR code, real logos, extra text, extra punctuation, distorted anatomy, border, poster mockup",
      examples: [1, 2, 3].map((n) => ({ name: `case-${n}`, values: {} })),
    };
  }

  let state = newState();
  let activeCase = 0;

  /* ---------- helpers ---------- */

  const $ = (sel, root = document) => root.querySelector(sel);

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "value") el.value = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      el.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return el;
  }

  function slugify(text) {
    return text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "");
  }

  function lines(text) {
    return String(text || "").split("\n").map((s) => s.trim()).filter(Boolean);
  }

  function parseValue(text) {
    const t = String(text).trim();
    if (t.startsWith("[") || t.startsWith("{")) {
      try { return JSON.parse(t); } catch { /* keep as string */ }
    }
    return t;
  }

  function stringifyValue(value) {
    return typeof value === "string" ? value : JSON.stringify(value);
  }

  let toastTimer;
  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function autosize(ta) {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight + 2, 420) + "px";
  }

  /* ---------- build output JSON ---------- */

  function sectionValue(sec) {
    if (sec.mode === "list") return lines(sec.text);
    if (sec.mode === "text") return sec.text.trim();
    const obj = {};
    for (const row of sec.rows) {
      const key = row.k.trim();
      if (key) obj[key] = parseValue(row.v);
    }
    return obj;
  }

  function buildJson() {
    const out = {
      style_version: state.style_version.trim(),
      style_name: state.style_name.trim(),
      style_slug: state.style_slug.trim(),
      style_summary: state.style_summary.trim(),
      category: state.category,
    };
    const env = {};
    for (const row of state.env) {
      const key = row.k.trim();
      if (key) env[key] = row.v.trim();
    }
    out.environment_variables = env;
    out.style_fidelity_anchors = lines(state.lists.style_fidelity_anchors);
    out.source_content_to_avoid = lines(state.lists.source_content_to_avoid);
    out.visual_deconstruction = sectionValue(state.sections.visual_deconstruction);
    out[state.treatmentKey] = sectionValue(state.sections.treatment);
    out.composition = sectionValue(state.sections.composition);
    out.typography = sectionValue(state.sections.typography);
    out.color_palette = sectionValue(state.sections.color_palette);
    out.design_rules = lines(state.lists.design_rules);
    out.do = lines(state.lists.do);
    out.avoid = lines(state.lists.avoid);
    out.prompt_template = state.prompt_template.trim();
    out.negative_prompt = state.negative_prompt.trim();
    out.examples = state.examples.map((c) => {
      const values = {};
      for (const row of state.env) {
        const key = row.k.trim();
        const val = (c.values[key] || "").trim();
        if (key && val) values[key] = val;
      }
      return { case_name: c.name.trim(), values };
    });
    return out;
  }

  /* ---------- validation (mirrors scripts/validate-style-json.py) ---------- */

  function isEmptyValue(v) {
    if (typeof v === "string") return !v.trim();
    if (Array.isArray(v)) return v.length === 0;
    if (v && typeof v === "object") return Object.keys(v).length === 0;
    return true;
  }

  function allStrings(value, path, acc = []) {
    if (typeof value === "string") acc.push([path, value]);
    else if (Array.isArray(value)) value.forEach((item, i) => allStrings(item, `${path}[${i}]`, acc));
    else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) allStrings(v, path ? `${path}.${k}` : k, acc);
    }
    return acc;
  }

  const KEY_SECTION = {
    style_name: "sec-basics", style_slug: "sec-basics", style_version: "sec-basics", style_summary: "sec-basics", category: "sec-basics",
    environment_variables: "sec-env", style_fidelity_anchors: "sec-anchors", source_content_to_avoid: "sec-source",
    visual_deconstruction: "sec-visual_deconstruction", image_treatment: "sec-treatment", photographic_direction: "sec-treatment",
    composition: "sec-composition", typography: "sec-typography", color_palette: "sec-color_palette",
    design_rules: "sec-rules", do: "sec-rules", avoid: "sec-rules",
    prompt_template: "sec-prompt", negative_prompt: "sec-negative", examples: "sec-examples",
  };

  function keyOf(msg) {
    if (/^(variable|duplicate variable|ASPECT_RATIO)/.test(msg)) return "environment_variables";
    if (/^(example|some example)/.test(msg)) return "examples";
    if (/^variables not used/.test(msg)) return "prompt_template";
    const m = /^[a-z_]+/.exec(msg);
    return m && KEY_SECTION[m[0]] ? m[0] : "";
  }

  function validate(data) {
    const errors = [];
    const warnings = [];
    const err = (m) => errors.push({ msg: m, key: keyOf(m) });
    const warn = (m) => warnings.push({ msg: m, key: keyOf(m) });

    if (!data.style_name) err("style_name is empty");
    if (!data.style_slug) err("style_slug is empty");
    else if (!SLUG_RE.test(data.style_slug)) err("style_slug must be lowercase kebab-case (a-z, 0-9, dashes)");
    else if (data.style_slug.length > 60) warn("style_slug is longer than 60 characters");
    if (data.style_name && data.style_name === data.style_slug) err("style_name must be human-readable, not a duplicate of style_slug");
    if (!data.style_version) err("style_version is empty");
    if (!data.style_summary) err("style_summary is empty");
    if (!CATEGORIES.includes(data.category)) err("category is not valid");

    const env = data.environment_variables;
    const envKeys = new Set(Object.keys(env));
    for (const key of Object.keys(REQUIRED_ENV)) if (!envKeys.has(key)) err(`variable ${key} is required`);
    if (envKeys.has("ASPECT_RATIO")) err("ASPECT_RATIO must not be a variable: aspect ratio is chosen manually in the generator");
    for (const [key, val] of Object.entries(env)) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) err(`variable name ${key} must be UPPER_SNAKE_CASE`);
      if (!val) err(`variable ${key} needs a description`);
    }
    const dupKeys = state.env.map((r) => r.k.trim()).filter(Boolean);
    if (dupKeys.length !== new Set(dupKeys).size) err("duplicate variable names");

    for (const [field, min] of Object.entries(LIST_MIN)) {
      const list = data[field];
      if (list.length < min) err(`${field}: ${list.length}/${min} items`);
      else if (list.length !== new Set(list).size) err(`${field} has duplicate items`);
    }

    for (const def of SECTION_DEFS) {
      const key = def.key === "treatment" ? state.treatmentKey : def.key;
      const v = data[key];
      if (isEmptyValue(v)) err(`${key} is empty`);
      else if (typeof v === "object" && !Array.isArray(v)) {
        const need = def.key === "visual_deconstruction" ? 3 : 2;
        if (Object.keys(v).length < need) warn(`${key}: the schema asks for at least ${need} fields`);
      } else if (Array.isArray(v) && v.length < 2) warn(`${key}: the schema asks for at least 2 list items`);
      else if (typeof v === "string") warn(`${key} is plain text; named fields work better`);
    }

    if (!Colors.hexRe().test(JSON.stringify(data.color_palette))) warn("color_palette has no hex colors; add #RRGGBB codes so the generator can match them");
    if (!data.prompt_template) err("prompt_template is empty");
    else {
      const used = new Set([...data.prompt_template.matchAll(PLACEHOLDER_RE)].map((m) => m[1]));
      const undef = [...used].filter((k) => !envKeys.has(k));
      if (undef.length) err("prompt_template uses undefined placeholders: " + undef.map((k) => `{${k}}`).join(", "));
      const unused = Object.keys(env).filter((k) => !used.has(k));
      if (unused.length) warn("variables not used in prompt_template: " + unused.join(", "));
    }
    if (!data.negative_prompt) err("negative_prompt is empty");

    if (data.examples.length < 3) err(`examples: ${data.examples.length}/3 cases`);
    data.examples.forEach((c, i) => {
      const p = `example ${i + 1}`;
      if (!c.case_name) err(`${p}: case name is empty`);
      const n = Object.keys(c.values).length;
      if (n < 5) err(`${p}: ${n}/5 variables filled`);
      for (const [k, v] of Object.entries(c.values)) {
        if (GENERIC_VALUES.has(v)) err(`${p}: ${k} is still a generic placeholder`);
      }
    });
    const names = data.examples.map((c) => c.case_name).filter(Boolean);
    if (names.length !== new Set(names).size) warn("some example case names are duplicated");

    for (const [path, text] of allStrings(data, "")) {
      const low = text.toLowerCase();
      const hit = GENERIC_SNIPPETS.find((s) => low.includes(s));
      if (hit) err(`${path} contains generic helper text (“${hit}”)`);
    }
    return { errors, warnings };
  }

  /* ---------- rendering: form ---------- */

  const sectionsEl = $("#sections");
  const counters = [];

  // Minimal 24x24 stroke icons (Lucide-style paths), inherit currentColor.
  const ICONS = {
    "sec-basics": '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    "sec-env": '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
    "sec-anchors": '<circle cx="12" cy="5" r="3"/><path d="M12 22V8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/>',
    "sec-visual_deconstruction": '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    "sec-treatment": '<path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02Z"/>',
    "sec-composition": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>',
    "sec-typography": '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
    "sec-color_palette": '<circle cx="13.5" cy="6.5" r=".6"/><circle cx="17.5" cy="10.5" r=".6"/><circle cx="8.5" cy="7.5" r=".6"/><circle cx="6.5" cy="12.5" r=".6"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.67 1.5-1.5 0-.4-.15-.75-.4-1-.23-.27-.38-.63-.38-1 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9Z"/>',
    "sec-rules": '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    "sec-source": '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    "sec-negative": '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    "sec-prompt": '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
    "sec-examples": '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  };

  function icon(id) {
    const path = ICONS[id];
    if (!path) return null;
    const span = h("span", { class: "h-icon", "aria-hidden": "true" });
    span.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
    return span;
  }

  function card(id, title, desc, ...body) {
    const head = h("h2", { tabindex: "0", role: "button", "aria-expanded": "true" }, icon(id), title);
    const el = h("section", { class: "card", id }, head, desc ? h("p", { class: "desc" }, desc) : null, ...body);
    const toggle = () => {
      const collapsed = el.classList.toggle("collapsed");
      head.setAttribute("aria-expanded", String(!collapsed));
    };
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    return el;
  }

  function goTo(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const group = el.closest(".group");
    if (group && group.hidden) setGroup(group.id.replace("group-", ""), false);
    el.classList.remove("collapsed");
    $("h2", el).setAttribute("aria-expanded", "true");
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
    const field = $("input, textarea, select", el);
    if (field) setTimeout(() => field.focus({ preventScroll: true }), 350);
  }

  function textField(label, value, onInput, opts = {}) {
    const input = h("input", { type: "text", value, placeholder: opts.placeholder || "", spellcheck: "false" });
    input.addEventListener("input", () => onInput(input.value, input));
    return h("label", { class: "field" }, h("span", { class: "lbl" }, label), input);
  }

  function areaField(label, value, onInput, opts = {}) {
    const ta = h("textarea", { class: opts.mono ? "mono" : "", rows: opts.rows || 3, placeholder: opts.placeholder || "" });
    ta.value = value;
    ta.addEventListener("input", () => { autosize(ta); onInput(ta.value, ta); });
    requestAnimationFrame(() => autosize(ta));
    return h("label", { class: "field" }, h("span", { class: "lbl" }, label), ta);
  }

  function listField(field, title, desc) {
    const min = LIST_MIN[field];
    const count = h("span", { class: "count" });
    const ta = h("textarea", { rows: 6, placeholder: "One item per line" });
    ta.value = state.lists[field];
    const refresh = () => {
      const n = lines(ta.value).length;
      count.textContent = `${n}/${min}+`;
      count.className = "count " + (n >= min ? "ok" : "bad");
    };
    const dupes = h("span", { class: "count bad", hidden: true });
    const refreshDupes = () => {
      const items = lines(ta.value);
      const n = items.length - new Set(items).size;
      dupes.hidden = n === 0;
      dupes.textContent = `${n} duplicate${n === 1 ? "" : "s"}`;
    };
    ta.addEventListener("input", () => { state.lists[field] = ta.value; autosize(ta); refresh(); refreshDupes(); update(); });
    refresh();
    refreshDupes();
    requestAnimationFrame(() => autosize(ta));
    const apply = (items) => { ta.value = items.join("\n"); ta.dispatchEvent(new Event("input")); };
    const tools = h("div", { class: "list-tools" },
      h("button", { type: "button", onclick: () => apply(lines(ta.value).sort((a, b) => a.localeCompare(b))) }, "Sort A→Z"),
      h("button", { type: "button", onclick: () => apply([...new Set(lines(ta.value))]) }, "Remove duplicates"),
      dupes);
    return h("div", { class: "field" }, h("h2", { style: "font-size:14px;margin:0 0 4px" }, title, count), desc ? h("p", { class: "desc", style: "margin:0 0 6px" }, desc) : null, ta, tools);
  }

  function kvRows(rows, suggestions, onChange, { keyPlaceholder = "key", valuePlaceholder = "value", rerender }) {
    const wrap = h("div");
    rows.forEach((row, i) => {
      const key = h("input", { type: "text", class: "key", value: row.k, placeholder: keyPlaceholder, spellcheck: "false", list: suggestions ? suggestions.id : null });
      const val = h("textarea", { rows: 1, placeholder: valuePlaceholder });
      val.value = row.v;
      key.addEventListener("input", () => { row.k = key.value; onChange(false); });
      key.addEventListener("change", () => onChange(true));
      val.addEventListener("input", () => { row.v = val.value; autosize(val); onChange(false); });
      requestAnimationFrame(() => autosize(val));
      const rm = h("button", { type: "button", class: "icon danger rm", "aria-label": "Remove", onclick: () => { rows.splice(i, 1); onChange(true); rerender(); } }, "✕");
      wrap.append(h("div", { class: "kv" }, key, val, rm));
    });
    return wrap;
  }

  function sectionEditor(def) {
    const sec = state.sections[def.key];
    const listId = `dl-${def.key}`;
    const dl = h("datalist", { id: listId }, def.keys.map((k) => h("option", { value: k })));
    const body = h("div");

    const paint = () => {
      body.replaceChildren();
      if (sec.mode === "fields") {
        body.append(kvRows(sec.rows, dl, () => update(), { keyPlaceholder: "field name", valuePlaceholder: "description (a JSON [list] is also accepted)", rerender: paint }));
        body.append(h("div", { class: "row-actions" },
          h("button", { type: "button", onclick: () => { sec.rows.push({ k: "", v: "" }); paint(); } }, "+ Add field"),
          h("span", { class: "chips" }, def.keys.filter((k) => !sec.rows.some((r) => r.k === k)).slice(0, 5).map((k) =>
            h("button", { type: "button", class: "chip", onclick: () => {
              const empty = sec.rows.find((r) => !r.k.trim() && !r.v.trim());
              if (empty) empty.k = k; else sec.rows.push({ k, v: "" });
              paint(); update();
            } }, "+ " + k)))));
      } else {
        const ta = h("textarea", { rows: 5, placeholder: sec.mode === "list" ? "One item per line" : "Plain text description" });
        ta.value = sec.text;
        ta.addEventListener("input", () => { sec.text = ta.value; autosize(ta); update(); });
        requestAnimationFrame(() => autosize(ta));
        body.append(ta);
      }
    };

    const seg = h("div", { class: "seg", role: "group", "aria-label": "Section format" });
    for (const [mode, label] of [["fields", "Fields"], ["list", "List"], ["text", "Text"]]) {
      const b = h("button", { type: "button", class: sec.mode === mode ? "is-active" : "", onclick: () => {
        sec.mode = mode;
        for (const s of seg.children) s.classList.toggle("is-active", s === b);
        paint(); update();
      } }, label);
      seg.append(b);
    }

    const extra = [];
    if (def.key === "treatment") {
      const sel = h("select", { "aria-label": "Treatment key" },
        h("option", { value: "image_treatment" }, "image_treatment (illustration / graphic)"),
        h("option", { value: "photographic_direction" }, "photographic_direction (photo-based)"));
      sel.value = state.treatmentKey;
      sel.addEventListener("change", () => { state.treatmentKey = sel.value; update(); });
      extra.push(h("div", { style: "margin-bottom:10px" }, sel));
    }

    paint();
    return card(`sec-${def.key}`, def.label, def.desc, ...extra, seg, body, dl);
  }

  function envSection() {
    const wrap = h("div");
    const paint = () => {
      wrap.replaceChildren();
      const used = new Set(state.env.map((r) => r.k.trim()));
      wrap.append(kvRows(state.env, null, (structural) => {
        if (structural) { renderPromptChips(); renderExamples(); }
        update();
      }, { keyPlaceholder: "VARIABLE_NAME", valuePlaceholder: "what to put here", rerender: () => { paint(); renderPromptChips(); renderExamples(); update(); } }));
      const chips = [...OPTIONAL_ENV, ...Object.keys(RUNTIME_ENV)].filter((k) => !used.has(k));
      wrap.append(h("div", { class: "row-actions" },
        h("button", { type: "button", onclick: () => { state.env.push({ k: "", v: "" }); paint(); } }, "+ Add variable"),
        h("span", { class: "chips" }, chips.map((k) => h("button", { type: "button", class: "chip", onclick: () => {
          state.env.push({ k, v: RUNTIME_ENV[k] || `describe ${k.toLowerCase().replace(/_/g, " ")}` });
          paint(); renderPromptChips(); renderExamples(); update();
        } }, "+ " + k)))));
    };
    paint();
    return card("sec-env", "Variables", "Placeholders the user fills in. The 9 core variables are required. Do not add ASPECT_RATIO: you choose the ratio manually in Google Flow.", wrap);
  }

  let promptChipsEl;
  function renderPromptChips() {
    if (!promptChipsEl) return;
    if (typeof paintPromptBack === "function") paintPromptBack();
    const template = state.prompt_template;
    const used = new Set([...template.matchAll(PLACEHOLDER_RE)].map((m) => m[1]));
    promptChipsEl.replaceChildren(...state.env.map((r) => r.k.trim()).filter(Boolean).map((k) =>
      h("button", { type: "button", class: "chip " + (used.has(k) ? "used" : ""), title: "Insert at cursor", onclick: () => insertPlaceholder(k) }, `{${k}}`)));
  }

  let promptArea;
  function insertPlaceholder(key) {
    const ta = promptArea;
    const token = `{${key}}`;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? start;
    ta.value = ta.value.slice(0, start) + token + ta.value.slice(end);
    ta.focus();
    ta.setSelectionRange(start + token.length, start + token.length);
    state.prompt_template = ta.value;
    autosize(ta);
    paintPromptBack();
    renderPromptChips();
    update();
  }

  let promptBack, suggestEl, suggestItems = [], suggestIndex = 0;

  function paintPromptBack() {
    if (!promptBack) return;
    const keys = new Set(state.env.map((r) => r.k.trim()).filter(Boolean));
    const frag = document.createDocumentFragment();
    for (const part of promptArea.value.split(/(\{[A-Za-z0-9_]+\})/)) {
      const m = /^\{([A-Za-z0-9_]+)\}$/.exec(part);
      if (m) frag.append(h("span", { class: "ph" + (keys.has(m[1]) ? "" : " bad") }, part));
      else frag.append(document.createTextNode(part));
    }
    frag.append(document.createTextNode("\n "));
    promptBack.replaceChildren(frag);
  }

  function closeSuggest() { suggestEl.hidden = true; suggestItems = []; }

  function updateSuggest() {
    const caret = promptArea.selectionStart;
    const m = /\{([A-Z0-9_]*)$/.exec(promptArea.value.slice(0, caret));
    if (!m) return closeSuggest();
    const keys = state.env.map((r) => r.k.trim()).filter((k) => k && k.startsWith(m[1]));
    if (!keys.length) return closeSuggest();
    suggestItems = keys;
    suggestIndex = 0;
    suggestEl.hidden = false;
    paintSuggest();
  }

  function paintSuggest() {
    suggestEl.replaceChildren(...suggestItems.map((k, i) =>
      h("li", { class: i === suggestIndex ? "on" : "", onmousedown: (e) => { e.preventDefault(); acceptSuggest(k); } }, `{${k}}`)));
  }

  function acceptSuggest(key) {
    const caret = promptArea.selectionStart;
    const before = promptArea.value.slice(0, caret).replace(/\{[A-Z0-9_]*$/, "");
    const after = promptArea.value.slice(caret).replace(/^[A-Z0-9_]*\}?/, "");
    promptArea.value = `${before}{${key}}${after}`;
    const pos = before.length + key.length + 2;
    promptArea.setSelectionRange(pos, pos);
    closeSuggest();
    promptArea.dispatchEvent(new Event("input"));
  }

  function promptSection() {
    promptArea = h("textarea", { class: "mono", rows: 10, spellcheck: "false", "aria-label": "Prompt template" });
    promptArea.value = state.prompt_template;
    promptBack = h("pre", { class: "hl-back", "aria-hidden": "true" });
    suggestEl = h("ul", { class: "suggest", role: "listbox", hidden: true });
    promptArea.addEventListener("input", () => {
      state.prompt_template = promptArea.value;
      autosize(promptArea);
      paintPromptBack();
      renderPromptChips();
      updateSuggest();
      update();
    });
    promptArea.addEventListener("keydown", (e) => {
      if (suggestEl.hidden) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        suggestIndex = (suggestIndex + (e.key === "ArrowDown" ? 1 : -1) + suggestItems.length) % suggestItems.length;
        paintSuggest();
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        acceptSuggest(suggestItems[suggestIndex]);
      } else if (e.key === "Escape") closeSuggest();
    });
    promptArea.addEventListener("blur", () => setTimeout(closeSuggest, 120));
    promptArea.addEventListener("click", updateSuggest);
    promptChipsEl = h("div", { class: "chips", style: "margin-bottom:10px" });
    requestAnimationFrame(() => { autosize(promptArea); paintPromptBack(); });
    renderPromptChips();
    return card("sec-prompt", "Prompt template", "Type { to autocomplete a variable, or click a chip. Green = defined, red wavy = undefined. Do not mention an aspect ratio here: it is set in the generator.",
      promptChipsEl, h("div", { class: "hl-wrap" }, promptBack, promptArea), suggestEl);
  }

  function negativeCard() {
    return card("sec-negative", "Negative prompt", "Comma-separated things the image must not contain.",
      areaField("Negative prompt", state.negative_prompt, (v) => { state.negative_prompt = v; update(); }, { rows: 2 }));
  }

  let examplesEl;
  function renderExamples() {
    if (!examplesEl) return;
    if (activeCase >= state.examples.length) activeCase = Math.max(0, state.examples.length - 1);
    examplesEl.replaceChildren();
    const keys = state.env.map((r) => r.k.trim()).filter((k) => k && !(k in RUNTIME_ENV));
    state.examples.forEach((c, i) => {
      const name = h("input", { type: "text", value: c.name, placeholder: "case-name-in-kebab-case", spellcheck: "false" });
      name.addEventListener("input", () => { c.name = name.value; update(); });
      const head = h("div", { class: "case-head" }, name,
        h("button", { type: "button", class: "icon", title: "Duplicate", onclick: () => { state.examples.splice(i + 1, 0, { name: c.name + "-copy", values: { ...c.values } }); renderExamples(); update(); } }, "⧉"),
        h("button", { type: "button", class: "icon danger", title: "Remove", onclick: () => { state.examples.splice(i, 1); renderExamples(); update(); } }, "✕"));
      const filled = () => keys.filter((k) => (c.values[k] || "").trim()).length;
      const count = h("span", { class: "count" });
      const paintCount = () => { const n = filled(); count.textContent = `${n}/5+ filled`; count.className = "count " + (n >= 5 ? "ok" : "bad"); };
      paintCount();
      const fields = keys.map((k) => {
        const ta = h("textarea", { rows: 1 });
        ta.value = c.values[k] || "";
        ta.addEventListener("input", () => { c.values[k] = ta.value; autosize(ta); paintCount(); update(); });
        requestAnimationFrame(() => autosize(ta));
        return h("label", { class: "field" }, h("span", { class: "lbl" }, k), ta);
      });
      examplesEl.append(h("div", { class: "case" }, head, count, h("div", { style: "height:8px" }), ...fields));
    });
    examplesEl.append(h("div", { class: "row-actions" }, h("button", { type: "button", onclick: () => {
      state.examples.push({ name: `case-${state.examples.length + 1}`, values: {} });
      renderExamples(); update();
    } }, "+ Add example case")));
  }

  function examplesSection() {
    examplesEl = h("div");
    renderExamples();
    return card("sec-examples", "Examples", "At least 3 real cases, each with at least 5 filled variables. Leave STYLE_FIDELITY_ANCHORS and SOURCE_CONTENT_TO_AVOID out: they are injected at runtime.", examplesEl);
  }

  function renderForm() {
    sectionsEl.replaceChildren();
    const basics = card("sec-basics", "Basics", null,
      h("div", { class: "grid2" },
        textField("Style name", state.style_name, (v) => {
          state.style_name = v;
          if (!state.slugTouched) { state.style_slug = slugify(v); slugInput.value = state.style_slug; }
          update();
        }, { placeholder: "Velocity Type Sport" }),
        (() => {
          const label = textField("Slug (folder name)", state.style_slug, (v) => { state.style_slug = v; state.slugTouched = true; update(); }, { placeholder: "velocity-type-sport" });
          slugInput = $("input", label);
          return label;
        })()),
      h("div", { class: "grid2" },
        textField("Version", state.style_version, (v) => { state.style_version = v; update(); }),
        (() => {
          const sel = h("select", {}, CATEGORIES.map((c) => h("option", { value: c }, c)));
          sel.value = state.category;
          sel.addEventListener("change", () => { state.category = sel.value; update(); });
          return h("label", { class: "field" }, h("span", { class: "lbl" }, "Category"), sel);
        })()),
      areaField("Summary", state.style_summary, (v) => { state.style_summary = v; update(); }, { rows: 3, placeholder: "One or two sentences describing the visual system" }));

    const anchors = card("sec-anchors", "Style anchors", null,
      listField("style_fidelity_anchors", "Style fidelity anchors", "What must stay visible. Start each with [CORE] or [FLEX] if you like."));

    const source = card("sec-source", "Source content to avoid", null,
      listField("source_content_to_avoid", "Source content to avoid", "Logos, slogans, people or layouts from the reference that must not be copied."));

    const rules = card("sec-rules", "Rules", null,
      listField("design_rules", "Design rules"),
      h("div", { style: "height:14px" }),
      listField("do", "Do"),
      h("div", { style: "height:14px" }),
      listField("avoid", "Avoid"));

    const [visual, treatment, composition, typography, palette] = SECTION_DEFS.map(sectionEditor);
    const byId = {};
    for (const el of [basics, anchors, visual, treatment, composition, typography, palette, source, rules, negativeCard(), envSection(), promptSection(), examplesSection()]) byId[el.id] = el;

    const nav = $("#groupNav");
    nav.replaceChildren();
    GROUPS.forEach((group, index) => {
      const cards = group.cards.map((id) => byId[id]);
      const chips = h("div", { class: "group-tools" },
        h("span", { class: "chips" }, cards.map((el) => h("button", { type: "button", class: "chip plain", onclick: () => goTo(el.id) }, $("h2", el).textContent))),
        h("span", { class: "spacer" }),
        h("button", { type: "button", class: "chip plain", onclick: () => setAllCollapsed(true) }, "Collapse all"),
        h("button", { type: "button", class: "chip plain", onclick: () => setAllCollapsed(false) }, "Expand all"));
      const prev = GROUPS[index - 1];
      const next = GROUPS[index + 1];
      const footer = h("div", { class: "group-footer" },
        prev ? h("button", { type: "button", onclick: () => setGroup(prev.id, true) }, "← " + prev.label) : h("span"),
        next ? h("button", { type: "button", class: "primary", onclick: () => setGroup(next.id, true) }, "Next: " + next.label + " →") : h("span"));
      const wrap = h("div", { class: "group", id: "group-" + group.id, hidden: group.id !== activeGroup }, h("h2", { class: "group-title" }, group.label, h("small", {}, group.hint)), chips, ...cards, footer);
      sectionsEl.append(wrap);
      nav.append(h("button", { type: "button", class: "gn" + (group.id === activeGroup ? " is-active" : ""), "data-group": group.id, onclick: () => setGroup(group.id, true) },
        h("span", { class: "gn-num" }, String(index + 1)), h("span", { class: "gn-text" }, h("b", {}, group.label), h("small", {}, group.hint)), h("span", { class: "gn-dot" })));
    });
    update();
  }

  const GROUPS = [
    { id: "identity", label: "Identity", hint: "Name and category", cards: ["sec-basics"] },
    { id: "look", label: "Look", hint: "The visual system", cards: ["sec-anchors", "sec-visual_deconstruction", "sec-treatment", "sec-composition", "sec-typography", "sec-color_palette"] },
    { id: "guardrails", label: "Guardrails", hint: "What to avoid", cards: ["sec-source", "sec-rules", "sec-negative"] },
    { id: "prompt", label: "Prompt", hint: "Template and examples", cards: ["sec-env", "sec-prompt", "sec-examples"] },
  ];
  let activeGroup = "identity";

  function setGroup(id, scroll) {
    activeGroup = id;
    for (const g of document.querySelectorAll(".group")) g.hidden = g.id !== "group-" + id;
    for (const b of document.querySelectorAll("#groupNav .gn")) b.classList.toggle("is-active", b.dataset.group === id);
    focusedSection = "";
    markFocused();
    if (scroll) window.scrollTo({ top: Math.max(0, $(".workspace").offsetTop - 60), behavior: "smooth" });
  }

  let slugInput;

  function setAllCollapsed(collapsed) {
    for (const el of document.querySelectorAll(".group:not([hidden]) section.card")) {
      el.classList.toggle("collapsed", collapsed);
      $("h2", el).setAttribute("aria-expanded", String(!collapsed));
    }
  }

  /* ---------- panel ---------- */

  let lastData = null;
  let focusedSection = "";

  const TOKEN_RE = /("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?)|(true|false|null)|([{}\[\],])/g;

  function tokens(text, strClass) {
    const out = [];
    let last = 0;
    for (const m of text.matchAll(TOKEN_RE)) {
      if (m.index > last) out.push(text.slice(last, m.index));
      if (m[1]) {
        out.push(h("span", { class: strClass }, ...Colors.richNodes(m[1])));
      } else if (m[2] || m[3]) out.push(h("span", { class: "n" }, m[0]));
      else out.push(h("span", { class: "p" }, m[0]));
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }

  function renderJsonView(data, errKeys) {
    const view = $("#tab-json");
    const scroll = view.parentElement.scrollTop;
    let topKey = "";
    const rows = JSON.stringify(data, null, 2).split("\n").map((line) => {
      const m = /^(\s*)("(?:[^"\\]|\\.)*")(: )?(.*)$/.exec(line);
      const isTop = m && m[1].length === 2 && m[3];
      if (isTop) topKey = JSON.parse(m[2]);
      else if (line === "{" || line === "}") topKey = "";
      const el = h("div", { class: "jl" + (isTop ? " top" : "") });
      if (topKey) el.dataset.key = topKey;
      if (topKey && errKeys.has(topKey)) el.classList.add("err");
      if (m && m[3]) el.append(m[1], h("span", { class: isTop ? "k1" : "k2" }, m[2]), ": ", ...tokens(m[4], "s"));
      else el.append(...tokens(line, "s"));
      return el;
    });
    view.replaceChildren(...rows);
    view.parentElement.scrollTop = scroll;
    markFocused();
  }

  function markFocused() {
    for (const el of document.querySelectorAll("#tab-json .jl")) {
      el.classList.toggle("focus", !!focusedSection && KEY_SECTION[el.dataset.key] === focusedSection);
    }
  }

  function scrollJsonToSection() {
    const view = $("#tab-json");
    if (!view.classList.contains("is-active")) return;
    const first = view.querySelector(".jl.focus");
    if (!first) return;
    const body = view.parentElement;
    body.scrollTop = first.offsetTop - view.offsetTop - 40;
  }

  /* ---------- raw editor ---------- */

  let rawDirty = false;

  function syncRaw() {
    const raw = $("#rawText");
    if (!raw || rawDirty || document.activeElement === raw) return;
    raw.value = JSON.stringify(lastData, null, 2);
    setRawStatus("");
  }

  function setRawStatus(text, ok) {
    const el = $("#rawStatus");
    el.textContent = text;
    el.className = "raw-status" + (text ? (ok ? " ok" : " bad") : "");
  }

  function checkRaw() {
    const text = $("#rawText").value;
    try { JSON.parse(text); setRawStatus("✓ Valid JSON", true); return true; }
    catch (e) {
      let where = "";
      const lc = /line (\d+) column (\d+)/.exec(e.message);
      const pos = /position (\d+)/.exec(e.message);
      if (lc) where = ` (line ${lc[1]}, column ${lc[2]})`;
      else if (pos) {
        const before = text.slice(0, Number(pos[1])).split("\n");
        where = ` (line ${before.length}, column ${before[before.length - 1].length + 1})`;
      }
      setRawStatus("✕ " + e.message.replace(/ in JSON at position \d+.*$/, "").replace(/ \(line.*$/, "") + where, false);
      return false;
    }
  }

  function update() {
    const data = buildJson();
    lastData = data;
    const { errors, warnings } = validate(data);

    const checks = $("#tab-checks");
    checks.replaceChildren();
    if (!errors.length) checks.append(h("p", { class: "all-good" }, "✓ Passes all validator rules"));
    const item = (cls) => (m) => {
      const target = KEY_SECTION[m.key];
      return h("li", { class: cls + (target ? " link" : ""), title: target ? "Go to field" : null, onclick: target ? () => goTo(target) : null }, m.msg);
    };
    const ul = h("ul", { class: "checks" }, errors.map(item("")), warnings.map(item("warn")));
    checks.append(ul);
    const badge = $("#checkBadge");
    badge.textContent = errors.length ? String(errors.length) : "✓";
    badge.classList.toggle("ok", !errors.length);

    const errKeys = new Set(errors.map((m) => m.key).filter(Boolean));
    renderJsonView(data, errKeys);
    const badSections = new Set([...errKeys].map((k) => KEY_SECTION[k]));
    for (const el of document.querySelectorAll("section.card")) el.classList.toggle("has-error", badSections.has(el.id));
    for (const b of document.querySelectorAll("#groupNav .gn")) {
      const group = GROUPS.find((g) => g.id === b.dataset.group);
      b.classList.toggle("bad", group.cards.some((id) => badSections.has(id)));
    }
    syncRaw();
    renderPromptPreview();
    saveDraft();
  }

  function renderPromptPreview() {
    if (!lastData) return;
    const sel = $("#promptCase");
    const prev = sel.value;
    sel.replaceChildren(...state.examples.map((c, i) => h("option", { value: String(i) }, c.name || `case ${i + 1}`)));
    sel.value = prev && Number(prev) < state.examples.length ? prev : "0";
    const example = lastData.examples[Number(sel.value)] || { values: {} };
    const values = { ...example.values };
    if (!values.STYLE_FIDELITY_ANCHORS && lastData.style_fidelity_anchors.length) values.STYLE_FIDELITY_ANCHORS = lastData.style_fidelity_anchors.join(" ");
    if (!values.SOURCE_CONTENT_TO_AVOID && lastData.source_content_to_avoid.length) values.SOURCE_CONTENT_TO_AVOID = lastData.source_content_to_avoid.join("; ");
    if (!values.NEGATIVE_PROMPT && lastData.negative_prompt) values.NEGATIVE_PROMPT = lastData.negative_prompt;
    $("#promptOut").replaceChildren(...Colors.richNodes(lastData.prompt_template.replace(/\{([A-Z][A-Z0-9_]*)\}/g, (m, k) => (values[k] ? values[k] : m))));
  }

  /* ---------- import / draft ---------- */

  function sectionFromJson(value) {
    if (Array.isArray(value)) return { mode: "list", rows: [{ k: "", v: "" }], text: value.map(stringifyValue).join("\n") };
    if (value && typeof value === "object") {
      const rows = Object.entries(value).map(([k, v]) => ({ k, v: stringifyValue(v) }));
      return { mode: "fields", rows: rows.length ? rows : [{ k: "", v: "" }], text: "" };
    }
    return { mode: "text", rows: [{ k: "", v: "" }], text: typeof value === "string" ? value : "" };
  }

  function stateFromJson(json) {
    const s = newState();
    const dropped = Object.keys(json).filter((k) => !TOP_LEVEL.has(k));
    s.style_name = json.style_name || "";
    s.style_slug = json.style_slug || "";
    s.slugTouched = true;
    s.style_version = json.style_version || "1.0.0";
    s.style_summary = json.style_summary || "";
    s.category = CATEGORIES.includes(json.category) ? json.category : CATEGORIES[0];
    const env = json.environment_variables && typeof json.environment_variables === "object" ? json.environment_variables : {};
    let removedRatio = false;
    s.env = [];
    for (const [k, v] of Object.entries(env)) {
      if (k === "ASPECT_RATIO") { removedRatio = true; continue; }
      s.env.push({ k, v: String(v) });
    }
    for (const field of Object.keys(LIST_MIN)) s.lists[field] = Array.isArray(json[field]) ? json[field].join("\n") : "";
    s.sections.visual_deconstruction = sectionFromJson(json.visual_deconstruction);
    s.treatmentKey = json.photographic_direction && !json.image_treatment ? "photographic_direction" : "image_treatment";
    s.sections.treatment = sectionFromJson(json[s.treatmentKey]);
    s.sections.composition = sectionFromJson(json.composition);
    s.sections.typography = sectionFromJson(json.typography);
    s.sections.color_palette = sectionFromJson(json.color_palette);
    s.prompt_template = String(json.prompt_template || "").replace(/\{ASPECT_RATIO\}/g, "");
    s.negative_prompt = json.negative_prompt || "";
    s.examples = (Array.isArray(json.examples) ? json.examples : []).map((c) => {
      const values = {};
      for (const [k, v] of Object.entries((c && c.values) || {})) if (k !== "ASPECT_RATIO") values[k] = String(v);
      return { name: (c && c.case_name) || "", values };
    });
    if (!s.examples.length) s.examples = newState().examples;
    return { state: s, dropped, removedRatio };
  }

  function loadState(next, message) {
    state = next;
    rawDirty = false;
    activeCase = 0;
    renderForm();
    if (message) toast(message);
  }

  let draftTimer;
  function saveDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
    }, 400);
  }

  function importJson(text) {
    let json;
    try { json = JSON.parse(text); } catch (e) { return "Not valid JSON: " + e.message; }
    if (!json || typeof json !== "object" || Array.isArray(json)) return "Top-level value must be an object";
    const { state: next, dropped, removedRatio } = stateFromJson(json);
    const notes = [];
    if (removedRatio) notes.push("ASPECT_RATIO removed");
    if (json.image_treatment && json.photographic_direction) notes.push("kept image_treatment, photographic_direction was not imported");
    if (dropped.length) notes.push("dropped unknown fields: " + dropped.join(", "));
    loadState(next, "Imported" + (notes.length ? " (" + notes.join("; ") + ")" : ""));
    return "";
  }

  /* ---------- wiring ---------- */

  function setupStyleCombo(styles) {
    const btn = $("#comboBtn");
    const pop = $("#comboPop");
    const search = $("#comboSearch");
    const list = $("#comboList");
    const preview = $("#comboPreview");
    const previewImg = $("img", preview);
    const empty = $("#comboEmpty");
    btn.textContent = "Load existing style…";
    let shown = [];
    let active = -1;

    const haystack = (st) => [st.name, st.slug.replace(/-/g, " "), st.category, (st.tags || []).join(" ")].join(" ").toLowerCase();
    const index = styles.map((st) => ({ st, text: haystack(st) }));

    function showPreview(st) {
      if (!st) { preview.hidden = true; return; }
      const src = "../" + (st.thumb16 || "");
      if (previewImg.getAttribute("src") !== src) {
        previewImg.removeAttribute("src");
        previewImg.src = src;
      }
      previewImg.alt = st.name + " preview";
      $("b", preview).textContent = st.name;
      $("span", preview).textContent = st.category;
      preview.hidden = false;
    }

    function setActive(i, scroll) {
      active = i;
      [...list.children].forEach((li, n) => {
        li.classList.toggle("on", n === i);
        li.setAttribute("aria-selected", String(n === i));
      });
      const li = list.children[i];
      if (li) {
        search.setAttribute("aria-activedescendant", li.id);
        if (scroll) li.scrollIntoView({ block: "nearest" });
      }
      showPreview(shown[i]);
    }

    function render() {
      const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
      shown = index.filter((e) => words.every((w) => e.text.includes(w))).map((e) => e.st);
      list.replaceChildren(...shown.map((st, i) => h("li", {
        id: "combo-opt-" + i, role: "option", "aria-selected": "false",
        onmouseenter: () => setActive(i, false),
        onclick: () => choose(st),
      }, h("span", { class: "n" }, st.name), h("small", {}, st.category))));
      empty.hidden = shown.length > 0;
      list.hidden = shown.length === 0;
      if (!shown.length) preview.hidden = true;
      else setActive(0, false);
    }

    function open() {
      pop.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      search.value = "";
      render();
      search.focus();
    }

    function close() {
      if (pop.hidden) return;
      pop.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      btn.focus({ preventScroll: true });
    }

    function choose(st) {
      if (!st || !st.jsonText) return;
      close();
      if (!confirm("Replace the current draft with “" + st.name + "”?")) return;
      const err = importJson(st.jsonText);
      if (err) toast(err);
    }

    btn.addEventListener("click", () => (pop.hidden ? open() : close()));
    search.addEventListener("input", render);
    search.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!shown.length) return;
        setActive((active + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length, true);
      } else if (e.key === "Enter") {
        e.preventDefault();
        choose(shown[active]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    });
    document.addEventListener("pointerdown", (e) => {
      if (!pop.hidden && !$("#styleCombo").contains(e.target)) close();
    });
  }

  function setupChrome() {
    const styles = (window.COOKBOOK_STYLES && window.COOKBOOK_STYLES.styles) || [];
    setupStyleCombo(styles);

    $("#newBtn").addEventListener("click", () => {
      if (confirm("Discard the current draft and start a new style?")) loadState(newState(), "New style");
    });
    $("#themeBtn").addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("cookbook-theme", next); } catch { /* ignore */ }
    });

    const dialog = $("#importDialog");
    $("#importBtn").addEventListener("click", () => { $("#importError").hidden = true; $("#importText").value = ""; dialog.showModal(); });
    $("#importFile").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (file) $("#importText").value = await file.text();
    });
    $("#importGo").addEventListener("click", () => {
      const err = importJson($("#importText").value);
      const box = $("#importError");
      if (err) { box.textContent = err; box.hidden = false; } else dialog.close();
    });

    for (const tab of document.querySelectorAll(".panel-tabs button")) {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".panel-tabs button").forEach((b) => b.classList.toggle("is-active", b === tab));
        document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t.id === "tab-" + tab.dataset.tab));
        if (tab.dataset.tab === "raw") { syncRaw(); checkRaw(); }
        if (tab.dataset.tab === "json") scrollJsonToSection();
      });
    }
    $("#promptCase").addEventListener("change", renderPromptPreview);

    // raw JSON editor
    const raw = $("#rawText");
    raw.addEventListener("input", () => { rawDirty = true; checkRaw(); });
    raw.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        raw.setRangeText("  ", raw.selectionStart, raw.selectionEnd, "end");
        raw.dispatchEvent(new Event("input"));
      }
    });
    $("#rawFormat").addEventListener("click", () => {
      if (!checkRaw()) return;
      raw.value = JSON.stringify(JSON.parse(raw.value), null, 2);
      toast("Formatted");
    });
    $("#rawApply").addEventListener("click", () => {
      if (!checkRaw()) return;
      const err = importJson(raw.value);
      if (err) setRawStatus("✕ " + err, false);
      else { rawDirty = false; syncRaw(); setRawStatus("✓ Applied", true); }
    });

    // JSON view: click a top-level key to jump to its section
    $("#tab-json").addEventListener("click", (e) => {
      const line = e.target.closest(".jl.top");
      if (line) goTo(KEY_SECTION[line.dataset.key]);
    });

    // form focus highlights the matching keys in the JSON view
    sectionsEl.addEventListener("focusin", (e) => {
      const sec = e.target.closest("section.card");
      if (!sec || sec.id === focusedSection) return;
      focusedSection = sec.id;
      markFocused();
      scrollJsonToSection();
    });

    $("#copyPromptBtn").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText($("#promptOut").textContent); toast("Copied prompt"); }
      catch { toast("Copy failed: select the text manually"); }
    });

    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        $("#downloadBtn").click();
      }
    });

    $("#copyBtn").addEventListener("click", async () => {
      const text = JSON.stringify(lastData, null, 2) + "\n";
      try { await navigator.clipboard.writeText(text); toast("Copied style.json"); }
      catch {
        const ta = h("textarea", { style: "position:fixed;opacity:0" }); ta.value = text; document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove(); toast("Copied style.json");
      }
    });
    $("#downloadBtn").addEventListener("click", () => {
      const { errors } = validate(lastData);
      const blob = new Blob([JSON.stringify(lastData, null, 2) + "\n"], { type: "application/json" });
      const a = h("a", { href: URL.createObjectURL(blob), download: "style.json" });
      document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
      toast(errors.length ? `Downloaded with ${errors.length} validation error(s)` : "Downloaded style.json");
    });
  }

  function restoreDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.env) || !saved.sections) return false;
      state = { ...newState(), ...saved };
      return true;
    } catch { return false; }
  }

  setupChrome();
  const restored = restoreDraft();
  renderForm();
  Colors.observe(sectionsEl);
  if (restored) toast("Draft restored");
})();
