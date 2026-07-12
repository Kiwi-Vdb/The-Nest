(() => {
  const DATA_URL = './data/discord.json';
  const SYNC_URL = './data/nest-sync.json';
  const REFRESH_MS = 30_000;

  const membersEl = document.getElementById('discord-members');
  const chatEl = document.getElementById('discord-general-chat');
  const memeEl = document.getElementById('discord-latest-meme');
  const joinEl = document.getElementById('discord-join-link');
  const syncStatusEl = document.getElementById('nest-sync-status');
  const syncUpdatedEl = document.getElementById('nest-sync-updated');

  let lastDiscordData = null;
  let lastSyncData = null;

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
    const count = Number(data?.membersOnline);
    const members = Array.isArray(data?.onlineMembers) ? data.onlineMembers.slice(0, 6) : [];

    if (!Number.isFinite(count)) {
      membersEl.innerHTML = `
        <div class="discord-empty-state">
          Live member count will appear here once the Discord connection is enabled.
        </div>`;
      return;
    }

    const avatars = members.length
      ? `<div class="member-avatar-row">${members.map((member) => avatarMarkup(member, 'member-avatar')).join('')}</div>`
      : '';

    membersEl.innerHTML = `
      <div class="members-online-count">${count.toLocaleString()}</div>
      <div class="members-online-label">Nestlings online now</div>
      ${avatars}
      <div class="members-online-note">${escapeHtml(data?.membersNote || 'The flock is gathering in Discord.')}</div>`;
  }

  function renderChat(data) {
    const messages = Array.isArray(data?.generalMessages) ? data.generalMessages.slice(0, 6) : [];
    if (!messages.length) {
      chatEl.innerHTML = `
        <div class="discord-empty-state">
          Live #general messages will appear here once the Discord connection is enabled.
        </div>`;
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

  function renderMeme(data) {
    const meme = data?.latestMeme;
    if (!meme?.imageUrl) {
      memeEl.innerHTML = `
        <div class="discord-empty-state">
          The newest image from the meme channel will appear here once Discord is connected.
        </div>`;
      return;
    }

    const image = `<img src="${escapeHtml(meme.imageUrl)}" alt="${escapeHtml(meme.alt || meme.caption || 'Latest Discord meme')}" loading="lazy">`;
    const media = meme.messageUrl
      ? `<a class="latest-meme-media" href="${escapeHtml(meme.messageUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open the latest meme in Discord">${image}</a>`
      : `<div class="latest-meme-media">${image}</div>`;

    memeEl.innerHTML = `
      ${media}
      <div class="latest-meme-meta">
        <div>
          <div class="latest-meme-caption">${escapeHtml(meme.caption || 'Latest meme')}</div>
          <div class="latest-meme-author">${escapeHtml(meme.displayName || meme.author || 'Nestling')}</div>
        </div>
        <time class="latest-meme-time" datetime="${escapeHtml(meme.createdAt || '')}">${escapeHtml(relativeTime(meme.createdAt))}</time>
      </div>`;
  }

  function renderDiscord(data) {
    lastDiscordData = data || {};
    const inviteUrl = data?.inviteUrl || 'https://discord.gg/KGE8Q6GW6a';
    if (joinEl) joinEl.href = inviteUrl;
    renderMembers(data);
    renderChat(data);
    renderMeme(data);
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

  async function fetchJson(url) {
    const response = await fetch(`${url}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  }

  async function refresh() {
    const [discordResult, syncResult] = await Promise.allSettled([
      fetchJson(DATA_URL),
      fetchJson(SYNC_URL)
    ]);

    if (discordResult.status === 'fulfilled') {
      renderDiscord(discordResult.value);
    } else if (!lastDiscordData) {
      renderDiscord({});
    }

    if (syncResult.status === 'fulfilled') {
      renderSync(syncResult.value);
    } else if (!lastSyncData) {
      renderSync({ connected: false });
    }
  }

  refresh();
  window.setInterval(refresh, REFRESH_MS);
  window.setInterval(() => {
    if (lastDiscordData) renderDiscord(lastDiscordData);
    if (lastSyncData) renderSync(lastSyncData);
  }, 30_000);
})();
