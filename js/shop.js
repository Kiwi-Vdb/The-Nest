const SHOP_TOKEN_KEY = "the-nest-shop-token";
const SHOP_REFRESH_MS = 60_000;
const SHOP_CONFIG_FALLBACK = {
  enabled: false,
  apiBase: "",
  shopTitle: "The Nest Shop"
};

const shopState = {
  config: SHOP_CONFIG_FALLBACK,
  catalog: { products: [], featured: [], dailySpecial: null, topSellers: [] },
  user: null,
  selectedProduct: null,
  busy: false,
  service: "loading",
  lastLoadedAt: null,
};

let toastTimer = null;
let refreshTimer = null;
let dailyTimerInterval = null;

document.addEventListener("DOMContentLoaded", async () => {
  bindShopUi();
  shopState.config = await loadJson("./data/shop-config.json", SHOP_CONFIG_FALLBACK);
  await exchangeReturnedAuthCode();
  await loadShopData({ quiet: false });

  const sync = await loadJson("./data/nest-sync.json", {
    connected: true,
    lastUpdated: "just now"
  });
  renderSync(sync);

  refreshTimer = window.setInterval(() => loadShopData({ quiet: true }), SHOP_REFRESH_MS);
  dailyTimerInterval = window.setInterval(() => renderDaily(shopState.catalog.dailySpecial), 30_000);
});

window.addEventListener("beforeunload", () => {
  window.clearInterval(refreshTimer);
  window.clearInterval(dailyTimerInterval);
});

function shopConfigured() {
  const base = String(shopState.config?.apiBase || "").trim();
  return Boolean(
    shopState.config?.enabled
    && base.startsWith("https://")
    && !base.includes("YOUR-WORKER")
  );
}

function apiUrl(path) {
  return `${String(shopState.config.apiBase || "").replace(/\/$/, "")}/${String(path).replace(/^\//, "")}`;
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  const token = localStorage.getItem(SHOP_TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(apiUrl(path), {
    ...options,
    headers,
    cache: "no-store",
  });

  let data;
  try {
    data = await response.json();
  } catch {
    data = { ok: false, error: "BAD_RESPONSE", message: "The shop returned an unreadable response." };
  }

  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || friendlyShopError(data.error) || "Shop request failed.");
    error.code = data.error || `HTTP_${response.status}`;
    error.status = response.status;
    throw error;
  }
  return data;
}

async function exchangeReturnedAuthCode() {
  const url = new URL(location.href);
  const code = url.searchParams.get("shop_auth");
  if (!code || !shopConfigured()) return;

  try {
    const result = await apiRequest("/api/auth/exchange", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    localStorage.setItem(SHOP_TOKEN_KEY, result.token);
    showToast("Signed in with Twitch.");
  } catch (error) {
    showToast(error.message || "Twitch sign-in could not be completed.", true);
  } finally {
    url.searchParams.delete("shop_auth");
    history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }
}

async function loadShopData({ quiet = false } = {}) {
  if (!shopConfigured()) {
    const fallback = await loadJson("./data/shop.json", {
      shinies: 0,
      items: [],
      dailySpecial: null,
      topSellers: []
    });
    shopState.catalog = normaliseFallbackCatalog(fallback);
    shopState.user = null;
    shopState.service = "preview";
    shopState.lastLoadedAt = new Date();
    renderShop();
    return;
  }

  let catalogLoaded = false;
  try {
    const catalog = await apiRequest("/api/catalog");
    shopState.catalog = catalog;
    shopState.service = "online";
    shopState.lastLoadedAt = new Date();
    catalogLoaded = true;
  } catch (error) {
    shopState.service = "error";
    if (!shopState.catalog.products?.length) {
      const fallback = await loadJson("./data/shop.json", { items: [], dailySpecial: null, topSellers: [] });
      shopState.catalog = normaliseFallbackCatalog(fallback);
    }
    if (!quiet) showToast(error.message || "The shop catalogue is unavailable.", true);
  }

  const token = localStorage.getItem(SHOP_TOKEN_KEY);
  if (token) {
    try {
      const result = await apiRequest("/api/me");
      shopState.user = result.user;
    } catch (error) {
      if (["SESSION_INVALID", "AUTH_REQUIRED"].includes(error.code)) {
        localStorage.removeItem(SHOP_TOKEN_KEY);
        if (!quiet) showToast("Your shop session expired. Please sign in again.", true);
      }
      shopState.user = null;
    }
  } else {
    shopState.user = null;
  }

  if (catalogLoaded || !quiet) renderShop();
  else renderAccount();
}

function normaliseFallbackCatalog(data) {
  const featured = (data.items || []).map((item, index) => ({
    id: item.id || slugify(item.name),
    name: item.name || "Shop Item",
    description: item.description || "Live purchasing becomes available after the hosted shop service is connected.",
    type: item.type || "Item",
    rarity: String(item.rarity || "common").toLowerCase(),
    price: Number(item.price || 0),
    oldPrice: item.oldPrice ? Number(item.oldPrice) : null,
    icon: item.icon || "✦",
    image: item.image || "",
    rewardId: item.rewardId || "",
    featuredOrder: index + 1,
    repeatable: Boolean(item.repeatable),
    stock: item.stock ?? null,
    sold: Number(item.sold || 0),
  }));
  const daily = data.dailySpecial ? {
    id: data.dailySpecial.id || slugify(data.dailySpecial.name),
    ...data.dailySpecial,
    rarity: String(data.dailySpecial.rarity || "rare").toLowerCase(),
    price: Number(data.dailySpecial.price || 0),
    oldPrice: data.dailySpecial.oldPrice ? Number(data.dailySpecial.oldPrice) : null,
    icon: data.dailySpecial.icon || "✦",
    repeatable: Boolean(data.dailySpecial.repeatable),
    stock: data.dailySpecial.stock ?? null,
  } : null;
  return {
    products: [...featured, ...(daily ? [daily] : [])],
    featured,
    dailySpecial: daily,
    topSellers: data.topSellers || featured.slice(0, 3).map((item) => ({ ...item, sold: 0 })),
    offlinePreview: true,
  };
}

function renderShop() {
  renderAccount();
  renderItems(shopState.catalog.featured || []);
  renderDaily(shopState.catalog.dailySpecial);
  renderSellers(shopState.catalog.topSellers || []);
}

function renderAccount() {
  const value = document.querySelector("#shop-shinies");
  const account = document.querySelector("#shop-account");
  const service = document.querySelector("#shop-service-status");
  if (!value || !account || !service) return;

  service.classList.remove("is-online", "is-error");
  if (shopState.service === "online") {
    service.classList.add("is-online");
    service.textContent = shopState.lastLoadedAt
      ? `Shop online · refreshed ${relativeTime(shopState.lastLoadedAt)}`
      : "Shop online";
  } else if (shopState.service === "error") {
    service.classList.add("is-error");
    service.textContent = "Shop connection unavailable";
  } else {
    service.textContent = "Preview mode · online setup required";
  }

  if (shopState.user) {
    value.textContent = Number(shopState.user.balance || 0).toLocaleString();
    account.innerHTML = `
      <span class="shop-account-name" title="${escapeAttr(shopState.user.displayName || shopState.user.login)}">${escapeHtml(shopState.user.displayName || shopState.user.login)}</span>
      <button type="button" data-shop-logout>Sign out</button>
    `;
    account.querySelector("[data-shop-logout]")?.addEventListener("click", logoutShop);
    return;
  }

  value.textContent = "—";
  if (shopConfigured()) {
    account.innerHTML = `<button type="button" data-shop-login>Sign in with Twitch</button>`;
    account.querySelector("[data-shop-login]")?.addEventListener("click", beginTwitchLogin);
  } else {
    account.innerHTML = `<span>Sign-in becomes available after deployment</span>`;
  }
}

function renderItems(items) {
  const slots = Array.from(document.querySelectorAll("[data-featured-slot]"))
    .sort((a, b) => Number(a.dataset.featuredSlot || 0) - Number(b.dataset.featuredSlot || 0));
  if (!slots.length) return;

  const cards = [...items.slice(0, slots.length)];
  while (cards.length < slots.length) cards.push(null);

  slots.forEach((slot, index) => {
    const item = cards[index];
    slot.innerHTML = item ? productCardHtml(item) : `
      <article class="shop-card"><div class="shop-card-empty">New item<br>coming soon</div></article>
    `;
    slot.querySelector("[data-buy-product]")?.addEventListener("click", (event) => {
      openPurchase(event.currentTarget.dataset.buyProduct);
    });
  });
}

function productCardHtml(item) {
  const availability = productAvailability(item);
  const rarity = String(item.rarity || "common").toLowerCase();
  const visual = item.image
    ? `<img class="shop-card-image" src="${escapeAttr(item.image)}" alt="${escapeAttr(item.name)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'shop-card-icon',textContent:'${escapeJs(item.icon || "✦")}'}))">`
    : `<div class="shop-card-icon" aria-hidden="true">${escapeHtml(item.icon || "✦")}</div>`;
  const classNames = ["shop-card"];
  if (availability.code === "owned") classNames.push("is-owned");
  if (availability.code === "soldout") classNames.push("is-sold-out");
  return `
    <article class="${classNames.join(" ")}" data-rarity="${escapeAttr(rarity)}">
      ${visual}
      <div class="shop-card-details">
        <div class="shop-card-name" title="${escapeAttr(item.name)}">${escapeHtml(item.name)}</div>
        <div class="shop-card-meta">
          <span>${escapeHtml(item.type || "Item")}</span>
          <span class="shop-card-rarity">${escapeHtml(rarity)}</span>
        </div>
      </div>
      <div class="shop-card-price-row">
        <div class="shop-card-price">${Number(item.price || 0).toLocaleString()} ✦</div>
        ${item.oldPrice ? `<div class="shop-card-old-price">${Number(item.oldPrice).toLocaleString()}</div>` : ""}
      </div>
      <button type="button" class="shop-card-buy" data-buy-product="${escapeAttr(item.id)}" ${availability.disabled ? "disabled" : ""}>${escapeHtml(availability.label)}</button>
    </article>
  `;
}

function renderDaily(item) {
  const panel = document.querySelector("#shop-daily-special");
  if (!panel) return;
  if (!item) {
    panel.innerHTML = `<div class="daily-special-rarity">No special available today.</div>`;
    return;
  }
  const availability = productAvailability(item);
  const rarity = String(item.rarity || "special").toLowerCase();
  panel.innerHTML = `
    <div class="daily-special-timer">${escapeHtml(dailyTimer(item))}</div>
    <div class="daily-special-name" title="${escapeAttr(item.name)}">${escapeHtml(item.name)}</div>
    <div class="daily-special-meta">${escapeHtml(item.type || "Item")} · ${escapeHtml(rarity)}</div>
    <div class="daily-special-price">
      ${Number(item.price || 0).toLocaleString()} ✦
      ${item.oldPrice ? `<span class="daily-special-old">${Number(item.oldPrice).toLocaleString()}</span>` : ""}
    </div>
    <button type="button" class="daily-special-buy" data-buy-product="${escapeAttr(item.id)}" ${availability.disabled ? "disabled" : ""}>${escapeHtml(availability.label === "Buy" ? "Buy special" : availability.label)}</button>
  `;
  panel.querySelector("[data-buy-product]")?.addEventListener("click", () => openPurchase(item.id));
}

function renderSellers(items) {
  const list = document.querySelector("#shop-top-sellers");
  if (!list) return;
  const sellers = items.length ? items.slice(0, 3) : (shopState.catalog.featured || []).slice(0, 3).map((item) => ({ ...item, sold: 0 }));
  if (!sellers.length) {
    list.innerHTML = `<div class="daily-special-rarity">Waiting for the first purchase.</div>`;
    return;
  }
  list.innerHTML = sellers.map((item, index) => `
    <div class="seller-row">
      <span class="seller-rank">${index + 1}.</span>
      <span class="seller-name" title="${escapeAttr(item.name)}">${escapeHtml(item.name)}</span>
      <span class="seller-price">${Number(item.price || 0).toLocaleString()} ✦</span>
      <span class="seller-sold">${Number(item.sold || 0).toLocaleString()} ${Number(item.sold || 0) === 1 ? "purchase" : "purchases"}</span>
    </div>
  `).join("");
}

function renderSync(sync) {
  const status = document.querySelector("#nest-sync-status");
  const updated = document.querySelector("#nest-sync-updated");
  if (!status || !updated) return;
  const connected = sync.connected !== false;
  status.textContent = connected ? "Connected" : "Disconnected";
  status.classList.toggle("is-disconnected", !connected);
  updated.textContent = `Last updated ${sync.lastUpdated ?? "just now"}`;
}

function bindShopUi() {
  document.querySelectorAll("[data-shop-close]").forEach((element) => {
    element.addEventListener("click", closePurchase);
  });
  document.querySelector("#shop-confirm-buy")?.addEventListener("click", confirmPurchase);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePurchase();
  });
}

function beginTwitchLogin() {
  if (!shopConfigured()) {
    showToast("The hosted shop is not configured yet.", true);
    return;
  }
  const returnUrl = `${location.origin}${location.pathname}`;
  location.href = `${apiUrl("/auth/twitch")}?return_to=${encodeURIComponent(returnUrl)}`;
}

async function logoutShop() {
  try {
    if (shopConfigured()) await apiRequest("/api/logout", { method: "POST", body: "{}" });
  } catch {
    // Local logout still succeeds if the API is temporarily unavailable.
  }
  localStorage.removeItem(SHOP_TOKEN_KEY);
  shopState.user = null;
  renderShop();
  showToast("Signed out.");
}

function findProduct(productId) {
  return (shopState.catalog.products || []).find((item) => item.id === productId)
    || (shopState.catalog.featured || []).find((item) => item.id === productId)
    || (shopState.catalog.dailySpecial?.id === productId ? shopState.catalog.dailySpecial : null);
}

function productAvailability(item) {
  if (!item) return { code: "missing", label: "Unavailable", disabled: true };
  if (!shopConfigured()) return { code: "preview", label: "Preview", disabled: true };
  if (owns(item)) return { code: "owned", label: "Owned", disabled: true };
  const hasRemainingStock = item.remainingStock !== null && item.remainingStock !== undefined;
  const hasStockLimit = item.stock !== null && item.stock !== undefined;
  const soldOut = hasRemainingStock
    ? Number(item.remainingStock) <= 0
    : hasStockLimit && Number(item.stock) <= 0;
  if (soldOut) {
    return { code: "soldout", label: "Sold out", disabled: true };
  }
  if (!shopState.user) return { code: "login", label: "Sign in to buy", disabled: false };
  const missing = Math.max(0, Number(item.price || 0) - Number(shopState.user.balance || 0));
  if (missing > 0) return { code: "funds", label: `Need ${formatCompact(missing)} more`, disabled: true };
  return { code: "buy", label: "Buy", disabled: false };
}

function openPurchase(productId) {
  if (!shopState.user) {
    beginTwitchLogin();
    return;
  }
  const item = findProduct(productId);
  if (!item || owns(item)) return;
  const availability = productAvailability(item);
  if (availability.code !== "buy") {
    showToast(availability.code === "funds" ? "You do not have enough Shinies for this item." : availability.label, true);
    return;
  }
  shopState.selectedProduct = item;

  const balance = Number(shopState.user.balance || 0);
  const price = Number(item.price || 0);
  const after = balance - price;
  setText("#shop-modal-title", item.name);
  setText("#shop-modal-description", item.description || `Purchase ${item.name} for your Kiwi Birb profile.`);
  setText("#shop-modal-rarity", `${item.type || "Item"} · ${item.rarity || "common"}`);
  setText("#shop-modal-balance", `${balance.toLocaleString()} ✦`);
  setText("#shop-modal-price", `${price.toLocaleString()} ✦`);
  setText("#shop-modal-after", `${after.toLocaleString()} ✦`);
  setText("#shop-modal-icon", item.icon || "✦");
  setText("#shop-modal-error", "");
  document.querySelector("#shop-modal-after")?.classList.toggle("is-negative", after < 0);

  const modal = document.querySelector("#shop-modal");
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  document.querySelector("#shop-confirm-buy")?.focus();
}

function closePurchase() {
  if (shopState.busy) return;
  const modal = document.querySelector("#shop-modal");
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  shopState.selectedProduct = null;
}

async function confirmPurchase() {
  const item = shopState.selectedProduct;
  if (!item || shopState.busy) return;
  const button = document.querySelector("#shop-confirm-buy");
  const errorBox = document.querySelector("#shop-modal-error");
  shopState.busy = true;
  button.disabled = true;
  button.textContent = "Purchasing…";
  if (errorBox) errorBox.textContent = "";

  try {
    const result = await apiRequest("/api/purchase", {
      method: "POST",
      body: JSON.stringify({
        productId: item.id,
        idempotencyKey: `website:${shopState.user.twitchUserId}:${item.id}:${crypto.randomUUID()}`,
      }),
    });
    shopState.user.balance = Number(result.balance || 0);
    if (!item.repeatable && item.rewardId) {
      const owned = new Set(shopState.user.ownedRewardIds || []);
      owned.add(item.rewardId);
      shopState.user.ownedRewardIds = [...owned];
    }
    incrementSeller(item);
    shopState.busy = false;
    closePurchase();
    renderShop();
    const pending = result.purchase?.status === "pending";
    showToast(pending
      ? `${item.name} purchased! Kiwi Birb will apply the reward automatically.`
      : `${item.name} purchased!`);
  } catch (error) {
    if (error.code === "SESSION_INVALID" || error.code === "AUTH_REQUIRED") {
      localStorage.removeItem(SHOP_TOKEN_KEY);
      shopState.user = null;
      shopState.busy = false;
      closePurchase();
      renderShop();
      showToast("Your session expired. Please sign in again.", true);
    } else if (errorBox) {
      errorBox.textContent = error.message || friendlyShopError(error.code) || "The purchase could not be completed.";
    }
  } finally {
    shopState.busy = false;
    button.disabled = false;
    button.textContent = "Buy";
  }
}

function incrementSeller(item) {
  const sellers = [...(shopState.catalog.topSellers || [])];
  const existing = sellers.find((seller) => seller.id === item.id);
  if (existing) existing.sold = Number(existing.sold || 0) + 1;
  else sellers.push({ id: item.id, name: item.name, price: item.price, sold: 1, icon: item.icon, image: item.image });
  sellers.sort((a, b) => Number(b.sold || 0) - Number(a.sold || 0) || String(a.name).localeCompare(String(b.name)));
  shopState.catalog.topSellers = sellers.slice(0, 3);
}

function owns(item) {
  return Boolean(item && !item.repeatable && item.rewardId && (shopState.user?.ownedRewardIds || []).includes(item.rewardId));
}

function dailyTimer(item) {
  if (!item?.saleEndsAt) return "Today’s special";
  const seconds = Number(item.saleEndsAt) - Math.floor(Date.now() / 1000);
  if (seconds <= 0) return "Refreshing soon";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m left`;
}

function showToast(message, isError = false) {
  const toast = document.querySelector("#shop-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 4800);
}

function friendlyShopError(code) {
  const messages = {
    AUTH_REQUIRED: "Please sign in with Twitch.",
    SESSION_INVALID: "Your shop session expired. Please sign in again.",
    ALREADY_OWNED: "You already own this item.",
    OUT_OF_STOCK: "That item is out of stock.",
    PRICE_CHANGED: "The price changed. Refresh the shop and try again.",
    INSUFFICIENT_BALANCE: "You do not have enough Shinies for this item.",
    PRODUCT_UNAVAILABLE: "That item is not currently available.",
  };
  return messages[code] || "";
}

function formatCompact(value) {
  const number = Number(value || 0);
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1)}m`;
  if (number >= 10_000) return `${Math.ceil(number / 1_000)}k`;
  return number.toLocaleString();
}

function relativeTime(date) {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

function slugify(value) {
  return String(value || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function escapeJs(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("'", "\\'").replaceAll("\n", " ");
}
