(function attachKiwiAvatarRenderer(global) {
  "use strict";

  const DEFAULT_LOADOUT = {
    body: "kiwi:body:brown", head: "", eyes: "", neck: "", hat: "",
    feet: "", beak: "", back: "", hand: "",
  };
  const SLOTS = ["body", "head", "eyes", "neck", "hat", "feet", "beak", "back", "hand"];
  const FULL_HEAD_DETAIL_SLOTS = ["eyes", "neck", "hat", "beak"];
  const BODY_NAMES = new Set(["brown", "forest", "violet", "golden"]);
  const LEGACY_REWARD_SLOTS = {
    "kiwi:head:leaf-crown": "hat",
    "kiwi:head:aviator-cap": "hat",
  };
  const LEGACY_REWARD_FILES = {
    "kiwi:head:leaf-crown": "head-leaf-crown.png",
    "kiwi:head:aviator-cap": "head-aviator-cap.png",
  };
  const LEGACY_REAR_FILES = {
    "kiwi:head:aviator-cap": "head-aviator-cap-rear.png",
    "kiwi:neck:amber-scarf": "neck-amber-scarf-rear.png",
  };
  const ASSET_ROOT = String(global.KIWI_AVATAR_ASSET_ROOT || "assets/kiwi").replace(/\/$/, "");
  const ASSET_VERSION = String(global.KIWI_AVATAR_ASSET_VERSION || "3.25.1");
  const LAYOUT_CONFIG = global.KIWI_COSMETIC_LAYOUTS && typeof global.KIWI_COSMETIC_LAYOUTS === "object"
    ? global.KIWI_COSMETIC_LAYOUTS : {};
  const LAYOUT_ITEMS = LAYOUT_CONFIG.items && typeof LAYOUT_CONFIG.items === "object"
    ? LAYOUT_CONFIG.items : LAYOUT_CONFIG;
  const LAYOUT_CANVAS_SIZE = Math.max(1, Number(LAYOUT_CONFIG.canvasSize) || 960);
  const COSMETIC_SLOT_ORDER = ["back", "feet", "neck", "beak", "eyes", "hat", "head", "hand"];

  function slotForReward(rewardId) {
    const reward = String(rewardId || "").trim().toLowerCase();
    if (LEGACY_REWARD_SLOTS[reward]) return LEGACY_REWARD_SLOTS[reward];
    const parts = reward.split(":");
    return parts[0] === "kiwi" && SLOTS.includes(parts[1]) ? parts[1] : "";
  }

  function normalise(loadout) {
    const source = loadout && typeof loadout === "object" ? loadout : {};
    const bodyName = String(source.body || "").split(":").pop();
    const clean = {
      body: BODY_NAMES.has(bodyName) ? `kiwi:body:${bodyName}` : DEFAULT_LOADOUT.body,
      ...Object.fromEntries(SLOTS.filter((slot) => slot !== "body").map((slot) => [slot, ""])),
    };
    SLOTS.filter((slot) => slot !== "body").forEach((sourceSlot) => {
      const reward = String(source[sourceSlot] || "").trim().toLowerCase();
      const targetSlot = slotForReward(reward);
      if (!targetSlot || targetSlot === "body") return;
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
    if (LEGACY_REWARD_FILES[rewardId]) return LEGACY_REWARD_FILES[rewardId];
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

  function layoutForReward(rewardId, slot = slotForReward(rewardId)) {
    const saved = LAYOUT_ITEMS[String(rewardId || "")] || {};
    const scale = clampNumber(saved.scale, 1, 0.1, 3);
    const defaultPlacement = slot === "back" ? "behind" : (slot === "beak" ? "top" : "front");
    const fallbackFile = fallbackFilename(rewardId, slot);
    let rawLayers = Array.isArray(saved.layers) ? saved.layers : [];
    if (!rawLayers.length) {
      rawLayers = [];
      if (LEGACY_REAR_FILES[rewardId]) {
        rawLayers.push({ id: "rear", name: "Rear section", file: LEGACY_REAR_FILES[rewardId], placement: "behind" });
      }
      rawLayers.push({ id: "main", name: "Main artwork", file: fallbackFile, placement: defaultPlacement });
    }
    return {
      x: clampNumber(saved.x, 0, -1920, 1920),
      y: clampNumber(saved.y, 0, -1920, 1920),
      scale,
      layer: saved.layer === "behind" ? "behind" : "front",
      hideBaseHead: slot === "head" ? saved.hideBaseHead !== false : false,
      layers: rawLayers
        .map((layer, index) => normaliseLayer(layer, fallbackFile, defaultPlacement, index))
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

  function imageLayer(filename, className, rewardId = "", layout = null, layer = null) {
    const style = layout && layer
      ? ` style="${layoutStyle(layout, layer)}" data-reward-id="${rewardId}" data-layer-id="${layer.id}"`
      : "";
    return `<img class="kiwi-avatar-layer ${className}" src="${ASSET_ROOT}/${filename}?v=${encodeURIComponent(ASSET_VERSION)}"${style} alt="" aria-hidden="true" draggable="false">`;
  }

  function render(loadout, options = {}) {
    const clean = normalise(loadout);
    const requestedExpression = String(options.expression || "normal").toLowerCase();
    const expression = ["happy", "excited"].includes(requestedExpression) ? "happy" : "normal";
    const bodyName = clean.body.split(":").pop();
    const cosmetics = COSMETIC_SLOT_ORDER
      .map((slot) => ({ slot, rewardId: clean[slot], layout: layoutForReward(clean[slot], slot) }))
      .filter((item) => item.rewardId && item.layout.layers.length);

    const layers = [];
    cosmetics.forEach((item) => item.layout.layers
      .filter((layer) => layer.placement === "behind")
      .forEach((layer) => layers.push(imageLayer(layer.file, `kiwi-${item.slot}-layer kiwi-cosmetic-behind`, item.rewardId, item.layout, layer))));

    const headLayout = clean.head ? layoutForReward(clean.head, "head") : null;
    const bodyFilename = clean.head
      ? `body-${bodyName}-${expression}-${headLayout && headLayout.hideBaseHead ? "full-full-head" : "head"}.png`
      : `body-${bodyName}-${expression}.png`;
    layers.push(imageLayer(bodyFilename, "kiwi-body-layer"));

    cosmetics.forEach((item) => item.layout.layers
      .filter((layer) => layer.placement === "front")
      .forEach((layer) => layers.push(imageLayer(layer.file, `kiwi-${item.slot}-layer kiwi-cosmetic-front`, item.rewardId, item.layout, layer))));

    if (!clean.head && cosmetics.some((item) => item.slot !== "beak")) {
      layers.push(imageLayer(`natural-beak-${bodyName}-${expression}.png`, "kiwi-natural-beak-layer"));
    }

    cosmetics.forEach((item) => item.layout.layers
      .filter((layer) => layer.placement === "top")
      .forEach((layer) => layers.push(imageLayer(layer.file, `kiwi-${item.slot}-layer kiwi-cosmetic-top`, item.rewardId, item.layout, layer))));

    return `<span class="kiwi-avatar-png" role="img" aria-label="Cartoon kiwi bird" data-expression="${expression}">${layers.join("")}</span>`;
  }

  function previewReward(rewardId) {
    const reward = String(rewardId || "");
    const slot = slotForReward(reward);
    const loadout = { ...DEFAULT_LOADOUT };
    if (slot) loadout[slot] = reward;
    return render(loadout, { expression: "normal" });
  }

  global.KiwiAvatarRenderer = {
    render, previewReward, normalise, slotForReward, layoutForReward,
    SLOTS: [...SLOTS], DEFAULT_LOADOUT: { ...DEFAULT_LOADOUT },
  };
}(window));
