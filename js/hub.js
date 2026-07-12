(() => {
  const syncStatus = document.getElementById('nest-sync-status');
  const syncUpdated = document.getElementById('nest-sync-updated');
  const reaction = document.querySelector('.kiwi-reaction');
  const hotspots = Array.from(document.querySelectorAll('.hotspot'));

  const fallbackSync = {
    connected: true,
    lastUpdated: 'just now'
  };

  loadNestSync();
  setupKiwiReactions();

  async function loadNestSync() {
    let data = fallbackSync;

    try {
      const response = await fetch('./data/nest-sync.json', { cache: 'no-store' });
      if (response.ok) data = await response.json();
    } catch (error) {
      data = fallbackSync;
    }

    const connected = Boolean(data.connected);
    const lastUpdated = data.lastUpdated || 'just now';

    if (syncStatus) {
      syncStatus.textContent = connected ? 'Connected' : 'Disconnected';
      syncStatus.classList.toggle('is-connected', connected);
      syncStatus.classList.toggle('is-disconnected', !connected);
    }

    if (syncUpdated) {
      syncUpdated.textContent = `Last updated ${lastUpdated}`;
    }
  }

  function setupKiwiReactions() {
    if (!reaction || !hotspots.length) return;

    hotspots.forEach(hotspot => {
      hotspot.addEventListener('mouseenter', () => {
        const message = hotspot.dataset.kiwiReaction || 'Welcome home.';
        reaction.dataset.message = message;
        document.body.classList.add('kiwi-reacting');
      });

      hotspot.addEventListener('mouseleave', () => {
        document.body.classList.remove('kiwi-reacting');
      });

      hotspot.addEventListener('focus', () => {
        const message = hotspot.dataset.kiwiReaction || 'Welcome home.';
        reaction.dataset.message = message;
        document.body.classList.add('kiwi-reacting');
      });

      hotspot.addEventListener('blur', () => {
        document.body.classList.remove('kiwi-reacting');
      });
    });
  }
})();
