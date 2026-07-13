const fallbackStreamStatus = {
  live: false,
  viewers: 0
};

const TWITCH_STATUS_STALE_MS = 3 * 60 * 1000;

function formatViewerCount(viewers) {
  const safeViewers = Number.isFinite(Number(viewers)) ? Number(viewers) : 0;
  return `${safeViewers.toLocaleString()} ${safeViewers === 1 ? "Viewer" : "Viewers"}`;
}

function renderStreamStatus(data) {
  const statusEl = document.getElementById("stream-status");
  const viewersEl = document.getElementById("viewer-count");

  if (!statusEl || !viewersEl) return;

  const live = Boolean(data.live);
  const viewers = Number.isFinite(Number(data.viewers)) ? Number(data.viewers) : 0;

  statusEl.textContent = live ? "● LIVE NOW" : "● OFFLINE";
  statusEl.classList.toggle("is-live", live);
  statusEl.classList.toggle("is-offline", !live);
  viewersEl.textContent = formatViewerCount(viewers);
}

async function readJson(path, fallback = {}) {
  try {
    const response = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`${path} not found`);
    return await response.json();
  } catch {
    return fallback;
  }
}

function applyTwitchFreshness(data = {}) {
  const updatedAt = Number(data.statusUpdatedAt || 0) * 1000;
  if (updatedAt > 0 && (Date.now() - updatedAt) <= TWITCH_STATUS_STALE_MS) {
    return data;
  }
  return { ...data, live: false, viewers: 0 };
}

async function loadStreamStatus() {
  const [config, fileStatus] = await Promise.all([
    readJson("./data/shop-config.json", {}),
    readJson("./data/twitch.json", fallbackStreamStatus)
  ]);

  const apiBase = String(config.apiBase || "").replace(/\/+$/, "");
  if (apiBase) {
    try {
      const response = await fetch(
        `${apiBase}/api/twitch-status?v=${Date.now()}`,
        { cache: "no-store" }
      );
      if (response.ok) {
        const cloudStatus = await response.json();
        if (cloudStatus?.ok) {
          renderStreamStatus({ ...fallbackStreamStatus, ...cloudStatus });
          return;
        }
      }
    } catch {
      // Fall back to the GitHub-published snapshot below.
    }
  }

  renderStreamStatus({
    ...fallbackStreamStatus,
    ...applyTwitchFreshness(fileStatus)
  });
}

loadStreamStatus();
window.setInterval(loadStreamStatus, 30000);
