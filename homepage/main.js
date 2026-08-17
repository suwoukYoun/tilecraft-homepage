/**
 * Tile Craft — 1:1 real-tile mapping engine + dynamic palette UI
 * Masks from preview.png / product.json palette; textures from tiles.json.
 * Zoom/pan stays on CSS transforms so hover/lock only swap backgrounds.
 */
(() => {
  'use strict';

  const ASSET_ROOT = '../assets';
  const TILES_URL = `${ASSET_ROOT}/tiles/tiles.json`;
  const CAT_ORDER = ['wall', 'floor', 'other'];
  const CAT_LABELS = { wall: '벽', floor: '바닥', other: '기타' };

  const els = {};
  const state = {
    ready: false,
    active: false,
    bindId: 0,
    defaults: { physicalSizeCm: 10, mosaicCellMm: 10, texturePx: 64 },
    tiles: [],
    product: null,
    slots: [],
    activeSlot: -1,
    pickerCat: 'wall',
    maskUrls: [],
  };

  let readyResolve;
  const ready = new Promise((resolve) => {
    readyResolve = resolve;
  });

  function encodePath(rel) {
    return String(rel || '')
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
  }

  function assetUrl(rel) {
    return `${ASSET_ROOT}/${encodePath(rel)}`;
  }

  function productUrl(category, setId) {
    return [ASSET_ROOT, encodeURIComponent(category), encodeURIComponent(setId), 'product.json'].join('/');
  }

  function previewUrl(category, setId, base) {
    const file = `${base || setId}_preview.png`;
    return [ASSET_ROOT, encodeURIComponent(category), encodeURIComponent(setId), encodeURIComponent(file)].join('/');
  }

  function previewFallbackUrl(category, setId) {
    return [ASSET_ROOT, encodeURIComponent(category), encodeURIComponent(setId), 'preview.png'].join('/');
  }

  function normalizeHex(value) {
    let hex = String(value || '').trim();
    if (!hex.startsWith('#')) hex = `#${hex}`;
    hex = hex.toUpperCase();
    if (/^#[0-9A-F]{3}$/.test(hex)) {
      hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    return /^#[0-9A-F]{6}$/.test(hex) ? hex : '#888888';
  }

  function parseRgb(hex) {
    const h = normalizeHex(hex).slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function rgbKey(r, g, b) {
    return (r << 16) | (g << 8) | b;
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`image failed: ${url}`));
      img.src = url;
    });
  }

  async function tryLoadImage(url) {
    try {
      return await loadImage(url);
    } catch (_) {
      return null;
    }
  }

  function canvasToUrl(canvas) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(URL.createObjectURL(blob));
        else resolve(canvas.toDataURL('image/png'));
      }, 'image/png');
    });
  }

  function revokeMasks() {
    state.maskUrls.forEach((url) => {
      if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
    });
    state.maskUrls = [];
  }

  function tileCategory(tile) {
    const raw = String(tile?.category || 'other').toLowerCase();
    if (raw === 'wall' || raw === '벽') return 'wall';
    if (raw === 'floor' || raw === '바닥') return 'floor';
    return 'other';
  }

  function tileSizeCm(tile) {
    const fallback = Number(state.defaults.physicalSizeCm) || 10;
    const p = tile?.physicalSize;
    if (p == null) {
      const n = Number(tile?.physicalSizeCm);
      return { w: Number.isFinite(n) ? n : fallback, h: Number.isFinite(n) ? n : fallback };
    }
    if (typeof p === 'number') return { w: p, h: p };
    const w = Number(p.widthCm ?? p.width ?? p.cm ?? fallback);
    const h = Number(p.heightCm ?? p.height ?? p.cm ?? w ?? fallback);
    return {
      w: Number.isFinite(w) ? w : fallback,
      h: Number.isFinite(h) ? h : fallback,
    };
  }

  /**
   * Repeat size in mask-image pixels.
   * preview.png 1px = one physical tile (default 10cm).
   * physicalSize scales the cell so a 20cm tile covers 2 preview pixels.
   */
  function repeatPx(tile) {
    const refCm = Number(state.defaults.physicalSizeCm) || 10;
    const { w, h } = tileSizeCm(tile);
    const product = state.product || {};
    const imgW = Number(product._imgW) || 1;
    const imgH = Number(product._imgH) || 1;

    if (product.physicalWidthCm || product.widthCm) {
      const designW = Number(product.physicalWidthCm || product.widthCm);
      const designH = Number(product.physicalHeightCm || product.heightCm || designW * (imgH / imgW));
      const pxPerCmX = imgW / Math.max(0.001, designW);
      const pxPerCmY = imgH / Math.max(0.001, designH);
      return { w: Math.max(1, w * pxPerCmX), h: Math.max(1, h * pxPerCmY) };
    }

    return {
      w: Math.max(1, w / refCm),
      h: Math.max(1, h / refCm),
    };
  }

  function tileImageUrl(tile) {
    return assetUrl(tile.imagePath);
  }

  function closestTile(hex, pool) {
    const list = pool && pool.length ? pool : state.tiles;
    if (!list.length) return null;
    const [r, g, b] = parseRgb(hex);
    let best = list[0];
    let bestD = Infinity;
    for (const tile of list) {
      const [tr, tg, tb] = parseRgb(tile.avgColor || '#000000');
      const d = (r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2;
      const catBias = tileCategory(tile) === 'wall' ? 0 : 0.25;
      if (d + catBias < bestD) {
        bestD = d + catBias;
        best = tile;
      }
    }
    return best;
  }

  function effectiveTile(slot) {
    return slot.hoverTile || slot.lockedTile || null;
  }

  function paintLayer(layerEl, tile) {
    if (!layerEl) return;
    if (!tile) {
      layerEl.style.backgroundImage = 'none';
      return;
    }
    const size = repeatPx(tile);
    layerEl.style.setProperty('--tile-cells-x', String(size.w));
    layerEl.style.setProperty('--tile-cells-y', String(size.h));
    layerEl.style.backgroundImage = `url("${tileImageUrl(tile)}")`;
  }

  function paintSlot(slot) {
    const tile = effectiveTile(slot);
    paintLayer(slot.layerEl, tile);
    paintLayer(slot.miniEl, tile);
    if (slot.chipEl) {
      slot.chipEl.classList.toggle('is-mapped', !!slot.lockedTile);
      slot.chipEl.classList.toggle('is-preview', !!slot.hoverTile);
      slot.chipEl.style.setProperty('--chip-hex', slot.hex);
      slot.chipEl.style.setProperty('--chip-tile', tile ? `url("${tileImageUrl(tile)}")` : 'none');
      const label = tile ? `${slot.hex} · ${tile.name}` : slot.hex;
      slot.chipEl.title = label;
      slot.chipEl.setAttribute('aria-label', label);
    }
  }

  function setSlotHover(slotIndex, tile) {
    const slot = state.slots[slotIndex];
    if (!slot) return;
    slot.hoverTile = tile || null;
    paintSlot(slot);
  }

  function lockSlot(slotIndex, tile) {
    const slot = state.slots[slotIndex];
    if (!slot || !tile) return;
    slot.lockedTile = tile;
    slot.hoverTile = null;
    paintSlot(slot);
    renderPickerGrid();
  }

  function hidePicker() {
    if (!els.picker) return;
    els.picker.hidden = true;
    state.activeSlot = -1;
    state.slots.forEach((slot) => slot.chipEl?.classList.remove('is-active'));
  }

  function renderPickerTabs() {
    if (!els.pickerTabs) return;
    const present = new Set(state.tiles.map(tileCategory));
    const cats = CAT_ORDER.filter((id) => present.has(id));
    if (!cats.includes(state.pickerCat)) state.pickerCat = cats[0] || 'wall';
    els.pickerTabs.innerHTML = '';
    cats.forEach((id) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tile-picker-tab' + (id === state.pickerCat ? ' is-active' : '');
      btn.textContent = CAT_LABELS[id] || id;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', id === state.pickerCat ? 'true' : 'false');
      btn.addEventListener('click', () => {
        state.pickerCat = id;
        renderPickerTabs();
        renderPickerGrid();
      });
      els.pickerTabs.appendChild(btn);
    });
  }

  function renderPickerGrid() {
    if (!els.pickerGrid) return;
    const slot = state.slots[state.activeSlot];
    const lockedId = slot?.lockedTile?.tileId;
    const hoverId = slot?.hoverTile?.tileId;
    const tiles = state.tiles.filter((t) => tileCategory(t) === state.pickerCat);
    els.pickerGrid.innerHTML = '';

    tiles.forEach((tile) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'tile-card';
      if (tile.tileId === lockedId) card.classList.add('is-locked');
      if (tile.tileId === hoverId) card.classList.add('is-preview');
      card.style.backgroundImage = `url("${tileImageUrl(tile)}")`;
      card.title = `${tile.name} · ${tileSizeCm(tile).w}cm`;
      card.setAttribute('role', 'option');
      const name = document.createElement('span');
      name.className = 'tile-card-name';
      name.textContent = tile.name;
      card.appendChild(name);
      card.addEventListener('pointerenter', () => {
        if (state.activeSlot < 0) return;
        setSlotHover(state.activeSlot, tile);
        [...els.pickerGrid.children].forEach((el) => el.classList.remove('is-preview'));
        card.classList.add('is-preview');
      });
      card.addEventListener('click', () => {
        lockSlot(state.activeSlot, tile);
      });
      els.pickerGrid.appendChild(card);
    });

    els.pickerGrid.onpointerleave = () => {
      if (state.activeSlot < 0) return;
      setSlotHover(state.activeSlot, null);
      [...els.pickerGrid.children].forEach((el) => el.classList.remove('is-preview'));
    };
  }

  function openPicker(slotIndex) {
    if (!els.picker || !state.slots[slotIndex]) return;
    if (state.activeSlot === slotIndex && !els.picker.hidden) {
      hidePicker();
      return;
    }
    state.activeSlot = slotIndex;
    const slot = state.slots[slotIndex];
    state.slots.forEach((s, i) => s.chipEl?.classList.toggle('is-active', i === slotIndex));
    if (els.pickerHex) els.pickerHex.textContent = slot.hex;
    const lockedCat = slot.lockedTile ? tileCategory(slot.lockedTile) : 'wall';
    state.pickerCat = lockedCat;
    renderPickerTabs();
    renderPickerGrid();
    els.picker.hidden = false;
  }

  function renderChips() {
    if (!els.bar) return;
    els.bar.innerHTML = '';
    state.slots.forEach((slot, i) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'palette-chip';
      chip.style.setProperty('--chip-hex', slot.hex);
      chip.setAttribute('role', 'listitem');
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        openPicker(i);
      });
      slot.chipEl = chip;
      els.bar.appendChild(chip);
      paintSlot(slot);
    });
  }

  function clearLayers() {
    if (els.layers) els.layers.innerHTML = '';
    if (els.mini) els.mini.innerHTML = '';
    state.slots.forEach((slot) => {
      slot.layerEl = null;
      slot.miniEl = null;
      slot.chipEl = null;
    });
  }

  function mountLayers() {
    if (!els.layers || !els.mini) return;
    els.layers.innerHTML = '';
    els.mini.innerHTML = '';
    state.slots.forEach((slot) => {
      const layer = document.createElement('div');
      layer.className = 'tile-sim-layer';
      layer.style.webkitMaskImage = `url("${slot.maskUrl}")`;
      layer.style.maskImage = `url("${slot.maskUrl}")`;
      els.layers.appendChild(layer);
      const mini = layer.cloneNode(true);
      els.mini.appendChild(mini);
      slot.layerEl = layer;
      slot.miniEl = mini;
      paintSlot(slot);
    });
  }

  function hexFromLightness(l) {
    const v = Math.round((Math.max(0, Math.min(100, Number(l))) / 100) * 255);
    const h = v.toString(16).padStart(2, '0').toUpperCase();
    return `#${h}${h}${h}`;
  }

  function lightnessFromHex(hex) {
    const [r, g, b] = parseRgb(hex);
    return Math.round(((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255) * 100);
  }

  let groutSyncing = false;

  function applyGroutVars({ fromSlider = false } = {}) {
    const root = document.documentElement;
    let color = normalizeHex(els.groutColor?.value || '#ffffff');
    if (fromSlider && els.groutColorSlider) {
      color = hexFromLightness(els.groutColorSlider.value);
      groutSyncing = true;
      if (els.groutColor) els.groutColor.value = color;
      groutSyncing = false;
    }
    const opacityPct = Math.max(0, Math.min(100, Number(els.groutOpacity?.value ?? 45)));
    root.style.setProperty('--grid-color', color);
    root.style.setProperty('--grid-opacity', (opacityPct / 100).toFixed(3));
    if (els.groutColorValue) els.groutColorValue.textContent = color;
    if (els.groutOpacityValue) els.groutOpacityValue.textContent = `${Math.round(opacityPct)}%`;
  }

  async function buildMasks(img, palette) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const src = document.createElement('canvas');
    src.width = w;
    src.height = h;
    const ctx = src.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, w, h).data;

    const paletteRgb = palette.map(parseRgb);
    const exact = new Map();
    paletteRgb.forEach((rgb, i) => exact.set(rgbKey(rgb[0], rgb[1], rgb[2]), i));

    const index = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < w * h; i++, p += 4) {
      const r = pixels[p];
      const g = pixels[p + 1];
      const b = pixels[p + 2];
      let idx = exact.get(rgbKey(r, g, b));
      if (idx == null) {
        let best = 0;
        let bestD = Infinity;
        for (let k = 0; k < paletteRgb.length; k++) {
          const pr = paletteRgb[k];
          const d = (r - pr[0]) ** 2 + (g - pr[1]) ** 2 + (b - pr[2]) ** 2;
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
        idx = best;
      }
      index[i] = idx;
    }

    const urls = [];
    for (let k = 0; k < palette.length; k++) {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const cctx = canvas.getContext('2d');
      cctx.imageSmoothingEnabled = false;
      const imageData = cctx.createImageData(w, h);
      const out = imageData.data;
      for (let i = 0; i < index.length; i++) {
        if (index[i] !== k) continue;
        const p = i * 4;
        out[p] = 255;
        out[p + 1] = 255;
        out[p + 2] = 255;
        out[p + 3] = 255;
      }
      cctx.putImageData(imageData, 0, 0);
      urls.push(await canvasToUrl(canvas));
    }
    return urls;
  }

  async function loadTilesLibrary() {
    const res = await fetch(`${TILES_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('tiles.json missing');
    const data = await res.json();
    state.defaults = {
      physicalSizeCm: 10,
      mosaicCellMm: 10,
      texturePx: 64,
      ...(data.defaults || {}),
    };
    state.tiles = Array.isArray(data.tiles) ? data.tiles : [];
  }

  function setActive(on) {
    state.active = on;
    document.body.classList.toggle('is-tile-sim', on);
    if (els.dock) els.dock.hidden = !on;
    if (!on) hidePicker();
  }

  async function unload() {
    hidePicker();
    clearLayers();
    revokeMasks();
    state.slots = [];
    state.product = null;
    setActive(false);
  }

  async function bindSet({ category, setId, base } = {}) {
    await ready;
    const bindId = ++state.bindId;
    if (!category || !setId) {
      await unload();
      return false;
    }

    let product = null;
    try {
      const res = await fetch(`${productUrl(category, setId)}?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) product = await res.json();
    } catch (_) {
      product = null;
    }

    const palette = Array.isArray(product?.palette)
      ? product.palette.map(normalizeHex).filter(Boolean)
      : [];
    if (!palette.length) {
      await unload();
      return false;
    }

    const img =
      (await tryLoadImage(previewUrl(category, setId, base))) ||
      (await tryLoadImage(previewFallbackUrl(category, setId)));
    if (!img) {
      await unload();
      return false;
    }
    if (bindId !== state.bindId) return false;

    const maskUrls = await buildMasks(img, palette);
    if (bindId !== state.bindId) {
      maskUrls.forEach((url) => url.startsWith('blob:') && URL.revokeObjectURL(url));
      return false;
    }

    revokeMasks();
    state.maskUrls = maskUrls;
    state.product = {
      ...product,
      _imgW: img.naturalWidth || img.width,
      _imgH: img.naturalHeight || img.height,
    };

    const wallPool = state.tiles.filter((t) => tileCategory(t) === 'wall');
    state.slots = palette.map((hex, i) => ({
      hex,
      maskUrl: maskUrls[i],
      lockedTile: closestTile(hex, wallPool.length ? wallPool : state.tiles),
      hoverTile: null,
      layerEl: null,
      miniEl: null,
      chipEl: null,
    }));

    setActive(true);
    mountLayers();
    renderChips();
    hidePicker();
    return true;
  }

  function layoutMinimap(frameW, imgW) {
    const scale = imgW > 0 ? frameW / imgW : 1;
    const v = scale.toFixed(6);
    els.mini?.style.setProperty('--sim-mini-scale', v);
    els.mini?.parentElement?.style.setProperty('--sim-mini-scale', v);
  }

  function cacheEls() {
    els.dock = document.getElementById('palette-dock');
    els.bar = document.getElementById('palette-bar');
    els.picker = document.getElementById('tile-picker');
    els.pickerHex = document.getElementById('tile-picker-hex');
    els.pickerTabs = document.getElementById('tile-picker-tabs');
    els.pickerGrid = document.getElementById('tile-picker-grid');
    els.layers = document.getElementById('tile-sim-layers');
    els.mini = document.getElementById('nav-minimap-sim');
    els.groutColor = document.getElementById('grout-color');
    els.groutColorSlider = document.getElementById('grout-color-slider');
    els.groutColorValue = document.getElementById('grout-color-value');
    els.groutOpacity = document.getElementById('grout-opacity-slider');
    els.groutOpacityValue = document.getElementById('grout-opacity-value');
  }

  function bindUi() {
    document.addEventListener('pointerdown', (e) => {
      if (!state.active || els.picker?.hidden) return;
      if (els.dock && els.dock.contains(e.target)) return;
      hidePicker();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.active && els.picker && !els.picker.hidden) {
        hidePicker();
      }
    });

    els.groutColorSlider?.addEventListener('input', () => applyGroutVars({ fromSlider: true }));
    els.groutOpacity?.addEventListener('input', () => applyGroutVars());
    els.groutColor?.addEventListener('input', () => {
      if (groutSyncing) return;
      groutSyncing = true;
      if (els.groutColorSlider) {
        els.groutColorSlider.value = String(lightnessFromHex(els.groutColor.value));
      }
      groutSyncing = false;
      applyGroutVars();
    });
    applyGroutVars();
  }

  async function boot() {
    cacheEls();
    bindUi();
    try {
      await loadTilesLibrary();
    } catch (err) {
      console.warn('[TileSim] tiles.json load failed', err);
      state.tiles = [];
    }
    state.ready = true;
    readyResolve();
  }

  window.TileCraftSim = {
    bindSet,
    unload,
    layoutMinimap,
    isActive: () => state.active,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
