(function attachNestKiwiRenderer(global) {
  "use strict";

  const DEFAULT_LOADOUT = { body: "kiwi:body:brown", head: "", neck: "", back: "", hand: "" };
  const BODY = {
    "kiwi:body:brown": ["#8d5939", "#aa704a", "#603925"],
    "kiwi:body:forest": ["#647748", "#82975d", "#3d4c2d"],
    "kiwi:body:violet": ["#6f547d", "#9270a1", "#493552"],
    "kiwi:body:golden": ["#b87d34", "#d7a24e", "#765020"],
  };

  function normalise(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      body: BODY[source.body] ? source.body : DEFAULT_LOADOUT.body,
      head: ["kiwi:head:leaf-crown", "kiwi:head:aviator-cap"].includes(source.head) ? source.head : "",
      neck: source.neck === "kiwi:neck:amber-scarf" ? source.neck : "",
      back: source.back === "kiwi:back:explorer-pack" ? source.back : "",
      hand: "",
    };
  }

  function back(item) {
    return item === "kiwi:back:explorer-pack" ? `<g><rect x="12" y="103" width="77" height="100" rx="22" fill="#8b572f" stroke="#2d1c16" stroke-width="7"/><rect x="18" y="132" width="54" height="36" rx="10" fill="#b88342" stroke="#2d1c16" stroke-width="5"/><path d="M25 108c4-29 48-34 61-4" fill="none" stroke="#4b321f" stroke-width="8"/><path d="M14 176h72" stroke="#4b321f" stroke-width="6"/><circle cx="58" cy="150" r="5" fill="#e0b85c"/></g>` : "";
  }

  function backStrap(item) {
    return item === "kiwi:back:explorer-pack" ? `<g><path d="M66 105c27 22 37 58 31 101" fill="none" stroke="#4b321f" stroke-width="11" stroke-linecap="round"/><path d="M67 106c25 22 33 55 28 94" fill="none" stroke="#c08a49" stroke-width="5" stroke-linecap="round"/><rect x="88" y="153" width="18" height="16" rx="4" fill="#e0b85c" stroke="#3b271c" stroke-width="4" transform="rotate(8 97 161)"/></g>` : "";
  }

  function neck(item) {
    return item === "kiwi:neck:amber-scarf" ? `<g><path d="M72 147c27 16 70 17 100-2l9 25c-34 22-81 22-117 1z" fill="#df8a19" stroke="#3b2416" stroke-width="7"/><path d="M151 161l20 66 25-9-21-64z" fill="#ef9f25" stroke="#3b2416" stroke-width="7"/></g>` : "";
  }

  function head(item) {
    if (item === "kiwi:head:leaf-crown") return `<g><path d="M61 75c31-22 82-27 120-4" fill="none" stroke="#304b20" stroke-width="11"/><g fill="#73a633" stroke="#273b1d" stroke-width="5"><ellipse cx="68" cy="66" rx="13" ry="22" transform="rotate(-48 68 66)"/><ellipse cx="91" cy="54" rx="13" ry="23" transform="rotate(-24 91 54)"/><ellipse cx="119" cy="48" rx="13" ry="23"/><ellipse cx="147" cy="53" rx="13" ry="23" transform="rotate(24 147 53)"/><ellipse cx="171" cy="66" rx="13" ry="22" transform="rotate(48 171 66)"/></g></g>`;
    if (item === "kiwi:head:aviator-cap") return `<g><path d="M58 82c4-49 91-65 129-17l-9 37c-37-19-78-18-117 3z" fill="#733fd0" stroke="#28183e" stroke-width="8"/><path d="M53 93c37-12 88-9 135 8-25 8-49 9-72 2-21-6-43-6-63 2z" fill="#945ee8" stroke="#28183e" stroke-width="7"/><path d="M79 72c27-16 62-18 91-4" fill="none" stroke="#47311f" stroke-width="9"/><g fill="#b887ff" stroke="#3c2b20" stroke-width="7"><circle cx="101" cy="68" r="19"/><circle cx="147" cy="65" r="19"/></g></g>`;
    return "";
  }

  function render(loadout) {
    const clean = normalise(loadout);
    const colours = BODY[clean.body];
    return `<svg class="nest-kiwi-svg" viewBox="0 0 260 270" role="img" aria-label="Cartoon kiwi bird">
      ${back(clean.back)}
      <g fill="#dc8a36" stroke="#352018" stroke-width="7"><path d="M76 218c-20 7-31 25-18 34 9 6 20-2 27-9 2 13 16 18 23 8 8-12-7-32-32-33z"/><path d="M145 220c-17 10-22 28-8 34 10 4 18-5 23-13 5 12 20 14 25 2 5-13-14-28-40-23z"/></g>
      <path d="M42 154C39 95 78 54 128 56c54 1 91 39 88 102-2 55-32 91-87 91-56 0-84-36-87-95z" fill="${colours[0]}" stroke="#2a1c16" stroke-width="9"/>
      <path d="M54 146c5-45 30-71 63-80-21 18-32 46-29 79 2 31 13 59 34 92-43-4-71-35-68-91z" fill="${colours[1]}" opacity=".48"/>
      ${backStrap(clean.back)}
      <path d="M58 154c-19 25-17 63 10 71 24 7 40-22 38-55-1-25-27-38-48-16z" fill="${colours[2]}" stroke="#2a1c16" stroke-width="8"/>
      <g><ellipse cx="105" cy="105" rx="20" ry="27" fill="#f7f4df" stroke="#211a14" stroke-width="7"/><ellipse cx="151" cy="102" rx="20" ry="27" fill="#f7f4df" stroke="#211a14" stroke-width="7"/><ellipse cx="110" cy="109" rx="10" ry="15" fill="#61a73e"/><ellipse cx="156" cy="106" rx="10" ry="15" fill="#61a73e"/><ellipse cx="113" cy="112" rx="5" ry="9" fill="#15140f"/><ellipse cx="159" cy="109" rx="5" ry="9" fill="#15140f"/><circle cx="108" cy="101" r="4" fill="#fff"/><circle cx="154" cy="98" r="4" fill="#fff"/></g>
      <path d="M125 126c29-19 84-17 126 3-39 8-82 20-116 38-15 8-29-30-10-41z" fill="#df8b37" stroke="#352018" stroke-width="8"/><path d="M146 147c32-4 64-10 91-17" fill="none" stroke="#925020" stroke-width="5"/>
      ${neck(clean.neck)}${head(clean.head)}
    </svg>`;
  }

  function previewReward(rewardId) {
    const reward = String(rewardId || "");
    const slot = reward.split(":")[1];
    const loadout = { ...DEFAULT_LOADOUT };
    if (["body", "head", "neck", "back", "hand"].includes(slot)) loadout[slot] = reward;
    return render(loadout);
  }

  global.KiwiAvatarRenderer = { render, previewReward, normalise, DEFAULT_LOADOUT: { ...DEFAULT_LOADOUT } };
}(window));
