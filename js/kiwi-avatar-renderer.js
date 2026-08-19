(function attachKiwiAvatarRenderer(global) {
  "use strict";

  const DEFAULT_LOADOUT = {
    body: "kiwi:body:brown",
    head: "",
    eyes: "",
    neck: "",
    hat: "",
    feet: "",
    beak: "",
    back: "",
    hand: "",
  };

  const SLOTS = ["body", "head", "eyes", "neck", "hat", "feet", "beak", "back", "hand"];
  const FULL_HEAD_DETAIL_SLOTS = ["eyes", "neck", "hat", "beak"];
  const BODY_NAMES = new Set(["brown", "forest", "violet", "golden"]);
  const LEGACY_REWARD_SLOTS = {
    "kiwi:head:leaf-crown": "hat",
    "kiwi:head:aviator-cap": "hat",
  };
  const REWARD_FILES = {
    "kiwi:head:space-helmet": "head-space-helmet.png",
    "kiwi:eyes:aviators": "eyes-aviators.png",
    "kiwi:eyes:ski-goggles": "eyes-ski-goggles.png",
    "kiwi:head:leaf-crown": "head-leaf-crown.png",
    "kiwi:head:aviator-cap": "head-aviator-cap.png",
    "kiwi:hat:santa-hat": "hat-santa-hat.png",
    "kiwi:neck:amber-scarf": "neck-amber-scarf.png",
    "kiwi:neck:santa-beard": "neck-santa-beard.png",
    "kiwi:feet:red-gumboots": "feet-red-gumboots.png",
    "kiwi:beak:curly-moustache": "beak-curly-moustache.png",
    "kiwi:back:explorer-pack": "back-explorer-pack.png",
    "kiwi:back:jetpack": "back-jetpack.png",
    "kiwi:hand:zen-staff": "hand-zen-staff.png",
  };
  const REWARD_REAR_FILES = {
    "kiwi:head:aviator-cap": "head-aviator-cap-rear.png",
    "kiwi:neck:amber-scarf": "neck-amber-scarf-rear.png",
  };
  const ASSET_ROOT = String(global.KIWI_AVATAR_ASSET_ROOT || "assets/kiwi").replace(/\/$/, "");
  const ASSET_VERSION = String(global.KIWI_AVATAR_ASSET_VERSION || "3.23.3");
  const LAYOUT_CONFIG = global.KIWI_COSMETIC_LAYOUTS && typeof global.KIWI_COSMETIC_LAYOUTS === "object"
    ? global.KIWI_COSMETIC_LAYOUTS
    : {};
  const LAYOUT_ITEMS = LAYOUT_CONFIG.items && typeof LAYOUT_CONFIG.items === "object"
    ? LAYOUT_CONFIG.items
    : LAYOUT_CONFIG;
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

  function layoutForReward(rewardId, slot = slotForReward(rewardId)) {
    const saved = LAYOUT_ITEMS[String(rewardId || "")] || {};
    const scale = clampNumber(saved.scale, 1, 0.1, 3);
    return {
      x: clampNumber(saved.x, 0, -1920, 1920),
      y: clampNumber(saved.y, 0, -1920, 1920),
      scale,
      layer: saved.layer === "behind" || saved.layer === "front"
        ? saved.layer
        : (slot === "back" ? "behind" : "front"),
    };
  }

  function layoutStyle(layout) {
    const width = layout.scale * 100;
    const left = ((100 - width) / 2) + ((layout.x / LAYOUT_CANVAS_SIZE) * 100);
    const top = ((100 - width) / 2) + ((layout.y / LAYOUT_CANVAS_SIZE) * 100);
    return `left:${left.toFixed(4)}%;top:${top.toFixed(4)}%;right:auto;bottom:auto;width:${width.toFixed(4)}%;height:${width.toFixed(4)}%;`;
  }

  function imageLayer(filename, className, rewardId = "") {
    const layout = rewardId ? layoutForReward(rewardId) : null;
    const style = layout ? ` style="${layoutStyle(layout)}" data-reward-id="${rewardId}"` : "";
    return `<img class="kiwi-avatar-layer ${className}" src="${ASSET_ROOT}/${filename}?v=${encodeURIComponent(ASSET_VERSION)}"${style} alt="" aria-hidden="true" draggable="false">`;
  }

  function render(loadout, options = {}) {
    const clean = normalise(loadout);
    const requestedExpression = String(options.expression || "normal").toLowerCase();
    const expression = ["happy", "excited"].includes(requestedExpression) ? "happy" : "normal";
    const bodyName = clean.body.split(":").pop();
    const cosmetics = COSMETIC_SLOT_ORDER.map((slot) => ({
      slot,
      rewardId: clean[slot],
      filename: REWARD_FILES[clean[slot]],
      rearFilename: REWARD_REAR_FILES[clean[slot]],
      layout: layoutForReward(clean[slot], slot),
    })).filter((item) => item.rewardId && item.filename);
    const layers = cosmetics
      .filter((item) => item.rearFilename)
      .map((item) => imageLayer(item.rearFilename, `kiwi-${item.slot}-rear-layer`, item.rewardId));
    cosmetics
      .filter((item) => item.slot !== "beak" && !item.rearFilename && item.layout.layer === "behind")
      .forEach((item) => layers.push(imageLayer(item.filename, `kiwi-${item.slot}-layer`, item.rewardId)));
    layers.push(imageLayer(`body-${bodyName}-${expression}.png`, "kiwi-body-layer"));
    cosmetics
      .filter((item) => item.slot !== "beak" && (item.rearFilename || item.layout.layer === "front"))
      .forEach((item) => layers.push(imageLayer(item.filename, `kiwi-${item.slot}-layer`, item.rewardId)));
    if (!clean.head && cosmetics.some((item) => item.slot !== "beak")) {
      layers.push(imageLayer(`natural-beak-${bodyName}-${expression}.png`, "kiwi-natural-beak-layer"));
    }
    cosmetics
      .filter((item) => item.slot === "beak")
      .forEach((item) => layers.push(imageLayer(item.filename, "kiwi-beak-layer", item.rewardId)));

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
    render,
    previewReward,
    normalise,
    slotForReward,
    layoutForReward,
    SLOTS: [...SLOTS],
    DEFAULT_LOADOUT: { ...DEFAULT_LOADOUT },
  };
}(window));
