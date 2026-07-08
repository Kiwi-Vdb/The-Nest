(() => {
  const page = document.querySelector('.welcome-page');
  const hotspots = Array.from(document.querySelectorAll('.hotspot'));
  if (!page || !hotspots.length) return;

  const STORAGE_KEY = `nest-dev-layout:${location.pathname}`;
  const SNAP_STEP = 0.10; // percentage units
  const MIN_SIZE = 1;

  let devOn = false;
  let selected = null;
  let drag = null;
  let snap = false;
  let history = [];
  let historyIndex = -1;
  let defaults = new Map();

  setupHandles();
  createGrid();
  const ui = createPanel();
  const coords = createCoords();
  const toast = createToast();

  hotspots.forEach(h => defaults.set(h, getBox(h)));
  loadBrowserLayout(false);
  pushHistory();

  function setupHandles() {
    hotspots.forEach(h => {
      h.dataset.devId = getId(h);
      ['nw', 'ne', 'sw', 'se'].forEach(corner => {
        const handle = document.createElement('span');
        handle.className = 'dev-resize-handle';
        handle.dataset.corner = corner;
        h.appendChild(handle);
      });
    });
  }

  function createGrid() {
    const grid = document.createElement('div');
    grid.className = 'nest-dev-grid';
    page.appendChild(grid);
  }

  function createCoords() {
    const el = document.createElement('div');
    el.className = 'nest-dev-coords';
    el.textContent = 'x: 0%   y: 0%';
    document.body.appendChild(el);
    return el;
  }

  function createToast() {
    const el = document.createElement('div');
    el.className = 'nest-dev-toast';
    document.body.appendChild(el);
    return el;
  }

  function createPanel() {
    const panel = document.createElement('aside');
    panel.className = 'nest-dev-panel';
    panel.innerHTML = `
      <div class="nest-dev-title">The Nest Dev Editor</div>
      <div class="nest-dev-small">F8 toggles this editor. Drag a hotspot to move it. Drag a corner dot to resize it. Changes are percentage-based, so they scale with the artwork.</div>

      <div class="nest-dev-section">
        <div class="nest-dev-row three">
          <button type="button" data-action="toggle-grid">Grid</button>
          <button type="button" data-action="toggle-coords" class="is-active">Coords</button>
          <button type="button" data-action="toggle-snap">Snap</button>
        </div>
      </div>

      <div class="nest-dev-section">
        <div class="nest-dev-readout" data-readout>No hotspot selected.</div>
        <div class="nest-dev-fields">
          <div class="nest-dev-field"><label>Left %</label><input data-field="left" type="number" step="0.01"></div>
          <div class="nest-dev-field"><label>Top %</label><input data-field="top" type="number" step="0.01"></div>
          <div class="nest-dev-field"><label>Width %</label><input data-field="width" type="number" step="0.01"></div>
          <div class="nest-dev-field"><label>Height %</label><input data-field="height" type="number" step="0.01"></div>
        </div>
        <div class="nest-dev-row">
          <button type="button" data-action="copy-selected">Copy Selected CSS</button>
          <button type="button" data-action="reset-selected">Reset Selected</button>
        </div>
      </div>

      <div class="nest-dev-section">
        <div class="nest-dev-row">
          <button type="button" data-action="save-browser">Save Browser Layout</button>
          <button type="button" data-action="load-browser">Load Browser Layout</button>
        </div>
        <div class="nest-dev-row">
          <button type="button" data-action="copy-all">Copy All CSS</button>
          <button type="button" data-action="download-css">Download CSS Patch</button>
        </div>
        <div class="nest-dev-row">
          <button type="button" data-action="download-json">Download JSON</button>
          <button type="button" data-action="clear-browser">Clear Saved Layout</button>
        </div>
        <div class="nest-dev-row">
          <button type="button" data-action="undo">Undo</button>
          <button type="button" data-action="redo">Redo</button>
        </div>
        <div class="nest-dev-output" data-output>Permanent save: click Copy All CSS, then paste the generated hotspot rules into css/welcome.css.</div>
      </div>

      <div class="nest-dev-section nest-dev-small">
        Keys: Arrow = nudge 0.05%. Shift+Arrow = 0.5%. Ctrl+S = save browser layout. Ctrl+C = copy selected CSS. Esc closes Dev Mode.
      </div>
    `;
    document.body.appendChild(panel);

    panel.addEventListener('click', handlePanelClick);
    panel.querySelectorAll('[data-field]').forEach(input => {
      input.addEventListener('change', applyInputFields);
      input.addEventListener('input', applyInputFields);
    });

    return {
      panel,
      readout: panel.querySelector('[data-readout]'),
      output: panel.querySelector('[data-output]'),
      fields: Object.fromEntries(Array.from(panel.querySelectorAll('[data-field]')).map(i => [i.dataset.field, i]))
    };
  }

  function setDev(on) {
    devOn = on;
    document.body.classList.toggle('nest-dev-on', devOn);
    document.body.classList.toggle('show-coords', devOn);
    if (!devOn) {
      document.body.classList.remove('show-grid');
      clearSelected();
      drag = null;
    } else {
      showToast('Developer Mode On');
    }
  }

  function getId(el) {
    const byClass = Array.from(el.classList).find(c => c.startsWith('hotspot-'));
    return byClass ? byClass.replace('hotspot-', '') : el.dataset.devLabel || 'hotspot';
  }

  function selectorFor(el) {
    const cls = Array.from(el.classList).find(c => c.startsWith('hotspot-'));
    return cls ? `.${cls}` : `.hotspot[data-dev-id="${getId(el)}"]`;
  }

  function pageRect() { return page.getBoundingClientRect(); }

  function getBox(el) {
    const r = pageRect();
    const er = el.getBoundingClientRect();
    return {
      left: ((er.left - r.left) / r.width) * 100,
      top: ((er.top - r.top) / r.height) * 100,
      width: (er.width / r.width) * 100,
      height: (er.height / r.height) * 100
    };
  }

  function setBox(el, box, commit = false) {
    const b = normalizeBox(box);
    el.style.left = `${b.left.toFixed(2)}%`;
    el.style.top = `${b.top.toFixed(2)}%`;
    el.style.width = `${b.width.toFixed(2)}%`;
    el.style.height = `${b.height.toFixed(2)}%`;
    if (selected === el) updatePanel();
    if (commit) pushHistory();
  }

  function normalizeBox(box) {
    let b = {
      left: Number(box.left),
      top: Number(box.top),
      width: Number(box.width),
      height: Number(box.height)
    };
    if (snap) {
      b.left = snapVal(b.left);
      b.top = snapVal(b.top);
      b.width = snapVal(b.width);
      b.height = snapVal(b.height);
    }
    b.width = clamp(b.width, MIN_SIZE, 100);
    b.height = clamp(b.height, MIN_SIZE, 100);
    b.left = clamp(b.left, 0, 100 - b.width);
    b.top = clamp(b.top, 0, 100 - b.height);
    return b;
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function snapVal(v) { return Math.round(v / SNAP_STEP) * SNAP_STEP; }

  function select(el) {
    hotspots.forEach(h => h.classList.remove('is-selected'));
    selected = el;
    selected.classList.add('is-selected');
    updatePanel();
  }

  function clearSelected() {
    hotspots.forEach(h => h.classList.remove('is-selected', 'is-dragging'));
    selected = null;
    updatePanel();
  }

  function updatePanel() {
    if (!selected) {
      ui.readout.textContent = 'No hotspot selected.';
      Object.values(ui.fields).forEach(f => f.value = '');
      return;
    }
    const b = getBox(selected);
    ui.readout.textContent = `${selected.dataset.devLabel || getId(selected)}\nleft: ${b.left.toFixed(2)}%\ntop: ${b.top.toFixed(2)}%\nwidth: ${b.width.toFixed(2)}%\nheight: ${b.height.toFixed(2)}%`;
    ui.fields.left.value = b.left.toFixed(2);
    ui.fields.top.value = b.top.toFixed(2);
    ui.fields.width.value = b.width.toFixed(2);
    ui.fields.height.value = b.height.toFixed(2);
  }

  function applyInputFields() {
    if (!selected || drag) return;
    setBox(selected, {
      left: parseFloat(ui.fields.left.value),
      top: parseFloat(ui.fields.top.value),
      width: parseFloat(ui.fields.width.value),
      height: parseFloat(ui.fields.height.value)
    });
  }

  function commitInputs() {
    if (selected) pushHistory();
  }
  Object.values(ui.fields).forEach(input => input.addEventListener('blur', commitInputs));

  hotspots.forEach(el => {
    el.addEventListener('click', e => {
      if (!devOn) return;
      e.preventDefault();
      e.stopPropagation();
      select(el);
    });

    el.addEventListener('pointerdown', e => {
      if (!devOn) return;
      e.preventDefault();
      e.stopPropagation();
      select(el);

      const r = pageRect();
      const corner = e.target?.dataset?.corner || null;
      drag = {
        el,
        corner,
        startX: e.clientX,
        startY: e.clientY,
        startBox: getBox(el),
        pageW: r.width,
        pageH: r.height
      };
      el.classList.add('is-dragging');
      el.setPointerCapture?.(e.pointerId);
    });
  });

  window.addEventListener('pointermove', e => {
    updateCoords(e);
    if (!devOn || !drag) return;

    const dx = ((e.clientX - drag.startX) / drag.pageW) * 100;
    const dy = ((e.clientY - drag.startY) / drag.pageH) * 100;
    const b = { ...drag.startBox };

    if (!drag.corner) {
      b.left += dx;
      b.top += dy;
    } else {
      if (drag.corner.includes('e')) b.width += dx;
      if (drag.corner.includes('s')) b.height += dy;
      if (drag.corner.includes('w')) {
        b.left += dx;
        b.width -= dx;
      }
      if (drag.corner.includes('n')) {
        b.top += dy;
        b.height -= dy;
      }
    }
    setBox(drag.el, b);
  });

  window.addEventListener('pointerup', () => {
    if (drag) {
      drag.el.classList.remove('is-dragging');
      drag = null;
      pushHistory();
      updatePanel();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'F8') {
      e.preventDefault();
      setDev(!devOn);
      return;
    }
    if (!devOn) return;
    if (e.key === 'Escape') { setDev(false); return; }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveBrowserLayout();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selected) {
      e.preventDefault();
      copy(cssFor(selected), 'Selected CSS copied');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }

    if (selected && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      const step = e.shiftKey ? 0.5 : 0.05;
      const b = getBox(selected);
      if (e.key === 'ArrowLeft') b.left -= step;
      if (e.key === 'ArrowRight') b.left += step;
      if (e.key === 'ArrowUp') b.top -= step;
      if (e.key === 'ArrowDown') b.top += step;
      setBox(selected, b, true);
    }
  });

  function updateCoords(e) {
    if (!devOn || !document.body.classList.contains('show-coords')) return;
    const r = pageRect();
    const x = clamp(((e.clientX - r.left) / r.width) * 100, 0, 100);
    const y = clamp(((e.clientY - r.top) / r.height) * 100, 0, 100);
    coords.textContent = `x: ${x.toFixed(2)}%   y: ${y.toFixed(2)}%`;
  }

  function handlePanelClick(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'toggle-grid') {
      document.body.classList.toggle('show-grid');
      btn.classList.toggle('is-active', document.body.classList.contains('show-grid'));
    }
    if (action === 'toggle-coords') {
      document.body.classList.toggle('show-coords');
      btn.classList.toggle('is-active', document.body.classList.contains('show-coords'));
    }
    if (action === 'toggle-snap') {
      snap = !snap;
      btn.classList.toggle('is-active', snap);
      showToast(snap ? 'Snap On' : 'Snap Off');
    }
    if (action === 'copy-selected') selected ? copy(cssFor(selected), 'Selected CSS copied') : showToast('Select a hotspot first');
    if (action === 'reset-selected') resetSelected();
    if (action === 'save-browser') saveBrowserLayout();
    if (action === 'load-browser') loadBrowserLayout(true);
    if (action === 'clear-browser') clearBrowserLayout();
    if (action === 'copy-all') copy(allCss(), 'All hotspot CSS copied');
    if (action === 'download-css') download('welcome-hotspots-css-patch.css', allCss());
    if (action === 'download-json') download('welcome-hotspot-layout.json', JSON.stringify(getLayout(), null, 2));
    if (action === 'undo') undo();
    if (action === 'redo') redo();
  }

  function getLayout() {
    const layout = {};
    hotspots.forEach(h => layout[getId(h)] = roundBox(getBox(h)));
    return layout;
  }

  function applyLayout(layout) {
    hotspots.forEach(h => {
      const b = layout[getId(h)];
      if (b) setBox(h, b);
    });
    updatePanel();
  }

  function roundBox(b) {
    return {
      left: Number(b.left.toFixed(2)),
      top: Number(b.top.toFixed(2)),
      width: Number(b.width.toFixed(2)),
      height: Number(b.height.toFixed(2))
    };
  }

  function cssFor(el) {
    const b = roundBox(getBox(el));
    return `${selectorFor(el)} {\n  left: ${b.left.toFixed(2)}%;\n  top: ${b.top.toFixed(2)}%;\n  width: ${b.width.toFixed(2)}%;\n  height: ${b.height.toFixed(2)}%;\n}`;
  }

  function allCss() {
    return `/* The Nest Welcome Page hotspot positions.\n   Paste these rules into css/welcome.css, replacing the existing hotspot position rules. */\n\n${hotspots.map(cssFor).join('\n\n')}`;
  }

  function saveBrowserLayout() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getLayout()));
    showOutput('Browser layout saved. This survives refreshes on this computer only. For a permanent project save, use Copy All CSS and paste it into css/welcome.css.');
    showToast('Browser Layout Saved');
  }

  function loadBrowserLayout(showMessage) {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      if (showMessage) showToast('No Browser Layout Found');
      return;
    }
    try {
      applyLayout(JSON.parse(raw));
      pushHistory();
      if (showMessage) showToast('Browser Layout Loaded');
    } catch {
      if (showMessage) showToast('Saved Layout Is Invalid');
    }
  }

  function clearBrowserLayout() {
    localStorage.removeItem(STORAGE_KEY);
    showToast('Browser Layout Cleared');
    showOutput('Saved browser layout cleared. Refresh the page to see only the CSS-defined positions.');
  }

  function resetSelected() {
    if (!selected) { showToast('Select a hotspot first'); return; }
    setBox(selected, defaults.get(selected), true);
    showToast('Selected Reset');
  }

  function pushHistory() {
    const snapshot = JSON.stringify(getLayout());
    if (history[historyIndex] === snapshot) return;
    history = history.slice(0, historyIndex + 1);
    history.push(snapshot);
    historyIndex = history.length - 1;
    if (history.length > 80) {
      history.shift();
      historyIndex--;
    }
  }

  function undo() {
    if (historyIndex <= 0) { showToast('Nothing To Undo'); return; }
    historyIndex--;
    applyLayout(JSON.parse(history[historyIndex]));
    showToast('Undo');
  }

  function redo() {
    if (historyIndex >= history.length - 1) { showToast('Nothing To Redo'); return; }
    historyIndex++;
    applyLayout(JSON.parse(history[historyIndex]));
    showToast('Redo');
  }

  async function copy(text, message = 'Copied') {
    try {
      await navigator.clipboard.writeText(text);
      showOutput(text);
      showToast(message);
    } catch {
      showOutput(`Copy failed. Manually copy this:\n\n${text}`);
      showToast('Copy Failed');
    }
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showOutput(`Downloaded ${filename}.`);
    showToast('Downloaded');
  }

  function showOutput(text) {
    ui.output.textContent = text;
  }

  let toastTimer = null;
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1500);
  }
})();
