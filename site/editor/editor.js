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

  function validate(data) {
    const errors = [];
    const warnings = [];
    const err = (m) => errors.push(m);

    if (!data.style_name) err("style_name is empty");
    if (!data.style_slug) err("style_slug is empty");
    else if (!SLUG_RE.test(data.style_slug)) err("style_slug must be lowercase kebab-case (a-z, 0-9, dashes)");
    else if (data.style_slug.length > 60) warnings.push("style_slug is longer than 60 characters");
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
        if (Object.keys(v).length < need) warnings.push(`${key}: the schema asks for at least ${need} fields`);
      } else if (Array.isArray(v) && v.length < 2) warnings.push(`${key}: the schema asks for at least 2 list items`);
      else if (typeof v === "string") warnings.push(`${key} is plain text; named fields work better`);
    }

    if (!data.prompt_template) err("prompt_template is empty");
    else {
      const used = new Set([...data.prompt_template.matchAll(PLACEHOLDER_RE)].map((m) => m[1]));
      const undef = [...used].filter((k) => !envKeys.has(k));
      if (undef.length) err("prompt_template uses undefined placeholders: " + undef.map((k) => `{${k}}`).join(", "));
      const unused = Object.keys(env).filter((k) => !used.has(k));
      if (unused.length) warnings.push("variables not used in prompt_template: " + unused.join(", "));
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
    if (names.length !== new Set(names).size) warnings.push("some example case names are duplicated");

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

  function card(id, title, desc, ...body) {
    return h("section", { class: "card", id }, h("h2", {}, title), desc ? h("p", { class: "desc" }, desc) : null, ...body);
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
    ta.addEventListener("input", () => { state.lists[field] = ta.value; autosize(ta); refresh(); update(); });
    refresh();
    requestAnimationFrame(() => autosize(ta));
    return h("div", { class: "field" }, h("h2", { style: "font-size:14px;margin:0 0 4px" }, title, count), desc ? h("p", { class: "desc", style: "margin:0 0 6px" }, desc) : null, ta);
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
    renderPromptChips();
    update();
  }

  function promptSection() {
    promptArea = h("textarea", { class: "mono", rows: 10 });
    promptArea.value = state.prompt_template;
    promptArea.addEventListener("input", () => { state.prompt_template = promptArea.value; autosize(promptArea); renderPromptChips(); update(); });
    promptChipsEl = h("div", { class: "chips", style: "margin-bottom:10px" });
    requestAnimationFrame(() => autosize(promptArea));
    renderPromptChips();
    return card("sec-prompt", "Prompt template", "Click a variable to insert it. Green = used in the template. Do not mention an aspect ratio here: it is set in the generator.",
      promptChipsEl, promptArea,
      h("div", { style: "height:12px" }),
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

    const anchors = card("sec-anchors", "Anchors and source content", null,
      listField("style_fidelity_anchors", "Style fidelity anchors", "What must stay visible. Start each with [CORE] or [FLEX] if you like."),
      h("div", { style: "height:14px" }),
      listField("source_content_to_avoid", "Source content to avoid", "Logos, slogans, people or layouts from the reference that must not be copied."));

    const rules = card("sec-rules", "Rules", null,
      listField("design_rules", "Design rules"),
      h("div", { style: "height:14px" }),
      listField("do", "Do"),
      h("div", { style: "height:14px" }),
      listField("avoid", "Avoid"));

    const sectionCards = SECTION_DEFS.map(sectionEditor);
    sectionsEl.append(basics, envSection(), anchors, ...sectionCards, rules, promptSection(), examplesSection());

    const jump = $("#jump");
    jump.replaceChildren(...[["sec-basics", "Basics"], ["sec-env", "Variables"], ["sec-anchors", "Anchors"], ["sec-visual_deconstruction", "Visual"], ["sec-composition", "Composition"], ["sec-typography", "Typography"], ["sec-color_palette", "Color"], ["sec-rules", "Rules"], ["sec-prompt", "Prompt"], ["sec-examples", "Examples"]].map(([id, label]) => h("a", { href: "#" + id }, label)));
    update();
  }

  let slugInput;

  /* ---------- panel ---------- */

  let lastData = null;

  function update() {
    const data = buildJson();
    lastData = data;
    const { errors, warnings } = validate(data);

    const checks = $("#tab-checks");
    checks.replaceChildren();
    if (!errors.length) checks.append(h("p", { class: "all-good" }, "✓ Passes all validator rules"));
    const ul = h("ul", { class: "checks" },
      errors.map((m) => h("li", {}, m)),
      warnings.map((m) => h("li", { class: "warn" }, m)));
    checks.append(ul);
    const badge = $("#checkBadge");
    badge.textContent = errors.length ? String(errors.length) : "✓";
    badge.classList.toggle("ok", !errors.length);

    $("#tab-json").textContent = JSON.stringify(data, null, 2);
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
    $("#promptOut").textContent = lastData.prompt_template.replace(/\{([A-Z][A-Z0-9_]*)\}/g, (m, k) => (values[k] ? values[k] : m));
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

  function setupChrome() {
    const styles = (window.COOKBOOK_STYLES && window.COOKBOOK_STYLES.styles) || [];
    const sel = $("#loadExisting");
    for (const st of styles) sel.append(h("option", { value: st.slug }, st.name));
    sel.addEventListener("change", () => {
      const st = styles.find((x) => x.slug === sel.value);
      sel.value = "";
      if (!st || !st.jsonText) return;
      if (!confirm("Replace the current draft with “" + st.name + "”?")) return;
      const err = importJson(st.jsonText);
      if (err) toast(err);
    });

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
      });
    }
    $("#promptCase").addEventListener("change", renderPromptPreview);

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
  if (restored) toast("Draft restored");
})();
