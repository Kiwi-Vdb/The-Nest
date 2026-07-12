(() => {
  const LOCAL_DATA_URL = './data/discord.json';
  const SHOP_CONFIG_URL = './data/shop-config.json';
  const SYNC_URL = './data/nest-sync.json';
  const REFRESH_MS = 30_000;

  const membersEl = document.getElementById('discord-members');
  const chatEl = document.getElementById('discord-general-chat');
  const memeEl = document.getElementById('discord-latest-meme');
  const joinEl = document.getElementById('discord-join-link');
  const syncStatusEl = document.getElementById('nest-sync-status');
  const syncUpdatedEl = document.getElementById('nest-sync-updated');
  const memeModalEl = document.getElementById('discord-meme-modal');
  const memeModalImageEl = document.getElementById('discord-meme-modal-image');
  const memeModalCaptionEl = document.getElementById('discord-meme-modal-caption');
  const memeModalAuthorEl = document.getElementById('discord-meme-modal-author');
  const memeModalLinkEl = document.getElementById('discord-meme-modal-link');
  const memeModalCloseEl = document.getElementById('discord-meme-modal-close');

  let apiUrl = null;
  let localFallback = {};
  let lastDiscordData = null;
  let lastSyncData = null;
  let refreshTimer = null;
  let clockTimer = null;

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
  }

  function relativeTime(value) {
    if (!value) return '';
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 45) return 'now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86_400)}d ago`;
  }

  function avatarMarkup(person, className) {
    const avatar = person?.avatarUrl || person?.avatar || '';
    if (avatar) {
      return `<span class="${className}"><img src="${escapeHtml(avatar)}" alt="" loading="lazy"></span>`;
    }
    return `<span class="${className}">${escapeHtml(initials(person?.displayName || person?.name))}</span>`;
  }

  function renderMembers(data) {
    if (!membersEl) return;
    const countValue = data?.membersOnline;
    const totalValue = data?.totalMembers;
    const count = countValue === null || countValue === undefined || countValue === '' ? Number.NaN : Number(countValue);
    const total = totalValue === null || totalValue === undefined || totalValue === '' ? Number.NaN : Number(totalValue);
    const members = Array.isArray(data?.onlineMembers) ? data.onlineMembers.slice(0, 6) : [];

    if (data?.connected === false) {
      membersEl.innerHTML = '<div class="discord-empty-state">Discord is temporarily unavailable.</div>';
      return;
    }

    if (!Number.isFinite(count)) {
      membersEl.innerHTML = '<div class="discord-empty-state">Live member count will appear here once the Discord connection is enabled.</div>';
      return;
    }

    const avatars = members.length
      ? `<div class="member-avatar-row">${members.map((member) => avatarMarkup(member, 'member-avatar')).join('')}</div>`
      : '';
    const totalLine = Number.isFinite(total)
      ? `<div class="members-total-count">of ${total.toLocaleString()} total members</div>`
      : '';

    membersEl.innerHTML = `
      <div class="members-online-count">${count.toLocaleString()}</div>
      <div class="members-online-label">Nestlings online now</div>
      ${totalLine}
      ${avatars}
      <div class="members-online-note">${escapeHtml(data?.membersNote || 'The flock is gathering in Discord.')}</div>`;
  }

  function renderChat(data) {
    if (!chatEl) return;
    const messages = Array.isArray(data?.generalMessages) ? data.generalMessages.slice(0, 6) : [];

    if (data?.connected === false) {
      chatEl.innerHTML = '<div class="discord-empty-state">Live chat is temporarily unavailable.</div>';
      return;
    }

    if (!messages.length) {
      chatEl.innerHTML = '<div class="discord-empty-state">No recent human messages in #general yet.</div>';
      return;
    }

    chatEl.innerHTML = messages.map((message) => `
      <article class="discord-chat-message">
        ${avatarMarkup(message, 'discord-chat-avatar')}
        <div class="discord-chat-author">${escapeHtml(message.displayName || message.author || 'Nestling')}</div>
        <time class="discord-chat-time" datetime="${escapeHtml(message.createdAt || '')}">${escapeHtml(relativeTime(message.createdAt))}</time>
        <div class="discord-chat-copy">${escapeHtml(message.content || '')}</div>
      </article>`).join('');
  }

  function closeMemeModal() {
    if (!memeModalEl) return;
    memeModalEl.hidden = true;
    document.body.classList.remove('discord-modal-open');
    if (memeModalImageEl) memeModalImageEl.removeAttribute('src');
  }

  function openMemeModal(meme) {
    if (!memeModalEl || !meme?.imageUrl) return;
    if (memeModalImageEl) {
      memeModalImageEl.src = meme.imageUrl;
      memeModalImageEl.alt = meme.alt || meme.caption || 'Latest Discord meme';
    }
    if (memeModalCaptionEl) memeModalCaptionEl.textContent = meme.caption || 'Latest meme';
    if (memeModalAuthorEl) {
      const author = meme.displayName || meme.author || 'Nestling';
      const time = relativeTime(meme.createdAt);
      memeModalAuthorEl.textContent = time ? `${author} · ${time}` : author;
    }
    if (memeModalLinkEl) {
      if (meme.messageUrl) {
        memeModalLinkEl.href = meme.messageUrl;
        memeModalLinkEl.hidden = false;
      } else {
        memeModalLinkEl.hidden = true;
      }
    }
    memeModalEl.hidden = false;
    document.body.classList.add('discord-modal-open');
    memeModalCloseEl?.focus();
  }

  function renderMeme(data) {
    if (!memeEl) return;
    const meme = data?.latestMeme;

    if (data?.connected === false) {
      memeEl.innerHTML = '<div class="discord-empty-state">The meme feed is temporarily unavailable.</div>';
      return;
    }

    if (!meme?.imageUrl) {
      memeEl.innerHTML = '<div class="discord-empty-state">No recent image has been posted in the meme channel yet.</div>';
      return;
    }

    memeEl.innerHTML = `
      <button class="latest-meme-media" type="button" aria-label="Expand the latest Discord meme">
        <img src="${escapeHtml(meme.imageUrl)}" alt="${escapeHtml(meme.alt || meme.caption || 'Latest Discord meme')}" loading="lazy">
        <span class="latest-meme-expand">EXPAND</span>
      </button>
      <div class="latest-meme-meta">
        <div>
          <div class="latest-meme-caption">${escapeHtml(meme.caption || 'Latest meme')}</div>
          <div class="latest-meme-author">${escapeHtml(meme.displayName || meme.author || 'Nestling')}</div>
        </div>
        <time class="latest-meme-time" datetime="${escapeHtml(meme.createdAt || '')}">${escapeHtml(relativeTime(meme.createdAt))}</time>
      </div>`;

    memeEl.querySelector('.latest-meme-media')?.addEventListener('click', () => openMemeModal(meme));
  }

  function renderDiscord(data) {
    const merged = { ...localFallback, ...(data || {}) };
    if (!merged.inviteUrl) merged.inviteUrl = joinEl?.getAttribute('href') || '';
    lastDiscordData = merged;
    if (joinEl && merged.inviteUrl) joinEl.href = merged.inviteUrl;
    renderMembers(merged);
    renderChat(merged);
    renderMeme(merged);
  }

  function renderSync(data) {
    lastSyncData = data || {};
    const connected = data?.connected !== false;
    if (syncStatusEl) {
      syncStatusEl.textContent = connected ? 'Connected' : 'Disconnected';
      syncStatusEl.classList.toggle('is-disconnected', !connected);
      syncStatusEl.classList.toggle('is-connected', connected);
    }
    if (syncUpdatedEl) {
      if (data?.updatedAt) {
        syncUpdatedEl.textContent = `Last updated ${relativeTime(data.updatedAt)}`;
      } else if (data?.lastUpdated) {
        const value = String(data.lastUpdated);
        syncUpdatedEl.textContent = value.toLowerCase().startsWith('last updated')
          ? value
          : `Last updated ${value}`;
      } else {
        syncUpdatedEl.textContent = 'Last updated just now';
      }
    }
  }

  async function fetchJson(rawUrl) {
    const target = new URL(rawUrl, window.location.href);
    target.searchParams.set('_', Date.now().toString());
    const response = await fetch(target.toString(), { cache: 'no-store' });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok || data?.ok === false) {
      throw new Error(data?.message || `${response.status} ${response.statusText}`);
    }
    return data;
  }

  async function loadConfiguration() {
    const [localResult, configResult] = await Promise.allSettled([
      fetchJson(LOCAL_DATA_URL),
      fetchJson(SHOP_CONFIG_URL),
    ]);

    if (localResult.status === 'fulfilled') localFallback = localResult.value || {};
    renderDiscord(localFallback);

    if (configResult.status !== 'fulfilled') return;
    const config = configResult.value || {};
    const base = String(config.apiBase || '').trim().replace(/\/$/, '');
    if (config.enabled && base.startsWith('https://') && !base.includes('YOUR-WORKER')) {
      apiUrl = `${base}/api/discord`;
    }
  }

  async function refresh() {
    const discordSource = apiUrl || LOCAL_DATA_URL;
    const [discordResult, syncResult] = await Promise.allSettled([
      fetchJson(discordSource),
      fetchJson(SYNC_URL),
    ]);

    if (discordResult.status === 'fulfilled') {
      renderDiscord(discordResult.value);
    } else if (apiUrl) {
      renderDiscord({ connected: false });
    } else if (!lastDiscordData) {
      renderDiscord(localFallback);
    }

    if (syncResult.status === 'fulfilled') {
      renderSync(syncResult.value);
    } else if (!lastSyncData) {
      renderSync({ connected: false });
    }
  }

  async function initialise() {
    await loadConfiguration();
    await refresh();
    refreshTimer = window.setInterval(refresh, REFRESH_MS);
    clockTimer = window.setInterval(() => {
      if (lastDiscordData) renderDiscord(lastDiscordData);
      if (lastSyncData) renderSync(lastSyncData);
    }, 30_000);
  }

  memeModalCloseEl?.addEventListener('click', closeMemeModal);
  memeModalEl?.addEventListener('click', (event) => {
    if (event.target === memeModalEl) closeMemeModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && memeModalEl && !memeModalEl.hidden) closeMemeModal();
  });
  window.addEventListener('beforeunload', () => {
    window.clearInterval(refreshTimer);
    window.clearInterval(clockTimer);
  });

  initialise();
})();
