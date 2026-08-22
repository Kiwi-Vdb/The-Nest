(function attachKiwiAvatarRenderer(global) {
  "use strict";

  const ARTWORK_ENABLED = true;
  const ART_STYLE_ID = "kiwi-pixel-v1";
  const DEFAULT_LOADOUT = {
    body: "kiwi:body:brown", head: "", eyes: "", hat: "",
    iris: "", feet: "", beak: "", wings: "", aura: "",
  };
  const SLOTS = ["body", "head", "eyes", "iris", "hat", "feet", "beak", "wings", "aura"];
  const FULL_HEAD_DETAIL_SLOTS = ["hat", "eyes", "iris", "beak"];
  const WING_MODES = new Set(["viewer-left", "viewer-right", "both"]);
  const ASSET_ROOT = String(global.KIWI_AVATAR_ASSET_ROOT || "assets/kiwi").replace(/\/$/, "");
  const ASSET_VERSION = String(global.KIWI_AVATAR_ASSET_VERSION || "3.30.0");
  const LAYOUT_CONFIG = global.KIWI_COSMETIC_LAYOUTS && typeof global.KIWI_COSMETIC_LAYOUTS === "object"
    ? global.KIWI_COSMETIC_LAYOUTS : {};
  const LAYOUT_ITEMS = LAYOUT_CONFIG.items && typeof LAYOUT_CONFIG.items === "object"
    ? LAYOUT_CONFIG.items : LAYOUT_CONFIG;
  const LAYOUT_CANVAS_SIZE = Math.max(1, Number(LAYOUT_CONFIG.canvasSize) || 960);
  const COSMETIC_SLOT_ORDER = ["aura", "body", "head", "iris", "eyes", "beak", "wings", "feet", "hat"];
  const BASE_PARTS = [
    { part: "leg-left", file: "base-leg-left.png" },
    { part: "leg-right", file: "base-leg-right.png" },
    { part: "body", file: "base-body.png" },
    { part: "head", file: "base-head.png" },
    { part: "irises", file: "base-irises-green.png" },
    { part: "eyes", file: "base-eyes.png" },
    { part: "beak", file: "base-beak.png" },
    { part: "wing-left", file: "base-wing-left.png" },
    { part: "wing-right", file: "base-wing-right.png" },
    { part: "foot-left", file: "base-foot-left.png" },
    { part: "foot-right", file: "base-foot-right.png" },
  ];

  function slotForReward(rewardId) {
    const reward = String(rewardId || "").trim().toLowerCase();
    const configuredSlot = String(LAYOUT_ITEMS[reward]?.slot || "").trim().toLowerCase();
    if (SLOTS.includes(configuredSlot)) return configuredSlot;
    const parts = reward.split(":");
    return parts[0] === "kiwi" && SLOTS.includes(parts[1]) ? parts[1] : "";
  }

  function normalise(loadout) {
    const source = loadout && typeof loadout === "object" ? loadout : {};
    const requestedBody = String(source.body || "").trim().toLowerCase();
    const bodyIsApproved = requestedBody === DEFAULT_LOADOUT.body
      || (slotForReward(requestedBody) === "body" && Boolean(LAYOUT_ITEMS[requestedBody]));
    const clean = {
      body: bodyIsApproved ? requestedBody : DEFAULT_LOADOUT.body,
      ...Object.fromEntries(SLOTS.filter((slot) => slot !== "body").map((slot) => [slot, ""])),
    };
    SLOTS.filter((slot) => slot !== "body").forEach((sourceSlot) => {
      const reward = String(source[sourceSlot] || "").trim().toLowerCase();
      const targetSlot = slotForReward(reward);
      if (!targetSlot || targetSlot === "body" || !LAYOUT_ITEMS[reward]) return;
      if (targetSlot === sourceSlot || !clean[targetSlot]) clean[targetSlot] = reward;
    });
    if (clean.head) FULL_HEAD_DETAIL_SLOTS.forEach((slot) => { clean[slot] = ""; });
    return clean;
  }

  function clampNumber(value, fallback, minimum, maximum) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
  }

  function fallbackFilename(rewardId, slot) {
    const slug = String(rewardId || "").split(":").slice(2).join("-");
    return slug && slot ? `${slot}-${slug}.png` : "";
  }

  function normaliseLayer(raw, fallbackFile, placement, index) {
    const source = raw && typeof raw === "object" ? raw : {};
    const cleanPlacement = ["behind", "front", "top"].includes(source.placement)
      ? source.placement : placement;
    let cropLeft = clampNumber(source.cropLeft, 0, 0, 95);
    let cropTop = clampNumber(source.cropTop, 0, 0, 95);
    let cropRight = clampNumber(source.cropRight, 0, 0, 95);
    let cropBottom = clampNumber(source.cropBottom, 0, 0, 95);
    if (cropLeft + cropRight > 95) cropRight = 95 - cropLeft;
    if (cropTop + cropBottom > 95) cropBottom = 95 - cropTop;
    return {
      id: String(source.id || `layer-${index + 1}`),
      name: String(source.name || `Layer ${index + 1}`),
      file: String(source.file || fallbackFile || "").split(/[\\/]/).pop(),
      animated: Boolean(source.animated),
      staticFile: String(source.staticFile || "").split(/[\\/]/).pop(),
      placement: cleanPlacement,
      visible: source.visible !== false,
      x: clampNumber(source.x, 0, -1920, 1920),
      y: clampNumber(source.y, 0, -1920, 1920),
      scaleX: clampNumber(source.scaleX, 1, 0.05, 5),
      scaleY: clampNumber(source.scaleY, 1, 0.05, 5),
      rotation: clampNumber(source.rotation, 0, -180, 180),
      skewX: clampNumber(source.skewX, 0, -75, 75),
      skewY: clampNumber(source.skewY, 0, -75, 75),
      flipX: Boolean(source.flipX),
      flipY: Boolean(source.flipY),
      opacity: clampNumber(source.opacity, 1, 0, 1),
      cropLeft, cropTop, cropRight, cropBottom,
    };
  }

  function defaultPlacement(slot) {
    if (["aura", "body"].includes(slot)) return "behind";
    if (["beak", "hat"].includes(slot)) return "top";
    return "front";
  }

  function layoutForReward(rewardId, slot = slotForReward(rewardId)) {
    const saved = LAYOUT_ITEMS[String(rewardId || "")] || {};
    const scale = clampNumber(saved.scale, 1, 0.1, 3);
    const placement = defaultPlacement(slot);
    const fallbackFile = fallbackFilename(rewardId, slot);
    const requestedWingMode = String(saved.wingMode || "both");
    let rawLayers = Array.isArray(saved.layers) ? saved.layers : [];
    if (!rawLayers.length && fallbackFile) {
      rawLayers = [{ id: "main", name: "Main artwork", file: fallbackFile, placement }];
    }
    return {
      x: clampNumber(saved.x, 0, -1920, 1920),
      y: clampNumber(saved.y, 0, -1920, 1920),
      scale,
      artStyle: ART_STYLE_ID,
      hideBaseEyes: Boolean(saved.hideBaseEyes),
      hideBaseIrises: Boolean(saved.hideBaseIrises),
      wingMode: WING_MODES.has(requestedWingMode) ? requestedWingMode : "both",
      layers: rawLayers
        .map((layer, index) => normaliseLayer(layer, fallbackFile, placement, index))
        .filter((layer) => layer.visible && layer.file),
    };
  }

  function layoutStyle(layout, layer) {
    const width = layout.scale * layer.scaleX * 100;
    const height = layout.scale * layer.scaleY * 100;
    const left = ((100 - width) / 2) + (((layout.x + layer.x) / LAYOUT_CANVAS_SIZE) * 100);
    const top = ((100 - height) / 2) + (((layout.y + layer.y) / LAYOUT_CANVAS_SIZE) * 100);
    const flipX = layer.flipX ? -1 : 1;
    const flipY = layer.flipY ? -1 : 1;
    const transform = `rotate(${layer.rotation.toFixed(3)}deg) skewX(${layer.skewX.toFixed(3)}deg) skewY(${layer.skewY.toFixed(3)}deg) scale(${flipX},${flipY})`;
    const clip = `inset(${layer.cropTop.toFixed(3)}% ${layer.cropRight.toFixed(3)}% ${layer.cropBottom.toFixed(3)}% ${layer.cropLeft.toFixed(3)}%)`;
    return [
      `left:${left.toFixed(4)}%`, `top:${top.toFixed(4)}%`, "right:auto", "bottom:auto",
      `width:${width.toFixed(4)}%`, `height:${height.toFixed(4)}%`,
      `opacity:${layer.opacity.toFixed(4)}`, `transform:${transform}`, "transform-origin:50% 50%",
      `clip-path:${clip}`,
    ].join(";") + ";";
  }

  function assetUrl(filename) {
    return `${ASSET_ROOT}/${filename}?v=${encodeURIComponent(ASSET_VERSION)}`;
  }

  function escapeAttribute(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function prefersReducedMotion() {
    try {
      return Boolean(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch {
      return false;
    }
  }

  function imageLayer(filename, className, rewardId = "", layout = null, layer = null, part = "", allowAnimation = true) {
    const transformed = layout && layer ? ` style="${layoutStyle(layout, layer)}"` : "";
    const reward = rewardId ? ` data-reward-id="${escapeAttribute(rewardId)}"` : "";
    const layerId = layer ? ` data-layer-id="${escapeAttribute(layer.id)}"` : "";
    const partId = part ? ` data-base-part="${escapeAttribute(part)}"` : "";
    const isAnimated = Boolean(layer?.animated);
    const displayedFile = isAnimated && !allowAnimation && layer.staticFile ? layer.staticFile : filename;
    const animationClass = isAnimated ? " kiwi-cosmetic-animated" : "";
    const animation = isAnimated
      ? ` data-animation="apng" data-animation-state="${allowAnimation ? "playing" : "static"}"`
      : "";
    return `<img class="kiwi-avatar-layer ${className}${animationClass}" src="${assetUrl(displayedFile)}"${transformed}${reward}${layerId}${partId}${animation} alt="" aria-hidden="true" draggable="false">`;
  }

  function hiddenBaseParts(cosmetics) {
    const hidden = new Set();
    cosmetics.forEach((item) => {
      if (item.slot === "body") hidden.add("body");
      if (item.slot === "head") {
        ["head", "irises", "eyes", "beak"].forEach((part) => hidden.add(part));
      }
      if (item.slot === "beak") hidden.add("beak");
      if (item.slot === "feet") {
        hidden.add("foot-left");
        hidden.add("foot-right");
      }
      if (item.layout.hideBaseEyes) {
        hidden.add("irises");
        hidden.add("eyes");
      }
      if (item.layout.hideBaseIrises) hidden.add("irises");
      if (item.slot !== "wings") return;
      if (["viewer-left", "both"].includes(item.layout.wingMode)) hidden.add("wing-left");
      if (["viewer-right", "both"].includes(item.layout.wingMode)) hidden.add("wing-right");
    });
    return hidden;
  }

  function baseLayers(hiddenParts) {
    return BASE_PARTS
      .filter((item) => !hiddenParts.has(item.part))
      .map((item) => imageLayer(item.file, `kiwi-base-layer kiwi-base-${item.part}`, "", null, null, item.part));
  }

  function render(loadout, options = {}) {
    if (!ARTWORK_ENABLED) {
      return `<span class="kiwi-avatar-png kiwi-avatar-placeholder" role="img" aria-label="Audience avatar artwork placeholder"><span>AVATAR</span></span>`;
    }
    const clean = normalise(loadout);
    const requestedExpression = String(options.expression || "normal").toLowerCase();
    const expression = ["happy", "excited"].includes(requestedExpression) ? "happy" : "normal";
    const allowAnimation = options.animate !== false && !prefersReducedMotion();
    const cosmetics = COSMETIC_SLOT_ORDER
      .map((slot) => ({ slot, rewardId: clean[slot], layout: layoutForReward(clean[slot], slot) }))
      .filter((item) => item.rewardId && item.rewardId !== DEFAULT_LOADOUT.body && item.layout.layers.length);

    const layers = [];
    cosmetics.forEach((item) => item.layout.layers
      .filter((layer) => layer.placement === "behind")
      .forEach((layer) => layers.push(imageLayer(layer.file, `kiwi-${item.slot}-layer kiwi-cosmetic-behind`, item.rewardId, item.layout, layer, "", allowAnimation))));

    layers.push(...baseLayers(hiddenBaseParts(cosmetics)));

    cosmetics.forEach((item) => item.layout.layers
      .filter((layer) => layer.placement === "front")
      .forEach((layer) => layers.push(imageLayer(layer.file, `kiwi-${item.slot}-layer kiwi-cosmetic-front`, item.rewardId, item.layout, layer, "", allowAnimation))));
    cosmetics.forEach((item) => item.layout.layers
      .filter((layer) => layer.placement === "top")
      .forEach((layer) => layers.push(imageLayer(layer.file, `kiwi-${item.slot}-layer kiwi-cosmetic-top`, item.rewardId, item.layout, layer, "", allowAnimation))));

    return `<span class="kiwi-avatar-png" role="img" aria-label="Pixel-art kiwi bird" data-art-style="${ART_STYLE_ID}" data-expression="${expression}">${layers.join("")}</span>`;
  }

  function previewReward(rewardId, options = {}) {
    const reward = String(rewardId || "");
    const slot = slotForReward(reward);
    const loadout = { ...DEFAULT_LOADOUT };
    if (slot) loadout[slot] = reward;
    return render(loadout, { ...options, expression: "normal" });
  }

  global.KiwiAvatarRenderer = {
    render, previewReward, normalise, slotForReward, layoutForReward, hiddenBaseParts,
    SLOTS: [...SLOTS], BASE_PARTS: BASE_PARTS.map((item) => ({ ...item })),
    DEFAULT_LOADOUT: { ...DEFAULT_LOADOUT }, ART_STYLE_ID,
  };
}(window));
