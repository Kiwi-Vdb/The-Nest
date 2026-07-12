(() => {
  const fallbackCommunity = {
    highlights: [
      { icon: '✦', title: 'Rising Star', copy: 'Community highlights will appear here.' },
      { icon: '●', title: 'Top Chatter', copy: 'Community highlights will appear here.' },
      { icon: '♥', title: 'Loyal Friend', copy: 'Community highlights will appear here.' }
    ],
    goal: {
      type: 'twitch_followers',
      status: 'waiting',
      label: 'Road to 1,000 Followers',
      current: 0,
      target: 1000,
      suffix: 'followers',
      remaining: 1000,
      completed: false
    }
  };


  const fallbackHighlights = {
    generatedAt: 0,
    rotationGeneratedAt: 0,
    nextRotationAt: 0,
    highlights: fallbackCommunity.highlights
  };

  const fallbackLeaderboard = {
    generatedAt: 0,
    totalViewers: 0,
    totalShinies: 0,
    entries: []
  };

  const fallbackActivity = {
    generatedAt: 0,
    count: 0,
    activities: []
  };

  const fallbackSync = {
    connected: true,
    lastUpdated: 'Last updated just now'
  };

  let currentActivity = [];

  init();

  async function init() {
    const [community, highlights, leaderboard, activity, goal, sync] = await Promise.all([
      loadJson('./data/community.json', fallbackCommunity),
      loadJson('./data/highlights.json', fallbackHighlights),
      loadJson('./data/leaderboard.json', fallbackLeaderboard),
      loadJson('./data/activity.json', fallbackActivity),
      loadJson('./data/community-goal.json', fallbackCommunity.goal),
      loadJson('./data/nest-sync.json', fallbackSync)
    ]);

    renderHighlights(highlights.highlights || community.highlights || fallbackCommunity.highlights);
    renderLeaderboard(leaderboard.entries || []);
    renderActivity(activity.activities || []);
    renderGoal(goal || community.goal || fallbackCommunity.goal);
    renderSync(sync);

    // GitHub Pages is static, so periodically re-read public snapshots.
    window.setInterval(refreshCommunityData, 60000);
    // Keep relative timestamps accurate without making a network request.
    window.setInterval(() => renderActivity(currentActivity), 30000);
  }

  async function refreshCommunityData() {
    const cacheBust = Date.now();
    const [highlights, leaderboard, activity, goal] = await Promise.all([
      loadJson(`./data/highlights.json?cache=${cacheBust}`, fallbackHighlights),
      loadJson(`./data/leaderboard.json?cache=${cacheBust}`, fallbackLeaderboard),
      loadJson(`./data/activity.json?cache=${cacheBust}`, fallbackActivity),
      loadJson(`./data/community-goal.json?cache=${cacheBust}`, fallbackCommunity.goal)
    ]);
    renderHighlights(highlights.highlights || fallbackCommunity.highlights);
    renderLeaderboard(leaderboard.entries || []);
    renderActivity(activity.activities || []);
    renderGoal(goal || fallbackCommunity.goal);
  }

  async function loadJson(path, fallback) {
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Could not load ${path}`);
      return await response.json();
    } catch (_) {
      return fallback;
    }
  }

  function renderHighlights(items) {
    const root = document.getElementById('community-highlights');
    if (!root) return;
    const highlights = Array.isArray(items) ? items.slice(0, 3) : [];
    if (!highlights.length) {
      root.innerHTML = `
        <div class="highlights-empty">
          <strong>Waiting for highlights</strong>
          <span>Kiwi Birb will choose a fresh daily set after the next Nest Sync.</span>
        </div>
      `;
      return;
    }

    root.innerHTML = highlights.map(item => `
      <article class="highlight-item">
        <div class="highlight-icon" aria-hidden="true">${escapeHtml(item.icon || '✦')}</div>
        <div>
          <div class="highlight-title">${escapeHtml(item.title || '')}</div>
          <div class="highlight-copy">${escapeHtml(item.copy || '')}</div>
        </div>
      </article>
    `).join('');
  }

  function renderLeaderboard(items) {
    const root = document.getElementById('community-leaderboard');
    if (!root) return;

    const topFive = Array.isArray(items) ? items.slice(0, 5) : [];
    if (!topFive.length) {
      root.innerHTML = `
        <div class="leaderboard-empty">
          <strong>Waiting for Kiwi Birb</strong>
          <span>The real Shiny leaderboard will appear after the next Nest Sync.</span>
        </div>
      `;
      return;
    }

    root.innerHTML = topFive.map((item, index) => `
      <article class="leaderboard-row">
        <div class="leaderboard-rank">${Number(item.rank || index + 1)}</div>
        <div class="leaderboard-avatar" aria-hidden="true">${initials(item.name)}</div>
        <div class="leaderboard-name" title="${escapeHtml(item.name || 'Viewer')}">${escapeHtml(item.name || 'Viewer')}</div>
        <div class="leaderboard-score">${formatNumber(item.shinies ?? item.score ?? 0)} ✦</div>
      </article>
    `).join('');
  }

  function renderActivity(items) {
    const root = document.getElementById('community-activity');
    if (!root) return;

    currentActivity = Array.isArray(items) ? items : [];
    const recent = currentActivity.slice(0, 4);

    if (!recent.length) {
      root.innerHTML = `
        <div class="activity-empty">
          <strong>Waiting for activity</strong>
          <span>Unlocks, gifts and big Shiny wins will appear here.</span>
        </div>
      `;
      return;
    }

    root.innerHTML = recent.map(item => {
      const type = activityType(item.type);
      const who = item.who || 'Someone';
      const copy = item.text || 'did something shiny';
      const timestamp = Number(item.timestamp || 0);
      return `
        <article class="activity-row activity-${type}" title="${escapeHtml(`${who} ${copy}`)}">
          <div class="activity-avatar" aria-hidden="true">${activityIcon(type, who)}</div>
          <div class="activity-copy"><strong>${escapeHtml(who)}</strong> ${escapeHtml(copy)}</div>
          <time class="activity-time" datetime="${timestamp ? new Date(timestamp * 1000).toISOString() : ''}">${relativeTime(timestamp)}</time>
        </article>
      `;
    }).join('');
  }

  function renderGoal(goal) {
    const copy = document.getElementById('community-goal-copy');
    const bar = document.getElementById('community-goal-bar');
    const meta = document.getElementById('community-goal-meta');
    if (!copy || !bar || !meta) return;

    const current = Math.max(0, Number(goal.current || 0));
    const target = Math.max(Number(goal.target || 1), 1);
    const percentage = Math.min(100, Math.max(0, Number(goal.percentage ?? ((current / target) * 100))));
    const remaining = Math.max(0, Number(goal.remaining ?? (target - current)));
    const completed = goal.completed === true || current >= target;
    const suffix = goal.suffix || 'followers';

    copy.textContent = goal.label || 'Road to 1,000 Followers';
    bar.style.width = `${percentage}%`;
    bar.parentElement?.classList.toggle('is-complete', completed);

    const progressCopy = `${formatNumber(current)} / ${formatNumber(target)} ${escapeHtml(suffix)}`;
    const remainingCopy = completed
      ? 'Goal reached! ✦'
      : `${formatNumber(remaining)} to go`;
    meta.innerHTML = `<span>${progressCopy}</span><span>${remainingCopy}</span>`;
  }

  function renderSync(sync) {
    const status = document.getElementById('nest-sync-status');
    const updated = document.getElementById('nest-sync-updated');
    if (!status || !updated) return;

    const connected = sync.connected !== false;
    status.textContent = connected ? 'Connected' : 'Offline';
    status.classList.toggle('is-connected', connected);
    status.classList.toggle('is-disconnected', !connected);
    updated.textContent = sync.lastUpdated || 'Last updated just now';
  }

  function activityType(value) {
    const allowed = new Set(['unlock', 'gift', 'prediction', 'gamba', 'jackpot']);
    const type = String(value || '').toLowerCase();
    return allowed.has(type) ? type : 'default';
  }

  function activityIcon(type, who) {
    const icons = {
      unlock: '✦',
      gift: '♥',
      prediction: '✓',
      gamba: '◆',
      jackpot: '★'
    };
    return icons[type] || initials(who);
  }

  function relativeTime(timestamp) {
    const value = Number(timestamp || 0);
    if (!value) return '';

    const seconds = Math.max(0, Math.floor(Date.now() / 1000) - value);
    if (seconds < 15) return 'now';
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    return new Date(value * 1000).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short'
    });
  }

  function initials(name = '') {
    return String(name)
      .replaceAll('_', ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0])
      .join('')
      .toUpperCase() || '•';
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
