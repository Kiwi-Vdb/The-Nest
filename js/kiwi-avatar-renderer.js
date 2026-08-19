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
    "kiwi:head:leaf-crown": "head-leaf-crown.png",
    "kiwi:head:aviator-cap": "head-aviator-cap.png",
    "kiwi:neck:amber-scarf": "neck-amber-scarf.png",
    "kiwi:back:explorer-pack": "back-explorer-pack.png",
  };
  const ASSET_ROOT = String(global.KIWI_AVATAR_ASSET_ROOT || "assets/kiwi").replace(/\/$/, "");

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

  function imageLayer(filename, className) {
    return `<img class="kiwi-avatar-layer ${className}" src="${ASSET_ROOT}/${filename}" alt="" aria-hidden="true" draggable="false">`;
  }

  function render(loadout, options = {}) {
    const clean = normalise(loadout);
    const requestedExpression = String(options.expression || "normal").toLowerCase();
    const expression = ["happy", "excited"].includes(requestedExpression) ? "happy" : "normal";
    const bodyName = clean.body.split(":").pop();
    const layers = [imageLayer(`body-${bodyName}-${expression}.png`, "kiwi-body-layer")];

    ["back", "feet", "neck", "beak", "eyes", "hat", "head", "hand"].forEach((slot) => {
      const filename = REWARD_FILES[clean[slot]];
      if (filename) layers.push(imageLayer(filename, `kiwi-${slot}-layer`));
    });

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
    SLOTS: [...SLOTS],
    DEFAULT_LOADOUT: { ...DEFAULT_LOADOUT },
  };
}(window));
