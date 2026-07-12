(() => {
  const PAGE_SIZE = 100;
  const DATA_PATH = './data/leaderboard.json';
  const fallback = {
    generatedAt: 0,
    totalViewers: 0,
    totalShinies: 0,
    entries: []
  };

  let data = fallback;
  let currentPage = 1;

  const body = document.getElementById('leaderboard-body');
  const empty = document.getElementById('leaderboard-empty');
  const previous = document.getElementById('leaderboard-prev');
  const next = document.getElementById('leaderboard-next');
  const pageLabel = document.getElementById('leaderboard-page-label');
  const scrollRegion = document.getElementById('leaderboard-scroll-region');

  previous?.addEventListener('click', () => changePage(currentPage - 1));
  next?.addEventListener('click', () => changePage(currentPage + 1));

  init();

  async function init() {
    await refresh();
    window.setInterval(refresh, 60000);
  }

  async function refresh() {
    const loaded = await loadJson(`${DATA_PATH}?cache=${Date.now()}`, fallback);
    data = normalisePayload(loaded);
    currentPage = Math.min(currentPage, pageCount());
    render();
  }

  function normalisePayload(payload) {
    const entries = Array.isArray(payload?.entries)
      ? payload.entries
          .filter(entry => entry && String(entry.name || '').trim())
          .map((entry, index) => ({
            rank: Number(entry.rank || index + 1),
            name: String(entry.name || 'Viewer'),
            shinies: Math.max(0, Number(entry.shinies || 0))
          }))
      : [];

    return {
      generatedAt: Number(payload?.generatedAt || 0),
      totalViewers: Number(payload?.totalViewers ?? entries.length),
      totalShinies: Number(payload?.totalShinies ?? entries.reduce((sum, entry) => sum + entry.shinies, 0)),
      entries
    };
  }

  function render() {
    renderSummary();
    renderRows();
    renderPager();
    renderSync();
  }

  function renderSummary() {
    setText('leaderboard-total-viewers', formatNumber(data.totalViewers));
    setText('leaderboard-total-shinies', `${formatNumber(data.totalShinies)} ✦`);
    setText('leaderboard-updated', data.generatedAt ? relativeTime(data.generatedAt) : 'Waiting for sync');
  }

  function renderRows() {
    if (!body || !empty) return;
    const start = (currentPage - 1) * PAGE_SIZE;
    const rows = data.entries.slice(start, start + PAGE_SIZE);

    empty.hidden = rows.length > 0;
    body.innerHTML = rows.map(entry => `
      <tr>
        <td class="rank-cell">${formatNumber(entry.rank)}</td>
        <td class="viewer-cell" title="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</td>
        <td class="shinies-cell">${formatNumber(entry.shinies)} ✦</td>
      </tr>
    `).join('');
  }

  function renderPager() {
    const pages = pageCount();
    if (pageLabel) pageLabel.textContent = `Page ${currentPage} of ${pages} · 100 viewers per page`;
    if (previous) previous.disabled = currentPage <= 1;
    if (next) next.disabled = currentPage >= pages;
  }

  function renderSync() {
    const status = document.getElementById('nest-sync-status');
    const updated = document.getElementById('nest-sync-updated');
    const connected = data.generatedAt > 0;
    if (status) {
      status.textContent = connected ? 'Connected' : 'Waiting';
      status.classList.toggle('is-connected', connected);
      status.classList.toggle('is-disconnected', !connected);
    }
    if (updated) updated.textContent = connected ? `Updated ${relativeTime(data.generatedAt)}` : 'Waiting for Kiwi Birb';
  }

  function changePage(page) {
    const nextPage = Math.max(1, Math.min(pageCount(), page));
    if (nextPage === currentPage) return;
    currentPage = nextPage;
    renderRows();
    renderPager();
    if (scrollRegion) scrollRegion.scrollTop = 0;
  }

  function pageCount() {
    return Math.max(1, Math.ceil(data.entries.length / PAGE_SIZE));
  }

  async function loadJson(path, fallbackValue) {
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Could not load ${path}`);
      return await response.json();
    } catch (_) {
      return fallbackValue;
    }
  }

  function relativeTime(unixSeconds) {
    const seconds = Math.max(0, Math.floor(Date.now() / 1000) - Number(unixSeconds || 0));
    if (seconds < 15) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('en-GB');
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
})();
