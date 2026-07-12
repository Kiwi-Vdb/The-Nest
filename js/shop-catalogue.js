const CATALOGUE_TOKEN_KEY = "the-nest-shop-token";
const CATALOGUE_REFRESH_MS = 60_000;
const CATALOGUE_RARITY_ORDER = ["common", "rare", "epic", "legendary", "special", "limited"];
const CATALOGUE_CONFIG_FALLBACK = { enabled: false, apiBase: "", shopTitle: "The Nest Shop" };

const catalogueState = {
  config: CATALOGUE_CONFIG_FALLBACK,
  products: [],
  user: null,
  selectedProduct: null,
  selectedRarity: "all",
  service: "loading",
  busy: false,
  kind: document.querySelector(".catalogue-page")?.dataset.catalogKind || "cosmetic",
};

let catalogueRefreshTimer = null;
let catalogueToastTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
  bindCatalogueUi();
  catalogueState.config = await loadJson("./data/shop-config.json", CATALOGUE_CONFIG_FALLBACK);
  await exchangeCatalogueAuthCode();
  await loadCatalogue({ quiet: false });
  catalogueRefreshTimer = window.setInterval(() => loadCatalogue({ quiet: true }), CATALOGUE_REFRESH_MS);
});

window.addEventListener("beforeunload", () => window.clearInterval(catalogueRefreshTimer));

function catalogueConfigured() {
  const base = String(catalogueState.config?.apiBase || "").trim();
  return Boolean(catalogueState.config?.enabled && base.startsWith("https://") && !base.includes("YOUR-WORKER"));
}

function catalogueApiUrl(path) {
  return `${String(catalogueState.config.apiBase || "").replace(/\/$/, "")}/${String(path).replace(/^\//, "")}`;
}

async function catalogueApiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  const token = localStorage.getItem(CATALOGUE_TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(catalogueApiUrl(path), { ...options, headers, cache: "no-store" });
  let data;
  try {
    data = await response.json();
  } catch {
    data = { ok: false, error: "BAD_RESPONSE", message: "The shop returned an unreadable response." };
  }

  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || catalogueFriendlyError(data.error) || "Shop request failed.");
    error.code = data.error || `HTTP_${response.status}`;
    error.status = response.status;
    throw error;
  }
  return data;
}

async function exchangeCatalogueAuthCode() {
  const url = new URL(location.href);
  const code = url.searchParams.get("shop_auth");
  if (!code || !catalogueConfigured()) return;

  try {
    const result = await catalogueApiRequest("/api/auth/exchange", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    localStorage.setItem(CATALOGUE_TOKEN_KEY, result.token);
    catalogueToast("Signed in with Twitch.");
  } catch (error) {
    catalogueToast(error.message || "Twitch sign-in could not be completed.", true);
  } finally {
    url.searchParams.delete("shop_auth");
    history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }
}

async function loadCatalogue({ quiet = false } = {}) {
  let loadedLive = false;
  if (catalogueConfigured()) {
    try {
      const catalog = await catalogueApiRequest("/api/catalog");
      catalogueState.products = normaliseCatalogueProducts(catalog.products || []);
      catalogueState.service = "online";
      loadedLive = true;
    } catch (error) {
      catalogueState.service = "error";
      if (!quiet) catalogueToast(error.message || "The live catalogue is unavailable.", true);
    }
  }

  if (!loadedLive && !catalogueState.products.length) {
    const fallback = await loadJson("./data/shop-catalogue.json", { products: [] });
    catalogueState.products = normaliseCatalogueProducts(fallback.products || []);
    if (!catalogueConfigured()) catalogueState.service = "preview";
  }

  if (catalogueConfigured() && localStorage.getItem(CATALOGUE_TOKEN_KEY)) {
    try {
      const result = await catalogueApiRequest("/api/me");
      catalogueState.user = result.user;
    } catch (error) {
      if (["SESSION_INVALID", "AUTH_REQUIRED"].includes(error.code)) {
        localStorage.removeItem(CATALOGUE_TOKEN_KEY);
        if (!quiet) catalogueToast("Your shop session expired. Please sign in again.", true);
      }
      catalogueState.user = null;
    }
  } else {
    catalogueState.user = null;
  }

  renderCatalogue();
}

function normaliseCatalogueProducts(products) {
  return products.map((item) => {
    const basePrice = Number(item.price || 0);
    const salePrice = item.salePrice === null || item.salePrice === undefined || item.salePrice === ""
      ? null
      : Number(item.salePrice);
    const liveDto = item.oldPrice !== undefined;
    return {
      ...item,
      id: String(item.id || ""),
      name: String(item.name || "Shop Item"),
      type: String(item.type || "Item"),
      category: String(item.category || item.type || "Item"),
      rarity: String(item.rarity || "common").toLowerCase(),
      rewardId: String(item.rewardId || item.reward_id || ""),
      price: liveDto ? basePrice : Number(salePrice ?? basePrice),
      oldPrice: liveDto ? (item.oldPrice === null || item.oldPrice === undefined ? null : Number(item.oldPrice)) : (salePrice !== null ? basePrice : null),
      image: String(item.image || item.imagePath || ""),
      icon: String(item.icon || "✦"),
      repeatable: Boolean(item.repeatable),
      stock: item.stock === null || item.stock === undefined || item.stock === "" ? null : Number(item.stock),
      remainingStock: item.remainingStock === null || item.remainingStock === undefined ? null : Number(item.remainingStock),
      enabled: item.enabled !== false,
    };
  });
}

function filteredKindProducts() {
  return catalogueState.products.filter((item) => {
    const isText = String(item.type || "").toLowerCase() === "text effect";
    return catalogueState.kind === "text-effect" ? isText : !isText;
  });
}

function renderCatalogue() {
  renderCatalogueAccount();
  renderCatalogueFilters();
  renderCatalogueSections();
}

function renderCatalogueAccount() {
  const name = document.querySelector("#catalogue-account-name");
  const balance = document.querySelector("#catalogue-balance");
  const button = document.querySelector("#catalogue-account-button");
  const service = document.querySelector("#catalogue-service");
  if (!name || !balance || !button || !service) return;

  service.classList.remove("is-online", "is-error");
  if (catalogueState.service === "online") {
    service.classList.add("is-online");
    service.textContent = "Shop online";
  } else if (catalogueState.service === "error") {
    service.classList.add("is-error");
    service.textContent = "Using cached catalogue";
  } else {
    service.textContent = "Preview mode";
  }

  button.replaceWith(button.cloneNode(true));
  const freshButton = document.querySelector("#catalogue-account-button");
  if (catalogueState.user) {
    name.textContent = catalogueState.user.displayName || catalogueState.user.login;
    balance.textContent = `${Number(catalogueState.user.balance || 0).toLocaleString()} Shinies`;
    freshButton.textContent = "Sign out";
    freshButton.className = "catalogue-logout";
    freshButton.disabled = false;
    freshButton.addEventListener("click", catalogueLogout);
  } else {
    name.textContent = "Not signed in";
    balance.textContent = "— Shinies";
    freshButton.textContent = catalogueConfigured() ? "Sign in with Twitch" : "Sign-in unavailable";
    freshButton.className = "catalogue-login";
    freshButton.disabled = !catalogueConfigured();
    freshButton.addEventListener("click", catalogueLogin);
  }
}

function renderCatalogueFilters() {
  const container = document.querySelector("#catalogue-filters");
  if (!container) return;
  const available = new Set(filteredKindProducts().map((item) => item.rarity));
  const rarities = CATALOGUE_RARITY_ORDER.filter((rarity) => available.has(rarity));
  const choices = ["all", ...rarities];
  if (!choices.includes(catalogueState.selectedRarity)) catalogueState.selectedRarity = "all";
  container.innerHTML = choices.map((rarity) => `
    <button type="button" class="catalogue-filter${catalogueState.selectedRarity === rarity ? " is-active" : ""}" data-rarity-filter="${escapeCatalogueAttr(rarity)}">
      ${escapeCatalogueHtml(rarity === "all" ? "All" : rarity)}
    </button>
  `).join("");
  container.querySelectorAll("[data-rarity-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      catalogueState.selectedRarity = button.dataset.rarityFilter || "all";
      renderCatalogueFilters();
      renderCatalogueSections();
    });
  });
}

function renderCatalogueSections() {
  const content = document.querySelector("#catalogue-content");
  const status = document.querySelector("#catalogue-status");
  if (!content || !status) return;

  const products = filteredKindProducts();
  status.textContent = `${products.length} ${catalogueState.kind === "text-effect" ? "text effects" : "cosmetics"} available`;
  if (!products.length) {
    content.innerHTML = `<div class="catalogue-empty">No products are available in this catalogue yet.</div>`;
    return;
  }

  const groups = new Map();
  products.forEach((item) => {
    if (!groups.has(item.rarity)) groups.set(item.rarity, []);
    groups.get(item.rarity).push(item);
  });

  const orderedRarities = [
    ...CATALOGUE_RARITY_ORDER.filter((rarity) => groups.has(rarity)),
    ...Array.from(groups.keys()).filter((rarity) => !CATALOGUE_RARITY_ORDER.includes(rarity)).sort(),
  ];

  content.innerHTML = orderedRarities.map((rarity) => {
    const items = groups.get(rarity).sort((a, b) => a.name.localeCompare(b.name));
    const hidden = catalogueState.selectedRarity !== "all" && catalogueState.selectedRarity !== rarity;
    return `
      <section class="catalogue-section" data-catalogue-rarity="${escapeCatalogueAttr(rarity)}" ${hidden ? "hidden" : ""}>
        <h2 class="catalogue-section-heading">${escapeCatalogueHtml(rarity)} <span class="catalogue-count">${items.length}</span></h2>
        <div class="catalogue-grid">${items.map(catalogueCardHtml).join("")}</div>
      </section>
    `;
  }).join("");

  content.querySelectorAll("[data-catalogue-buy]").forEach((button) => {
    button.addEventListener("click", () => openCataloguePurchase(button.dataset.catalogueBuy));
  });
}

function catalogueCardHtml(item) {
  const availability = catalogueAvailability(item);
  const visual = catalogueVisualHtml(item);
  const badges = availability.code === "owned"
    ? `<span class="catalogue-owned-badge">OWNED</span>`
    : availability.code === "soldout" ? `<span class="catalogue-sold-badge">SOLD OUT</span>` : "";
  return `
    <article class="catalogue-card" data-rarity="${escapeCatalogueAttr(item.rarity)}">
      ${badges}
      <div class="catalogue-visual">${visual}</div>
      <div class="catalogue-card-head">
        <h3 class="catalogue-card-name">${escapeCatalogueHtml(item.name)}</h3>
        <div class="catalogue-card-meta">
          <span>${escapeCatalogueHtml(item.category || item.type)}</span>
          <span>${escapeCatalogueHtml(item.rarity)}</span>
        </div>
      </div>
      <p class="catalogue-card-description">${escapeCatalogueHtml(item.description || "A reward for your Kiwi Birb profile.")}</p>
      <div class="catalogue-card-footer">
        <div class="catalogue-price-row">
          <span class="catalogue-price">${Number(item.price || 0).toLocaleString()} ✦</span>
          ${item.oldPrice ? `<span class="catalogue-old-price">${Number(item.oldPrice).toLocaleString()} ✦</span>` : ""}
        </div>
        <button type="button" class="catalogue-buy" data-catalogue-buy="${escapeCatalogueAttr(item.id)}" ${availability.disabled ? "disabled" : ""}>${escapeCatalogueHtml(availability.label)}</button>
      </div>
    </article>
  `;
}

function catalogueVisualHtml(item) {
  if (String(item.type).toLowerCase() === "text effect") {
    const effectClass = `effect-${String(item.rewardId || "").replace(/^text-/, "").replace(/[^a-z0-9-]/g, "")}`;
    return `<span class="catalogue-text-preview ${escapeCatalogueAttr(effectClass)}">KiwiBirb</span>`;
  }
  if (item.image) {
    return `<img class="catalogue-image" src="${escapeCatalogueAttr(item.image)}" alt="${escapeCatalogueAttr(item.name)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'catalogue-icon',textContent:'${escapeCatalogueJs(item.icon || "✦")}'}))">`;
  }
  return `<span class="catalogue-icon" aria-hidden="true">${escapeCatalogueHtml(item.icon || "✦")}</span>`;
}

function catalogueAvailability(item) {
  if (!catalogueConfigured()) return { code: "preview", label: "Preview", disabled: true };
  if (catalogueOwns(item)) return { code: "owned", label: "Owned", disabled: true };
  const hasRemaining = item.remainingStock !== null && item.remainingStock !== undefined;
  const hasLimit = item.stock !== null && item.stock !== undefined;
  const soldOut = hasRemaining ? Number(item.remainingStock) <= 0 : hasLimit && Number(item.stock) <= 0;
  if (soldOut) return { code: "soldout", label: "Sold out", disabled: true };
  if (!catalogueState.user) return { code: "login", label: "Sign in to buy", disabled: false };
  const missing = Math.max(0, Number(item.price || 0) - Number(catalogueState.user.balance || 0));
  if (missing > 0) return { code: "funds", label: `Need ${catalogueCompact(missing)} more`, disabled: true };
  return { code: "buy", label: "Buy", disabled: false };
}

function catalogueOwns(item) {
  return Boolean(item && !item.repeatable && item.rewardId && (catalogueState.user?.ownedRewardIds || []).includes(item.rewardId));
}

function catalogueLogin() {
  if (!catalogueConfigured()) return;
  const returnUrl = `${location.origin}${location.pathname}`;
  location.href = `${catalogueApiUrl("/auth/twitch")}?return_to=${encodeURIComponent(returnUrl)}`;
}

async function catalogueLogout() {
  try {
    await catalogueApiRequest("/api/logout", { method: "POST", body: "{}" });
  } catch {
    // Local sign-out remains valid when the API is temporarily unreachable.
  }
  localStorage.removeItem(CATALOGUE_TOKEN_KEY);
  catalogueState.user = null;
  renderCatalogue();
  catalogueToast("Signed out.");
}

function findCatalogueProduct(productId) {
  return catalogueState.products.find((item) => item.id === productId) || null;
}

function openCataloguePurchase(productId) {
  if (!catalogueState.user) {
    catalogueLogin();
    return;
  }
  const item = findCatalogueProduct(productId);
  if (!item || catalogueOwns(item)) return;
  const availability = catalogueAvailability(item);
  if (availability.code !== "buy") {
    catalogueToast(availability.code === "funds" ? "You do not have enough Shinies for this item." : availability.label, true);
    return;
  }

  catalogueState.selectedProduct = item;
  const balance = Number(catalogueState.user.balance || 0);
  const price = Number(item.price || 0);
  const after = balance - price;
  setCatalogueText("#catalogue-modal-title", item.name);
  setCatalogueText("#catalogue-modal-description", item.description || `Purchase ${item.name} for your Kiwi Birb profile.`);
  setCatalogueText("#catalogue-modal-rarity", `${item.type} · ${item.rarity}`);
  setCatalogueText("#catalogue-modal-balance", `${balance.toLocaleString()} ✦`);
  setCatalogueText("#catalogue-modal-price", `${price.toLocaleString()} ✦`);
  setCatalogueText("#catalogue-modal-after", `${after.toLocaleString()} ✦`);
  setCatalogueText("#catalogue-modal-icon", item.icon || "✦");
  setCatalogueText("#catalogue-modal-error", "");

  const modal = document.querySelector("#catalogue-modal");
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  document.querySelector("#catalogue-confirm-buy")?.focus();
}

function closeCataloguePurchase() {
  if (catalogueState.busy) return;
  const modal = document.querySelector("#catalogue-modal");
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  catalogueState.selectedProduct = null;
}

async function confirmCataloguePurchase() {
  const item = catalogueState.selectedProduct;
  if (!item || catalogueState.busy) return;
  const button = document.querySelector("#catalogue-confirm-buy");
  const errorBox = document.querySelector("#catalogue-modal-error");
  catalogueState.busy = true;
  button.disabled = true;
  button.textContent = "Purchasing…";
  if (errorBox) errorBox.textContent = "";

  try {
    const result = await catalogueApiRequest("/api/purchase", {
      method: "POST",
      body: JSON.stringify({
        productId: item.id,
        idempotencyKey: `website:${catalogueState.user.twitchUserId}:${item.id}:${crypto.randomUUID()}`,
      }),
    });
    catalogueState.user.balance = Number(result.balance || 0);
    if (!item.repeatable && item.rewardId) {
      const owned = new Set(catalogueState.user.ownedRewardIds || []);
      owned.add(item.rewardId);
      catalogueState.user.ownedRewardIds = [...owned];
    }
    catalogueState.busy = false;
    closeCataloguePurchase();
    renderCatalogue();
    catalogueToast(result.purchase?.status === "pending"
      ? `${item.name} purchased! Kiwi Birb will apply it automatically.`
      : `${item.name} purchased!`);
  } catch (error) {
    if (["SESSION_INVALID", "AUTH_REQUIRED"].includes(error.code)) {
      localStorage.removeItem(CATALOGUE_TOKEN_KEY);
      catalogueState.user = null;
      catalogueState.busy = false;
      closeCataloguePurchase();
      renderCatalogue();
      catalogueToast("Your session expired. Please sign in again.", true);
    } else if (errorBox) {
      errorBox.textContent = error.message || catalogueFriendlyError(error.code) || "The purchase could not be completed.";
    }
  } finally {
    catalogueState.busy = false;
    button.disabled = false;
    button.textContent = "Buy";
  }
}

function bindCatalogueUi() {
  document.querySelectorAll("[data-catalogue-close]").forEach((element) => element.addEventListener("click", closeCataloguePurchase));
  document.querySelector("#catalogue-confirm-buy")?.addEventListener("click", confirmCataloguePurchase);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCataloguePurchase();
  });
}

function catalogueToast(message, isError = false) {
  const toast = document.querySelector("#catalogue-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  clearTimeout(catalogueToastTimer);
  catalogueToastTimer = setTimeout(() => toast.classList.remove("is-visible"), 4800);
}

function catalogueFriendlyError(code) {
  return ({
    AUTH_REQUIRED: "Please sign in with Twitch.",
    SESSION_INVALID: "Your shop session expired. Please sign in again.",
    ALREADY_OWNED: "You already own this item.",
    OUT_OF_STOCK: "That item is out of stock.",
    PRICE_CHANGED: "The price changed. Refresh the catalogue and try again.",
    INSUFFICIENT_BALANCE: "You do not have enough Shinies for this item.",
    PRODUCT_UNAVAILABLE: "That item is not currently available.",
  })[code] || "";
}

function catalogueCompact(value) {
  const number = Number(value || 0);
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1)}m`;
  if (number >= 10_000) return `${Math.ceil(number / 1_000)}k`;
  return number.toLocaleString();
}

function setCatalogueText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function escapeCatalogueHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeCatalogueAttr(value) { return escapeCatalogueHtml(value); }
function escapeCatalogueJs(value) { return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("'", "\\'").replaceAll("\n", " "); }
