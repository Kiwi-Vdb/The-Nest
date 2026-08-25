const KIWI_TOKEN_KEY = "the-nest-shop-token";
const KIWI_DEFAULT_CONFIG = { enabled: false, apiBase: "" };
const KIWI_SLOTS = ["body", "head", "iris", "eyes", "hat", "feet", "beak", "wings", "aura"];
const KIWI_DEFAULT_BODY = { rewardId: "kiwi:body:brown", name: "Classic Pixel Kiwi", rarity: "default", category: "Kiwi Body" };

const kiwiState = { config: KIWI_DEFAULT_CONFIG, data: null, busy: false };
let kiwiToastTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
  bindKiwiUi();
  kiwiState.config = await loadJson("./data/shop-config.json", KIWI_DEFAULT_CONFIG);
  await exchangeKiwiAuthCode();
  await loadKiwi();
});

function kiwiConfigured() {
  const base = String(kiwiState.config?.apiBase || "").trim();
  return Boolean(kiwiState.config?.enabled && base.startsWith("https://") && !base.includes("YOUR-WORKER"));
}

function kiwiApiUrl(path) {
  return `${String(kiwiState.config.apiBase || "").replace(/\/$/, "")}/${String(path).replace(/^\//, "")}`;
}

async function kiwiApi(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  const token = localStorage.getItem(KIWI_TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(kiwiApiUrl(path), { ...options, headers, cache: "no-store" });
  let data;
  try { data = await response.json(); }
  catch { data = { ok: false, error: "BAD_RESPONSE", message: "The Nest returned an unreadable response." }; }
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || "Your kiwi could not be updated.");
    error.code = data.error || `HTTP_${response.status}`;
    throw error;
  }
  return data;
}

function bindKiwiUi() {
  document.querySelector("#kiwi-login")?.addEventListener("click", beginKiwiLogin);
  document.querySelector("#kiwi-logout")?.addEventListener("click", logoutKiwi);
}

async function exchangeKiwiAuthCode() {
  const url = new URL(location.href);
  const code = url.searchParams.get("shop_auth");
  if (!code || !kiwiConfigured()) return;
  try {
    const result = await kiwiApi("/api/auth/exchange", { method: "POST", body: JSON.stringify({ code }) });
    localStorage.setItem(KIWI_TOKEN_KEY, result.token);
    kiwiToast("Welcome to your Audience Avatar Builder.");
  } catch (error) {
    kiwiToast(error.message || "Twitch sign-in failed.", true);
  } finally {
    url.searchParams.delete("shop_auth");
    history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }
}

function beginKiwiLogin() {
  if (!kiwiConfigured()) return kiwiToast("The hosted Nest service is not configured yet.", true);
  const returnTo = location.href.split("?")[0].split("#")[0];
  location.href = `${kiwiApiUrl("/auth/twitch")}?return_to=${encodeURIComponent(returnTo)}`;
}

async function logoutKiwi() {
  try { await kiwiApi("/api/logout", { method: "POST", body: "{}" }); } catch { /* local sign-out still succeeds */ }
  localStorage.removeItem(KIWI_TOKEN_KEY);
  kiwiState.data = null;
  renderKiwiSignedOut();
  kiwiToast("Signed out.");
}

async function loadKiwi() {
  if (!kiwiConfigured() || !localStorage.getItem(KIWI_TOKEN_KEY)) return renderKiwiSignedOut();
  try {
    kiwiState.data = await kiwiApi("/api/my-nest");
    renderKiwi();
  } catch (error) {
    if (["AUTH_REQUIRED", "SESSION_INVALID"].includes(error.code)) {
      localStorage.removeItem(KIWI_TOKEN_KEY);
      renderKiwiSignedOut();
    }
    kiwiToast(error.message || "Your kiwi could not be loaded.", true);
  }
}

function renderKiwiSignedOut() {
  document.querySelector("#kiwi-signed-out").hidden = false;
  document.querySelector("#kiwi-builder").hidden = true;
  document.querySelector("#kiwi-owned").innerHTML = `<p class="kiwi-empty">Sign in to view and equip your Kiwi Pixel cosmetics.</p>`;
}

function ownedKiwiItems() {
  return (kiwiState.data?.collections?.cosmetics || []).filter((item) => String(item.rewardId || "").startsWith("kiwi:"));
}

function equippedLoadout() {
  return window.KiwiAvatarRenderer.normalise(kiwiState.data?.kiwi?.equipped || {});
}

function selectedAvatarId() {
  const requested = String(kiwiState.data?.kiwi?.avatarId || window.KiwiAvatarRenderer.DEFAULT_AVATAR_ID || "kiwi");
  return window.KiwiAvatarRenderer.AVATAR_IDS.includes(requested)
    ? requested : window.KiwiAvatarRenderer.DEFAULT_AVATAR_ID;
}

function renderKiwi() {
  const data = kiwiState.data;
  if (!data) return renderKiwiSignedOut();
  document.querySelector("#kiwi-signed-out").hidden = true;
  document.querySelector("#kiwi-builder").hidden = false;
  document.querySelector("#kiwi-owner").textContent = `${data.user?.displayName || data.user?.login || "Viewer"}'s Avatar`;
  document.querySelector("#kiwi-balance").textContent = `${Number(data.user?.balance || 0).toLocaleString()} Shinies`;
  document.querySelector("#kiwi-preview").innerHTML = window.KiwiAvatarRenderer.render(
    equippedLoadout(), { avatarId: selectedAvatarId() },
  );
  renderAvatarBases();
  renderKiwiSlots();
  renderOwnedKiwis();
  renderEquipStatus();
}

function renderAvatarBases() {
  const container = document.querySelector("#kiwi-avatar-bases");
  if (!container) return;
  const selected = selectedAvatarId();
  container.innerHTML = window.KiwiAvatarRenderer.AVATAR_IDS.map((avatarId) => {
    const avatar = window.KiwiAvatarRenderer.avatarDefinition(avatarId);
    return `<button class="kiwi-option${selected === avatarId ? " is-equipped" : ""}" type="button"
      data-avatar-id="${escapeKiwi(avatarId)}" ${kiwiState.busy ? "disabled" : ""}>
      ${escapeKiwi(avatar.name || avatarId)}
    </button>`;
  }).join("");
  container.querySelectorAll("[data-avatar-id]").forEach((button) => {
    button.addEventListener("click", () => equipAvatar(button.dataset.avatarId));
  });
}

function slotItems(slot) {
  const items = ownedKiwiItems().filter((item) => window.KiwiAvatarRenderer.slotForReward(item.rewardId) === slot);
  if (slot === "body") return [KIWI_DEFAULT_BODY, ...items];
  return [{ rewardId: "", name: "None", rarity: "default", category: `Kiwi ${kiwiSlotLabel(slot)}` }, ...items];
}

function kiwiSlotLabel(slot) {
  const labels = {
    head: "Full Head",
    iris: "Eye Colour",
    feet: "Boots / Shoes",
    wings: "Wings / Held Objects",
    aura: "Aura",
  };
  return labels[slot] || String(slot || "").replace(/^./, (letter) => letter.toUpperCase());
}

function renderKiwiSlots() {
  const loadout = equippedLoadout();
  const slots = document.querySelector("#kiwi-slots");
  slots.innerHTML = KIWI_SLOTS.map((slot) => `
    <article class="kiwi-slot">
      <div class="kiwi-slot-label">${escapeKiwi(kiwiSlotLabel(slot))}</div>
      <div class="kiwi-options">
        ${slotItems(slot).map((item) => {
          const equipped = String(loadout[slot] || "") === String(item.rewardId || "");
          return `<button class="kiwi-option${equipped ? " is-equipped" : ""}" type="button"
            data-kiwi-slot="${escapeKiwi(slot)}" data-kiwi-reward="${escapeKiwi(item.rewardId || "")}"
            ${kiwiState.busy ? "disabled" : ""}>${escapeKiwi(item.name || item.rewardId)}</button>`;
        }).join("")}
      </div>
    </article>`).join("");
  slots.querySelectorAll("[data-kiwi-slot]").forEach((button) => {
    button.addEventListener("click", () => equipKiwi(button.dataset.kiwiSlot, button.dataset.kiwiReward));
  });
}

function renderOwnedKiwis() {
  const grid = document.querySelector("#kiwi-owned");
  const items = ownedKiwiItems();
  if (!items.length) {
    grid.innerHTML = `<p class="kiwi-empty">You do not own any Kiwi Pixel cosmetics yet. Visit the shop or open a Loot Chest to find one.</p>`;
    return;
  }
  grid.innerHTML = items.map((item) => `
    <article class="kiwi-owned-card" data-rarity="${escapeKiwi(String(item.rarity || "common").toLowerCase())}">
      ${window.KiwiAvatarRenderer.previewReward(item.rewardId, { avatarId: selectedAvatarId() })}
      <div class="kiwi-owned-name">${escapeKiwi(item.name || item.rewardId)}</div>
      <div class="kiwi-owned-meta">${escapeKiwi(item.rarity || "common")} · ${escapeKiwi(`Kiwi ${kiwiSlotLabel(window.KiwiAvatarRenderer.slotForReward(item.rewardId))}`)}</div>
    </article>`).join("");
}

function renderEquipStatus() {
  const statuses = [
    ...Object.values(kiwiState.data?.kiwi?.statuses || {}),
    kiwiState.data?.kiwi?.avatarStatus || "",
  ];
  const status = document.querySelector("#kiwi-equip-status");
  const pending = statuses.includes("pending");
  status.textContent = pending ? "Saved — waiting for Kiwi Birb to apply this equipment." : "Your modular pixel Kiwi is ready.";
  status.classList.toggle("is-pending", pending);
}

async function equipAvatar(avatarId) {
  if (kiwiState.busy || selectedAvatarId() === avatarId) return;
  kiwiState.busy = true;
  renderAvatarBases();
  try {
    const result = await kiwiApi("/api/equip-avatar", {
      method: "POST", body: JSON.stringify({ avatarId }),
    });
    kiwiState.data.kiwi = result.kiwi;
    renderKiwi();
    kiwiToast("Audience avatar saved.");
  } catch (error) {
    kiwiToast(error.message || "That avatar could not be selected.", true);
  } finally {
    kiwiState.busy = false;
    renderAvatarBases();
  }
}

async function equipKiwi(slot, rewardId) {
  if (kiwiState.busy) return;
  kiwiState.busy = true;
  renderKiwiSlots();
  try {
    const result = await kiwiApi("/api/equip-kiwi", { method: "POST", body: JSON.stringify({ slot, rewardId }) });
    kiwiState.data.kiwi = result.kiwi;
    renderKiwi();
    kiwiToast("Kiwi equipment saved.");
  } catch (error) {
    kiwiToast(error.message || "That cosmetic could not be equipped.", true);
  } finally {
    kiwiState.busy = false;
    renderKiwiSlots();
  }
}

function kiwiToast(message, isError = false) {
  const toast = document.querySelector("#kiwi-toast");
  window.clearTimeout(kiwiToastTimer);
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  kiwiToastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 4200);
}

function escapeKiwi(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}
