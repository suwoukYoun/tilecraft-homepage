/**
 * Tile Craft — First Fold Interactions
 * Liquid mouse background · Gravity dropzone · AI compute narrative
 * Categories/sets loaded from catalog.json — array order is nav order (no folder-name sort)
 */

(() => {
  'use strict';

  const ASSET_ROOT = '../assets';
  let CATEGORIES = [];

  const pairPath = (category, setId, kind, baseName) => {
    const base = baseName || setId.replace(/_1SET$/, '');
    const file = `${base}_${kind}.png`;
    // Encode each segment so Korean folder/file names resolve reliably
    return [
      ASSET_ROOT,
      encodeURIComponent(category),
      encodeURIComponent(setId),
      encodeURIComponent(file),
    ].join('/');
  };

  const urlCache = new Map();

  function collapseWs(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function dedupeCatalog(cats) {
    const out = [];
    const seenCat = new Set();
    for (const cat of cats) {
      const catKey = collapseWs(cat.id);
      if (!catKey || seenCat.has(catKey)) continue;
      seenCat.add(catKey);
      const seenSet = new Set();
      const sets = [];
      for (const set of cat.sets || []) {
        const setKey = collapseWs(set.id);
        if (!setKey || seenSet.has(setKey)) continue;
        seenSet.add(setKey);
        sets.push(set);
      }
      out.push({ ...cat, sets });
    }
    return out;
  }

  function findSetMeta(category, setId) {
    const cat = CATEGORIES.find((c) => c.id === category);
    return cat?.sets?.find((s) => s.id === setId) || null;
  }

  function tryLoadUrl(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  async function resolveAsset(category, setId, kind) {
    const key = `${category}:${setId}:${kind}`;
    if (urlCache.has(key)) return urlCache.get(key);

    const meta = findSetMeta(category, setId);
    const base = meta?.base || setId.replace(/_1SET$/, '');
    const primary = pairPath(category, setId, kind, base);
    const altKind = kind === 'grid' ? 'preview' : 'grid';
    const alternate = pairPath(category, setId, altKind, base);

    let url = await tryLoadUrl(primary);
    if (!url) url = await tryLoadUrl(alternate);
    if (!url) {
      console.warn('[Tile Craft] missing asset', primary);
    }

    urlCache.set(key, url);
    return url;
  }

  async function loadCatalog() {
    // Prefer relative catalog for GitHub Pages (/repo/homepage/).
    // Absolute /api and /homepage paths are for local serve.py only.
    const endpoints = [
      `./catalog.json?t=${Date.now()}`,
      `/api/catalog?t=${Date.now()}`,
      `/homepage/catalog.json?t=${Date.now()}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, { cache: 'no-store' });
        if (!res.ok) continue;
        const data = await res.json();
        const cats = Array.isArray(data) ? data : data.categories;
        if (Array.isArray(cats) && cats.length) {
          CATEGORIES = dedupeCatalog(
            cats.map((c) => ({
              id: c.id,
              label: c.label || c.id,
              sets: (c.sets || []).map((s) => ({
                id: s.id,
                name: s.name || s.id.replace(/_1SET$/, ''),
                base: s.base || s.id.replace(/_1SET$/, ''),
                hasPreview: !!s.hasPreview,
                hasGrid: !!s.hasGrid,
                hasProduct: !!s.hasProduct,
                palette: Array.isArray(s.palette) ? s.palette : [],
              })),
            }))
          );
          return CATEGORIES;
        }
      } catch (_) {
        /* try next */
      }
    }
    CATEGORIES = [];
    return CATEGORIES;
  }

  function catalogSignature() {
    return CATEGORIES.map(
      (c) => `${c.id}:${c.sets.map((s) => s.id).join(',')}`
    ).join('|');
  }

  function getCategory(catId) {
    return CATEGORIES.find((c) => c.id === catId);
  }

  function getSets(catId) {
    return getCategory(catId)?.sets || [];
  }

  function pickBootSet() {
    const withProduct = CATEGORIES.flatMap((c) =>
      c.sets
        .filter((s) => s.hasProduct || (s.palette && s.palette.length))
        .map((s) => ({ category: c.id, ...s }))
    )[0];
    if (withProduct) return withProduct;

    const soft = CATEGORIES.flatMap((c) =>
      c.sets
        .filter((s) => s.id.includes('소프트지브라'))
        .map((s) => ({ category: c.id, ...s }))
    )[0];
    if (soft) return soft;

    const withGrid = CATEGORIES.flatMap((c) =>
      c.sets.filter((s) => s.hasGrid !== false).map((s) => ({ category: c.id, ...s }))
    )[0];
    if (withGrid) return withGrid;

    const firstCat = CATEGORIES[0];
    const firstSet = firstCat?.sets?.[0];
    if (!firstSet) return null;
    return { category: firstCat.id, ...firstSet };
  }

  /* ---------- DOM ---------- */
  const body = document.body;
  const bgOrigin = document.getElementById('bg-origin');
  const bgPhoto = document.getElementById('bg-photo');
  const bgFlash = document.getElementById('bg-flash');
  const bgTile = document.getElementById('bg-tile');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const absorbStage = document.getElementById('absorb-stage');
  const processStatus = document.getElementById('process-status');
  const processText = document.getElementById('process-text');
  const launchModal = document.getElementById('launch-modal');
  const launchFeedbackForm = document.getElementById('launch-feedback-form');
  const launchEmail = document.getElementById('launch-email');
  const launchFeedback = document.getElementById('launch-feedback');
  const launchSubmit = document.getElementById('launch-submit');
  const launchToast = document.getElementById('launch-toast');
  const navCats = document.getElementById('nav-cats');
  const navGrid = document.getElementById('nav-grid');
  const navMinimap = document.getElementById('nav-minimap');
  const navMinimapFrame = document.getElementById('nav-minimap-frame');
  const navMinimapImg = document.getElementById('nav-minimap-img');
  const navMinimapSim = document.getElementById('nav-minimap-sim');
  const navViewport = document.getElementById('nav-viewport');
  const navCatName = document.getElementById('nav-cat-name');
  const navSetName = document.getElementById('nav-set-name');
  const navMode = document.getElementById('nav-mode');
  const navZoomSlider = document.getElementById('nav-zoom-slider');
  const navZoomValue = document.getElementById('nav-zoom-value');
  const root = document.documentElement;

  let busy = false;
  let activeCategoryId = '';
  let activeSetId = '';
  let showingTile = false;
  let previewNavActive = false;
  let minimapDragging = false;
  let gridRenderGen = 0;
  let catalogRefresh = null;
  let catalogRefreshQueued = false;
  let catalogRefreshOpts = { keepSelection: true };

  const ZOOM_MIN = 1;
  const ZOOM_MAX = 10;
  const ZOOM_DEFAULT = 2;
  const GRID_ZOOM_MIN = 2;

  /* Exact camera in image-normalized space [0..1] */
  const camera = {
    imgW: 1,
    imgH: 1,
    focusX: 0.5,
    focusY: 0.5,
    targetX: 0.5,
    targetY: 0.5,
    zoom: ZOOM_DEFAULT,
    ready: false,
  };

  /* ---------- Navigator ---------- */
  function buildCategoryTabs() {
    navCats.innerHTML = '';
    CATEGORIES.forEach((cat) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-cat' + (cat.id === activeCategoryId ? ' is-active' : '');
      btn.textContent = cat.label;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', cat.id === activeCategoryId ? 'true' : 'false');
      btn.addEventListener('click', () => selectCategory(cat.id));
      navCats.appendChild(btn);
    });
  }

  async function buildNavigator() {
    buildCategoryTabs();
    await renderSetGrid();
    bindMinimap();
    bindZoom();

    const refreshBtn = document.getElementById('nav-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = '...';
        urlCache.clear();
        const changed = await refreshCatalog({ keepSelection: true });
        refreshBtn.textContent = changed ? 'OK' : 'SCAN';
        refreshBtn.disabled = false;
        setTimeout(() => {
          refreshBtn.textContent = 'SCAN';
        }, 900);
      });
    }

    window.addEventListener('resize', () => {
      layoutMinimapFrame();
      applyCamera();
    });
  }

  async function doRefreshCatalog({ keepSelection = true } = {}) {
    const prevSig = catalogSignature();
    const prevCat = activeCategoryId;
    const prevSet = activeSetId;
    await loadCatalog();
    const nextSig = catalogSignature();
    if (prevSig === nextSig) return false;

    const stillThere = CATEGORIES.some(
      (c) => c.id === prevCat && c.sets.some((s) => s.id === prevSet)
    );

    if (!stillThere || !keepSelection) {
      const boot = pickBootSet();
      if (boot) {
        activeCategoryId = boot.category;
        activeSetId = boot.id;
      } else {
        activeCategoryId = CATEGORIES[0]?.id || '';
        activeSetId = CATEGORIES[0]?.sets?.[0]?.id || '';
      }
    } else {
      activeCategoryId = prevCat;
      activeSetId = prevSet;
    }

    buildCategoryTabs();
    await renderSetGrid();

    if (!stillThere || !keepSelection) {
      const cat = getCategory(activeCategoryId);
      const set = cat?.sets?.find((s) => s.id === activeSetId) || cat?.sets?.[0];
      if (set) await selectSet(activeCategoryId, set.id, set.name);
    }
    return true;
  }

  async function refreshCatalog(opts = {}) {
    catalogRefreshOpts = { keepSelection: opts.keepSelection !== false };
    if (catalogRefresh) {
      catalogRefreshQueued = true;
      return catalogRefresh;
    }
    catalogRefresh = (async () => {
      try {
        let changed = false;
        do {
          catalogRefreshQueued = false;
          changed = await doRefreshCatalog(catalogRefreshOpts);
        } while (catalogRefreshQueued);
        return changed;
      } finally {
        catalogRefresh = null;
      }
    })();
    return catalogRefresh;
  }

  async function renderSetGrid() {
    const renderId = ++gridRenderGen;
    const catId = activeCategoryId;
    const sets = getSets(catId);
    const cells = [];

    for (const set of sets) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'nav-cell' + (set.id === activeSetId ? ' is-active' : '');
      cell.title = set.name;
      cell.setAttribute('aria-label', set.name);
      cell.dataset.setId = set.id;
      const thumb = await resolveAsset(catId, set.id, 'preview');
      if (renderId !== gridRenderGen) return;
      if (thumb) {
        cell.style.backgroundImage = `url("${thumb}")`;
        cell.style.backgroundSize = 'cover';
        cell.style.backgroundPosition = 'center';
      } else {
        cell.classList.add('is-missing');
        if (set.palette?.[0]) cell.style.backgroundColor = set.palette[0];
      }
      cell.addEventListener('click', () => selectSet(catId, set.id, set.name));
      cells.push(cell);
    }

    if (renderId !== gridRenderGen) return;
    navGrid.replaceChildren(...cells);
    navGrid.dataset.category = catId;
    navCatName.textContent = catId;
  }

  async function selectCategory(catId) {
    if (busy) return;
    activeCategoryId = catId;

    [...navCats.children].forEach((el, i) => {
      const on = CATEGORIES[i].id === catId;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    await renderSetGrid();

    const first = getSets(catId)[0];
    if (first) {
      await selectSet(catId, first.id, first.name);
    }
  }

  async function selectSet(categoryId, setId, name) {
    if (busy) return;
    activeCategoryId = categoryId;
    activeSetId = setId;
    showingTile = true;
    previewNavActive = true;

    navCatName.textContent = categoryId;
    navSetName.textContent = name;
    navMode.textContent = 'GRID';
    body.classList.add('is-grid-view', 'is-preview-nav');
    navMinimap.classList.add('is-active');

    [...navCats.children].forEach((el, i) => {
      const on = CATEGORIES[i].id === categoryId;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    if (navGrid.dataset.category !== categoryId) {
      await renderSetGrid();
    } else {
      [...navGrid.children].forEach((el) => {
        el.classList.toggle('is-active', el.dataset.setId === setId);
      });
    }

    const url = await resolveAsset(
      categoryId,
      setId,
      metaHasPalette(categoryId, setId) ? 'preview' : 'grid'
    );
    if (url) await setMainImage(url);
    await applyTileSim(categoryId, setId);
  }

  function metaHasPalette(categoryId, setId) {
    const meta = findSetMeta(categoryId, setId);
    return !!(meta?.hasProduct || (meta?.palette && meta.palette.length));
  }

  async function applyTileSim(categoryId, setId) {
    if (!window.TileCraftSim) return;
    const meta = findSetMeta(categoryId, setId);
    await window.TileCraftSim.bindSet({
      category: categoryId,
      setId,
      base: meta?.base,
    });
    layoutMinimapFrame();
    if (navMode && window.TileCraftSim.isActive()) {
      navMode.textContent = 'TILE';
    }
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  async function setMainImage(url) {
    if (!url) return;
    bgOrigin.classList.remove('is-active');
    bgTile.classList.remove('is-active', 'is-fadein');
    bgFlash.classList.remove('is-flash', 'is-active');

    const img = await loadImage(url);
    camera.imgW = img.naturalWidth || 1;
    camera.imgH = img.naturalHeight || 1;
    camera.focusX = 0.5;
    camera.focusY = 0.5;
    camera.targetX = 0.5;
    camera.targetY = 0.5;
    camera.zoom = clampZoom(camera.zoom);
    camera.ready = true;

    bgPhoto.src = url;
    navMinimapImg.src = url;
    layoutMinimapFrame();
    clampFocusToCrop();
    applyCamera();
    syncZoomUi();

    requestAnimationFrame(() => bgOrigin.classList.add('is-active'));
  }

  function getStageView() {
    return {
      originX: 0,
      originY: 0,
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  }

  function getVisibleCrop() {
    const { originX, originY, vw, vh } = getStageView();
    const { imgW, imgH } = camera;
    const z = clampZoom(camera.zoom);
    const scale = z;
    const dispW = imgW * scale;
    const dispH = imgH * scale;

    const width = Math.min(1, vw / Math.max(1, dispW));
    const height = Math.min(1, vh / Math.max(1, dispH));

    const focusX = Math.max(width / 2, Math.min(1 - width / 2, camera.focusX));
    const focusY = Math.max(height / 2, Math.min(1 - height / 2, camera.focusY));

    const left = focusX - width / 2;
    const top = focusY - height / 2;
    const extraX = Math.round(Math.max(0, (vw - dispW) / 2));
    const extraY = Math.round(Math.max(0, (vh - dispH) / 2));

    return {
      left,
      top,
      width,
      height,
      scale,
      z,
      focusX,
      focusY,
      vw,
      vh,
      originX,
      originY,
      extraX,
      extraY,
      dispW,
      dispH,
    };
  }

  function pointerToImage(clientX, clientY, crop) {
    return {
      imgX: crop.left + (clientX - crop.originX - crop.extraX) / Math.max(1, crop.dispW),
      imgY: crop.top + (clientY - crop.originY - crop.extraY) / Math.max(1, crop.dispH),
    };
  }

  function clampFocusToCrop() {
    const crop = getVisibleCrop();
    camera.focusX = crop.focusX;
    camera.focusY = crop.focusY;
    camera.targetX = Math.max(crop.width / 2, Math.min(1 - crop.width / 2, camera.targetX));
    camera.targetY = Math.max(crop.height / 2, Math.min(1 - crop.height / 2, camera.targetY));
  }

  function applyCamera() {
    if (!camera.ready) return;

    const crop = getVisibleCrop();
    camera.focusX = crop.focusX;
    camera.focusY = crop.focusY;

    const z = crop.z;
    const leftPx = Math.round(crop.left * camera.imgW);
    const topPx = Math.round(crop.top * camera.imgH);
    const tx = crop.extraX - leftPx * z;
    const ty = crop.extraY - topPx * z;

    root.style.setProperty('--bg-tx', `${tx}px`);
    root.style.setProperty('--bg-ty', `${ty}px`);
    root.style.setProperty('--bg-scale', String(z));
    root.style.setProperty('--z', String(z));
    root.style.setProperty('--img-w', String(camera.imgW));
    root.style.setProperty('--img-h', String(camera.imgH));
    body.classList.toggle('is-pixel-grid', z >= GRID_ZOOM_MIN);

    root.style.setProperty('--nav-vp-x', `${((leftPx / camera.imgW) * 100).toFixed(3)}%`);
    root.style.setProperty('--nav-vp-y', `${((topPx / camera.imgH) * 100).toFixed(3)}%`);
    root.style.setProperty('--nav-vp-w', `${(crop.width * 100).toFixed(3)}%`);
    root.style.setProperty('--nav-vp-h', `${(crop.height * 100).toFixed(3)}%`);
  }

  function clampZoom(z) {
    const n = Math.round(Number(z));
    if (!Number.isFinite(n)) return ZOOM_DEFAULT;
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n));
  }

  function syncZoomUi() {
    const z = clampZoom(camera.zoom);
    camera.zoom = z;
    if (navZoomSlider) {
      navZoomSlider.value = String(z);
      navZoomSlider.setAttribute('aria-valuenow', String(z));
    }
    if (navZoomValue) navZoomValue.textContent = String(z);
  }

  function setZoom(nextZoom, { clientX, clientY } = {}) {
    const z = clampZoom(nextZoom);
    if (!camera.ready) {
      camera.zoom = z;
      syncZoomUi();
      return;
    }

    if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
      const prev = getVisibleCrop();
      const { imgX, imgY } = pointerToImage(clientX, clientY, prev);
      camera.zoom = z;
      const next = getVisibleCrop();
      camera.focusX =
        imgX - (clientX - next.originX - next.extraX) / Math.max(1, next.dispW) + next.width / 2;
      camera.focusY =
        imgY - (clientY - next.originY - next.extraY) / Math.max(1, next.dispH) + next.height / 2;
      camera.targetX = camera.focusX;
      camera.targetY = camera.focusY;
    } else {
      camera.zoom = z;
    }

    clampFocusToCrop();
    applyCamera();
    syncZoomUi();
  }

  function onWheelZoom(e) {
    if (busy) return;
    if (body.classList.contains('is-modal-open')) return;

    const onZoomUi = e.target.closest?.('#nav-zoom');
    const onChrome = e.target.closest?.('#palette-dock, #navigator, #launch-modal');
    if (onChrome && !onZoomUi) return;

    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    setZoom(camera.zoom + dir, { clientX: e.clientX, clientY: e.clientY });
  }

  function bindZoom() {
    window.addEventListener('wheel', onWheelZoom, { passive: false });

    if (!navZoomSlider) return;
    navZoomSlider.addEventListener('input', () => {
      setZoom(Number(navZoomSlider.value));
    });
    navZoomSlider.addEventListener('pointerdown', (e) => e.stopPropagation());
    syncZoomUi();
  }

  function layoutMinimapFrame() {
    if (!camera.ready || !navMinimapFrame) return;
    const box = navMinimap.getBoundingClientRect();
    if (!box.width || !box.height) return;

    const pad = 4;
    const maxW = box.width - pad * 2;
    const maxH = box.height - pad * 2;
    const fit = Math.min(maxW / camera.imgW, maxH / camera.imgH);
    const w = Math.max(1, camera.imgW * fit);
    const h = Math.max(1, camera.imgH * fit);

    navMinimapFrame.style.width = `${w.toFixed(1)}px`;
    navMinimapFrame.style.height = `${h.toFixed(1)}px`;
    const miniScale = camera.imgW > 0 ? w / camera.imgW : 1;
    navMinimapFrame.style.setProperty('--sim-mini-scale', miniScale.toFixed(6));

    if (window.TileCraftSim) {
      window.TileCraftSim.layoutMinimap(w, camera.imgW);
    } else if (navMinimapSim) {
      navMinimapSim.style.setProperty('--sim-mini-scale', miniScale.toFixed(6));
    }
  }

  function panFromMinimapEvent(e) {
    if (!camera.ready) return;
    const rect = navMinimapFrame.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    // Click point becomes focus center of main crop
    camera.targetX = nx;
    camera.targetY = ny;
    camera.focusX = nx;
    camera.focusY = ny;
    clampFocusToCrop();
    applyCamera();

    liquid.tx = nx;
    liquid.ty = ny;
    liquid.x = nx;
    liquid.y = ny;
    liquid.intensity = Math.max(liquid.intensity, 0.35);
    body.classList.add('is-liquid');
  }

  function bindMinimap() {
    const onDown = (e) => {
      if (busy || (!previewNavActive && !showingTile)) return;
      minimapDragging = true;
      navMinimap.classList.add('is-dragging');
      navMinimap.setPointerCapture?.(e.pointerId);
      panFromMinimapEvent(e);
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!minimapDragging) return;
      panFromMinimapEvent(e);
    };
    const onUp = () => {
      minimapDragging = false;
      navMinimap.classList.remove('is-dragging');
    };

    navMinimap.addEventListener('pointerdown', onDown);
    navMinimap.addEventListener('pointermove', onMove);
    navMinimap.addEventListener('pointerup', onUp);
    navMinimap.addEventListener('pointercancel', onUp);
  }

  /* ---------- Liquid mouse physics + exact crop pan ---------- */
  const liquid = {
    x: 0.5,
    y: 0.5,
    tx: 0.5,
    ty: 0.5,
    vx: 0,
    vy: 0,
    intensity: 0,
    lastX: null,
    lastY: null,
    lastT: 0,
  };

  let rafId = 0;

  function onPointerMove(e) {
    if (minimapDragging) return;
    if (e.target.closest?.('#palette-dock, #navigator, #launch-modal')) return;

    const now = performance.now();
    const nx = window.innerWidth > 0 ? e.clientX / window.innerWidth : 0.5;
    const ny = window.innerHeight > 0 ? e.clientY / window.innerHeight : 0.5;

    liquid.tx = nx;
    liquid.ty = ny;

    if (liquid.lastX !== null) {
      const dt = Math.max(8, now - liquid.lastT);
      const dx = e.clientX - liquid.lastX;
      const dy = e.clientY - liquid.lastY;
      const speed = Math.hypot(dx, dy) / dt;
      const boost = Math.min(1, speed * 1.15);
      liquid.intensity = Math.max(liquid.intensity, boost);
      liquid.vx += dx * 0.002;
      liquid.vy += dy * 0.002;
    }

    liquid.lastX = e.clientX;
    liquid.lastY = e.clientY;
    liquid.lastT = now;

    body.classList.add('is-liquid');

    if (previewNavActive || showingTile) {
      // Map pointer to image focus within valid crop range
      camera.targetX = nx;
      camera.targetY = ny;
    }
  }

  function tickLiquid() {
    liquid.x += (liquid.tx - liquid.x) * 0.08;
    liquid.y += (liquid.ty - liquid.y) * 0.08;
    liquid.vx *= 0.9;
    liquid.vy *= 0.9;
    liquid.intensity *= 0.965;

    const wobbleX = Math.sin(performance.now() / 420) * liquid.intensity * 1.2;
    const wobbleY = Math.cos(performance.now() / 380) * liquid.intensity * 1.2;
    const px = (liquid.x + liquid.vx * 0.4 + wobbleX * 0.01) * 100;
    const py = (liquid.y + liquid.vy * 0.4 + wobbleY * 0.01) * 100;
    const intensity = liquid.intensity;
    const navModeOn = previewNavActive || showingTile;
    const blur = intensity * (navModeOn ? 0.8 : 4.5);
    const scaleBoost = 1 + intensity * (navModeOn ? 0.008 : 0.035);
    const hue = intensity * (navModeOn ? 2 : 8);

    if (navModeOn && camera.ready && !minimapDragging) {
      const ease = 0.08;
      camera.focusX += (camera.targetX - camera.focusX) * ease;
      camera.focusY += (camera.targetY - camera.focusY) * ease;
      applyCamera();
    } else if (navModeOn && camera.ready && minimapDragging) {
      applyCamera();
    }

    root.style.setProperty('--liquid-x', `${px.toFixed(2)}%`);
    root.style.setProperty('--liquid-y', `${py.toFixed(2)}%`);
    root.style.setProperty('--liquid-intensity', intensity.toFixed(3));
    root.style.setProperty('--liquid-blur', `${blur.toFixed(2)}px`);
    root.style.setProperty('--liquid-scale', scaleBoost.toFixed(4));
    root.style.setProperty('--liquid-hue', `${hue.toFixed(2)}deg`);

    if (intensity < 0.02) {
      body.classList.remove('is-liquid');
    }

    rafId = requestAnimationFrame(tickLiquid);
  }

  /* ---------- Dropzone ---------- */
  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, preventDefaults);
    document.addEventListener(evt, preventDefaults);
  });

  dropzone.addEventListener('dragenter', () => {
    if (!busy) dropzone.classList.add('is-dragover');
  });

  dropzone.addEventListener('dragover', () => {
    if (!busy) dropzone.classList.add('is-dragover');
  });

  dropzone.addEventListener('dragleave', (e) => {
    if (!dropzone.contains(e.relatedTarget)) {
      dropzone.classList.remove('is-dragover');
    }
  });

  /* ---------- Launch Modal + EmailJS ---------- */
  let toastTimer = null;

  function getEmailJsConfig() {
    const cfg = window.__EMAILJS__ || {};
    return {
      publicKey: String(cfg.publicKey || '').trim(),
      serviceId: String(cfg.serviceId || '').trim(),
      templateId: String(cfg.templateId || '').trim(),
    };
  }

  function showLaunchToast(message, { error = false } = {}) {
    if (!launchToast) {
      window.alert(message);
      return;
    }
    launchToast.textContent = message;
    launchToast.hidden = false;
    launchToast.classList.toggle('is-error', error);
    requestAnimationFrame(() => launchToast.classList.add('is-visible'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      launchToast.classList.remove('is-visible');
      setTimeout(() => {
        launchToast.hidden = true;
        launchToast.classList.remove('is-error');
      }, 320);
    }, 4200);
  }

  function openLaunchModal() {
    if (!launchModal) return;
    launchModal.hidden = false;
    launchModal.setAttribute('aria-hidden', 'false');
    body.classList.add('is-modal-open');
    const closeBtn = launchModal.querySelector('.launch-modal-close');
    closeBtn?.focus({ preventScroll: true });
  }

  function closeLaunchModal() {
    if (!launchModal || launchModal.hidden) return;
    launchModal.hidden = true;
    launchModal.setAttribute('aria-hidden', 'true');
    body.classList.remove('is-modal-open');
    dropzone?.focus({ preventScroll: true });
  }

  async function sendLaunchFeedback() {
    const email = launchEmail?.value.trim() || '';
    const message = launchFeedback?.value.trim() || '';
    if (!email || !message) return;

    const { publicKey, serviceId, templateId } = getEmailJsConfig();
    if (!publicKey || !serviceId || !templateId) {
      showLaunchToast(
        '이메일 설정이 아직 연결되지 않았습니다. .env.local을 확인해 주세요. / Email service is not configured.',
        { error: true }
      );
      return;
    }

    if (typeof emailjs === 'undefined' || typeof emailjs.send !== 'function') {
      showLaunchToast('EmailJS SDK failed to load. Please try again.', { error: true });
      return;
    }

    if (launchSubmit) {
      launchSubmit.disabled = true;
      launchSubmit.textContent = 'Sending…';
    }

    try {
      emailjs.init({ publicKey });
      await emailjs.send(serviceId, templateId, {
        user_email: email,
        message,
        reply_to: email,
      });

      launchFeedbackForm?.reset();
      closeLaunchModal();
      showLaunchToast(
        '의견이 성공적으로 접수되었습니다. 오픈 시 혜택을 보내드리겠습니다. / Thank you for your feedback!'
      );
    } catch (err) {
      console.error('[EmailJS]', err);
      showLaunchToast(
        '전송에 실패했습니다. 잠시 후 다시 시도해 주세요. / Failed to send. Please try again.',
        { error: true }
      );
    } finally {
      if (launchSubmit) {
        launchSubmit.disabled = false;
        launchSubmit.textContent = 'Send · 보내기';
      }
    }
  }

  if (launchModal) {
    launchModal.querySelectorAll('[data-modal-close]').forEach((el) => {
      el.addEventListener('click', closeLaunchModal);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !launchModal.hidden) {
        closeLaunchModal();
      }
    });
  }

  if (launchFeedbackForm) {
    launchFeedbackForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendLaunchFeedback();
    });
  }

  dropzone.addEventListener('drop', (e) => {
    dropzone.classList.remove('is-dragover');
    if (busy) return;
    openLaunchModal();
  });

  dropzone.addEventListener('click', () => {
    if (!busy) openLaunchModal();
  });

  dropzone.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !busy) {
      e.preventDefault();
      openLaunchModal();
    }
  });

  /* ---------- Absorption + AI narrative ---------- */
  function handleImageDrop(file, clientX, clientY) {
    if (busy) return;
    busy = true;
    body.classList.add('is-computing');
    body.classList.remove('is-complete');
    dropzone.classList.add('is-absorbing');

    showProcess('ABSORBING IMAGE…');
    playAbsorption(clientX, clientY);

    // After absorption (~1.15s) → flash → fade to tiled result
    setTimeout(() => {
      runAiComputeSequence();
    }, 1150);
  }

  function playAbsorption(clientX, clientY) {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const ax = clientX - cx;
    const ay = clientY - cy;

    absorbStage.innerHTML = '';

    const token = document.createElement('div');
    token.className = 'absorb-token';
    token.style.setProperty('--ax', `${ax}px`);
    token.style.setProperty('--ay', `${ay}px`);
    token.style.left = '50%';
    token.style.top = '50%';
    token.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h3l1.2-1.6A1.5 1.5 0 0 1 11.9 3h.2a1.5 1.5 0 0 1 1.2.4L14.5 5H17.5A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z" stroke="#1a1a1c" stroke-width="1.4"/>
        <circle cx="12" cy="12.5" r="3.2" stroke="#1a1a1c" stroke-width="1.4"/>
      </svg>
    `;
    absorbStage.appendChild(token);

    // orbital shards
    const shardCount = 10;
    for (let i = 0; i < shardCount; i++) {
      const angle = (Math.PI * 2 * i) / shardCount + Math.random() * 0.3;
      const dist = 90 + Math.random() * 160;
      const shard = document.createElement('div');
      shard.className = 'absorb-shard';
      shard.style.left = '50%';
      shard.style.top = '50%';
      shard.style.setProperty('--sx', `${Math.cos(angle) * dist + ax * 0.15}px`);
      shard.style.setProperty('--sy', `${Math.sin(angle) * dist + ay * 0.15}px`);
      shard.style.animationDelay = `${i * 28}ms`;
      shard.style.width = `${5 + Math.random() * 7}px`;
      shard.style.height = shard.style.width;
      absorbStage.appendChild(shard);
    }

    setTimeout(() => {
      absorbStage.innerHTML = '';
    }, 1300);
  }

  function showProcess(text) {
    processText.textContent = text;
    processStatus.classList.add('is-visible');
  }

  function hideProcess(delay = 0) {
    setTimeout(() => {
      processStatus.classList.remove('is-visible');
    }, delay);
  }

  async function runAiComputeSequence() {
    showProcess('AI TILE COMPUTE…');
    navMode.textContent = 'COMPUTE';

    const red = CATEGORIES.flatMap((c) =>
      c.sets
        .filter((s) => s.id.includes('레드네트워크'))
        .map((s) => ({ category: c.id, ...s }))
    )[0];
    const soft = pickBootSet();

    const flashUrl = red
      ? await resolveAsset(red.category, red.id, 'grid')
      : soft
        ? await resolveAsset(soft.category, soft.id, 'grid')
        : null;
    const tileUrl = soft
      ? await resolveAsset(soft.category, soft.id, 'grid')
      : flashUrl;

    // 1) Flash: 레드네트워크 tile — 1s
    if (flashUrl) bgFlash.style.backgroundImage = `url("${flashUrl}")`;
    bgFlash.classList.remove('is-flash');
    void bgFlash.offsetWidth;
    bgFlash.classList.add('is-flash');
    showProcess('NEURAL FLASH · GRID MAP');

    await wait(1000);

    bgFlash.classList.remove('is-flash');

    // 2) Fade-in narrative on tile layer, then lock camera to exact grid crop
    bgOrigin.classList.remove('is-active');
    if (tileUrl) bgTile.style.backgroundImage = `url("${tileUrl}")`;
    bgTile.classList.remove('is-fadein', 'is-active');
    void bgTile.offsetWidth;
    bgTile.classList.add('is-fadein');
    showProcess('TILE BLUEPRINT READY');
    navMode.textContent = 'GRID';
    if (soft) {
      navCatName.textContent = soft.category;
      navSetName.textContent = soft.name;
      activeCategoryId = soft.category;
      activeSetId = soft.id;
    }
    showingTile = true;
    previewNavActive = true;
    body.classList.add('is-grid-view', 'is-preview-nav');
    navMinimap.classList.add('is-active');

    [...navCats.children].forEach((el, i) => {
      const on = CATEGORIES[i]?.id === activeCategoryId;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    await renderSetGrid();
    [...navGrid.children].forEach((el) => {
      el.classList.toggle('is-active', el.dataset.setId === activeSetId);
    });

    await wait(1400);

    bgTile.classList.remove('is-fadein');
    bgTile.classList.remove('is-active');
    if (tileUrl) await setMainImage(tileUrl);
    await applyTileSim(activeCategoryId, activeSetId);

    body.classList.remove('is-computing');
    body.classList.add('is-complete');
    dropzone.classList.remove('is-absorbing');
    showProcess('COMPLETE · 30-MIN BLUEPRINT');
    hideProcess(2200);

    busy = false;
  }

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /* ---------- Boot ---------- */
  async function init() {
    await loadCatalog();

    if (!CATEGORIES.length) {
      navSetName.textContent = 'NO ASSETS';
      navMode.textContent = 'EMPTY';
      console.warn('[Tile Craft] No categories found. Run: python homepage/generate_catalog.py');
    }

    const boot = pickBootSet();
    if (boot) {
      activeCategoryId = boot.category;
      activeSetId = boot.id;
    } else {
      activeCategoryId = CATEGORIES[0]?.id || '';
      activeSetId = CATEGORIES[0]?.sets?.[0]?.id || '';
    }

    await buildNavigator();

    if (boot) {
      await selectSet(boot.category, boot.id, boot.name);
    }

    // Auto-pick up new folders while the page is open
    window.addEventListener('focus', () => {
      urlCache.clear();
      refreshCatalog({ keepSelection: true });
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        urlCache.clear();
        refreshCatalog({ keepSelection: true });
      }
    });
    setInterval(() => {
      refreshCatalog({ keepSelection: true });
    }, 3000);

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    rafId = requestAnimationFrame(tickLiquid);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
