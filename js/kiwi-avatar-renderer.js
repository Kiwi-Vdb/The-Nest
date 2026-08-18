(function attachKiwiAvatarRenderer(global) {
  "use strict";

  const DEFAULT_LOADOUT = {
    body: "kiwi:body:brown",
    head: "",
    neck: "",
    back: "",
    hand: "",
  };

  const BODY_NAMES = new Set(["brown", "forest", "violet", "golden"]);
  const HEAD_NAMES = new Set(["kiwi:head:leaf-crown", "kiwi:head:aviator-cap"]);
  const ASSET_ROOT = String(global.KIWI_AVATAR_ASSET_ROOT || "assets/kiwi").replace(/\/$/, "");

  function normalise(loadout) {
    const source = loadout && typeof loadout === "object" ? loadout : {};
    const bodyName = String(source.body || "").split(":").pop();
    return {
      body: BODY_NAMES.has(bodyName) ? `kiwi:body:${bodyName}` : DEFAULT_LOADOUT.body,
      head: HEAD_NAMES.has(source.head) ? source.head : "",
      neck: source.neck === "kiwi:neck:amber-scarf" ? source.neck : "",
      back: source.back === "kiwi:back:explorer-pack" ? source.back : "",
      hand: "",
    };
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

    if (clean.back) layers.push(imageLayer("back-explorer-pack.png", "kiwi-back-layer"));
    if (clean.neck) layers.push(imageLayer("neck-amber-scarf.png", "kiwi-neck-layer"));
    if (clean.head === "kiwi:head:leaf-crown") {
      layers.push(imageLayer("head-leaf-crown.png", "kiwi-head-layer"));
    } else if (clean.head === "kiwi:head:aviator-cap") {
      layers.push(imageLayer("head-aviator-cap.png", "kiwi-head-layer"));
    }

    return `<span class="kiwi-avatar-png" role="img" aria-label="Cartoon kiwi bird" data-expression="${expression}">${layers.join("")}</span>`;
  }

  function previewReward(rewardId) {
    const reward = String(rewardId || "");
    const slot = reward.split(":")[1];
    const loadout = { ...DEFAULT_LOADOUT };
    if (["body", "head", "neck", "back", "hand"].includes(slot)) loadout[slot] = reward;
    return render(loadout, { expression: "normal" });
  }

  global.KiwiAvatarRenderer = {
    render,
    previewReward,
    normalise,
    DEFAULT_LOADOUT: { ...DEFAULT_LOADOUT },
  };
}(window));
