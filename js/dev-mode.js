(() => {
  "use strict";

  const page = document.querySelector(
    ".nest-art-page, .welcome-page, .community-page, .hub-page, .shop-page"
  );
  if (!page) return;

  const PAGE_NAME = (location.pathname.split("/").pop() || "index")
    .replace(/\.html$/i, "") || "index";
  const STORAGE_KEY = `nest-f8-draft-v2:${PAGE_NAME}`;
  const LEGACY_STORAGE_KEY = `nest-dev-layout:${location.pathname}`;
  const PANEL_SIDE_KEY = "nest-f8-panel-side";
  const LOCAL_EDITOR_ORIGIN = "http://127.0.0.1:8765";
  const SNAP_STEP = 0.1;
  const MIN_SIZE = 0.5;
  const DRAFT_DELAY_MS = 220;

  let editorOpen = false;
  let selected = null;
  let interaction = null;
  let snapEnabled = false;
  let history = [];
  let historyIndex = -1;
  let draftTimer = null;
  let dirty = false;
  let publishing = false;
  let lastPublishedLayout = null;
  let lastPublishedSnapshot = "";
  let serviceConfigPromise = null;
  let toastTimer = null;

  const defaults = new Map();
  const defaultScales = new Map();
  const targets = findTargets();
  if (!targets.length) return;

  setupTargets();
  const grid = createGrid();
  const selectionOverlay = createSelectionOverlay();
  const ui = createPanel();
  const toast = createToast();

  targets.forEach((target) => {
    defaults.set(target, getBox(target));
    defaultScales.set(target, getScale(target));
  });

  bindGlobalEvents();
  void initialiseEditor();

  function findTargets() {
    return Array.from(
      page.querySelectorAll(".hotspot, .dev-editable, [data-dev-id]")
    ).filter((element) => element !== page && !element.closest(".nest-f8-panel"));
  }

  function setupTargets() {
    targets.forEach((element, index) => {
      element.classList.add("nest-f8-target");
      element.dataset.devId = safeLayoutId(
        element.dataset.devId || inferId(element, index),
        index
      );
      if (!element.dataset.devLabel) {
        element.dataset.devLabel = labelFromId(element.dataset.devId);
      }
      if (getComputedStyle(element).position === "static") {
        element.style.position = "absolute";
      }

      element.addEventListener("pointerdown", (event) => {
        if (!editorOpen || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        selectTarget(element);
        beginInteraction(element, "move", event);
      });

      element.addEventListener("click", (event) => {
        if (!editorOpen) return;
        event.preventDefault();
        event.stopPropagation();
      });
    });
  }

  function createGrid() {
    const element = document.createElement("div");
    element.className = "nest-f8-grid";
    element.setAttribute("aria-hidden", "true");
    page.appendChild(element);
    return element;
  }

  function createSelectionOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "nest-f8-selection";
    overlay.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "nest-f8-selection-label";
    overlay.appendChild(label);

    ["n", "ne", "e", "se", "s", "sw", "w", "nw"].forEach((edge) => {
      const handle = document.createElement("span");
      handle.className = "nest-f8-resize-handle";
      handle.dataset.resizeEdge = edge;
      handle.addEventListener("pointerdown", (event) => {
        if (!editorOpen || !selected || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        beginInteraction(selected, edge, event);
      });
      overlay.appendChild(handle);
    });

    page.appendChild(overlay);
    return overlay;
  }

  function createToast() {
    const element = document.createElement("div");
    element.className = "nest-f8-toast";
    element.setAttribute("role", "status");
    element.setAttribute("aria-live", "polite");
    document.body.appendChild(element);
    return element;
  }

  function createPanel() {
    const panel = document.createElement("aside");
    panel.className = "nest-f8-panel";
    panel.setAttribute("aria-label", "The Nest layout editor");
    panel.innerHTML = `
      <header class="nest-f8-panel-header">
        <div>
          <div class="nest-f8-eyebrow">The Nest</div>
          <div class="nest-f8-title">Layout Editor</div>
          <div class="nest-f8-page-name">${escapeHtml(PAGE_NAME)} page</div>
        </div>
        <div class="nest-f8-header-actions">
          <button type="button" class="nest-f8-icon-button" data-action="dock" title="Move editor to the other side" aria-label="Move editor to the other side">⇆</button>
          <button type="button" class="nest-f8-icon-button" data-action="close" title="Close editor" aria-label="Close editor">×</button>
        </div>
      </header>

      <div class="nest-f8-status" data-status data-tone="quiet">
        <span class="nest-f8-status-dot"></span>
        <span data-status-text>Loading the published layout…</span>
      </div>

      <button type="button" class="nest-f8-publish" data-action="publish">
        <span data-publish-label>Save &amp; Publish</span>
        <small>Save for everyone and push to GitHub</small>
      </button>

      <section class="nest-f8-section">
        <label class="nest-f8-select-label" for="nest-f8-target-select">Editing</label>
        <select id="nest-f8-target-select" data-target-select>
          <option value="">Choose a button or window…</option>
          ${targets.map((target) => `
            <option value="${escapeHtml(getId(target))}">${escapeHtml(targetLabel(target))}</option>
          `).join("")}
        </select>

        <div class="nest-f8-fields">
          <label><span>X position</span><input data-field="left" type="number" step="0.01" inputmode="decimal"></label>
          <label><span>Y position</span><input data-field="top" type="number" step="0.01" inputmode="decimal"></label>
          <label><span>Width</span><input data-field="width" type="number" step="0.01" inputmode="decimal"></label>
          <label><span>Height</span><input data-field="height" type="number" step="0.01" inputmode="decimal"></label>
          <label class="nest-f8-scale-field"><span>Content scale</span><input data-field="scale" type="number" step="1" min="25" max="300" inputmode="decimal"></label>
        </div>

        <div class="nest-f8-hint" data-selection-hint>Select an outlined item, then drag it. Use the handles to resize.</div>

        <div class="nest-f8-button-row">
          <button type="button" data-action="undo">Undo</button>
          <button type="button" data-action="redo">Redo</button>
          <button type="button" data-action="reset-selected">Reset item</button>
        </div>
      </section>

      <section class="nest-f8-section nest-f8-view-tools">
        <button type="button" data-action="grid">Grid</button>
        <button type="button" data-action="snap">Snap</button>
        <button type="button" data-action="reset-page">Reset page</button>
      </section>

      <details class="nest-f8-advanced">
        <summary>Advanced &amp; backups</summary>
        <div class="nest-f8-advanced-body">
          <div class="nest-f8-button-grid">
            <button type="button" data-action="reload-published">Reload published</button>
            <button type="button" data-action="discard-draft">Discard draft</button>
            <button type="button" data-action="copy-selected">Copy item CSS</button>
            <button type="button" data-action="copy-all">Copy all CSS</button>
            <button type="button" data-action="download-css">Download CSS</button>
            <button type="button" data-action="download-json">Download JSON</button>
          </div>
          <pre class="nest-f8-output" data-output>Advanced tools are optional. Your draft saves automatically while you edit.</pre>
        </div>
      </details>

      <footer class="nest-f8-footer">
        F8 closes · Ctrl+S publishes · Arrows nudge · Shift moves faster
      </footer>
    `;
    document.body.appendChild(panel);

    const fields = Object.fromEntries(
      Array.from(panel.querySelectorAll("[data-field]")).map((input) => [input.dataset.field, input])
    );
    const targetSelect = panel.querySelector("[data-target-select]");

    panel.addEventListener("click", handlePanelClick);
    targetSelect.addEventListener("change", () => {
      const target = targets.find((item) => getId(item) === targetSelect.value);
      if (target) selectTarget(target);
      else clearSelection();
    });

    Object.values(fields).forEach((input) => {
      input.addEventListener("input", applyFieldValues);
      input.addEventListener("change", () => {
        applyFieldValues();
        pushHistory();
      });
      input.addEventListener("blur", pushHistory);
    });

    const savedSide = localStorage.getItem(PANEL_SIDE_KEY);
    if (savedSide === "left") document.body.classList.add("nest-f8-panel-left");

    return {
      panel,
      fields,
      targetSelect,
      selectionHint: panel.querySelector("[data-selection-hint]"),
      status: panel.querySelector("[data-status]"),
      statusText: panel.querySelector("[data-status-text]"),
      publishButton: panel.querySelector("[data-action='publish']"),
      publishLabel: panel.querySelector("[data-publish-label]"),
      output: panel.querySelector("[data-output]"),
    };
  }

  function bindGlobalEvents() {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishInteraction);
    window.addEventListener("pointercancel", finishInteraction);
    window.addEventListener("blur", finishInteraction);
    window.addEventListener("resize", syncSelectionOverlay);

    document.addEventListener("pointerdown", (event) => {
      if (!editorOpen || event.target.closest(".nest-f8-panel") || event.target.closest(".nest-f8-target") || event.target.closest(".nest-f8-selection")) return;
      clearSelection();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "F8") {
        event.preventDefault();
        setEditorOpen(!editorOpen);
        return;
      }
      if (!editorOpen) return;

      if (event.key === "Escape") {
        setEditorOpen(false);
        return;
      }

      const typing = event.target instanceof HTMLInputElement
        || event.target instanceof HTMLSelectElement
        || event.target instanceof HTMLTextAreaElement;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void publishCurrentLayout();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !typing) {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
        return;
      }
      if (typing || !selected || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;

      event.preventDefault();
      const step = event.shiftKey ? 0.5 : 0.05;
      const box = getBox(selected);
      if (event.key === "ArrowLeft") box.left -= step;
      if (event.key === "ArrowRight") box.left += step;
      if (event.key === "ArrowUp") box.top -= step;
      if (event.key === "ArrowDown") box.top += step;
      setBox(selected, box);
      markChanged();
      pushHistory();
    });
  }

  async function initialiseEditor() {
    const published = await fetchBestPublishedLayout();
    if (published?.layout) applyLayout(published.layout);

    lastPublishedLayout = cloneLayout(getLayout());
    lastPublishedSnapshot = layoutSnapshot(lastPublishedLayout);

    const draft = readDraft();
    if (draft?.layout) applyLayout(draft.layout);
    dirty = layoutSnapshot(getLayout()) !== lastPublishedSnapshot;

    history = [];
    historyIndex = -1;
    pushHistory();
    updatePanel();

    if (dirty) {
      setStatus("Draft restored — ready to publish", "warning");
    } else if (published?.layout) {
      setStatus(
        published.source === "git" ? "Published Git layout loaded" : "Published layout loaded",
        "success"
      );
    } else {
      setStatus("Using the page's default layout", "quiet");
    }
  }

  function setEditorOpen(open) {
    editorOpen = Boolean(open);
    document.body.classList.toggle("nest-f8-on", editorOpen);
    if (!editorOpen) {
      finishInteraction();
      clearSelection();
      saveDraftNow();
      return;
    }
    showToast("Layout editor ready");
    updatePanel();
  }

  function beginInteraction(element, mode, event) {
    const rect = page.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    interaction = {
      element,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startBox: getBox(element),
      pageWidth: rect.width,
      pageHeight: rect.height,
    };
    element.classList.add("is-moving");
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    if (!editorOpen || !interaction) return;
    const dx = ((event.clientX - interaction.startX) / interaction.pageWidth) * 100;
    const dy = ((event.clientY - interaction.startY) / interaction.pageHeight) * 100;
    const box = { ...interaction.startBox };
    const mode = interaction.mode;

    if (mode === "move") {
      box.left += dx;
      box.top += dy;
    } else {
      if (mode.includes("e")) box.width += dx;
      if (mode.includes("s")) box.height += dy;
      if (mode.includes("w")) {
        box.left += dx;
        box.width -= dx;
      }
      if (mode.includes("n")) {
        box.top += dy;
        box.height -= dy;
      }
    }

    setBox(interaction.element, box);
    markChanged();
  }

  function finishInteraction() {
    if (!interaction) return;
    interaction.element.classList.remove("is-moving");
    interaction = null;
    pushHistory();
    saveDraftSoon();
    updatePanel();
  }

  function selectTarget(element) {
    targets.forEach((target) => target.classList.toggle("is-selected", target === element));
    selected = element;
    syncSelectionOverlay();
    updatePanel();
  }

  function clearSelection() {
    targets.forEach((target) => target.classList.remove("is-selected", "is-moving"));
    selected = null;
    selectionOverlay.classList.remove("is-visible");
    updatePanel();
  }

  function syncSelectionOverlay() {
    if (!editorOpen || !selected) {
      selectionOverlay.classList.remove("is-visible");
      return;
    }
    const box = getBox(selected);
    selectionOverlay.style.left = `${box.left}%`;
    selectionOverlay.style.top = `${box.top}%`;
    selectionOverlay.style.width = `${box.width}%`;
    selectionOverlay.style.height = `${box.height}%`;
    selectionOverlay.querySelector(".nest-f8-selection-label").textContent = targetLabel(selected);
    selectionOverlay.classList.add("is-visible");
  }

  function updatePanel() {
    if (!ui) return;
    ui.targetSelect.value = selected ? getId(selected) : "";

    if (!selected) {
      Object.values(ui.fields).forEach((field) => {
        field.value = "";
        field.disabled = true;
      });
      ui.selectionHint.textContent = "Select an outlined item, then drag it. Use the handles to resize.";
      syncSelectionOverlay();
      return;
    }

    const box = getBox(selected);
    ui.fields.left.disabled = false;
    ui.fields.top.disabled = false;
    ui.fields.width.disabled = false;
    ui.fields.height.disabled = false;
    ui.fields.left.value = box.left.toFixed(2);
    ui.fields.top.value = box.top.toFixed(2);
    ui.fields.width.value = box.width.toFixed(2);
    ui.fields.height.value = box.height.toFixed(2);

    const scaleVariable = scaleVarFor(selected);
    ui.fields.scale.disabled = !scaleVariable;
    ui.fields.scale.value = scaleVariable ? String(Math.round(getScale(selected) * 100)) : "";
    ui.selectionHint.textContent = scaleVariable
      ? `${getId(selected)} · ${selectorFor(selected)} · scalable content`
      : `${getId(selected)} · ${selectorFor(selected)}`;
    syncSelectionOverlay();
  }

  function applyFieldValues() {
    if (!selected || interaction) return;
    const values = ["left", "top", "width", "height"].map((name) => Number(ui.fields[name].value));
    if (values.every(Number.isFinite)) {
      setBox(selected, {
        left: values[0],
        top: values[1],
        width: values[2],
        height: values[3],
      });
    }

    if (scaleVarFor(selected) && ui.fields.scale.value !== "") {
      const scale = Number(ui.fields.scale.value) / 100;
      if (Number.isFinite(scale)) setScale(selected, scale);
    }
    markChanged();
  }

  async function handlePanelClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;

    if (action === "close") setEditorOpen(false);
    if (action === "dock") togglePanelSide();
    if (action === "publish") await publishCurrentLayout();
    if (action === "undo") undo();
    if (action === "redo") redo();
    if (action === "reset-selected") resetSelected();
    if (action === "reset-page") resetPage();
    if (action === "grid") {
      document.body.classList.toggle("nest-f8-show-grid");
      button.classList.toggle("is-active", document.body.classList.contains("nest-f8-show-grid"));
    }
    if (action === "snap") {
      snapEnabled = !snapEnabled;
      button.classList.toggle("is-active", snapEnabled);
      showToast(snapEnabled ? "Snap enabled" : "Snap disabled");
    }
    if (action === "reload-published") await reloadPublishedLayout();
    if (action === "discard-draft") discardDraft();
    if (action === "copy-selected") {
      selected ? copyText(selectedCss(selected), "Item CSS copied") : showToast("Select an item first");
    }
    if (action === "copy-all") copyText(allCss(), "Page CSS copied");
    if (action === "download-css") downloadText(`${PAGE_NAME}-f8-layout.css`, allCss());
    if (action === "download-json") downloadText(`${PAGE_NAME}-f8-layout.json`, JSON.stringify({
      page: PAGE_NAME,
      layout: getLayout(),
      updatedAt: Math.floor(Date.now() / 1000),
    }, null, 2));
  }

  function togglePanelSide() {
    const moveLeft = !document.body.classList.contains("nest-f8-panel-left");
    document.body.classList.toggle("nest-f8-panel-left", moveLeft);
    localStorage.setItem(PANEL_SIDE_KEY, moveLeft ? "left" : "right");
  }

  function markChanged() {
    dirty = true;
    setStatus("Draft saved automatically — publish when ready", "warning");
    saveDraftSoon();
  }

  function saveDraftSoon() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraftNow, DRAFT_DELAY_MS);
  }

  function saveDraftNow() {
    clearTimeout(draftTimer);
    draftTimer = null;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 2,
        page: PAGE_NAME,
        layout: getLayout(),
        savedAt: Date.now(),
      }));
    } catch (error) {
      console.warn("Could not save the F8 draft", error);
    }
  }

  function readDraft() {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed?.layout ? parsed : { version: 1, page: PAGE_NAME, layout: parsed };
    } catch {
      return null;
    }
  }

  function discardDraft() {
    if (dirty && !window.confirm("Discard the current draft and return to the last published layout?")) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    if (lastPublishedLayout) applyLayout(lastPublishedLayout);
    dirty = false;
    history = [];
    historyIndex = -1;
    pushHistory();
    setStatus("Draft discarded — published layout restored", "success");
    showToast("Draft discarded");
  }

  async function reloadPublishedLayout() {
    if (dirty && !window.confirm("Replace this draft with the latest published layout?")) return;
    setStatus("Loading the latest published layout…", "busy");
    const published = await fetchBestPublishedLayout();
    if (!published?.layout) {
      setStatus("No published layout was found", "warning");
      showToast("No published layout");
      return;
    }
    applyLayout(published.layout);
    lastPublishedLayout = cloneLayout(getLayout());
    lastPublishedSnapshot = layoutSnapshot(lastPublishedLayout);
    dirty = false;
    saveDraftNow();
    history = [];
    historyIndex = -1;
    pushHistory();
    setStatus("Latest published layout loaded", "success");
    showToast("Published layout loaded");
  }

  async function publishCurrentLayout() {
    if (publishing) return;
    const layout = getLayout();
    const validationError = validateLayout(layout);
    if (validationError) {
      setStatus(validationError, "error");
      showToast("Layout needs attention");
      return;
    }

    publishing = true;
    ui.publishButton.disabled = true;
    ui.publishLabel.textContent = "Publishing…";
    setStatus("Saving for everyone and pushing to GitHub…", "busy");
    saveDraftNow();

    const [cloudResult, gitResult] = await Promise.all([
      publishToLayoutService(layout),
      publishThroughKiwiBirb(layout),
    ]);

    publishing = false;
    ui.publishButton.disabled = false;
    ui.publishLabel.textContent = "Save & Publish";

    const cloudSaved = Boolean(cloudResult.ok);
    const gitPushed = Boolean(gitResult.pushed);
    const detail = [
      `Everyone: ${cloudSaved ? "saved immediately" : cloudResult.message}`,
      `GitHub: ${gitPushed ? "committed and pushed" : gitResult.message}`,
    ].join("\n");
    showOutput(detail);

    if (!cloudSaved && !gitPushed) {
      setStatus("Publish failed — open Advanced for details", "error");
      showToast("Publish failed");
      return;
    }

    lastPublishedLayout = cloneLayout(layout);
    lastPublishedSnapshot = layoutSnapshot(lastPublishedLayout);
    dirty = false;
    saveDraftNow();

    if (cloudSaved && gitPushed) {
      setStatus("Published for everyone and pushed to GitHub", "success");
      showToast("Saved & published");
    } else if (gitPushed) {
      setStatus("Pushed to GitHub — Pages will update shortly", "success");
      showToast("Pushed to GitHub");
    } else {
      setStatus("Saved for everyone — GitHub push needs attention", "warning");
      showToast("Saved; Git push failed");
    }
  }

  async function publishToLayoutService(layout) {
    const apiBase = await serviceApiBase();
    if (!apiBase) return { ok: false, message: "layout service not configured" };
    const token = localStorage.getItem("the-nest-shop-token");
    if (!token) return { ok: false, message: "sign in with Twitch for instant publishing" };

    try {
      const response = await fetch(`${apiBase}/api/layout?page=${encodeURIComponent(PAGE_NAME)}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ layout }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.error || `service returned ${response.status}`);
      return { ok: true, updatedAt: Number(result.updatedAt || 0) };
    } catch (error) {
      return { ok: false, message: String(error.message || error) };
    }
  }

  async function publishThroughKiwiBirb(layout) {
    let lastMessage = "Kiwi Birb is not reachable; keep the app open while publishing";
    for (const endpoint of localEditorEndpoints("/api/editor/layout")) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 125000);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          mode: endpoint.startsWith("http") ? "cors" : "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page: PAGE_NAME, layout }),
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          lastMessage = String(result.error || result.message || `Kiwi Birb returned ${response.status}`);
          continue;
        }
        return {
          ok: Boolean(result.ok),
          saved: Boolean(result.saved),
          pushed: Boolean(result.pushed),
          message: String(result.message || (result.pushed ? "pushed" : "not pushed")),
        };
      } catch (error) {
        lastMessage = error.name === "AbortError"
          ? "Kiwi Birb timed out while pushing"
          : "Kiwi Birb is not reachable; keep the app open while publishing";
      } finally {
        clearTimeout(timeout);
      }
    }
    return { ok: false, saved: false, pushed: false, message: lastMessage };
  }

  function localEditorEndpoints(path) {
    const localHost = location.hostname === "127.0.0.1" || location.hostname === "localhost";
    if (!localHost) return [`${LOCAL_EDITOR_ORIGIN}${path}`];
    if (String(location.port || "") === "8765") return [path];
    return [path, `${LOCAL_EDITOR_ORIGIN}${path}`];
  }

  async function serviceApiBase() {
    if (!serviceConfigPromise) {
      serviceConfigPromise = fetch(`./data/shop-config.json?v=${Date.now()}`, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error("Service configuration not found");
          return response.json();
        })
        .then((config) => String(config.apiBase || "").replace(/\/+$/, ""))
        .catch(() => "");
    }
    return serviceConfigPromise;
  }

  async function fetchBestPublishedLayout() {
    const candidates = [];
    const [cloud, gitSnapshot] = await Promise.allSettled([
      fetchCloudLayout(),
      fetchGitLayout(),
    ]);
    if (cloud.status === "fulfilled" && cloud.value?.layout) candidates.push(cloud.value);
    if (gitSnapshot.status === "fulfilled" && gitSnapshot.value?.layout) candidates.push(gitSnapshot.value);
    candidates.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    return candidates[0] || null;
  }

  async function fetchCloudLayout() {
    const apiBase = await serviceApiBase();
    if (!apiBase) return null;
    const response = await fetch(
      `${apiBase}/api/layout?page=${encodeURIComponent(PAGE_NAME)}&v=${Date.now()}`,
      { cache: "no-store" }
    );
    if (!response.ok) throw new Error(`Layout service returned ${response.status}`);
    const result = await response.json();
    return result.layout ? {
      layout: result.layout,
      updatedAt: Number(result.updatedAt || 0),
      source: "cloud",
    } : null;
  }

  async function fetchGitLayout() {
    const response = await fetch(`./data/layouts/${encodeURIComponent(PAGE_NAME)}.json?v=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const result = await response.json();
    return result?.layout ? {
      layout: result.layout,
      updatedAt: Number(result.updatedAt || 0),
      source: "git",
    } : null;
  }

  function resetSelected() {
    if (!selected) {
      showToast("Select an item first");
      return;
    }
    setBox(selected, defaults.get(selected));
    if (scaleVarFor(selected)) setScale(selected, defaultScales.get(selected) || 1);
    markChanged();
    pushHistory();
    showToast("Item reset");
  }

  function resetPage() {
    if (!window.confirm("Reset every item on this page to its original CSS position?")) return;
    targets.forEach((target) => {
      setBox(target, defaults.get(target));
      if (scaleVarFor(target)) setScale(target, defaultScales.get(target) || 1);
    });
    markChanged();
    pushHistory();
    showToast("Page reset");
  }

  function pushHistory() {
    const snapshot = layoutSnapshot(getLayout());
    if (history[historyIndex] === snapshot) return;
    history = history.slice(0, historyIndex + 1);
    history.push(snapshot);
    historyIndex = history.length - 1;
    if (history.length > 100) {
      history.shift();
      historyIndex -= 1;
    }
  }

  function undo() {
    if (historyIndex <= 0) {
      showToast("Nothing to undo");
      return;
    }
    historyIndex -= 1;
    applyLayout(JSON.parse(history[historyIndex]));
    markChanged();
    showToast("Undo");
  }

  function redo() {
    if (historyIndex >= history.length - 1) {
      showToast("Nothing to redo");
      return;
    }
    historyIndex += 1;
    applyLayout(JSON.parse(history[historyIndex]));
    markChanged();
    showToast("Redo");
  }

  function getLayout() {
    const layout = {};
    targets.forEach((target, index) => {
      const id = safeLayoutId(getId(target), index);
      target.dataset.devId = id;
      const entry = roundBox(normalizeBox(getBox(target)));
      if (scaleVarFor(target)) entry.scale = Number(getScale(target).toFixed(2));
      layout[id] = entry;
    });
    return layout;
  }

  function applyLayout(layout) {
    if (!layout || typeof layout !== "object") return;
    targets.forEach((target) => {
      const box = layout[getId(target)];
      if (!box) return;
      setBox(target, box);
      if (scaleVarFor(target) && Number.isFinite(Number(box.scale))) {
        setScale(target, Number(box.scale));
      }
    });
    updatePanel();
  }

  function validateLayout(layout) {
    const entries = Object.entries(layout || {});
    if (!entries.length) return "No editable items were found on this page.";
    if (entries.length > 160) return "This page contains too many editable items.";
    for (const [id, box] of entries) {
      if (!/^[a-z0-9_-]{1,80}$/i.test(id)) return `Invalid editor ID: ${id}`;
      const values = [box?.left, box?.top, box?.width, box?.height].map(Number);
      if (!values.every(Number.isFinite)) return `Invalid measurements for ${id}.`;
      if (values[2] < 0.25 || values[3] < 0.25) return `${targetLabelById(id)} is too small.`;
      if (box.scale !== undefined && (!Number.isFinite(Number(box.scale)) || Number(box.scale) < 0.25 || Number(box.scale) > 3)) {
        return `Invalid content scale for ${id}.`;
      }
    }
    return "";
  }

  function getBox(element) {
    const pageWidth = page.clientWidth || page.getBoundingClientRect().width;
    const pageHeight = page.clientHeight || page.getBoundingClientRect().height;
    const style = getComputedStyle(element);
    const values = [style.left, style.top, style.width, style.height].map(parseFloat);

    if (pageWidth && pageHeight && values.every(Number.isFinite)) {
      return {
        left: (values[0] / pageWidth) * 100,
        top: (values[1] / pageHeight) * 100,
        width: (values[2] / pageWidth) * 100,
        height: (values[3] / pageHeight) * 100,
      };
    }

    const pageRect = page.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return {
      left: ((rect.left - pageRect.left) / pageRect.width) * 100,
      top: ((rect.top - pageRect.top) / pageRect.height) * 100,
      width: (rect.width / pageRect.width) * 100,
      height: (rect.height / pageRect.height) * 100,
    };
  }

  function setBox(element, box) {
    const value = normalizeBox(box);
    element.style.left = `${value.left.toFixed(2)}%`;
    element.style.top = `${value.top.toFixed(2)}%`;
    element.style.width = `${value.width.toFixed(2)}%`;
    element.style.height = `${value.height.toFixed(2)}%`;
    if (element === selected) {
      syncSelectionOverlay();
      updatePanelFieldsOnly(value);
    }
  }

  function updatePanelFieldsOnly(box) {
    if (!ui || !selected || document.activeElement?.matches?.("[data-field]")) return;
    ui.fields.left.value = box.left.toFixed(2);
    ui.fields.top.value = box.top.toFixed(2);
    ui.fields.width.value = box.width.toFixed(2);
    ui.fields.height.value = box.height.toFixed(2);
  }

  function normalizeBox(box) {
    const value = {
      left: Number(box?.left),
      top: Number(box?.top),
      width: Number(box?.width),
      height: Number(box?.height),
    };
    Object.keys(value).forEach((key) => {
      if (!Number.isFinite(value[key])) value[key] = key === "width" || key === "height" ? MIN_SIZE : 0;
      if (snapEnabled) value[key] = Math.round(value[key] / SNAP_STEP) * SNAP_STEP;
    });
    value.width = clamp(value.width, MIN_SIZE, 100);
    value.height = clamp(value.height, MIN_SIZE, 100);
    value.left = clamp(value.left, 0, 100 - value.width);
    value.top = clamp(value.top, 0, 100 - value.height);
    return value;
  }

  function roundBox(box) {
    return {
      left: Number(box.left.toFixed(2)),
      top: Number(box.top.toFixed(2)),
      width: Number(box.width.toFixed(2)),
      height: Number(box.height.toFixed(2)),
    };
  }

  function scaleVarFor(element) {
    return element?.dataset?.devScaleVar || "";
  }

  function getScale(element) {
    const variable = scaleVarFor(element);
    if (!variable) return 1;
    const value = parseFloat(getComputedStyle(element).getPropertyValue(variable));
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  function setScale(element, value) {
    const variable = scaleVarFor(element);
    if (!variable) return;
    element.style.setProperty(variable, clamp(Number(value), 0.25, 3).toFixed(2));
  }

  function usableClasses(element) {
    const generic = new Set([
      "hotspot", "nav-hotspot", "dev-editable", "nest-f8-target",
      "is-selected", "is-moving", "is-current",
    ]);
    return Array.from(element.classList).filter((name) => !generic.has(name) && !name.startsWith("dev-"));
  }

  function bestClass(element) {
    const classes = usableClasses(element);
    const priorities = [
      (name) => name.startsWith("nav-") && name !== "nav-hotspot",
      (name) => name.includes("hotspot") && name !== "hotspot",
      (name) => name.startsWith(`${PAGE_NAME}-`),
      (name) => name.includes("panel"),
      (name) => name.includes("card"),
      (name) => name.includes("sync"),
      (name) => name.includes("button"),
    ];
    for (const test of priorities) {
      const match = classes.find(test);
      if (match) return match;
    }
    return classes[0] || null;
  }

  function inferId(element, index) {
    if (element.id) return element.id;
    const best = bestClass(element);
    if (best) return best;
    const label = slug(element.dataset.devLabel || element.getAttribute("aria-label") || element.textContent);
    return label || `dev-item-${index + 1}`;
  }

  function selectorFor(element) {
    if (element.dataset.devSelector) return element.dataset.devSelector;
    if (element.id) return `#${element.id}`;
    const best = bestClass(element);
    return best ? `.${best}` : `[data-dev-id="${getId(element)}"]`;
  }

  function getId(element) {
    return element.dataset.devId || "";
  }

  function targetLabel(element) {
    return element.dataset.devLabel || labelFromId(getId(element));
  }

  function targetLabelById(id) {
    const target = targets.find((item) => getId(item) === id);
    return target ? targetLabel(target) : labelFromId(id);
  }

  function safeLayoutId(value, index = 0) {
    const raw = String(value || "").trim();
    if (/^[a-z0-9_-]{1,80}$/i.test(raw)) return raw;
    return slug(raw).slice(0, 80) || `dev-item-${index + 1}`;
  }

  function labelFromId(value) {
    return String(value || "item").replace(/[-_]+/g, " ").trim().toUpperCase();
  }

  function slug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function cssFor(element) {
    const box = roundBox(getBox(element));
    const variable = scaleVarFor(element);
    const scaleLine = variable ? `\n  ${variable}: ${getScale(element).toFixed(2)};` : "";
    return `/* F8: ${targetLabel(element)} | ${getId(element)} */
${selectorFor(element)} {
  left: ${box.left.toFixed(2)}%;
  top: ${box.top.toFixed(2)}%;
  width: ${box.width.toFixed(2)}%;
  height: ${box.height.toFixed(2)}%;${scaleLine}
}`;
  }

  function selectedCss(element) {
    return `/* Optional CSS backup for ${PAGE_NAME}. */\n\n${cssFor(element)}`;
  }

  function allCss() {
    const marker = PAGE_NAME.toUpperCase();
    return `/* === THE NEST F8 LAYOUT: ${marker} START === */
${targets.map(cssFor).join("\n\n")}
/* === THE NEST F8 LAYOUT: ${marker} END === */`;
  }

  async function copyText(text, message) {
    try {
      await navigator.clipboard.writeText(text);
      showOutput(text);
      showToast(message);
    } catch {
      showOutput(`Copy failed. Select and copy this manually:\n\n${text}`);
      showToast("Copy failed");
    }
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showOutput(`Downloaded ${filename}.`);
    showToast("Backup downloaded");
  }

  function setStatus(message, tone = "quiet") {
    ui.status.dataset.tone = tone;
    ui.statusText.textContent = message;
  }

  function showOutput(message) {
    ui.output.textContent = message;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 1800);
  }

  function layoutSnapshot(layout) {
    return JSON.stringify(layout);
  }

  function cloneLayout(layout) {
    return JSON.parse(JSON.stringify(layout));
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
