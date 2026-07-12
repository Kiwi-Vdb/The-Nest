const fallbackStreamStatus = {
  live: false,
  viewers: 0
};

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

async function loadStreamStatus() {
  try {
    const response = await fetch("./data/stream-status.json", { cache: "no-store" });
    if (!response.ok) throw new Error("stream-status.json not found");

    const data = await response.json();
    renderStreamStatus({ ...fallbackStreamStatus, ...data });
  } catch (error) {
    renderStreamStatus(fallbackStreamStatus);
  }
}

loadStreamStatus();
