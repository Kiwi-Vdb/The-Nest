document.addEventListener("DOMContentLoaded", async () => {
  const data = await loadJson("./data/shop.json", {
    shinies: 0,
    items: [],
    dailySpecial: null,
    topSellers: []
  });

  const sync = await loadJson("./data/nest-sync.json", {
    connected: true,
    lastUpdated: "just now"
  });

  setText("#shop-shinies", Number(data.shinies ?? 0).toLocaleString());

  renderItems(data.items ?? []);
  renderDaily(data.dailySpecial);
  renderSellers(data.topSellers ?? []);
  renderSync(sync);
});

function renderItems(items) {
  const grid = document.querySelector("#shop-items");
  if (!grid) return;

  grid.innerHTML = items.slice(0, 4).map(item => `
    <article class="shop-card">
      <div class="shop-card-icon" aria-hidden="true">${item.icon ?? "✦"}</div>
      <div>
        <div class="shop-card-name">${item.name}</div>
        <div class="shop-card-rarity">${item.rarity ?? item.type ?? "Item"}</div>
      </div>
      <div class="shop-card-price">${Number(item.price ?? 0).toLocaleString()} ✦</div>
    </article>
  `).join("");
}

function renderDaily(item) {
  const panel = document.querySelector("#shop-daily-special");
  if (!panel || !item) return;

  panel.innerHTML = `
    <div class="daily-special-timer">${item.timer ?? "Today"}</div>
    <div class="daily-special-name">${item.name}</div>
    <div class="daily-special-rarity">${item.rarity ?? "Special"}</div>
    <div class="daily-special-price">
      ${Number(item.price ?? 0).toLocaleString()} ✦
      ${item.oldPrice ? `<span class="daily-special-old">${Number(item.oldPrice).toLocaleString()}</span>` : ""}
    </div>
  `;
}

function renderSellers(items) {
  const list = document.querySelector("#shop-top-sellers");
  if (!list) return;

  list.innerHTML = items.slice(0, 3).map((item, index) => `
    <div class="seller-row">
      <span>${index + 1}.</span>
      <span>${item.name}</span>
      <span class="seller-price">${Number(item.price ?? 0).toLocaleString()} ✦</span>
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
