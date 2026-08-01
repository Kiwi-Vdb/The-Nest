const REDEEMS_TOKEN_KEY = "the-nest-shop-token";
const REDEEMS_REFRESH_MS = 10_000;

const redeemState = {
  config: { enabled: false, apiBase: "" },
  redeems: [],
  user: null,
  botOnline: false,
  selected: null,
  busy: false,
};

let refreshTimer = null;
let countdownTimer = null;
let toastTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
  bindRedeemUi();
  redeemState.config = await loadJson("./data/shop-config.json", redeemState.config);
  await exchangeReturnedAuthCode();
  await loadRedeems(false);
  refreshTimer = window.setInterval(() => loadRedeems(true), REDEEMS_REFRESH_MS);
  countdownTimer = window.setInterval(renderRedeemCards, 1000);
});

window.addEventListener("beforeunload", () => {
  window.clearInterval(refreshTimer);
  window.clearInterval(countdownTimer);
});

function configured() {
  const base = String(redeemState.config?.apiBase || "").trim();
  return Boolean(redeemState.config?.enabled && base.startsWith("https://") && !base.includes("YOUR-WORKER"));
}

function apiUrl(path) {
  return `${String(redeemState.config.apiBase || "").replace(/\/$/, "")}/${String(path).replace(/^\//, "")}`;
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  const token = localStorage.getItem(REDEEMS_TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(apiUrl(path), { ...options, headers, cache: "no-store" });
  let data;
  try { data = await response.json(); }
  catch { data = { ok: false, error: "BAD_RESPONSE", message: "The redeem service returned an unreadable response." }; }
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || "The redeem request failed.");
    error.code = data.error || `HTTP_${response.status}`;
    error.data = data;
    throw error;
  }
  return data;
}

async function exchangeReturnedAuthCode() {
  const url = new URL(location.href);
  const code = url.searchParams.get("shop_auth");
  if (!code || !configured()) return;
  try {
    const result = await apiRequest("/api/auth/exchange", { method: "POST", body: JSON.stringify({ code }) });
    localStorage.setItem(REDEEMS_TOKEN_KEY, result.token);
    toast("Signed in with Twitch.");
  } catch (error) {
    toast(error.message || "Twitch sign-in could not be completed.", true);
  } finally {
    url.searchParams.delete("shop_auth");
    history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }
}

async function loadRedeems(quiet = false) {
  if (!configured()) {
    redeemState.redeems = [];
    redeemState.botOnline = false;
    renderRedeems();
    setService("Redeems need the hosted Nest service configuration.", false);
    return;
  }

  try {
    const data = await apiRequest("/api/redeems");
    redeemState.redeems = (data.redeems || []).map((item) => ({
      ...item,
      cooldownUntil: Date.now() / 1000 + Number(item.cooldownRemaining || 0),
    }));
    redeemState.botOnline = Boolean(data.botOnline);
    setService(
      redeemState.botOnline ? "Kiwi Birb is online · redeems are ready" : "Kiwi Birb is offline · buttons will reopen with the bot",
      redeemState.botOnline,
    );
  } catch (error) {
    redeemState.botOnline = false;
    setService("Redeem service unavailable. Apply the Redeems Foundation worker update.", false);
    if (!quiet) toast(error.message || "Could not load stream redeems.", true);
  }

  const token = localStorage.getItem(REDEEMS_TOKEN_KEY);
  if (token) {
    try {
      const result = await apiRequest("/api/me");
      redeemState.user = result.user;
    } catch (error) {
      if (["AUTH_REQUIRED", "SESSION_INVALID"].includes(error.code)) localStorage.removeItem(REDEEMS_TOKEN_KEY);
      redeemState.user = null;
    }
  } else {
    redeemState.user = null;
  }
  renderRedeems();
}

function renderRedeems() {
  renderAccount();
  renderRedeemCards();
}

function renderAccount() {
  const balance = document.querySelector("#redeems-balance");
  const actions = document.querySelector("#redeems-account-actions");
  if (!balance || !actions) return;
  if (redeemState.user) {
    balance.textContent = `${Number(redeemState.user.balance || 0).toLocaleString()} ✦`;
    actions.innerHTML = `<button type="button" data-redeems-logout>Sign out ${escapeHtml(redeemState.user.displayName || redeemState.user.login)}</button>`;
    actions.querySelector("[data-redeems-logout]")?.addEventListener("click", logout);
  } else {
    balance.textContent = "—";
    actions.innerHTML = configured() ? `<button type="button" data-redeems-login>Sign in with Twitch</button>` : "";
    actions.querySelector("[data-redeems-login]")?.addEventListener("click", beginLogin);
  }
}

function cooldownRemaining(item) {
  return Math.max(0, Math.ceil(Number(item.cooldownUntil || 0) - Date.now() / 1000));
}

function availability(item) {
  if (!redeemState.botOnline) return { label: "Redeems offline", disabled: true };
  const remaining = cooldownRemaining(item);
  if (remaining > 0) return { label: `Cooldown ${remaining}s`, disabled: true };
  if (!redeemState.user) return { label: "Sign in to redeem", disabled: false, login: true };
  const shortfall = Math.max(0, Number(item.price || 0) - Number(redeemState.user.balance || 0));
  if (shortfall > 0) return { label: `Need ${shortfall.toLocaleString()} more`, disabled: true };
  return { label: `Redeem for ${Number(item.price || 0).toLocaleString()} ✦`, disabled: false };
}

function renderRedeemCards() {
  const grid = document.querySelector("#redeems-grid");
  if (!grid) return;
  if (!redeemState.redeems.length) {
    grid.innerHTML = `<div class="redeems-empty">No stream redeems are available yet.</div>`;
    return;
  }
  const focusId = new URL(location.href).searchParams.get("redeem");
  grid.innerHTML = redeemState.redeems.map((item) => {
    const state = availability(item);
    return `
      <article class="redeem-card ${focusId === item.id ? "is-focused" : ""}" data-redeem-card="${escapeAttr(item.id)}">
        <div class="redeem-card-icon" aria-hidden="true">▶</div>
        <h3>${escapeHtml(item.name)}</h3>
        <p class="redeem-card-description">${escapeHtml(item.description || "Play this effect live on stream.")}</p>
        <div class="redeem-card-meta">
          <span class="redeem-command">${escapeHtml(item.command)}</span>
          <span>${Number(item.cooldownSeconds || 0)}s cooldown</span>
        </div>
        <button type="button" class="redeem-button" data-redeem-id="${escapeAttr(item.id)}" ${state.disabled ? "disabled" : ""}>${escapeHtml(state.label)}</button>
      </article>`;
  }).join("");
  grid.querySelectorAll("[data-redeem-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = redeemState.redeems.find((candidate) => candidate.id === button.dataset.redeemId);
      if (!redeemState.user) beginLogin();
      else if (item) openModal(item);
    });
  });
}

function bindRedeemUi() {
  document.querySelectorAll("[data-redeem-close]").forEach((button) => button.addEventListener("click", closeModal));
  document.querySelector("#redeem-confirm")?.addEventListener("click", confirmRedeem);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });
}

function openModal(item) {
  if (availability(item).disabled) return;
  redeemState.selected = item;
  const balance = Number(redeemState.user?.balance || 0);
  setText("#redeem-modal-title", item.name);
  setText("#redeem-modal-description", item.description || "Play this effect live on stream.");
  setText("#redeem-modal-balance", `${balance.toLocaleString()} ✦`);
  setText("#redeem-modal-price", `${Number(item.price || 0).toLocaleString()} ✦`);
  setText("#redeem-modal-after", `${(balance - Number(item.price || 0)).toLocaleString()} ✦`);
  setText("#redeem-modal-error", "");
  const modal = document.querySelector("#redeem-modal");
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  document.querySelector("#redeem-confirm")?.focus();
}

function closeModal() {
  if (redeemState.busy) return;
  const modal = document.querySelector("#redeem-modal");
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  redeemState.selected = null;
}

async function confirmRedeem() {
  const item = redeemState.selected;
  if (!item || redeemState.busy) return;
  const button = document.querySelector("#redeem-confirm");
  redeemState.busy = true;
  button.disabled = true;
  button.textContent = "Sending to Kiwi Birb…";
  setText("#redeem-modal-error", "");
  try {
    const result = await apiRequest("/api/redeem", {
      method: "POST",
      body: JSON.stringify({
        redeemId: item.id,
        idempotencyKey: `website-redeem:${redeemState.user.twitchUserId}:${item.id}:${crypto.randomUUID()}`,
      }),
    });
    redeemState.user.balance = Number(result.balance || 0);
    item.cooldownUntil = Date.now() / 1000 + Number(item.cooldownSeconds || 0);
    redeemState.busy = false;
    closeModal();
    renderRedeems();
    toast(`${item.name} was sent to Kiwi Birb!`);
  } catch (error) {
    if (["AUTH_REQUIRED", "SESSION_INVALID"].includes(error.code)) {
      localStorage.removeItem(REDEEMS_TOKEN_KEY);
      redeemState.user = null;
      redeemState.busy = false;
      closeModal();
      renderRedeems();
      toast("Your Twitch session expired. Please sign in again.", true);
    } else {
      if (error.code === "REDEEM_COOLDOWN") {
        item.cooldownUntil = Date.now() / 1000 + Number(error.data?.remaining || 1);
        renderRedeemCards();
      }
      setText("#redeem-modal-error", error.message || "The redeem could not be completed.");
    }
  } finally {
    redeemState.busy = false;
    button.disabled = false;
    button.textContent = "Play on stream";
  }
}

function beginLogin() {
  if (!configured()) return;
  const returnTo = `${location.origin}${location.pathname}${location.search}`;
  location.href = `${apiUrl("/auth/twitch")}?return_to=${encodeURIComponent(returnTo)}`;
}

async function logout() {
  try { await apiRequest("/api/logout", { method: "POST", body: "{}" }); }
  catch { /* Local sign-out still succeeds. */ }
  localStorage.removeItem(REDEEMS_TOKEN_KEY);
  redeemState.user = null;
  renderRedeems();
  toast("Signed out.");
}

function setService(message, online) {
  const element = document.querySelector("#redeems-service");
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("is-online", online);
  element.classList.toggle("is-offline", !online);
}

function toast(message, isError = false) {
  const element = document.querySelector("#redeems-toast");
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("is-error", isError);
  element.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("is-visible"), 4800);
}

async function loadJson(path, fallback) {
  try {
    const response = await fetch(`${path}?cache=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error();
    return await response.json();
  } catch { return fallback; }
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

function escapeAttr(value) { return escapeHtml(value); }
