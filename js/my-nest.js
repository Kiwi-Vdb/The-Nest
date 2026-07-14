const MY_NEST_TOKEN_KEY = "the-nest-shop-token";
const MY_NEST_REFRESH_MS = 60_000;
const MY_NEST_CONFIG_FALLBACK = { enabled: false, apiBase: "" };

const MY_NEST_COLLECTION_PAGE_SIZE = 12;

const myNestState = {
  config: MY_NEST_CONFIG_FALLBACK,
  profile: null,
  activeCollection: "cosmetics",
  collectionPages: {
    cosmetics: 1,
    textEffects: 1,
  },
};

let myNestRefreshTimer = null;
let myNestToastTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
  bindMyNestUi();
  myNestState.config = await loadJson("./data/shop-config.json", MY_NEST_CONFIG_FALLBACK);
  await exchangeMyNestAuthCode();
  await loadMyNest({ quiet: false });
  await renderNestSync();
  myNestRefreshTimer = window.setInterval(() => loadMyNest({ quiet: true }), MY_NEST_REFRESH_MS);
});

window.addEventListener("beforeunload", () => window.clearInterval(myNestRefreshTimer));

function myNestConfigured() {
  const base = String(myNestState.config?.apiBase || "").trim();
  return Boolean(myNestState.config?.enabled && base.startsWith("https://") && !base.includes("YOUR-WORKER"));
}

function myNestApiUrl(path) {
  return `${String(myNestState.config.apiBase || "").replace(/\/$/, "")}/${String(path).replace(/^\//, "")}`;
}

async function myNestApi(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  const token = localStorage.getItem(MY_NEST_TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(myNestApiUrl(path), { ...options, headers, cache: "no-store" });
  let data;
  try { data = await response.json(); }
  catch { data = { ok: false, error: "BAD_RESPONSE", message: "The Nest returned an unreadable response." }; }

  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || myNestFriendlyError(data.error));
    error.code = data.error || `HTTP_${response.status}`;
    throw error;
  }
  return data;
}

async function exchangeMyNestAuthCode() {
  const url = new URL(location.href);
  const code = url.searchParams.get("shop_auth");
  if (!code || !myNestConfigured()) return;

  try {
    const result = await myNestApi("/api/auth/exchange", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    localStorage.setItem(MY_NEST_TOKEN_KEY, result.token);
    myNestToast("Welcome home.");
  } catch (error) {
    myNestToast(error.message || "Twitch sign-in could not be completed.", true);
  } finally {
    url.searchParams.delete("shop_auth");
    history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }
}

async function loadMyNest({ quiet = false } = {}) {
  showMyNestLoading(!quiet);
  clearMyNestError();

  if (!myNestConfigured()) {
    myNestState.profile = null;
    renderSignedOut("My Nest needs the hosted service configuration used by the Shop.");
    return;
  }

  const token = localStorage.getItem(MY_NEST_TOKEN_KEY);
  if (!token) {
    myNestState.profile = null;
    renderSignedOut();
    return;
  }

  try {
    const data = await myNestApi("/api/my-nest");
    myNestState.profile = data;
    renderMyNest(data);
  } catch (error) {
    if (["AUTH_REQUIRED", "SESSION_INVALID"].includes(error.code)) {
      localStorage.removeItem(MY_NEST_TOKEN_KEY);
      myNestState.profile = null;
      renderSignedOut("Your session expired. Please sign in again.");
      return;
    }
    showMyNestLoading(false);
    renderMyNestError(error.message || "Your Nest could not be loaded.");
    if (!quiet) myNestToast(error.message || "Your Nest could not be loaded.", true);
  }
}

function bindMyNestUi() {
  document.querySelector("#my-nest-login")?.addEventListener("click", beginMyNestLogin);
  document.querySelector("#my-nest-logout")?.addEventListener("click", logoutMyNest);
  document.querySelectorAll("[data-collection-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      myNestState.activeCollection = button.dataset.collectionTab || "cosmetics";
      document.querySelectorAll("[data-collection-tab]").forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle("is-active", active);
        candidate.setAttribute("aria-selected", String(active));
      });
      renderCollection(myNestState.profile);
    });
  });

  document.querySelectorAll("[data-collection-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = myNestState.activeCollection;
      const direction = button.dataset.collectionPage;
      const currentPage = Number(myNestState.collectionPages[key] || 1);
      myNestState.collectionPages[key] = direction === "previous"
        ? Math.max(1, currentPage - 1)
        : currentPage + 1;
      renderCollection(myNestState.profile);
    });
  });
}

function beginMyNestLogin() {
  if (!myNestConfigured()) {
    myNestToast("The hosted Nest service is not configured yet.", true);
    return;
  }
  const returnTo = location.href.split("?")[0].split("#")[0];
  location.href = `${myNestApiUrl("/auth/twitch")}?return_to=${encodeURIComponent(returnTo)}`;
}

async function logoutMyNest() {
  try { await myNestApi("/api/logout", { method: "POST", body: "{}" }); }
  catch { /* The local token is cleared even when the remote session already expired. */ }
  localStorage.removeItem(MY_NEST_TOKEN_KEY);
  myNestState.profile = null;
  renderSignedOut();
  myNestToast("Signed out of My Nest.");
}

function showMyNestLoading(show) {
  const loading = document.querySelector("#my-nest-loading");
  if (loading) loading.hidden = !show;
}

function renderSignedOut(message = "") {
  showMyNestLoading(false);
  const signedOut = document.querySelector("#my-nest-signed-out");
  const content = document.querySelector("#my-nest-profile-content");
  if (signedOut) signedOut.hidden = false;
  if (content) content.hidden = true;
  if (message) renderMyNestError(message);
  renderStats(null);
  renderCollection(null);
  renderActivity(null);
}

function renderMyNest(data) {
  showMyNestLoading(false);
  const signedOut = document.querySelector("#my-nest-signed-out");
  const content = document.querySelector("#my-nest-profile-content");
  if (signedOut) signedOut.hidden = true;
  if (content) content.hidden = false;

  const user = data.user || {};
  setText("#my-nest-display-name", user.displayName || user.login || "Viewer");
  setText("#my-nest-balance", `${formatNumber(user.balance)} ✦`);
  setText("#my-nest-rank", user.rank ? `#${formatNumber(user.rank)}` : "Unranked");
  setText("#my-nest-unlock-total", formatNumber(data.summary?.totalUnlocks || 0));
  setText("#my-nest-member-since", memberSinceText(data.profile?.memberSince, user.createdAt));
  setText("#my-nest-updated", data.profile?.updatedAt ? `Synced ${relativeTimestamp(data.profile.updatedAt)}` : "Waiting for Kiwi Birb");

  const avatar = document.querySelector("#my-nest-avatar");
  if (avatar) {
    avatar.src = user.avatarUrl || avatarFallback(user.displayName || user.login || "Viewer");
    avatar.alt = `${user.displayName || user.login || "Viewer"}'s Twitch avatar`;
    avatar.onerror = () => { avatar.src = avatarFallback(user.displayName || user.login || "Viewer"); };
  }

  renderStats(data);
  renderCollection(data);
  renderActivity(data);
}

function renderStats(data) {
  const grid = document.querySelector("#my-nest-stat-grid");
  if (!grid) return;
  if (!data) {
    grid.innerHTML = `<div class="stats-empty">Sign in to reveal your stats.</div>`;
    return;
  }

  const stats = data.profile?.stats || {};
  const cards = [
    ["◇", stats.lootBoxesOpened, "Loot boxes"],
    ["♢", stats.gambaPlays, "Gamba plays"],
    ["✦", stats.gambaWins, "Gamba wins"],
    ["☄", stats.biggestGambaWin, "Biggest win", true],
    ["◆", stats.jackpots, "Jackpots"],
    ["✓", stats.predictionWins, "Prediction wins"],
    ["◎", stats.predictionPicks, "Prediction picks"],
    ["↗", stats.shiniesGifted, "Shinies gifted", true],
  ];

  grid.innerHTML = cards.map(([icon, value, label, shinies]) => `
    <article class="stat-card">
      <div class="stat-icon">${escapeHtml(icon)}</div>
      <strong class="stat-value">${formatNumber(value || 0)}${shinies ? " ✦" : ""}</strong>
      <span class="stat-label">${escapeHtml(label)}</span>
    </article>
  `).join("");
}

function renderCollection(data) {
  const grid = document.querySelector("#my-nest-collection-grid");
  const summary = document.querySelector("#my-nest-collection-summary");
  const summaryText = document.querySelector("#my-nest-collection-summary-text");
  const pageLabel = document.querySelector("#my-nest-collection-page-label");
  const previousButton = document.querySelector('[data-collection-page="previous"]');
  const nextButton = document.querySelector('[data-collection-page="next"]');
  if (!grid || !summary) return;

  const setPagination = (page, totalPages, enabled = true) => {
    const safeTotal = Math.max(1, Number(totalPages) || 1);
    const safePage = Math.min(safeTotal, Math.max(1, Number(page) || 1));
    if (pageLabel) pageLabel.textContent = `Page ${safePage} of ${safeTotal}`;
    if (previousButton) previousButton.disabled = !enabled || safePage <= 1;
    if (nextButton) nextButton.disabled = !enabled || safePage >= safeTotal;
    summary.classList.toggle("has-pages", enabled && safeTotal > 1);
  };

  if (!data) {
    if (summaryText) summaryText.textContent = "Your unlocked rewards will appear here.";
    else summary.textContent = "Your unlocked rewards will appear here.";
    setPagination(1, 1, false);
    grid.innerHTML = `<div class="collection-empty"><strong>Your collection is private</strong><span>Sign in to view it.</span></div>`;
    return;
  }

  const key = myNestState.activeCollection;
  const collection = Array.isArray(data.collections?.[key]) ? data.collections[key] : [];
  const equipped = String(data.profile?.equippedTextEffect || "");
  const label = key === "cosmetics" ? "cosmetics" : "text effects";
  const totalPages = Math.max(1, Math.ceil(collection.length / MY_NEST_COLLECTION_PAGE_SIZE));
  const requestedPage = Number(myNestState.collectionPages[key] || 1);
  const currentPage = Math.min(totalPages, Math.max(1, requestedPage));
  myNestState.collectionPages[key] = currentPage;

  if (summaryText) summaryText.textContent = `${formatNumber(collection.length)} ${label} unlocked`;
  else summary.textContent = `${formatNumber(collection.length)} ${label} unlocked`;
  setPagination(currentPage, totalPages, collection.length > 0);

  if (!collection.length) {
    grid.innerHTML = `<div class="collection-empty"><strong>No ${escapeHtml(label)} yet</strong><span>Open Loot Chests or visit The Nest Shop to grow your collection.</span></div>`;
    return;
  }

  const pageStart = (currentPage - 1) * MY_NEST_COLLECTION_PAGE_SIZE;
  const visibleItems = collection.slice(pageStart, pageStart + MY_NEST_COLLECTION_PAGE_SIZE);

  grid.scrollTop = 0;
  grid.innerHTML = visibleItems.map((item) => {
    const isEquipped = key === "textEffects" && equipped && equipped === item.rewardId;
    const visual = item.image
      ? `<img class="collection-image" src="${escapeAttr(item.image)}" alt="${escapeAttr(item.name)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'collection-icon',textContent:'${escapeJs(item.icon || "✦")}'}))">`
      : `<div class="collection-icon" aria-hidden="true">${escapeHtml(item.icon || "✦")}</div>`;
    return `
      <article class="collection-card" data-rarity="${escapeAttr(String(item.rarity || "common").toLowerCase())}" title="${escapeAttr(item.description || item.name)}">
        ${isEquipped ? `<span class="collection-equipped">Equipped</span>` : ""}
        ${visual}
        <div class="collection-name">${escapeHtml(item.name || item.rewardId)}</div>
        <div class="collection-meta">${escapeHtml(item.rarity || "common")} · ${escapeHtml(item.category || item.type || "Reward")}</div>
      </article>
    `;
  }).join("");
}

function renderActivity(data) {
  const list = document.querySelector("#my-nest-activity-list");
  if (!list) return;
  if (!data) {
    list.innerHTML = `<div class="activity-empty"><strong>Your activity is private</strong><span>Sign in to view it.</span></div>`;
    return;
  }

  const activities = Array.isArray(data.recentActivity) ? data.recentActivity.slice(0, 12) : [];
  if (!activities.length) {
    list.innerHTML = `<div class="activity-empty"><strong>No recent activity yet</strong><span>Your wins, unlocks, gifts and purchases will appear here.</span></div>`;
    return;
  }

  list.innerHTML = activities.map((activity) => `
    <article class="personal-activity-row">
      <div class="personal-activity-icon">${escapeHtml(activity.icon || activityIcon(activity.type))}</div>
      <div class="personal-activity-copy">
        <div class="personal-activity-text">${escapeHtml(activity.text || "Nest activity")}</div>
        <div class="personal-activity-time">${relativeTimestamp(activity.timestamp)}</div>
      </div>
    </article>
  `).join("");
}

async function renderNestSync() {
  const sync = await loadJson("./data/nest-sync.json", { connected: true, lastUpdated: "just now" });
  const status = document.querySelector("#nest-sync-status");
  const updated = document.querySelector("#nest-sync-updated");
  if (status) {
    status.textContent = sync.connected === false ? "Disconnected" : "Connected";
    status.classList.toggle("is-disconnected", sync.connected === false);
    status.classList.toggle("is-connected", sync.connected !== false);
  }
  if (updated) updated.textContent = `Last updated ${sync.lastUpdated || "just now"}`;
}

function renderMyNestError(message) {
  const error = document.querySelector("#my-nest-error");
  if (!error) return;
  error.textContent = message;
  error.hidden = !message;
}

function clearMyNestError() { renderMyNestError(""); }

function memberSinceText(profileTimestamp, accountTimestamp) {
  const value = Number(profileTimestamp || accountTimestamp || 0);
  if (!value) return "Nest member since your first Kiwi Birb record";
  const date = new Date(value < 10_000_000_000 ? value * 1000 : value);
  if (Number.isNaN(date.getTime())) return "Nest member since your first Kiwi Birb record";
  return `Nest member since ${date.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`;
}

function activityIcon(type) {
  return ({
    unlock: "◇", gamba: "♢", jackpot: "◆", prediction: "✓",
    gift: "↗", purchase: "✦", balance: "◎", loot: "◇"
  })[String(type || "").toLowerCase()] || "✦";
}

function relativeTimestamp(value) {
  const numeric = Number(value || 0);
  const date = numeric ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric) : null;
  if (!date || Number.isNaN(date.getTime())) return "Recently";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 45) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

function formatNumber(value) { return Number(value || 0).toLocaleString(); }
function setText(selector, value) { const node = document.querySelector(selector); if (node) node.textContent = value; }

function avatarFallback(name) {
  const initial = String(name || "N").trim().charAt(0).toUpperCase() || "N";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#6d38ad"/><stop offset="1" stop-color="#171019"/></linearGradient></defs><rect width="160" height="160" rx="80" fill="url(#g)"/><text x="80" y="103" text-anchor="middle" font-family="Georgia,serif" font-size="78" fill="#f0dfbf">${initial}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function myNestToast(message, isError = false) {
  const toast = document.querySelector("#my-nest-toast");
  if (!toast) return;
  window.clearTimeout(myNestToastTimer);
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  myNestToastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 4200);
}

function myNestFriendlyError(code) {
  return ({
    AUTH_REQUIRED: "Please sign in with Twitch.",
    SESSION_INVALID: "Your session expired. Please sign in again.",
    PROFILE_NOT_READY: "Kiwi Birb has not synced this profile yet.",
    MY_NEST_NOT_READY: "The My Nest database upgrade has not been applied yet."
  })[code] || "Your Nest could not be loaded.";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}
function escapeAttr(value) { return escapeHtml(value); }
function escapeJs(value) { return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\r?\n/g, " "); }
