(() => {
  const page = document.querySelector('.nest-art-page, .welcome-page, .community-page, .hub-page, .shop-page');
  if (!page) return;

  const STORAGE_KEY = `nest-dev-layout:${location.pathname}`;
  const SNAP_STEP = 0.10;
  const MIN_SIZE = 1;

  let devOn = false;
  let selected = null;
  let drag = null;
  let snap = false;
  let history = [];
  let historyIndex = -1;
  const defaults = new Map();
  const defaultScales = new Map();

  let targets = getTargets();
  if (!targets.length) return;

  setupTargets();
  createGrid();
  const ui = createPanel();
  const coords = createCoords();
  const toast = createToast();

  targets.forEach(t => {
    defaults.set(t, getBox(t));
    defaultScales.set(t, getScale(t));
  });
  pushHistory();
  void initialisePublishedLayout();

  function getTargets() {
    const found = Array.from(page.querySelectorAll('.hotspot, .dev-editable, [data-dev-id]'));
    return found.filter(el => !el.closest('.nest-dev-panel') && el !== page);
  }

  function setupTargets() {
    targets.forEach(el => {
      el.classList.add('nest-dev-target');
      if (!el.dataset.devId) el.dataset.devId = inferId(el);
      if (!el.dataset.devLabel) el.dataset.devLabel = labelFromId(el.dataset.devId);
      if (getComputedStyle(el).position === 'static') el.style.position = 'absolute';

      if (!el.querySelector(':scope > .dev-resize-handle')) {
        ['nw', 'ne', 'sw', 'se'].forEach(corner => {
          const handle = document.createElement('span');
          handle.className = 'dev-resize-handle';
          handle.dataset.corner = corner;
          handle.setAttribute('aria-hidden', 'true');
          el.appendChild(handle);
        });
      }

      el.addEventListener('click', e => {
        if (!devOn) return;
        e.preventDefault();
        e.stopPropagation();
        select(el);
      });

      el.addEventListener('pointerdown', e => {
        if (!devOn) return;
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        select(el);
        const r = pageRect();
        drag = {
          el,
          corner: e.target?.dataset?.corner || null,
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
      <div class="nest-dev-title">The Nest UI Editor</div>
      <div class="nest-dev-small">F8 toggles this editor. Click any outlined item, then drag to move or drag a corner dot to resize. The readout now shows both the editor ID and the exact CSS selector.</div>

      <div class="nest-dev-section">
        <div class="nest-dev-row three">
          <button type="button" data-action="toggle-grid">Grid</button>
          <button type="button" data-action="toggle-coords" class="is-active">Coords</button>
          <button type="button" data-action="toggle-snap">Snap</button>
        </div>
      </div>

      <div class="nest-dev-section">
        <div class="nest-dev-readout" data-readout>No item selected.</div>
        <div class="nest-dev-fields">
          <div class="nest-dev-field"><label>Left %</label><input data-field="left" type="number" step="0.01"></div>
          <div class="nest-dev-field"><label>Top %</label><input data-field="top" type="number" step="0.01"></div>
          <div class="nest-dev-field"><label>Width %</label><input data-field="width" type="number" step="0.01"></div>
          <div class="nest-dev-field"><label>Height %</label><input data-field="height" type="number" step="0.01"></div>
          <div class="nest-dev-field nest-dev-scale-field"><label>Content Scale %</label><input data-field="scale" type="number" step="1" min="25" max="300"></div>
        </div>
        <div class="nest-dev-row">
          <button type="button" data-action="copy-selected">Copy Selected Override</button>
          <button type="button" data-action="reset-selected">Reset Selected</button>
        </div>
      </div>

      <div class="nest-dev-section">
        <div class="nest-dev-row">
          <button type="button" data-action="save-browser">Save Draft Locally</button>
          <button type="button" data-action="load-browser">Load Local Draft</button>
        </div>
        <div class="nest-dev-row">
          <button type="button" data-action="publish-layout">Publish For Everyone</button>
          <button type="button" data-action="load-published">Load Published</button>
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
        <div class="nest-dev-output" data-output>Use Save Draft Locally while positioning. When finished, click Publish For Everyone. Published layouts are stored securely and load for every visitor. CSS export remains available as a backup.</div>
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
      input.addEventListener('blur', () => { if (selected) pushHistory(); });
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

  function usableClasses(el) {
    const generic = new Set([
      'hotspot', 'nav-hotspot', 'dev-editable', 'nest-dev-target',
      'is-selected', 'is-dragging', 'is-current'
    ]);

    return Array.from(el.classList).filter(c => !generic.has(c) && !c.startsWith('dev-'));
  }

  function bestClass(el) {
    const classes = usableClasses(el);
    const priority = [
      c => c.startsWith('nav-') && c !== 'nav-hotspot',
      c => c.includes('hotspot') && c !== 'hotspot',
      c => c.startsWith(`${pageName()}-`),
      c => c.includes('panel'),
      c => c.includes('card'),
      c => c.includes('goal'),
      c => c.includes('sync'),
      c => c.includes('items'),
      c => c.includes('balance'),
      c => c.includes('daily'),
      c => c.includes('seller')
    ];

    for (const test of priority) {
      const match = classes.find(test);
      if (match) return match;
    }
    return classes[0] || null;
  }

  function slugFromText(text) {
    return String(text || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function inferId(el) {
    if (el.id) return el.id;
    if (el.dataset.devId) return el.dataset.devId;

    const cls = bestClass(el);
    if (cls) return cls;

    const label = slugFromText(el.dataset.devLabel || el.getAttribute('aria-label') || el.textContent);
    return label || `dev-item-${targets.indexOf(el) + 1}`;
  }

  function getId(el) { return el.dataset.devId || inferId(el); }
  function labelFromId(id) { return String(id).replace(/[-_]/g, ' ').toUpperCase(); }

  function selectorFor(el) {
    if (el.dataset.devSelector) return el.dataset.devSelector;
    if (el.id) return `#${el.id}`;

    const cls = bestClass(el);
    if (cls) return `.${cls}`;

    if (el.dataset.devId) return `[data-dev-id="${el.dataset.devId}"]`;
    return `[data-dev-id="${getId(el)}"]`;
  }

  function pageRect() { return page.getBoundingClientRect(); }

  function scaleVarFor(el) {
    return el?.dataset?.devScaleVar || "";
  }

  function getScale(el) {
    const variable = scaleVarFor(el);
    if (!variable) return 1;
    const raw = getComputedStyle(el).getPropertyValue(variable).trim();
    const value = parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  function setScale(el, value) {
    const variable = scaleVarFor(el);
    if (!variable) return;
    const scale = clamp(Number(value), 0.25, 3);
    el.style.setProperty(variable, scale.toFixed(2));
    if (selected === el) updatePanel();
  }

  function getBox(el) {
    const r = pageRect();
    const style = getComputedStyle(el);
    const leftPx = parseFloat(style.left);
    const topPx = parseFloat(style.top);
    const widthPx = parseFloat(style.width);
    const heightPx = parseFloat(style.height);

    // Use the element's actual CSS layout values rather than getBoundingClientRect().
    // This deliberately ignores hover transforms such as translateY(), which used
    // to make the editor readout disagree with the values in the CSS file.
    if ([leftPx, topPx, widthPx, heightPx].every(Number.isFinite)) {
      return {
        left: (leftPx / r.width) * 100,
        top: (topPx / r.height) * 100,
        width: (widthPx / r.width) * 100,
        height: (heightPx / r.height) * 100
      };
    }

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
    Object.keys(b).forEach(k => { if (!Number.isFinite(b[k])) b[k] = 0; });
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
    targets.forEach(t => t.classList.remove('is-selected'));
    selected = el;
    selected.classList.add('is-selected');
    updatePanel();
  }

  function clearSelected() {
    targets.forEach(t => t.classList.remove('is-selected', 'is-dragging'));
    selected = null;
    updatePanel();
  }

  function updatePanel() {
    if (!selected) {
      ui.readout.textContent = 'No item selected.';
      Object.values(ui.fields).forEach(f => {
        f.value = '';
        f.disabled = f.dataset.field === 'scale';
      });
      return;
    }
    const b = getBox(selected);
    const scaleVariable = scaleVarFor(selected);
    const scale = getScale(selected);
    const label = selected.dataset.devLabel || labelFromId(getId(selected));
    const selector = selectorFor(selected);
    const classes = Array.from(selected.classList)
      .filter(name => !name.startsWith('nest-dev-') && !name.startsWith('dev-') && !['is-selected', 'is-dragging'].includes(name))
      .map(name => `.${name}`)
      .join(' ');
    ui.readout.textContent = `Name: ${label}
Editor ID: ${getId(selected)}
CSS selector: ${selector}
HTML classes: ${classes || '(none)'}
Values: CSS layout (visual transforms ignored)

left: ${b.left.toFixed(2)}%
top: ${b.top.toFixed(2)}%
width: ${b.width.toFixed(2)}%
height: ${b.height.toFixed(2)}%
content scale: ${scaleVariable ? `${Math.round(scale * 100)}% (${scaleVariable})` : 'not available for this item'}`;
    ui.fields.left.value = b.left.toFixed(2);
    ui.fields.top.value = b.top.toFixed(2);
    ui.fields.width.value = b.width.toFixed(2);
    ui.fields.height.value = b.height.toFixed(2);
    ui.fields.scale.value = scaleVariable ? String(Math.round(scale * 100)) : '';
    ui.fields.scale.disabled = !scaleVariable;
  }

  function applyInputFields() {
    if (!selected || drag) return;
    setBox(selected, {
      left: parseFloat(ui.fields.left.value),
      top: parseFloat(ui.fields.top.value),
      width: parseFloat(ui.fields.width.value),
      height: parseFloat(ui.fields.height.value)
    });
    if (scaleVarFor(selected) && ui.fields.scale.value !== '') {
      setScale(selected, parseFloat(ui.fields.scale.value) / 100);
    }
  }

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
      if (drag.corner.includes('w')) { b.left += dx; b.width -= dx; }
      if (drag.corner.includes('n')) { b.top += dy; b.height -= dy; }
    }
    setBox(drag.el, b);
  });

  window.addEventListener('pointerup', () => {
    if (!drag) return;
    drag.el.classList.remove('is-dragging');
    drag = null;
    pushHistory();
    updatePanel();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'F8') { e.preventDefault(); setDev(!devOn); return; }
    if (!devOn) return;
    if (e.key === 'Escape') { setDev(false); return; }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault(); saveBrowserLayout(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selected) {
      e.preventDefault(); copy(selectedCss(selected), 'Selected override copied'); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault(); e.shiftKey ? redo() : undo(); return;
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

  async function handlePanelClick(e) {
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
    if (action === 'copy-selected') selected ? copy(selectedCss(selected), 'Selected override copied') : showToast('Select an item first');
    if (action === 'reset-selected') resetSelected();
    if (action === 'save-browser') saveBrowserLayout();
    if (action === 'load-browser') loadBrowserLayout(true);
    if (action === 'publish-layout') await publishCurrentLayout();
    if (action === 'load-published') await loadPublishedLayout(true);
    if (action === 'clear-browser') clearBrowserLayout();
    if (action === 'copy-all') copy(allCss(), 'All CSS copied');
    if (action === 'download-css') download(`${pageName()}-f8-layout-overrides.css`, allCss());
    if (action === 'download-json') download(`${pageName()}-dev-layout.json`, JSON.stringify(getLayout(), null, 2));
    if (action === 'undo') undo();
    if (action === 'redo') redo();
  }

  function pageName() {
    return (location.pathname.split('/').pop() || 'index').replace(/\.html$/i, '') || 'index';
  }

  function getLayout() {
    const layout = {};
    targets.forEach(t => {
      const entry = roundBox(getBox(t));
      if (scaleVarFor(t)) entry.scale = Number(getScale(t).toFixed(2));
      layout[getId(t)] = entry;
    });
    return layout;
  }

  function applyLayout(layout) {
    targets.forEach(t => {
      const b = layout[getId(t)];
      if (b) {
        setBox(t, b);
        if (scaleVarFor(t) && Number.isFinite(Number(b.scale))) setScale(t, Number(b.scale));
      }
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
    const label = el.dataset.devLabel || labelFromId(getId(el));
    const scaleVariable = scaleVarFor(el);
    const scaleLine = scaleVariable ? `\n  ${scaleVariable}: ${getScale(el).toFixed(2)};` : "";
    return `/* F8: ${label} | editor ID: ${getId(el)} */
${selectorFor(el)} {
  left: ${b.left.toFixed(2)}%;
  top: ${b.top.toFixed(2)}%;
  width: ${b.width.toFixed(2)}%;
  height: ${b.height.toFixed(2)}%;${scaleLine}
}`;
  }

  function selectedCss(el) {
    return `/* Paste this rule at the VERY BOTTOM of css/${pageName()}.css.
   Do not replace the original selector block; this overrides position and size only. */

${cssFor(el)}`;
  }

  function allCss() {
    const pageId = pageName().toUpperCase();
    return `/* === THE NEST F8 LAYOUT OVERRIDES: ${pageId} START ===
   Paste this entire block at the VERY BOTTOM of css/${pageName()}.css.
   These rules override position, size, and supported content-scale variables; they do not remove backgrounds,
   borders, animation, typography, hover effects, or other existing styling.
   On the next export, replace only the previous block between these markers. */

${targets.map(cssFor).join('\n\n')}

/* === THE NEST F8 LAYOUT OVERRIDES: ${pageId} END === */`;
  }


  let serviceConfigPromise = null;

  async function serviceApiBase() {
    if (!serviceConfigPromise) {
      serviceConfigPromise = fetch(`./data/shop-config.json?v=${Date.now()}`, {
        cache: 'no-store'
      })
        .then(response => {
          if (!response.ok) throw new Error('Shop service configuration not found');
          return response.json();
        })
        .then(config => String(config.apiBase || '').replace(/\/+$/, ''))
        .catch(() => '');
    }
    return serviceConfigPromise;
  }

  async function initialisePublishedLayout() {
    await loadPublishedLayout(false);
    // A local browser draft is intentionally applied last so the owner can
    // keep editing without changing what visitors see until Publish is clicked.
    loadBrowserLayout(false);
    pushHistory();
  }

  async function loadPublishedLayout(showMessage = false) {
    const apiBase = await serviceApiBase();
    if (!apiBase) {
      if (showMessage) {
        showToast('Layout Service Not Configured');
        showOutput('The published-layout service could not be found. Check data/shop-config.json.');
      }
      return false;
    }

    try {
      const response = await fetch(
        `${apiBase}/api/layout?page=${encodeURIComponent(pageName())}&v=${Date.now()}`,
        { cache: 'no-store' }
      );
      if (!response.ok) throw new Error(`Layout service returned ${response.status}`);
      const result = await response.json();

      if (!result.layout) {
        if (showMessage) {
          showToast('No Published Layout');
          showOutput('No global F8 layout has been published for this page yet.');
        }
        return false;
      }

      applyLayout(result.layout);
      pushHistory();
      if (showMessage) {
        showToast('Published Layout Loaded');
        showOutput('The globally published layout has been loaded.');
      }
      return true;
    } catch (error) {
      if (showMessage) {
        showToast('Published Layout Failed');
        showOutput(`Could not load the published layout: ${error.message || error}`);
      }
      return false;
    }
  }

  async function publishCurrentLayout() {
    const apiBase = await serviceApiBase();
    if (!apiBase) {
      showToast('Layout Service Not Configured');
      showOutput('The published-layout service could not be found. Check data/shop-config.json.');
      return;
    }

    const token = localStorage.getItem('the-nest-shop-token');
    if (!token) {
      showToast('Sign In Required');
      showOutput('Sign in with Twitch on the Shop or My Nest page first, then return here and click Publish For Everyone.');
      return;
    }

    try {
      const response = await fetch(
        `${apiBase}/api/layout?page=${encodeURIComponent(pageName())}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ layout: getLayout() })
        }
      );

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message || result.error || `Layout service returned ${response.status}`);
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(getLayout()));
      showToast('Published For Everyone');
      showOutput('This page layout is now global. New visitors and friends will receive these positions automatically.');
    } catch (error) {
      showToast('Publish Failed');
      showOutput(`Could not publish this layout: ${error.message || error}`);
    }
  }

  function saveBrowserLayout() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getLayout()));
    showOutput('Local draft saved on this browser only. Click Publish For Everyone when the layout is ready for visitors.');
    showToast('Local Draft Saved');
  }

  function loadBrowserLayout(showMessage) {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { if (showMessage) showToast('No Local Draft Found'); return; }
    try {
      applyLayout(JSON.parse(raw));
      pushHistory();
      if (showMessage) showToast('Local Draft Loaded');
    } catch {
      if (showMessage) showToast('Saved Layout Is Invalid');
    }
  }

  function clearBrowserLayout() {
    localStorage.removeItem(STORAGE_KEY);
    showToast('Local Draft Cleared');
    showOutput('Local draft cleared. Refresh the page to load the published layout, or the CSS defaults when no layout has been published.');
  }

  function resetSelected() {
    if (!selected) { showToast('Select an item first'); return; }
    setBox(selected, defaults.get(selected));
    if (scaleVarFor(selected)) setScale(selected, defaultScales.get(selected) || 1);
    pushHistory();
    showToast('Selected Reset');
  }

  function pushHistory() {
    const snapshot = JSON.stringify(getLayout());
    if (history[historyIndex] === snapshot) return;
    history = history.slice(0, historyIndex + 1);
    history.push(snapshot);
    historyIndex = history.length - 1;
    if (history.length > 80) { history.shift(); historyIndex--; }
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

  function showOutput(text) { ui.output.textContent = text; }

  let toastTimer = null;
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1500);
  }
})();
