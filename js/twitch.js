async function readJson(path, fallback) {
  try {
    const response = await fetch(`${path}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Unable to read ${path}`);
    return await response.json();
  } catch (error) {
    return fallback;
  }
}

const fallbackTwitch = {
  live: false,
  viewers: 0,
  channel: 'itsvdb',
  twitchUrl: 'https://www.twitch.tv/itsvdb',
  streamTitle: 'Live from The Nest',
  offlineTitle: 'No stream currently live',
  game: {
    provider: 'bar',
    available: true,
    active: false,
    status: 'not_in_lobby',
    statusLabel: 'NOT IN LOBBY',
    lobbyName: 'Not in a BAR lobby',
    lobbyTitle: '',
    mode: '',
    mapName: 'Waiting for the next match',
    mapImage: '',
    players: 0,
    maxPlayers: 0,
    spectators: 0
  },
  prediction: {
    active: false,
    endsIn: 'No prediction open',
    question: 'No prediction open',
    prize: 0,
    options: [
      { label: 'Yes', percent: 0 },
      { label: 'No', percent: 0 }
    ]
  },
  clips: []
};

const fallbackSync = {
  connected: true,
  lastUpdated: 'Last updated just now'
};

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

const STREAM_EMBED_WIDTH = 533;
const STREAM_EMBED_HEIGHT = 300;
const TWITCH_REFRESH_MS = 15000;
const PREDICTION_REFRESH_MS = 15000;
const SYNC_REFRESH_MS = 30000;
const TWITCH_STATUS_STALE_MS = 3 * 60 * 1000;
const BAR_STATUS_STALE_MS = 30 * 60 * 1000;
let twitchServiceConfigPromise = null;
let streamResizeObserver = null;
let currentTwitchData = fallbackTwitch;
let currentPredictionData = fallbackTwitch.prediction;
let currentSyncData = fallbackSync;
let currentClips = [];
let activeClip = null;


async function twitchServiceApiBase() {
  if (!twitchServiceConfigPromise) {
    twitchServiceConfigPromise = readJson('./data/shop-config.json', {})
      .then(config => String(config.apiBase || '').replace(/\/+$/, ''))
      .catch(() => '');
  }
  return twitchServiceConfigPromise;
}

function applyTwitchFreshness(data = {}) {
  const updatedAt = Number(data.statusUpdatedAt || 0) * 1000;
  const isFresh = updatedAt > 0 && (Date.now() - updatedAt) <= TWITCH_STATUS_STALE_MS;
  if (isFresh) return data;

  return {
    ...data,
    live: false,
    viewers: 0,
    title: '',
    gameName: '',
    startedAt: '',
    thumbnailUrl: '',
    statusStale: true
  };
}

async function fetchCloudTwitchStatus() {
  const apiBase = await twitchServiceApiBase();
  if (!apiBase) return null;

  try {
    const response = await fetch(
      `${apiBase}/api/twitch-status?v=${Date.now()}`,
      { cache: 'no-store' }
    );
    if (!response.ok) return null;
    const status = await response.json();
    return status?.ok ? status : null;
  } catch {
    return null;
  }
}


function inactiveBarGame(available = true) {
  return {
    provider: 'bar',
    available,
    active: false,
    status: available ? 'not_in_lobby' : 'unavailable',
    statusLabel: available ? 'NOT IN LOBBY' : 'BAR UNAVAILABLE',
    playerName: '',
    lobbyName: available ? 'Not in a BAR lobby' : 'BAR status unavailable',
    lobbyTitle: '',
    mode: '',
    mapName: available ? 'Waiting for the next match' : 'The BAR service could not be reached',
    mapFileName: '',
    mapImage: '',
    players: 0,
    maxPlayers: 0,
    spectators: 0,
    gameTime: 0
  };
}

function applyBarFreshness(game = {}) {
  if (!game.active) return game;
  const updatedAt = Date.parse(String(game.updatedAt || ''));
  if (Number.isFinite(updatedAt) && (Date.now() - updatedAt) <= BAR_STATUS_STALE_MS) {
    return game;
  }
  return { ...inactiveBarGame(true), statusStale: true };
}

function mergeCloudBarGame(fileGame = {}, cloudGame = {}) {
  if (!cloudGame || cloudGame.ok !== true) return applyBarFreshness(fileGame);
  if (!cloudGame.active) return { ...inactiveBarGame(cloudGame.available !== false), ...cloudGame };

  const sameMap = (
    String(fileGame.mapFileName || '').trim().toLowerCase()
    && String(fileGame.mapFileName || '').trim().toLowerCase()
      === String(cloudGame.mapFileName || '').trim().toLowerCase()
  ) || (
    String(fileGame.mapName || '').trim().toLowerCase()
    && String(fileGame.mapName || '').trim().toLowerCase()
      === String(cloudGame.mapName || '').trim().toLowerCase()
  );

  return {
    ...fileGame,
    ...cloudGame,
    mapImage: sameMap ? String(fileGame.mapImage || '') : String(cloudGame.mapImage || '')
  };
}

async function fetchCloudBarStatus() {
  const apiBase = await twitchServiceApiBase();
  if (!apiBase) return null;

  try {
    const response = await fetch(
      `${apiBase}/api/bar-status?v=${Date.now()}`,
      { cache: 'no-store' }
    );
    if (!response.ok) return null;
    const status = await response.json();
    return status?.ok ? status : null;
  } catch {
    return null;
  }
}

function normaliseChannel(value) {
  return String(value || 'itsvdb')
    .trim()
    .replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0] || 'itsvdb';
}

function twitchUrlFor(channel, customUrl) {
  if (customUrl && /^https:\/\//i.test(customUrl)) return customUrl;
  return `https://www.twitch.tv/${encodeURIComponent(channel)}`;
}

function twitchEmbedUrl(channel) {
  const host = window.location.hostname || 'localhost';
  const params = new URLSearchParams({
    channel,
    autoplay: 'true',
    muted: 'true'
  });
  params.append('parent', host);
  return `https://player.twitch.tv/?${params.toString()}`;
}

function fitStreamPlayer() {
  const monitor = document.querySelector('.stream-monitor');
  if (!monitor) return;
  const { width, height } = monitor.getBoundingClientRect();
  if (!width || !height) return;
  const scale = Math.max(width / STREAM_EMBED_WIDTH, height / STREAM_EMBED_HEIGHT);
  monitor.style.setProperty('--stream-player-scale', String(scale));
}

function renderStreamMonitor(data) {
  const monitor = document.querySelector('.stream-monitor');
  const player = document.getElementById('stream-player');
  const link = document.getElementById('stream-monitor-link');
  const offline = document.getElementById('stream-offline');
  if (!monitor || !player || !link || !offline) return;

  const isLive = Boolean(data.live);
  const channel = normaliseChannel(data.channel);
  const twitchUrl = twitchUrlFor(channel, data.twitchUrl);

  link.href = twitchUrl;
  link.setAttribute('aria-label', isLive
    ? `Watch ${channel} live on Twitch`
    : `Open ${channel} on Twitch`);

  monitor.classList.toggle('is-live', isLive);
  monitor.classList.toggle('is-offline', !isLive);
  offline.querySelector('span').textContent = 'Offline';

  if (isLive) {
    const embedUrl = twitchEmbedUrl(channel);
    if (player.dataset.embedUrl !== embedUrl) {
      player.src = embedUrl;
      player.dataset.embedUrl = embedUrl;
    }
  } else {
    player.removeAttribute('src');
    delete player.dataset.embedUrl;
  }

  fitStreamPlayer();
  if (!streamResizeObserver && 'ResizeObserver' in window) {
    streamResizeObserver = new ResizeObserver(fitStreamPlayer);
    streamResizeObserver.observe(monitor);
  }
}

function formatViewerCount(value) {
  const viewers = Math.max(0, Math.trunc(Number(value) || 0));
  return `${viewers.toLocaleString()} ${viewers === 1 ? 'viewer' : 'viewers'}`;
}

function renderStatus(data) {
  const card = document.querySelector('.live-status-card');
  const dot = document.getElementById('live-dot');
  const isLive = Boolean(data.live);
  const channel = normaliseChannel(data.channel);
  const streamTitle = isLive
    ? (data.streamTitle || data.title || data.message || 'Live from The Nest')
    : (data.offlineTitle || 'No stream currently live');

  setText('live-status-text', isLive ? 'ONLINE' : 'OFFLINE');
  setText('stream-title', streamTitle);
  setText('channel-name', `@${channel}`);
  setText('viewer-count', formatViewerCount(data.viewers));

  card?.classList.toggle('is-live', isLive);
  card?.classList.toggle('is-offline', !isLive);
  card?.setAttribute(
    'aria-label',
    isLive
      ? `${channel} is online with ${formatViewerCount(data.viewers)}. ${streamTitle}`
      : `${channel} is offline. ${streamTitle}`
  );
  dot?.classList.toggle('is-offline', !isLive);

  renderStreamMonitor(data);
}

function normaliseGameStatus(game) {
  const rawStatus = String(game.status || '').trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  if (rawStatus === 'in_game' || rawStatus === 'playing') return 'in_game';
  if (rawStatus === 'in_lobby' || rawStatus === 'lobby') return 'in_lobby';
  if (rawStatus === 'unavailable' || game.available === false) return 'unavailable';
  return 'not_in_lobby';
}

function formatGamePlayerCount(playersValue, maxPlayersValue) {
  const players = Math.max(0, Math.trunc(Number(playersValue) || 0));
  const maxPlayers = Math.max(0, Math.trunc(Number(maxPlayersValue) || 0));
  if (maxPlayers > 0) return `${players}/${maxPlayers} players`;
  return `${players} ${players === 1 ? 'player' : 'players'}`;
}

function normaliseMapImagePath(value) {
  const path = String(value || '').trim();
  if (!path) return '';
  if (/^https?:\/\//i.test(path) || path.startsWith('/') || path.startsWith('./')) return path;
  return `./${path.replace(/^\/+/, '')}`;
}

function renderGame(game = {}) {
  const card = document.querySelector('.current-game-card');
  const image = document.getElementById('game-map-image');
  const placeholder = document.getElementById('game-map-placeholder');
  const spectators = document.getElementById('game-spectators');
  if (!card || !image || !placeholder || !spectators) return;

  // Keep older twitch.json files readable while Kiwi Birb publishes the first
  // BAR snapshot from the new integration.
  const isLegacyGame = !('active' in game) && (game.title || game.description);
  const status = isLegacyGame ? 'not_in_lobby' : normaliseGameStatus(game);
  const active = isLegacyGame ? false : Boolean(game.active);
  const available = game.available !== false;
  const lobbyName = active
    ? (game.lobbyName || game.title || 'BAR Lobby')
    : (available ? 'Not in a BAR lobby' : 'BAR status unavailable');
  const mapName = active
    ? (game.mapName || game.description || 'Unknown map')
    : (available ? 'Waiting for the next match' : 'Kiwi Birb will try again automatically');
  const statusLabel = game.statusLabel || ({
    in_game: 'IN GAME',
    in_lobby: 'IN LOBBY',
    unavailable: 'BAR UNAVAILABLE',
    not_in_lobby: 'NOT IN LOBBY'
  }[status]);

  card.classList.remove('is-in-game', 'is-in-lobby', 'is-not-in-lobby', 'is-unavailable');
  card.classList.add(`is-${status.replaceAll('_', '-')}`);

  setText('game-status', statusLabel);
  setText('game-lobby-name', lobbyName);
  setText('game-map-name', mapName);
  setText('game-mode', active && game.mode ? String(game.mode).toUpperCase() : '—');
  setText('game-player-count', active
    ? formatGamePlayerCount(game.players, game.maxPlayers)
    : '0 players');

  const spectatorCount = Math.max(0, Math.trunc(Number(game.spectators) || 0));
  spectators.textContent = `${spectatorCount.toLocaleString()} ${spectatorCount === 1 ? 'spectator' : 'spectators'}`;
  spectators.hidden = !active || spectatorCount === 0;

  const imagePath = active ? normaliseMapImagePath(game.mapImage) : '';
  if (imagePath) {
    const imageKey = `${imagePath}|${game.mapName || ''}`;
    if (image.dataset.imageKey !== imageKey) {
      image.hidden = true;
      placeholder.hidden = false;
      image.alt = `${mapName} map preview`;
      image.onload = () => {
        image.hidden = false;
        placeholder.hidden = true;
      };
      image.onerror = () => {
        image.hidden = true;
        placeholder.hidden = false;
      };
      image.src = imagePath;
      image.dataset.imageKey = imageKey;
    } else if (image.complete && image.naturalWidth > 0) {
      image.hidden = false;
      placeholder.hidden = true;
    }
  } else {
    image.removeAttribute('src');
    image.removeAttribute('data-image-key');
    image.alt = '';
    image.hidden = true;
    placeholder.hidden = false;
  }

  const modeText = active && game.mode ? `, ${game.mode}` : '';
  const playerText = active ? `, ${formatGamePlayerCount(game.players, game.maxPlayers)}` : '';
  const fullLobbyTitle = game.lobbyTitle && game.lobbyTitle !== lobbyName
    ? `. Full lobby title: ${game.lobbyTitle}`
    : '';
  card.setAttribute(
    'aria-label',
    `${statusLabel}. ${lobbyName}. ${mapName}${modeText}${playerText}${fullLobbyTitle}`
  );
  card.title = active && game.lobbyTitle ? game.lobbyTitle : '';
}

function formatPredictionOptionLabel(value) {
  const label = String(value || '').trim();
  if (!label) return 'Answer';
  if (label === label.toLowerCase()) {
    return label.replace(/\b\w/g, character => character.toUpperCase());
  }
  return label;
}

function predictionStatusText(prediction, totalPicks) {
  if (!prediction.active) return 'No prediction';
  const pickText = `${totalPicks.toLocaleString()} ${totalPicks === 1 ? 'pick' : 'picks'}`;
  return prediction.status === 'closed' || prediction.closed
    ? `Picks closed • ${pickText}`
    : `Open • ${pickText}`;
}

function renderPrediction(prediction = {}) {
  const card = document.querySelector('.prediction-card');
  const optionsHost = document.getElementById('prediction-options');
  if (!card || !optionsHost) return;

  const active = Boolean(prediction.active);
  const status = prediction.status || (prediction.closed ? 'closed' : 'open');
  const options = Array.isArray(prediction.options) ? prediction.options : [];
  const totalPicks = Math.max(
    0,
    Math.trunc(Number(prediction.totalPicks ?? prediction.total_picks) || 0)
  );

  card.classList.toggle('is-active', active);
  card.classList.toggle('is-inactive', !active);
  card.classList.toggle('is-open', active && status !== 'closed');
  card.classList.toggle('is-closed', active && status === 'closed');

  setText('prediction-timer', predictionStatusText(prediction, totalPicks));
  setText('prediction-question', active
    ? (prediction.question || 'Prediction open')
    : 'No prediction open');
  setText('prediction-prize', active
    ? `Prize: ${Number(prediction.prize ?? prediction.reward ?? 0).toLocaleString()} Shinies ✦`
    : 'Waiting for the next prediction');

  if (!active || !options.length) {
    optionsHost.innerHTML = '';
    card.setAttribute('aria-label', 'No prediction is currently open');
    return;
  }

  optionsHost.innerHTML = options.map(option => {
    const label = formatPredictionOptionLabel(option.label ?? option.option);
    const votes = Math.max(0, Math.trunc(Number(option.votes ?? option.count) || 0));
    const percent = Math.max(0, Math.min(100, Number(option.percent) || 0));
    const displayPercent = Number.isInteger(percent) ? percent : percent.toFixed(1);

    return `
      <div class="prediction-row">
        <span class="prediction-option-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
        <div class="prediction-bar" role="meter" aria-label="${escapeHtml(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
          <span style="width: ${percent}%"></span>
        </div>
        <strong class="prediction-percent">${displayPercent}%</strong>
        <small class="prediction-votes">${votes.toLocaleString()}</small>
      </div>`;
  }).join('');

  const stateText = status === 'closed' ? 'Picks are closed' : 'Picks are open';
  card.setAttribute(
    'aria-label',
    `${prediction.question || 'Current prediction'}. ${stateText}. ${totalPicks} total picks. Prize ${Number(prediction.prize ?? prediction.reward ?? 0).toLocaleString()} Shinies.`
  );
}

function formatClipDuration(value) {
  if (typeof value === 'string' && /^\d+:\d{2}$/.test(value.trim())) {
    return value.trim();
  }

  const totalSeconds = Math.max(0, Math.round(Number(value) || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatClipViews(value) {
  const views = Math.max(0, Math.trunc(Number(value) || 0));
  return `${views.toLocaleString()} ${views === 1 ? 'view' : 'views'}`;
}

function clipSlug(clip = {}) {
  if (clip.id) return String(clip.id).trim();

  const embedMatch = String(clip.embedUrl || clip.embed_url || '').match(/[?&]clip=([^&]+)/i);
  if (embedMatch) return decodeURIComponent(embedMatch[1]);

  const url = String(clip.url || '').replace(/\/+$/, '');
  if (!url) return '';
  return url.split('/').filter(Boolean).pop() || '';
}

function clipEmbedUrl(clip) {
  const slug = clipSlug(clip);
  if (!slug) return '';

  const host = window.location.hostname || 'localhost';
  const params = new URLSearchParams({
    clip: slug,
    parent: host,
    autoplay: 'true'
  });
  return `https://clips.twitch.tv/embed?${params.toString()}`;
}

function normaliseClip(clip = {}) {
  return {
    id: clipSlug(clip),
    title: String(clip.title || 'Untitled clip').trim() || 'Untitled clip',
    url: String(clip.url || '').trim(),
    embedUrl: String(clip.embedUrl || clip.embed_url || '').trim(),
    thumbnailUrl: String(clip.thumbnailUrl || clip.thumbnail_url || '').trim(),
    views: Math.max(0, Math.trunc(Number(clip.views ?? clip.viewCount ?? clip.view_count) || 0)),
    duration: Number(clip.durationSeconds ?? clip.duration) || 0,
    createdAt: String(clip.createdAt || clip.created_at || '').trim()
  };
}

function renderClips(clips = []) {
  const windows = Array.from(document.querySelectorAll('.clip-window'));
  if (!windows.length) return;

  currentClips = (Array.isArray(clips) ? clips : [])
    .map(normaliseClip)
    .filter(clip => clip.id || clip.url || clip.thumbnailUrl)
    .slice(0, 5);

  windows.forEach((windowEl, index) => {
    const clip = currentClips[index];
    const image = windowEl.querySelector('.clip-image');
    const placeholder = windowEl.querySelector('.clip-placeholder');
    const title = windowEl.querySelector('.clip-title');
    const views = windowEl.querySelector('.clip-views');
    const duration = windowEl.querySelector('.clip-duration');

    windowEl.classList.toggle('is-empty', !clip);
    windowEl.disabled = !clip;
    windowEl.dataset.clipIndex = String(index);

    if (!clip) {
      if (image) {
        image.removeAttribute('src');
        image.alt = '';
      }
      if (placeholder) placeholder.textContent = index === 0 ? 'Waiting for Kiwi Birb sync' : 'Waiting for clip';
      if (title) title.textContent = index === 0 ? 'Newest clip' : `Clip ${index + 1}`;
      if (views) views.textContent = '0 views';
      if (duration) duration.textContent = '0:00';
      windowEl.setAttribute('aria-label', `Clip slot ${index + 1} is empty`);
      return;
    }

    if (image) {
      image.src = clip.thumbnailUrl;
      image.alt = `${clip.title} Twitch clip thumbnail`;
    }
    if (placeholder) placeholder.textContent = '';
    if (title) title.textContent = clip.title;
    if (views) views.textContent = formatClipViews(clip.views);
    if (duration) duration.textContent = formatClipDuration(clip.duration);
    windowEl.setAttribute('aria-label', `Play ${clip.title}. ${formatClipViews(clip.views)}.`);
  });
}

function openClipModal(clip) {
  if (!clip) return;

  // Twitch requires embedded players to be at least 400x300. On very small
  // screens, opening the normal Twitch clip page is the safer experience.
  if (window.innerWidth < 440 || window.innerHeight < 420) {
    const externalUrl = clip.url || `https://clips.twitch.tv/${encodeURIComponent(clip.id)}`;
    window.open(externalUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  const modal = document.getElementById('clip-modal');
  const player = document.getElementById('clip-player');
  const title = document.getElementById('clip-modal-title');
  const views = document.getElementById('clip-modal-views');
  const link = document.getElementById('clip-modal-link');
  if (!modal || !player || !title || !views || !link) return;

  const embedUrl = clipEmbedUrl(clip);
  if (!embedUrl) {
    if (clip.url) window.open(clip.url, '_blank', 'noopener,noreferrer');
    return;
  }

  activeClip = clip;
  title.textContent = clip.title;
  views.textContent = formatClipViews(clip.views);
  link.href = clip.url || `https://clips.twitch.tv/${encodeURIComponent(clip.id)}`;
  player.src = embedUrl;
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('clip-modal-open');
  window.requestAnimationFrame(() => modal.classList.add('is-open'));
  document.getElementById('clip-modal-close')?.focus();
}

function closeClipModal() {
  const modal = document.getElementById('clip-modal');
  const player = document.getElementById('clip-player');
  if (!modal || modal.hidden) return;

  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('clip-modal-open');
  if (player) player.removeAttribute('src');
  activeClip = null;

  window.setTimeout(() => {
    if (!modal.classList.contains('is-open')) modal.hidden = true;
  }, 180);
}

function bindClipControls() {
  document.querySelectorAll('.clip-window').forEach(windowEl => {
    windowEl.addEventListener('click', () => {
      const index = Number(windowEl.dataset.clipIndex);
      openClipModal(currentClips[index]);
    });
  });

  document.querySelectorAll('[data-clip-close]').forEach(closeButton => {
    closeButton.addEventListener('click', closeClipModal);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && activeClip) closeClipModal();
  });
}

function renderSync(sync) {
  setText('nest-sync-status', sync.connected ? 'Connected' : 'Disconnected');
  setText('nest-sync-updated', sync.lastUpdated || 'Last updated just now');
  const status = document.getElementById('nest-sync-status');
  status?.classList.toggle('is-connected', Boolean(sync.connected));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderTwitchPage(data) {
  renderStatus(data);
  renderGame(data.game);
  renderClips(data.clips);
}

async function refreshTwitchData() {
  const fileData = await readJson('./data/twitch.json', currentTwitchData);
  const [cloudStatus, cloudBarGame] = await Promise.all([
    fetchCloudTwitchStatus(),
    fetchCloudBarStatus()
  ]);

  const twitchData = cloudStatus
    ? { ...fileData, ...cloudStatus }
    : applyTwitchFreshness(fileData);

  currentTwitchData = {
    ...twitchData,
    game: mergeCloudBarGame(fileData.game || {}, cloudBarGame)
  };

  renderTwitchPage(currentTwitchData);
}

async function refreshPredictionData() {
  currentPredictionData = await readJson('./data/prediction.json', currentPredictionData);
  renderPrediction(currentPredictionData);
}

async function refreshSyncData() {
  currentSyncData = await readJson('./data/nest-sync.json', currentSyncData);
  renderSync(currentSyncData);
}

async function initTwitchPage() {
  bindClipControls();
  await Promise.all([refreshTwitchData(), refreshPredictionData(), refreshSyncData()]);
  window.setInterval(refreshTwitchData, TWITCH_REFRESH_MS);
  window.setInterval(refreshPredictionData, PREDICTION_REFRESH_MS);
  window.setInterval(refreshSyncData, SYNC_REFRESH_MS);
}

initTwitchPage();
