/**
 * Tile Craft — First Fold Interactions
 * Liquid mouse background · Gravity dropzone · AI compute narrative
 * Categories/sets loaded from catalog.json — array order is nav order (no folder-name sort).
 * generate_catalog.py puts ART COLLECTIONS members first; nav stays one category level.
 * Main menu: Space Styling Examples, Art Collections, Request Quote.
 * Home is Space Styling Examples — Column (기둥), first image. Navigator stays on the collection view.
 */

(() => {
  'use strict';

  const ASSET_ROOT = 'assets';
  const IMAGE_EXTS = ['webp', 'png'];
  const MENU_MODES = ['cases', 'collection', 'order'];
  let CATEGORIES = [];
  let INSTALLATIONS = [];
  let activeMode = 'cases';
  let activeCaseKey = '';
  let activeCaseSpace = '';

  function categoryRel(category) {
    const cat = CATEGORIES.find((c) => c.id === category);
    return cat?.dir || category;
  }

  function categorySegments(category) {
    return String(categoryRel(category))
      .split('/')
      .filter(Boolean)
      .map((part) => encodeURIComponent(part));
  }

  const pairPath = (category, setId, kind, baseName, ext = 'webp') => {
    const base = baseName || setId.replace(/_1SET$/, '');
    const file = `${base}_${kind}.${ext}`;
    return [
      ASSET_ROOT,
      ...categorySegments(category),
      encodeURIComponent(setId),
      encodeURIComponent(file),
    ].join('/');
  };

  function assetCandidates(category, setId, kind) {
    const meta = findSetMeta(category, setId);
    const base = meta?.base || setId.replace(/_1SET$/, '');
    const altKind = kind === 'grid' ? 'preview' : 'grid';
    const kindExt = String(
      kind === 'grid' ? meta?.gridExt || meta?.previewExt : meta?.previewExt || meta?.gridExt
    ).toLowerCase();
    const extOrder = kindExt === 'webp' ? IMAGE_EXTS : ['png', 'webp'];
    const urls = [];
    const seen = new Set();
    const push = (url) => {
      if (url && !seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    };
    for (const k of [kind, altKind]) {
      for (const ext of extOrder) {
        push(pairPath(category, setId, k, base, ext));
      }
    }
    for (const ext of extOrder) {
      push(
        [ASSET_ROOT, ...categorySegments(category), encodeURIComponent(setId), `preview.${ext}`].join('/')
      );
    }
    return urls;
  }

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

    let url = null;
    for (const candidate of assetCandidates(category, setId, kind)) {
      url = await tryLoadUrl(candidate);
      if (url) break;
    }
    if (!url) {
      console.warn('[Tile Craft] missing asset', pairPath(category, setId, kind));
    }

    urlCache.set(key, url);
    return url;
  }

  async function loadCatalog() {
    // Relative catalog.json for GitHub Pages.
    // /api/catalog is for local serve.py only.
    const endpoints = [
      `./catalog.json?t=${Date.now()}`,
      `/api/catalog?t=${Date.now()}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, { cache: 'no-store' });
        if (!res.ok) continue;
        const data = await res.json();
        const cats = Array.isArray(data) ? data : data.categories;
        if (Array.isArray(cats) && cats.length) {
          INSTALLATIONS = normalizeInstallations(data.installations);
          CATEGORIES = dedupeCatalog(
            cats.map((c) => ({
              id: c.id,
              dir: c.dir || c.id,
              label: c.label || c.id,
              sets: (c.sets || []).map((s) => ({
                id: s.id,
                name: s.name || s.id.replace(/_1SET$/, ''),
                base: s.base || s.id.replace(/_1SET$/, ''),
                hasPreview: !!s.hasPreview,
                hasGrid: !!s.hasGrid,
                previewExt: String(s.previewExt || ''),
                gridExt: String(s.gridExt || ''),
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
    INSTALLATIONS = [];
    return CATEGORIES;
  }

  function normalizeInstallations(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((space) => space && space.id && Array.isArray(space.images))
      .map((space) => ({
        id: String(space.id),
        name: String(space.name || space.id),
        images: space.images
          .filter((img) => img && (img.src || img.file))
          .map((img) => ({
            name: String(img.name || img.file || ''),
            file: String(img.file || ''),
            src: String(img.src || ''),
          })),
      }))
      .filter((space) => space.images.length);
  }

  function catalogSignature() {
    const caseSig = INSTALLATIONS.map(
      (space) => `${space.id}:${space.images.map((img) => img.file).join(',')}`
    ).join('|');
    return `${CATEGORIES.map(
      (c) => `${c.id}:${c.sets.map((s) => s.id).join(',')}`
    ).join('|')}||${caseSig}`;
  }

  function getCategory(catId) {
    return CATEGORIES.find((c) => c.id === catId);
  }

  function getSets(catId) {
    return getCategory(catId)?.sets || [];
  }

  function isAbstractCategory(id) {
    const name = String(id || '');
    return name.includes('ABSTRACT') || name.includes('추상화');
  }

  function pickBootSet() {
    const abstract = CATEGORIES.find((c) => isAbstractCategory(c.id) && c.sets?.length);
    if (abstract) {
      const set = abstract.sets.find((s) => s.hasProduct || (s.palette && s.palette.length)) || abstract.sets[0];
      return { category: abstract.id, ...set };
    }

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
  const navDrop = document.getElementById('nav-drop');
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
  const navZoomLabel = document.getElementById('nav-zoom-label');
  const navZoomValue = document.getElementById('nav-zoom-value');
  const root = document.documentElement;

  let busy = false;
  let activeCategoryId = '';
  let activeSetId = '';
  let showingTile = false;
  let previewNavActive = false;
  let minimapDragging = false;
  let stageDragging = false;
  let pinchScale = null;
  let gridRenderGen = 0;
  let catalogRefresh = null;
  let catalogRefreshQueued = false;
  let catalogRefreshOpts = { keepSelection: true };

  const ZOOM_MIN = 0;
  const ZOOM_MAX = 15;
  const ZOOM_DEFAULT = 10;
  const GRID_ZOOM_MIN = 6;

  function isMobileLayout() {
    return window.matchMedia('(max-width: 767px)').matches;
  }

  function isStagePanIgnore(target) {
    return !!target?.closest?.(
      '#palette-dock, #navigator, #launch-modal, #about-rail, #value-rail, .site-header, .launch-toast, #main-menu, #cases-view, #quote-dock'
    );
  }

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
      if (activeMode === 'cases') {
        fitCasePhoto();
        placeCaseCaption();
      }
      layoutMinimapFrame();
      const z = clampZoom(camera.zoom);
      if (z !== camera.zoom) {
        setZoom(z);
        return;
      }
      clampFocusToCrop();
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
    if (activeMode === 'cases') renderCases();
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

  function bindThumbFallbacks(img, urls) {
    let i = 0;
    img.addEventListener('error', () => {
      i += 1;
      if (i < urls.length) {
        img.src = urls[i];
        return;
      }
      img.remove();
      img.closest('.nav-cell')?.classList.add('is-missing');
    });
    if (urls[0]) img.src = urls[0];
  }

  function renderSetGrid() {
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
      const urls = assetCandidates(catId, set.id, set.hasPreview === false ? 'grid' : 'preview');
      if (urls.length) {
        const img = document.createElement('img');
        img.className = 'nav-cell-img';
        img.alt = '';
        img.draggable = false;
        img.loading = 'lazy';
        img.decoding = 'async';
        bindThumbFallbacks(img, urls);
        cell.appendChild(img);
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
    const changingWork = activeCategoryId !== categoryId || activeSetId !== setId;
    if (changingWork) camera.zoom = 0;
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
      dir: categoryRel(categoryId),
      setId,
      base: meta?.base,
    });
    layoutMinimapFrame();
    if (navMode && window.TileCraftSim.isActive()) {
      navMode.textContent = 'TILE';
    }
    if (isMobileLayout()) {
      requestAnimationFrame(() => {
        clampFocusToCrop();
        applyCamera();
      });
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

  function getMobileBottomInset() {
    if (!isMobileLayout()) return 0;
    let top = window.innerHeight;
    const nav = document.getElementById('navigator');
    if (nav) {
      const box = nav.getBoundingClientRect();
      if (box.height > 0) top = Math.min(top, box.top);
    }
    const pal = document.getElementById('palette-dock');
    if (pal && !pal.hidden) {
      const box = pal.getBoundingClientRect();
      if (box.height > 0) top = Math.min(top, box.top);
    }
    return Math.max(0, Math.round(window.innerHeight - top));
  }

  function getStageView() {
    const bottom = getMobileBottomInset();
    return {
      originX: 0,
      originY: 0,
      vw: window.innerWidth,
      vh: Math.max(1, window.innerHeight - bottom),
    };
  }

  function getFitScale() {
    const { vw, vh } = getStageView();
    const pad = 8;
    const availW = Math.max(1, vw - pad * 2);
    const availH = Math.max(1, vh - pad * 2);
    return Math.min(availW / Math.max(1, camera.imgW), availH / Math.max(1, camera.imgH));
  }

  function isFitZoom(z = camera.zoom) {
    return clampZoom(z) === 0;
  }

  function getZoomScale(z = camera.zoom) {
    if (pinchScale != null) return pinchScale;
    const level = clampZoom(z);
    return level === 0 ? getFitScale() : level;
  }

  function clampRenderScale(scale) {
    const n = Number(scale);
    if (!Number.isFinite(n) || n <= 0) return getFitScale();
    return Math.min(ZOOM_MAX, Math.max(getFitScale(), n));
  }

  function scaleToZoomLevel(scale) {
    const fit = getFitScale();
    if (!Number.isFinite(scale) || scale <= (fit + 1) / 2) return 0;
    const rounded = Math.min(ZOOM_MAX, Math.max(1, Math.round(scale)));
    if (Number.isFinite(fit) && rounded < fit) return 0;
    return rounded;
  }

  function firstPixelZoom() {
    if (!camera.ready) return 1;
    const fit = getFitScale();
    if (!Number.isFinite(fit) || fit <= 0) return 1;
    const z = Math.max(1, Math.ceil(fit));
    return z > ZOOM_MAX ? 0 : z;
  }

  function getVisibleCrop() {
    const { originX, originY, vw, vh } = getStageView();
    const { imgW, imgH } = camera;
    const z = clampZoom(camera.zoom);
    const scale = getZoomScale(z);
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

    const scale = crop.scale;
    const leftPx = Math.round(crop.left * camera.imgW);
    const topPx = Math.round(crop.top * camera.imgH);
    const tx = crop.extraX - leftPx * scale;
    const ty = crop.extraY - topPx * scale;

    root.style.setProperty('--bg-tx', `${tx}px`);
    root.style.setProperty('--bg-ty', `${ty}px`);
    root.style.setProperty('--bg-scale', String(scale));
    root.style.setProperty('--z', String(scale));
    root.style.setProperty('--img-w', String(camera.imgW));
    root.style.setProperty('--img-h', String(camera.imgH));
    body.classList.toggle(
      'is-pixel-grid',
      pinchScale != null ? scale >= GRID_ZOOM_MIN : crop.z >= GRID_ZOOM_MIN
    );
    body.classList.toggle(
      'is-fit-view',
      pinchScale != null ? scale <= getFitScale() * 1.05 : crop.z === 0
    );

    root.style.setProperty('--nav-vp-x', `${((leftPx / camera.imgW) * 100).toFixed(3)}%`);
    root.style.setProperty('--nav-vp-y', `${((topPx / camera.imgH) * 100).toFixed(3)}%`);
    root.style.setProperty('--nav-vp-w', `${(crop.width * 100).toFixed(3)}%`);
    root.style.setProperty('--nav-vp-h', `${(crop.height * 100).toFixed(3)}%`);
  }

  function clampZoom(z) {
    const n = Math.round(Number(z));
    if (!Number.isFinite(n)) return ZOOM_DEFAULT;
    if (n <= ZOOM_MIN) return 0;
    const pixel = Math.min(ZOOM_MAX, Math.max(1, n));
    if (!camera.ready) return pixel;
    const fit = getFitScale();
    if (Number.isFinite(fit) && pixel < fit) return 0;
    return pixel;
  }

  function zoomModeName(z) {
    if (z === 0) return 'Artwork View';
    if (z < 10) return 'Distant';
    if (z === 10) return 'Mid';
    return 'Tile View';
  }

  function zoomValueText(z) {
    return String(z);
  }

  function applyZoomUi(z) {
    if (navZoomSlider) {
      navZoomSlider.value = String(z);
      navZoomSlider.setAttribute('aria-valuenow', String(z));
      navZoomSlider.setAttribute(
        'aria-valuetext',
        z === 0 ? 'Artwork View' : `${zoomModeName(z)} ${z}`
      );
    }
    if (navZoomLabel) navZoomLabel.textContent = zoomModeName(z);
    if (navZoomValue) navZoomValue.textContent = zoomValueText(z);
  }

  function syncZoomUi() {
    const z = clampZoom(camera.zoom);
    camera.zoom = z;
    applyZoomUi(z);
  }

  function setZoom(nextZoom, { clientX, clientY } = {}) {
    const z = clampZoom(nextZoom);
    if (!camera.ready) {
      camera.zoom = z;
      syncZoomUi();
      return;
    }

    if (z === 0) {
      camera.zoom = 0;
      camera.focusX = 0.5;
      camera.focusY = 0.5;
      camera.targetX = 0.5;
      camera.targetY = 0.5;
    } else if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
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
    const onChrome = e.target.closest?.('#palette-dock, #navigator, #launch-modal, #about-rail, #value-rail');
    if (onChrome && !onZoomUi) return;

    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    let next = camera.zoom + dir;
    if (camera.zoom === 0 && dir > 0) next = firstPixelZoom();
    setZoom(next, { clientX: e.clientX, clientY: e.clientY });
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
    if (!camera.ready || isFitZoom()) return;
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

  function panByScreenDelta(dx, dy) {
    if (!camera.ready || isFitZoom()) return;
    const scale = getZoomScale();
    camera.targetX -= dx / Math.max(1, camera.imgW * scale);
    camera.targetY -= dy / Math.max(1, camera.imgH * scale);
    camera.focusX = camera.targetX;
    camera.focusY = camera.targetY;
    clampFocusToCrop();
    applyCamera();
  }

  function bindStageDragPan() {
    const pointers = new Map();
    let panId = null;
    let lastX = 0;
    let lastY = 0;
    let pinch = null;

    const pointerList = () => [...pointers.values()];
    const distOf = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const midOf = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

    function stageReady() {
      return (
        camera.ready &&
        (previewNavActive || showingTile) &&
        !busy &&
        !body.classList.contains('is-modal-open')
      );
    }

    function applyLivePinch(midX, midY, nextScale) {
      const prev = getVisibleCrop();
      const { imgX, imgY } = pointerToImage(midX, midY, prev);
      pinchScale = clampRenderScale(nextScale);
      const next = getVisibleCrop();
      camera.focusX =
        imgX - (midX - next.originX - next.extraX) / Math.max(1, next.dispW) + next.width / 2;
      camera.focusY =
        imgY - (midY - next.originY - next.extraY) / Math.max(1, next.dispH) + next.height / 2;
      camera.targetX = camera.focusX;
      camera.targetY = camera.focusY;
      clampFocusToCrop();
      applyCamera();
      applyZoomUi(scaleToZoomLevel(pinchScale));
    }

    function endPinch(midX, midY) {
      if (pinchScale == null) {
        pinch = null;
        return;
      }
      const snapped = scaleToZoomLevel(pinchScale);
      pinch = null;
      pinchScale = null;
      setZoom(snapped, {
        clientX: Number.isFinite(midX) ? midX : undefined,
        clientY: Number.isFinite(midY) ? midY : undefined,
      });
    }

    function startPinch() {
      const pts = pointerList();
      if (pts.length < 2) return;
      const dist = distOf(pts[0], pts[1]);
      if (dist < 8) return;
      stageDragging = true;
      panId = null;
      pinch = {
        startDist: dist,
        startScale: pinchScale != null ? pinchScale : getZoomScale(),
      };
    }

    const onDown = (e) => {
      if (!isMobileLayout()) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!stageReady()) return;
      if (isStagePanIgnore(e.target)) return;

      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        e.target.setPointerCapture?.(e.pointerId);
      } catch (_) {
        /* capture is optional */
      }

      if (pointers.size >= 2) {
        startPinch();
        return;
      }

      if (isFitZoom() && pinchScale == null) return;

      stageDragging = true;
      panId = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
    };

    const onMove = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (!pinch && pointers.size >= 2) startPinch();

      if (pinch && pointers.size >= 2) {
        const pts = pointerList();
        const dist = distOf(pts[0], pts[1]);
        const mid = midOf(pts[0], pts[1]);
        applyLivePinch(mid.x, mid.y, pinch.startScale * (dist / Math.max(1, pinch.startDist)));
        return;
      }

      if (!stageDragging || pinch || e.pointerId !== panId) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (!dx && !dy) return;
      panByScreenDelta(dx, dy);
    };

    const onUp = (e) => {
      if (!pointers.has(e.pointerId)) {
        if (e.pointerId === panId) {
          stageDragging = false;
          panId = null;
        }
        return;
      }

      pointers.delete(e.pointerId);

      if (pinch) {
        if (pointers.size < 2) {
          const leftover = pointerList()[0];
          endPinch(leftover?.x ?? e.clientX, leftover?.y ?? e.clientY);
          stageDragging = false;
          panId = null;
        }
        return;
      }

      if (e.pointerId === panId) {
        stageDragging = false;
        panId = null;
      }
    };

    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
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
    if (minimapDragging || stageDragging || pinchScale != null) return;
    if (isMobileLayout()) return;
    if (e.target.closest?.('#palette-dock, #navigator, #launch-modal, #about-rail, #value-rail')) return;

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

    if ((previewNavActive || showingTile) && !isFitZoom()) {
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

    if (navModeOn && camera.ready && !minimapDragging && !stageDragging && pinchScale == null && !isFitZoom()) {
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
  let emailJsLoader = null;

  function ensureEmailJs() {
    if (typeof emailjs !== 'undefined' && typeof emailjs.send === 'function') {
      return Promise.resolve();
    }
    if (emailJsLoader) return emailJsLoader;
    emailJsLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        emailJsLoader = null;
        reject(new Error('EmailJS SDK failed to load'));
      };
      document.head.appendChild(script);
    });
    return emailJsLoader;
  }

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
    ensureEmailJs().catch(() => {});
    const closeBtn = launchModal.querySelector('.launch-modal-close');
    closeBtn?.focus({ preventScroll: true });
  }

  function closeLaunchModal() {
    if (!launchModal || launchModal.hidden) return;
    launchModal.hidden = true;
    launchModal.setAttribute('aria-hidden', 'true');
    body.classList.remove('is-modal-open');
    const mobileDrop = navDrop && isMobileLayout();
    (mobileDrop ? navDrop : dropzone)?.focus({ preventScroll: true });
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

    if (launchSubmit) {
      launchSubmit.disabled = true;
      launchSubmit.textContent = 'Sending…';
    }

    try {
      await ensureEmailJs();
      if (typeof emailjs === 'undefined' || typeof emailjs.send !== 'function') {
        throw new Error('EmailJS SDK failed to load');
      }
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

  function requestDropAction() {
    if (busy) return;
    if (activeMode === 'order') {
      fileInput?.click();
      return;
    }
    openLaunchModal();
  }

  function acceptQuoteReference(file) {
    if (!file || !String(file.type || '').startsWith('image/')) return;
    quoteReferenceName = file.name;
    const nameEl = document.getElementById('quote-file-name');
    if (nameEl) nameEl.textContent = file.name;
    updateQuoteSummary();
  }

  dropzone.addEventListener('drop', (e) => {
    dropzone.classList.remove('is-dragover');
    if (activeMode === 'order') {
      acceptQuoteReference(e.dataTransfer?.files?.[0]);
      return;
    }
    requestDropAction();
  });

  dropzone.addEventListener('click', (event) => {
    if (event.target === fileInput) return;
    requestDropAction();
  });

  dropzone.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !busy) {
      e.preventDefault();
      requestDropAction();
    }
  });

  navDrop?.addEventListener('click', requestDropAction);

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

  function scheduleIdle(fn, timeout = 1800) {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => fn(), { timeout });
      return;
    }
    setTimeout(fn, 1);
  }

  /* ---------- Main menu ---------- */
  function modeFromLocation() {
    const hash = (location.hash || '').replace(/^#/, '').toLowerCase();
    if (!hash || hash === 'cases') return 'cases';
    return MENU_MODES.includes(hash) ? hash : 'cases';
  }

  function caseImageSrc(img, spaceId) {
    if (img.src) return img.src;
    return [ASSET_ROOT, 'SpaceStylingExamples', spaceId, img.file].map(encodeURIComponent).join('/');
  }

  function fitCasePhoto() {
    const photo = document.getElementById('cases-photo');
    if (!photo || photo.hidden) return;
    const imgW = photo.naturalWidth;
    const imgH = photo.naturalHeight;
    if (!imgW || !imgH) return;

    const frame = photo.closest('.cases-frame');
    const mobile = isMobileLayout();
    if (frame) {
      if (mobile) {
        const bar = document.getElementById('cases-bar');
        const lead = document.querySelector('.header-lead');
        const top = lead ? Math.ceil(lead.getBoundingClientRect().bottom) + 12 : 16;
        const barTop = bar && !bar.hidden ? bar.getBoundingClientRect().top : window.innerHeight - 16;
        const bottom = Math.max(16, Math.ceil(window.innerHeight - barTop) + 12);
        frame.style.paddingTop = `${top}px`;
        frame.style.paddingRight = '8px';
        frame.style.paddingBottom = `${bottom}px`;
        frame.style.paddingLeft = '8px';
      } else {
        frame.style.paddingTop = '';
        frame.style.paddingRight = '';
        frame.style.paddingBottom = '';
        frame.style.paddingLeft = '';
      }
    }

    const box = frame ? frame.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
    const frameStyle = frame ? getComputedStyle(frame) : null;
    const padX = frameStyle ? parseFloat(frameStyle.paddingLeft) + parseFloat(frameStyle.paddingRight) : 16;
    const padY = frameStyle ? parseFloat(frameStyle.paddingTop) + parseFloat(frameStyle.paddingBottom) : 16;
    const availW = Math.max(1, box.width - padX);
    const availH = Math.max(1, box.height - padY);
    const scale = Math.min(availW / imgW, availH / imgH);
    photo.style.width = `${Math.max(1, Math.round(imgW * scale))}px`;
    photo.style.height = `${Math.max(1, Math.round(imgH * scale))}px`;
  }

  function bindCasePhotoFit() {
    const photo = document.getElementById('cases-photo');
    if (!photo || photo.dataset.fitBound === '1') return;
    photo.dataset.fitBound = '1';
    photo.addEventListener('load', fitCasePhoto);
  }

  function renderCases() {
    const photo = document.getElementById('cases-photo');
    const spaceEl = document.getElementById('cases-space');
    const nameEl = document.getElementById('cases-name');
    const spacesEl = document.getElementById('cases-spaces');
    const strip = document.getElementById('cases-strip');
    const empty = document.getElementById('cases-empty');
    const bar = document.getElementById('cases-bar');
    if (!photo || !strip || !empty || !bar || !spacesEl) return;

    const spaces = INSTALLATIONS.filter((space) => space.images?.length);

    if (!spaces.length) {
      photo.hidden = true;
      photo.removeAttribute('src');
      photo.alt = '';
      bar.hidden = true;
      spacesEl.hidden = true;
      spacesEl.replaceChildren();
      strip.hidden = true;
      strip.replaceChildren();
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    photo.hidden = false;
    bar.hidden = false;
    spacesEl.hidden = false;

    if (!spaces.some((space) => space.id === activeCaseSpace)) {
      activeCaseSpace = spaces[0].id;
    }
    const space = spaces.find((item) => item.id === activeCaseSpace) || spaces[0];
    activeCaseSpace = space.id;

    spacesEl.replaceChildren(
      ...spaces.map((item) => {
        const on = item.id === space.id;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cases-space-btn' + (on ? ' is-active' : '');
        btn.textContent = item.name;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
        btn.addEventListener('click', () => {
          if (activeCaseSpace === item.id) return;
          activeCaseSpace = item.id;
          const first = item.images[0];
          activeCaseKey = first ? `${item.id}/${first.file}` : '';
          renderCases();
        });
        return btn;
      })
    );

    const current = space.images.find((img) => `${space.id}/${img.file}` === activeCaseKey) || space.images[0];
    activeCaseKey = `${space.id}/${current.file}`;
    const src = caseImageSrc(current, space.id);
    if (photo.getAttribute('src') !== src) photo.src = src;
    photo.alt = `${space.name} ${current.name}`;
    bindCasePhotoFit();
    if (spaceEl) spaceEl.textContent = space.name;
    if (nameEl) nameEl.textContent = current.name;

    strip.hidden = false;
    strip.replaceChildren(
      ...space.images.map((img) => {
        const on = `${space.id}/${img.file}` === activeCaseKey;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cases-thumb' + (on ? ' is-active' : '');
        btn.title = img.name;
        btn.setAttribute('aria-label', img.name);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        const thumb = document.createElement('img');
        thumb.alt = '';
        thumb.draggable = false;
        thumb.src = caseImageSrc(img, space.id);
        btn.appendChild(thumb);
        btn.addEventListener('click', () => {
          activeCaseKey = `${space.id}/${img.file}`;
          renderCases();
        });
        return btn;
      })
    );
    requestAnimationFrame(() => {
      if (photo.complete) fitCasePhoto();
      placeCaseCaption();
    });
  }

  function revealCaseThumb(strip, active) {
    const stripRect = strip.getBoundingClientRect();
    const thumbRect = active.getBoundingClientRect();
    if (thumbRect.left < stripRect.left - 1) {
      strip.scrollLeft -= stripRect.left - thumbRect.left;
    } else if (thumbRect.right > stripRect.right + 1) {
      strip.scrollLeft += thumbRect.right - stripRect.right;
    }
  }

  function placeCaseCaption() {
    const strip = document.getElementById('cases-strip');
    const caption = document.querySelector('.cases-caption');
    if (!caption) return;
    const active = strip && !strip.hidden ? strip.querySelector('.cases-thumb.is-active') : null;
    if (strip && active) revealCaseThumb(strip, active);
    if (isMobileLayout()) {
      caption.style.setProperty('--cases-caption-inset', '0px');
      return;
    }
    if (!strip || !active) {
      caption.style.setProperty('--cases-caption-inset', '0px');
      return;
    }
    const inset = strip.getBoundingClientRect().right - active.getBoundingClientRect().right;
    caption.style.setProperty('--cases-caption-inset', `${Math.max(0, Math.round(inset))}px`);
  }

  let quoteReferenceName = '';
  let quoteLaunchConfirmed = false;

  function quoteAspect(width, height) {
    const a = Math.round(Number(width) * 10);
    const b = Math.round(Number(height) * 10);
    if (!a || !b) return '';
    const gcd = (x, y) => (y ? gcd(y, x % y) : x);
    const d = gcd(a, b);
    return `${a / d}:${b / d}`;
  }

  function quoteArtworkName() {
    const style = document.getElementById('quote-style')?.value || '';
    if (!style || style !== activeCategoryId) return '';
    const cat = getCategory(activeCategoryId);
    return cat?.sets?.find((set) => set.id === activeSetId)?.name || '';
  }

  function syncQuoteStyle() {
    const select = document.getElementById('quote-style');
    if (!select) return;
    const preferred = CATEGORIES.some((cat) => cat.id === activeCategoryId)
      ? activeCategoryId
      : select.value;
    select.replaceChildren(
      ...CATEGORIES.map((cat) => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.label || cat.id;
        return option;
      })
    );
    if (preferred) select.value = preferred;
    updateQuoteSummary();
  }

  function readQuoteFields() {
    const space = document.getElementById('quote-space')?.value.trim() || '';
    const spaceNote = document.getElementById('quote-space-note')?.value.trim() || '';
    const width = document.getElementById('quote-width')?.value.trim() || '';
    const height = document.getElementById('quote-height')?.value.trim() || '';
    const style = document.getElementById('quote-style')?.value.trim() || '';
    const note = document.getElementById('quote-note')?.value.trim() || '';
    const email = document.getElementById('quote-email')?.value.trim() || '';
    return { space, spaceNote, width, height, style, note, email, artwork: quoteArtworkName() };
  }

  function updateQuoteSummary() {
    const summary = document.getElementById('quote-summary');
    if (!summary) return;
    const fields = readQuoteFields();
    const lines = [];
    if (fields.space) lines.push(`시공 장소: ${fields.space}${fields.spaceNote ? `, ${fields.spaceNote}` : ''}`);
    if (fields.width && fields.height) lines.push(`시공 크기: ${fields.width}m × ${fields.height}m`);
    if (fields.style) {
      lines.push(`이미지 스타일: ${fields.style}${fields.artwork ? ` · ${fields.artwork}` : ''}`);
    }
    if (quoteReferenceName) lines.push(`참고 이미지: ${quoteReferenceName}`);
    if (fields.note) lines.push(`요청: ${fields.note}`);
    summary.textContent = lines.length
      ? lines.join('\n')
      : '장소, 크기, 스타일을 입력하면 요청 요약이 여기에 표시됩니다.';
  }

  function buildQuoteMessage(fields) {
    const spaceEn = {
      로비: 'hotel lobby',
      외벽: 'exterior facade',
      복도: 'corridor',
      거실: 'living room',
      욕실: 'bathroom',
      바닥: 'floor',
      기타: 'interior space',
    }[fields.space] || fields.space;
    const place = [spaceEn, fields.spaceNote].filter(Boolean).join(', ');
    const size = fields.width && fields.height ? `${fields.width}m x ${fields.height}m` : '';
    const style = [fields.style, fields.artwork].filter(Boolean).join(' / ');
    const aspect = quoteAspect(fields.width, fields.height);
    const prompt = [
      'Architectural visualization of a 10mm square mosaic tile installation',
      place ? ` in a ${place}` : '',
      size ? `, wall ${fields.width}m wide by ${fields.height}m high` : '',
      style ? `, style of ${style}` : '',
      fields.note ? `, ${fields.note}` : '',
      ', precise grout grid, photoreal, no text',
      aspect ? ` --ar ${aspect}` : '',
    ].join('');

    return [
      'Tile Craft 시공 시안 요청',
      '',
      `시공 장소: ${[fields.space, fields.spaceNote].filter(Boolean).join(', ') || '-'}`,
      `시공 크기: ${size || '-'}`,
      `이미지 스타일: ${style || '-'}`,
      `참고 이미지: ${quoteReferenceName || '없음'}`,
      `한 줄 요청: ${fields.note || '-'}`,
      `이메일: ${fields.email}`,
      `오픈 안내 확인: ${quoteLaunchConfirmed ? '예' : '아니오'}`,
      '',
      'Prompt:',
      prompt,
    ].join('\n');
  }

  async function saveConsultation(fields) {
    const response = await fetch('/api/consultations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        space: fields.space,
        spaceNote: fields.spaceNote,
        widthM: fields.width,
        heightM: fields.height,
        style: fields.style,
        artwork: fields.artwork,
        note: fields.note,
        email: fields.email,
        referenceFile: quoteReferenceName,
        launchConfirmed: quoteLaunchConfirmed,
      }),
    });
    if (!response.ok) throw new Error('consultation log failed');
  }

  async function sendQuoteRequest(fields) {
    const submit = document.getElementById('quote-submit');
    const { publicKey, serviceId, templateId } = getEmailJsConfig();
    let logSaved = false;

    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Sending…';
    }
    try {
      try {
        await saveConsultation(fields);
        logSaved = true;
      } catch (err) {
        console.error('[consultation]', err);
      }

      if (!publicKey || !serviceId || !templateId) {
        showLaunchToast(
          logSaved
            ? '상담 목록에는 남겼습니다. 이메일 설정이 아직 연결되지 않았습니다.'
            : '이메일 설정이 아직 연결되지 않았습니다. .env.local을 확인해 주세요. / Email service is not configured.',
          { error: true }
        );
        return;
      }

      await ensureEmailJs();
      if (typeof emailjs === 'undefined' || typeof emailjs.send !== 'function') {
        throw new Error('EmailJS SDK failed to load');
      }
      emailjs.init({ publicKey });
      await emailjs.send(serviceId, templateId, {
        user_email: fields.email,
        message: buildQuoteMessage(fields),
        reply_to: fields.email,
      });
      showLaunchToast(
        logSaved
          ? '시공 시안 요청이 접수되었습니다. / Your quote request has been received.'
          : '메일은 보냈습니다. 상담 목록에는 남기지 못했습니다.'
      );
    } catch (err) {
      console.error('[EmailJS]', err);
      showLaunchToast(
        logSaved
          ? '상담 목록에는 남겼습니다. 메일 전송은 실패했습니다.'
          : '전송에 실패했습니다. 잠시 후 다시 시도해 주세요. / Failed to send. Please try again.',
        { error: true }
      );
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = '요청 보내기';
      }
    }
  }

  function bindQuoteForm() {
    const form = document.getElementById('quote-form');
    if (!form) return;
    form.addEventListener('input', updateQuoteSummary);
    form.addEventListener('change', updateQuoteSummary);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const fields = readQuoteFields();
      if (!fields.space || !fields.width || !fields.height || !fields.style || !fields.email) return;
      sendQuoteRequest(fields);
    });
    document.getElementById('quote-launch-confirm')?.addEventListener('click', () => {
      quoteLaunchConfirmed = true;
      const note = document.getElementById('quote-launch-note');
      if (note) note.hidden = true;
    });
    fileInput?.addEventListener('click', (event) => event.stopPropagation());
    fileInput?.addEventListener('change', () => {
      acceptQuoteReference(fileInput.files?.[0]);
      fileInput.value = '';
    });
  }

  function setMode(mode, { historyMode = 'push' } = {}) {
    const next = MENU_MODES.includes(mode) ? mode : 'cases';
    activeMode = next;

    if (next === 'cases') {
      const spacesEl = document.getElementById('cases-spaces');
      const entering = body.dataset.mode !== 'cases';
      if (entering || !spacesEl?.childElementCount) renderCases();
      if (entering && spacesEl) void spacesEl.offsetWidth;
    }

    body.dataset.mode = next;
    placeMobileMenu();

    document.querySelectorAll('#main-menu [data-mode]').forEach((btn) => {
      const on = btn.dataset.mode === next;
      btn.classList.toggle('is-active', on);
      if (on) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });

    const casesView = document.getElementById('cases-view');
    if (casesView) casesView.hidden = next !== 'cases';
    if (next === 'collection') showCollectionHome();
    if (next === 'order') syncQuoteStyle();

    const hash = next === 'cases' ? '' : `#${next}`;
    const url = `${location.pathname}${location.search}${hash}`;
    const current = `${location.pathname}${location.search}${location.hash}`;
    if (current === url || historyMode === 'none') return;
    if (historyMode === 'replace') history.replaceState({ mode: next }, '', url);
    else history.pushState({ mode: next }, '', url);
  }

  function showCollectionHome() {
    const boot = pickBootSet();
    if (!boot) return;
    camera.zoom = 0;
    activeCategoryId = boot.category;
    activeSetId = boot.id;
    if (navCats) buildCategoryTabs();
    selectSet(boot.category, boot.id, boot.name);
  }

  function placeMobileMenu() {
    const menu = document.getElementById('main-menu');
    const frame = document.querySelector('.navigator-frame');
    const header = document.querySelector('.site-header');
    if (!menu || !frame || !header) return;

    const dockInNav = isMobileLayout() && body.dataset.mode === 'collection';
    const parent = dockInNav ? frame : header;
    if (menu.parentElement !== parent) {
      if (dockInNav) frame.insertBefore(menu, frame.firstChild);
      else header.appendChild(menu);
    }

    if (!dockInNav) {
      body.style.removeProperty('--nav-mobile-h');
      return;
    }

    requestAnimationFrame(() => {
      const nav = document.getElementById('navigator');
      if (!nav || body.dataset.mode !== 'collection') return;
      const height = Math.ceil(nav.getBoundingClientRect().height);
      if (height > 0) body.style.setProperty('--nav-mobile-h', `${height}px`);
    });
  }

  function bindMainMenu() {
    document.querySelectorAll('#main-menu [data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });

    window.matchMedia('(max-width: 767px)').addEventListener('change', placeMobileMenu);
    window.addEventListener('resize', placeMobileMenu);

    document.querySelector('.brand-mark')?.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      setMode('cases');
    });

    window.addEventListener('popstate', () => {
      setMode(modeFromLocation(), { historyMode: 'none' });
    });
  }

  /* ---------- Boot ---------- */
  async function init() {
    await loadCatalog();

    if (!CATEGORIES.length) {
      navSetName.textContent = 'NO ASSETS';
      navMode.textContent = 'EMPTY';
      console.warn('[Tile Craft] No categories found. Run: python generate_catalog.py');
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
    bindStageDragPan();
    bindMainMenu();
    bindQuoteForm();
    setMode(modeFromLocation(), { historyMode: 'replace' });

    scheduleIdle(() => {
      if (boot) selectSet(boot.category, boot.id, boot.name);
    }, 1200);

    scheduleIdle(() => {
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
    }, 2200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
