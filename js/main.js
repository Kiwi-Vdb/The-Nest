async function loadJson(path, fallback = {}) {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(path);
    return await res.json();
  } catch (err) {
    console.warn("Using fallback data for", path);
    return fallback;
  }
}

function setText(selector, text) {
  const el = document.querySelector(selector);
  if (el) el.textContent = text;
}

document.addEventListener("DOMContentLoaded", () => {
  const current = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll("[data-nav]").forEach(link => {
    const href = link.getAttribute("href");
    if (href === current || (current === "" && href === "index.html")) {
      link.classList.add("active");
    }
  });
});