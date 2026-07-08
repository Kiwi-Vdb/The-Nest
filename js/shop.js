document.addEventListener("DOMContentLoaded", async () => {
  const shop = await loadJson("./data/shop.json", { items: [] });
  const grid = document.querySelector("[data-shop-items]");
  if (!grid) return;

  grid.innerHTML = shop.items.map(item => `
    <article class="shop-item">
      <strong>${item.name}</strong>
      <span>${item.type}</span>
      <p class="shop-price">${item.price} ${shop.currency || "Shinies"}</p>
    </article>
  `).join("");
});