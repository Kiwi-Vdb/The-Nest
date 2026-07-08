document.addEventListener("DOMContentLoaded", async () => {
  const data = await loadJson("./data/shop.json", {items: []});
  setText("[data-shinies]", data.shinies ?? 0);

  const grid = document.querySelector("[data-shop-items]");
  if (!grid) return;

  grid.innerHTML = data.items.map(item => `
    <article class="tile">
      <div class="tile-thumb"></div>
      <strong>${item.name}</strong>
      <p>${item.type}</p>
      <p>${item.price} Shinies</p>
    </article>
  `).join("");
});