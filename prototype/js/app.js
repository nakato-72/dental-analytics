/**
 * ダッシュボード UI ロジック
 * 階層: 医院 → 職種(Dr/DH/未設定) → 担当
 * 表示: 全階層で同一レイアウト（後から level ごとに差し替え可能）
 */

const state = {
  level: 'clinic',
  clinicId: 'clinic-sakura',
  role: null,
  staffId: null,
  selectedPeriod: '本日',
  expanded: { 'clinic-sakura': true },
  intelPanelOrder: null,
  navOrder: null,
};

const INTEL_PANEL_ORDER_STORAGE_KEY = 'intelPanelOrder';
const NAV_ORDER_STORAGE_KEY = 'navOrder';
let intelDragState = null;
let navDragState = null;

const INTEL_DRAG_HANDLE_SVG = '<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><circle cx="2.5" cy="2" r="1"/><circle cx="7.5" cy="2" r="1"/><circle cx="2.5" cy="5" r="1"/><circle cx="7.5" cy="5" r="1"/><circle cx="2.5" cy="8" r="1"/><circle cx="7.5" cy="8" r="1"/></svg>';

function loadIntelPanelOrderFromStorage() {
  try {
    const raw = localStorage.getItem(INTEL_PANEL_ORDER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.primary || !parsed?.secondary) return null;
    parsed.primary = parsed.primary.filter(Boolean);
    parsed.secondary = parsed.secondary.filter(Boolean);
    return parsed;
  } catch {
    return null;
  }
}

function saveIntelPanelOrderToStorage(order) {
  localStorage.setItem(INTEL_PANEL_ORDER_STORAGE_KEY, JSON.stringify(order));
}

function getIntelPanelOrder() {
  if (!state.intelPanelOrder) {
    state.intelPanelOrder = loadIntelPanelOrderFromStorage() || getDefaultIntelPanelOrder();
  }
  return state.intelPanelOrder;
}

function applyIntelPanelOrderToLayout(layout, order) {
  const map = new Map();
  [...layout.primary.filter(Boolean), ...layout.secondary].forEach((p) => map.set(p.id, p));

  const defaultOrder = getDefaultIntelPanelOrder();
  const savedPrimary = (order.primary || []).filter(Boolean);
  const primaryIds = savedPrimary.length === defaultOrder.primary.length
    ? savedPrimary
    : defaultOrder.primary;

  const primary = primaryIds.map((id) => map.get(id)).filter(Boolean);
  const placed = new Set(primaryIds);

  const secondaryIds = [...(order.secondary || defaultOrder.secondary)].filter(Boolean);
  secondaryIds.forEach((id) => placed.add(id));

  map.forEach((_panel, id) => {
    if (!placed.has(id)) {
      secondaryIds.push(id);
      placed.add(id);
    }
  });

  const secondary = secondaryIds.map((id) => map.get(id)).filter(Boolean);
  return { primary, secondary };
}

function commitIntelPanelOrder(grid, orderIds) {
  const order = getIntelPanelOrder();
  order[grid] = orderIds;
  state.intelPanelOrder = order;
  saveIntelPanelOrderToStorage(order);
}

function resolveSlotsForOrder(gridEl, orderIds) {
  const withPanel = new Map();
  gridEl.querySelectorAll('.intel-panel-slot').forEach((slot) => {
    if (slot.dataset.panelId) withPanel.set(slot.dataset.panelId, slot);
  });
  return orderIds.filter(Boolean).map((id) => withPanel.get(id)).filter(Boolean);
}

function flipApplyIntelPanelOrder(gridEl, orderIds, skipSlot = null) {
  const slots = [...gridEl.querySelectorAll('.intel-panel-slot')];
  const first = new Map(slots.map((s) => [s, s.getBoundingClientRect()]));
  const ordered = resolveSlotsForOrder(gridEl, orderIds);

  ordered.forEach((el) => gridEl.appendChild(el));
  ordered.forEach((slot, i) => {
    slot.dataset.slotIndex = String(i);
  });

  ordered.forEach((slot) => {
    if (slot === skipSlot) return;
    const from = first.get(slot);
    if (!from) return;
    const to = slot.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

    slot.style.transform = `translate(${dx}px, ${dy}px)`;
    slot.style.transition = 'transform 0s';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        slot.style.transition = 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)';
        slot.style.transform = '';
      });
    });
  });
}

function rectOverlapArea(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  if (right <= left || bottom <= top) return 0;
  return (right - left) * (bottom - top);
}

function getSortedIntelSlots(gridEl) {
  return [...gridEl.querySelectorAll('.intel-panel-slot')].sort(
    (a, b) => Number(a.dataset.slotIndex) - Number(b.dataset.slotIndex)
  );
}

function halfRect(rect, side) {
  switch (side) {
    case 'left':
      return { left: rect.left, top: rect.top, right: rect.left + rect.width * 0.5, bottom: rect.bottom };
    case 'right':
      return { left: rect.left + rect.width * 0.5, top: rect.top, right: rect.right, bottom: rect.bottom };
    case 'top':
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.top + rect.height * 0.5 };
    case 'bottom':
      return { left: rect.left, top: rect.top + rect.height * 0.5, right: rect.right, bottom: rect.bottom };
    default:
      return rect;
  }
}

function halfOverlapsTarget(floatRect, targetRect, floatSide, threshold = 0.5) {
  const targetArea = targetRect.width * targetRect.height;
  if (targetArea <= 0) return false;
  const overlap = rectOverlapArea(halfRect(floatRect, floatSide), targetRect);
  return overlap / targetArea >= threshold;
}

function getFloatSideToward(floatRect, targetRect) {
  const floatCx = floatRect.left + floatRect.width / 2;
  const floatCy = floatRect.top + floatRect.height / 2;
  const targetCx = targetRect.left + targetRect.width / 2;
  const targetCy = targetRect.top + targetRect.height / 2;
  const dx = targetCx - floatCx;
  const dy = targetCy - floatCy;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  }
  return dy > 0 ? 'bottom' : 'top';
}

function isFloatCenterInRect(floatRect, rect, inset = 0.2) {
  const floatCx = floatRect.left + floatRect.width / 2;
  const floatCy = floatRect.top + floatRect.height / 2;
  return (
    floatCx >= rect.left + rect.width * inset
    && floatCx <= rect.right - rect.width * inset
    && floatCy >= rect.top + rect.height * inset
    && floatCy <= rect.bottom - rect.height * inset
  );
}

/** 重なった相手スロットを探す（入れ替え先） */
function getIntelSwapTargetIndex(floatRect, gridEl, currentIndex) {
  const slots = getSortedIntelSlots(gridEl);
  if (currentIndex < 0 || currentIndex >= slots.length) return currentIndex;

  const curRect = slots[currentIndex].getBoundingClientRect();

  if (isFloatCenterInRect(floatRect, curRect, 0.22)) {
    return currentIndex;
  }

  let best = { index: currentIndex, overlap: 0 };

  slots.forEach((slot, i) => {
    if (i === currentIndex) return;
    const rect = slot.getBoundingClientRect();
    const floatSide = getFloatSideToward(floatRect, rect);
    if (!halfOverlapsTarget(floatRect, rect, floatSide, 0.48)) return;
    const overlap = rectOverlapArea(floatRect, rect);
    if (overlap > best.overlap) {
      best = { index: i, overlap };
    }
  });

  return best.index;
}

function swapPairKey(a, b) {
  return `${Math.min(a, b)}:${Math.max(a, b)}`;
}

/** 2枚だけ入れ替え（他カードは動かさない） */
function previewIntelPanelSwap(fromIndex, toIndex) {
  if (!intelDragState || fromIndex === toIndex) return;

  const next = [...intelDragState.previewOrder];
  const temp = next[fromIndex];
  next[fromIndex] = next[toIndex];
  next[toIndex] = temp;

  intelDragState.previewOrder = next;
  intelDragState.currentDragIndex = toIndex;
  flipApplyIntelPanelOrder(intelDragState.gridEl, next, intelDragState.sourceSlot);
}

function updateIntelPanelDrag(pointerX, pointerY) {
  if (!intelDragState) return;

  const { floatEl, offsetX, offsetY, gridEl, currentDragIndex } = intelDragState;
  floatEl.style.left = `${pointerX - offsetX}px`;
  floatEl.style.top = `${pointerY - offsetY}px`;

  const floatRect = floatEl.getBoundingClientRect();
  const targetIndex = getIntelSwapTargetIndex(floatRect, gridEl, currentDragIndex);

  if (targetIndex === currentDragIndex) {
    intelDragState.swapLock = null;
    return;
  }

  const lockKey = swapPairKey(currentDragIndex, targetIndex);
  if (intelDragState.swapLock === lockKey) return;

  previewIntelPanelSwap(currentDragIndex, targetIndex);
  intelDragState.swapLock = lockKey;
}

let intelDragRafId = null;

function onIntelPanelPointerMove(e) {
  if (!intelDragState) return;
  e.preventDefault();
  intelDragState.pendingPointer = { x: e.clientX, y: e.clientY };
  if (intelDragRafId != null) return;
  intelDragRafId = requestAnimationFrame(() => {
    intelDragRafId = null;
    if (!intelDragState) return;
    const p = intelDragState.pendingPointer;
    if (p) updateIntelPanelDrag(p.x, p.y);
  });
}

function endIntelPanelDrag(commit) {
  const ds = intelDragState;
  if (!ds) return;

  intelDragState = null;

  if (intelDragRafId != null) {
    cancelAnimationFrame(intelDragRafId);
    intelDragRafId = null;
  }

  document.removeEventListener('pointermove', onIntelPanelPointerMove);
  document.removeEventListener('pointerup', onIntelPanelPointerUp);
  document.removeEventListener('pointercancel', onIntelPanelPointerUp);
  document.body.classList.remove('intel-panel-drag-active');

  ds.floatEl?.remove();
  ds.sourceSlot?.classList.remove('intel-panel-slot--source');
  ds.gridEl?.classList.remove('intel-panel-grid--dragging');
  ds.gridEl?.querySelectorAll('.intel-panel-slot').forEach((slot) => {
    slot.style.transform = '';
    slot.style.transition = '';
    slot.classList.remove('intel-panel-slot--dragging', 'intel-panel-slot--drag-over');
  });

  const changed = commit
    && JSON.stringify(ds.previewOrder) !== JSON.stringify(ds.initialOrder);

  if (changed) {
    commitIntelPanelOrder(ds.grid, ds.previewOrder);
  }

  render();
}

function onIntelPanelPointerUp() {
  endIntelPanelDrag(true);
}

function startIntelPanelPointerDrag(slot, handle, e) {
  const gridEl = slot.closest('.intel-panel-grid');
  const grid = slot.dataset.grid;
  const fromIndex = Number(slot.dataset.slotIndex);
  const order = getIntelPanelOrder();
  const previewOrder = [...order[grid]];
  const rect = slot.getBoundingClientRect();

  const floatEl = slot.cloneNode(true);
  floatEl.classList.add('intel-panel-slot--float');
  floatEl.querySelector('.intel-panel-slot__drag-handle')?.remove();
  floatEl.style.width = `${rect.width}px`;
  floatEl.style.height = `${rect.height}px`;
  floatEl.style.left = `${rect.left}px`;
  floatEl.style.top = `${rect.top}px`;
  document.body.appendChild(floatEl);

  slot.classList.add('intel-panel-slot--source');
  gridEl.classList.add('intel-panel-grid--dragging');
  document.body.classList.add('intel-panel-drag-active');

  intelDragState = {
    grid,
    gridEl,
    sourceSlot: slot,
    floatEl,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
    previewOrder,
    initialOrder: [...previewOrder],
    currentDragIndex: fromIndex,
    swapLock: null,
  };

  handle.setPointerCapture(e.pointerId);
  document.addEventListener('pointermove', onIntelPanelPointerMove);
  document.addEventListener('pointerup', onIntelPanelPointerUp);
  document.addEventListener('pointercancel', onIntelPanelPointerUp);
}

function setupIntelPanelDragDrop() {
  const root = document.getElementById('main-content');
  if (root.dataset.intelDragInit) return;
  root.dataset.intelDragInit = '1';

  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const handle = e.target.closest('.intel-panel-slot__drag-handle');
    if (!handle) return;

    const slot = handle.closest('.intel-panel-slot');
    if (!slot || slot.classList.contains('intel-panel-slot--empty')) return;

    e.preventDefault();
    e.stopPropagation();
    startIntelPanelPointerDrag(slot, handle, e);
  });
}

// --- Nav tree drag reorder (clinic / role / staff) ---

function loadNavOrderFromStorage() {
  try {
    const raw = localStorage.getItem(NAV_ORDER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.clinics || !parsed?.roles || !parsed?.staff) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveNavOrderToStorage(order) {
  localStorage.setItem(NAV_ORDER_STORAGE_KEY, JSON.stringify(order));
}

function getDefaultNavOrder() {
  const order = { clinics: [], roles: {}, staff: {} };
  for (const clinic of MOCK_DATA.clinics) {
    order.clinics.push(clinic.id);
    const roleKeys = ['Dr', 'DH', 'unset'].filter((rk) => (clinic.roles[rk]?.length > 0));
    order.roles[clinic.id] = roleKeys;
    for (const rk of roleKeys) {
      order.staff[`${clinic.id}-${rk}`] = clinic.roles[rk].map((m) => m.id);
    }
  }
  return order;
}

function syncNavOrderWithData(order) {
  const defaults = getDefaultNavOrder();
  order.clinics = order.clinics.filter((id) => defaults.clinics.includes(id));
  defaults.clinics.forEach((id) => {
    if (!order.clinics.includes(id)) order.clinics.push(id);
  });

  for (const clinicId of defaults.clinics) {
    const defRoles = defaults.roles[clinicId] || [];
    if (!order.roles[clinicId]) {
      order.roles[clinicId] = [...defRoles];
    } else {
      order.roles[clinicId] = order.roles[clinicId].filter((r) => defRoles.includes(r));
      defRoles.forEach((r) => {
        if (!order.roles[clinicId].includes(r)) order.roles[clinicId].push(r);
      });
    }

    for (const rk of defRoles) {
      const key = `${clinicId}-${rk}`;
      const defStaff = defaults.staff[key] || [];
      if (!order.staff[key]) {
        order.staff[key] = [...defStaff];
      } else {
        order.staff[key] = order.staff[key].filter((id) => defStaff.includes(id));
        defStaff.forEach((id) => {
          if (!order.staff[key].includes(id)) order.staff[key].push(id);
        });
      }
    }
  }

  return order;
}

function getNavOrder() {
  if (!state.navOrder) {
    const loaded = loadNavOrderFromStorage();
    state.navOrder = syncNavOrderWithData(loaded || getDefaultNavOrder());
  }
  return state.navOrder;
}

function getOrderedClinics() {
  const map = new Map(MOCK_DATA.clinics.map((c) => [c.id, c]));
  return getNavOrder().clinics.map((id) => map.get(id)).filter(Boolean);
}

function getOrderedRoles(clinic) {
  const keys = getNavOrder().roles[clinic.id] || [];
  return keys.filter((rk) => (clinic.roles[rk]?.length > 0));
}

function getOrderedStaff(clinic, roleKey) {
  const key = `${clinic.id}-${roleKey}`;
  const ids = getNavOrder().staff[key] || [];
  const members = clinic.roles[roleKey] || [];
  const map = new Map(members.map((m) => [m.id, m]));
  return ids.map((id) => map.get(id)).filter(Boolean);
}

function renderNavDragHandle() {
  return `<button type="button" class="nav-row__drag-handle" aria-label="並び替え" title="ドラッグして並び替え">${INTEL_DRAG_HANDLE_SVG}</button>`;
}

function getNavParentUl(row) {
  return row.closest('li.nav-item')?.parentElement ?? null;
}

function getNavSiblingRows(parentUl) {
  if (!parentUl) return [];
  return [...parentUl.children]
    .map((li) => li.querySelector(':scope > .nav-row[data-nav-group]'))
    .filter(Boolean);
}

function getNavOrderIdsForRow(row) {
  const order = getNavOrder();
  const group = row.dataset.navGroup;
  const parent = row.dataset.navParent;
  if (group === 'clinics') return [...order.clinics];
  if (group === 'roles') return [...(order.roles[parent] || [])];
  if (group === 'staff') return [...(order.staff[parent] || [])];
  return [];
}

function commitNavOrderForRow(row, ids) {
  const order = getNavOrder();
  const group = row.dataset.navGroup;
  const parent = row.dataset.navParent;
  if (group === 'clinics') order.clinics = ids;
  else if (group === 'roles') order.roles[parent] = ids;
  else if (group === 'staff') order.staff[parent] = ids;
  state.navOrder = order;
  saveNavOrderToStorage(order);
}

function flipApplyNavOrder(parentUl, orderIds, skipRow = null) {
  const rows = getNavSiblingRows(parentUl);
  const itemMap = new Map(rows.map((r) => [r.dataset.navId, r.closest('li.nav-item')]));
  const first = new Map(rows.map((r) => [r, r.getBoundingClientRect()]));

  orderIds.forEach((id) => {
    const li = itemMap.get(id);
    if (li) parentUl.appendChild(li);
  });

  getNavSiblingRows(parentUl).forEach((row) => {
    if (row === skipRow) return;
    const from = first.get(row);
    if (!from) return;
    const to = row.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

    row.style.transform = `translate(${dx}px, ${dy}px)`;
    row.style.transition = 'transform 0s';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        row.style.transition = 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)';
        row.style.transform = '';
      });
    });
  });
}

function getNavSwapTargetIndex(floatRect, parentUl, currentIndex) {
  const rows = getNavSiblingRows(parentUl);
  if (currentIndex < 0 || currentIndex >= rows.length) return currentIndex;

  const curRect = rows[currentIndex].getBoundingClientRect();
  if (isFloatCenterInRect(floatRect, curRect, 0.22)) return currentIndex;

  let best = { index: currentIndex, overlap: 0 };
  rows.forEach((row, i) => {
    if (i === currentIndex) return;
    const rect = row.getBoundingClientRect();
    const floatSide = getFloatSideToward(floatRect, rect);
    if (!halfOverlapsTarget(floatRect, rect, floatSide, 0.48)) return;
    const overlap = rectOverlapArea(floatRect, rect);
    if (overlap > best.overlap) best = { index: i, overlap };
  });

  return best.index;
}

function previewNavSwap(fromIndex, toIndex) {
  if (!navDragState || fromIndex === toIndex) return;

  const next = [...navDragState.previewOrder];
  const temp = next[fromIndex];
  next[fromIndex] = next[toIndex];
  next[toIndex] = temp;

  navDragState.previewOrder = next;
  navDragState.currentDragIndex = toIndex;
  flipApplyNavOrder(navDragState.parentUl, next, navDragState.sourceRow);
}

function updateNavDrag(pointerX, pointerY) {
  if (!navDragState) return;

  const { floatEl, offsetX, offsetY, parentUl, currentDragIndex } = navDragState;
  floatEl.style.left = `${pointerX - offsetX}px`;
  floatEl.style.top = `${pointerY - offsetY}px`;

  const floatRect = floatEl.getBoundingClientRect();
  const targetIndex = getNavSwapTargetIndex(floatRect, parentUl, currentDragIndex);

  if (targetIndex === currentDragIndex) {
    navDragState.swapLock = null;
    return;
  }

  const lockKey = swapPairKey(currentDragIndex, targetIndex);
  if (navDragState.swapLock === lockKey) return;

  previewNavSwap(currentDragIndex, targetIndex);
  navDragState.swapLock = lockKey;
}

let navDragRafId = null;

function onNavPointerMove(e) {
  if (!navDragState) return;
  e.preventDefault();
  navDragState.pendingPointer = { x: e.clientX, y: e.clientY };
  if (navDragRafId != null) return;
  navDragRafId = requestAnimationFrame(() => {
    navDragRafId = null;
    if (!navDragState) return;
    const p = navDragState.pendingPointer;
    if (p) updateNavDrag(p.x, p.y);
  });
}

function endNavDrag(commit) {
  const ds = navDragState;
  if (!ds) return;

  navDragState = null;

  if (navDragRafId != null) {
    cancelAnimationFrame(navDragRafId);
    navDragRafId = null;
  }

  document.removeEventListener('pointermove', onNavPointerMove);
  document.removeEventListener('pointerup', onNavPointerUp);
  document.removeEventListener('pointercancel', onNavPointerUp);
  document.body.classList.remove('nav-drag-active');

  ds.floatEl?.remove();
  ds.sourceRow?.classList.remove('nav-row--source');
  ds.parentUl?.classList.remove('nav-children--dragging');
  ds.parentUl?.querySelectorAll('.nav-row').forEach((row) => {
    row.style.transform = '';
    row.style.transition = '';
  });

  const changed = commit
    && JSON.stringify(ds.previewOrder) !== JSON.stringify(ds.initialOrder);

  if (changed) {
    commitNavOrderForRow(ds.sourceRow, ds.previewOrder);
    renderNav();
  }
}

function onNavPointerUp() {
  endNavDrag(true);
}

function startNavPointerDrag(row, handle, e) {
  const parentUl = getNavParentUl(row);
  const siblings = getNavSiblingRows(parentUl);
  const fromIndex = siblings.indexOf(row);
  if (fromIndex < 0) return;

  const previewOrder = getNavOrderIdsForRow(row);
  const rect = row.getBoundingClientRect();

  const floatEl = row.cloneNode(true);
  floatEl.classList.add('nav-row--float');
  floatEl.querySelector('.nav-row__drag-handle')?.remove();
  floatEl.style.width = `${rect.width}px`;
  floatEl.style.left = `${rect.left}px`;
  floatEl.style.top = `${rect.top}px`;
  document.body.appendChild(floatEl);

  row.classList.add('nav-row--source');
  parentUl.classList.add('nav-children--dragging');
  document.body.classList.add('nav-drag-active');

  navDragState = {
    sourceRow: row,
    parentUl,
    floatEl,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
    previewOrder,
    initialOrder: [...previewOrder],
    currentDragIndex: fromIndex,
    swapLock: null,
  };

  handle.setPointerCapture(e.pointerId);
  document.addEventListener('pointermove', onNavPointerMove);
  document.addEventListener('pointerup', onNavPointerUp);
  document.addEventListener('pointercancel', onNavPointerUp);
}

function setupNavDragDrop() {
  const tree = document.getElementById('nav-tree');
  if (tree.dataset.navDragInit) return;
  tree.dataset.navDragInit = '1';

  tree.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const handle = e.target.closest('.nav-row__drag-handle');
    if (!handle) return;

    const row = handle.closest('.nav-row[data-nav-group]');
    if (!row) return;

    e.preventDefault();
    e.stopPropagation();
    startNavPointerDrag(row, handle, e);
  });
}

/* PERIOD_KEYS — sample-metrics.js で定義 */

/**
 * スクロール後の期間ヘッダー表示モード
 * - 'unified' : 案1 — 区切りラインに期間タブを統合（1行）
 * - 'split'   : 従来 — period-toolbar + 区切りライン（2行）
 */
const PERIOD_HEADER_MODE = 'unified';

// --- Icons (inline SVG strings) ---
const ICONS = {
  building: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/></svg>',
  users: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  user: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  calendar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  alert: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  arrowLeft: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  chevronRight: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>',
};

function getPeriodDetail(periodKey) {
  return resolvePeriodDetail(periodKey, getMetricsContext(state));
}

function getSharedMetrics() {
  return resolveSharedMetrics(getMetricsContext(state));
}

function progressClass(pct) {
  if (pct >= 80) return 'success';
  if (pct >= 60) return 'warning';
  return 'danger';
}

function findStaff(staffId) {
  for (const clinic of MOCK_DATA.clinics) {
    for (const role of Object.keys(clinic.roles)) {
      const staff = clinic.roles[role].find(s => s.id === staffId);
      if (staff) return { clinic, role, staff };
    }
  }
  return null;
}

/** 階層別の表示フラグ（後から職種・担当だけ変更しやすい） */
function getLevelDisplayFlags(level) {
  return {
    showPeriodDetail: true,
  };
}

function getViewData() {
  const { level, clinicId, role, staffId } = state;
  const shared = getSharedMetrics();
  let title = 'ダッシュボード';

  if (level === 'all') {
    title = '全院ダッシュボード';
  } else if (level === 'clinic') {
    const clinic = MOCK_DATA.clinics.find(c => c.id === clinicId);
    title = `${clinic.name} ダッシュボード`;
  } else if (level === 'role') {
    const clinic = MOCK_DATA.clinics.find(c => c.id === clinicId);
    title = `${clinic.name} — ${MOCK_DATA.roleLabels[role]}`;
  } else if (level === 'staff') {
    const info = findStaff(staffId);
    title = `${info.staff.name}（${MOCK_DATA.roleLabels[info.role]}）`;
  }

  return {
    ...shared,
    level,
    title,
    ...getLevelDisplayFlags(level),
  };
}

function isActive(level, id, role) {
  if (level === 'all') return state.level === 'all';
  if (level === 'clinic') return state.level === 'clinic' && state.clinicId === id;
  if (level === 'role') return state.level === 'role' && state.clinicId === id && state.role === role;
  if (level === 'staff') return state.level === 'staff' && state.staffId === id;
  return false;
}

// --- Render Navigation ---
function renderNav() {
  const tree = document.getElementById('nav-tree');
  let html = '';

  for (const clinic of getOrderedClinics()) {
    const cActive = isActive('clinic', clinic.id);
    const cExpanded = state.expanded[clinic.id] !== false;
    html += `
      <li class="nav-item nav-item--root">
        <div class="nav-row nav-row--root ${cActive ? 'active' : ''}" data-action="select-clinic" data-clinic="${clinic.id}" data-nav-group="clinics" data-nav-id="${clinic.id}">
          ${renderNavDragHandle()}
          <span class="nav-toggle ${cExpanded ? 'open' : ''}" data-action="toggle" data-key="${clinic.id}">▶</span>
          <span class="nav-icon">${ICONS.building}</span>
          <span class="nav-label">${clinic.name}</span>
        </div>
        <ul class="nav-children nav-children--level-2 ${cExpanded ? '' : 'hidden'}">
    `;

    for (const roleKey of getOrderedRoles(clinic)) {
      const members = clinic.roles[roleKey] || [];
      if (members.length === 0) continue;
      const rActive = isActive('role', clinic.id, roleKey);
      const roleKeyId = `${clinic.id}-${roleKey}`;
      const rExpanded = state.expanded[roleKeyId] !== false;
      const color = MOCK_DATA.roleColors[roleKey] || '#94a3b8';
      const roleTag = roleKey === 'unset' ? '未' : roleKey;

      html += `
        <li class="nav-item">
          <div class="nav-row ${rActive ? 'active' : ''}" data-action="select-role" data-clinic="${clinic.id}" data-role="${roleKey}" data-nav-group="roles" data-nav-parent="${clinic.id}" data-nav-id="${roleKey}">
            ${renderNavDragHandle()}
            <span class="nav-toggle ${rExpanded ? 'open' : ''}" data-action="toggle" data-key="${roleKeyId}">▶</span>
            <span class="role-tag" style="background:${color}18;color:${color}">${roleTag}</span>
            <span class="nav-label">${MOCK_DATA.roleLabels[roleKey] || roleKey}</span>
            <span class="nav-icon" style="margin-left:auto">${ICONS.users}</span>
          </div>
          <ul class="nav-children nav-children--level-3 ${rExpanded ? '' : 'hidden'}">
      `;

      for (const member of getOrderedStaff(clinic, roleKey)) {
        const sActive = isActive('staff', member.id);
        html += `
          <li class="nav-item">
            <div class="nav-row ${sActive ? 'active' : ''}" data-action="select-staff" data-staff="${member.id}" data-clinic="${clinic.id}" data-role="${roleKey}" data-nav-group="staff" data-nav-parent="${roleKeyId}" data-nav-id="${member.id}">
              ${renderNavDragHandle()}
              <span class="nav-toggle empty">▶</span>
              <span class="nav-icon">${ICONS.user}</span>
              <span class="nav-label">${member.name}</span>
            </div>
          </li>
        `;
      }

      html += '</ul></li>';
    }

    html += '</ul></li>';
  }

  tree.innerHTML = html;
}

// --- Render Dashboard ---
function renderAlert(alert) {
  const icon = alert.type === 'success' ? ICONS.check : ICONS.alert;
  return `
    <div class="alert-box ${alert.type}">
      <div class="alert-box-title">${icon} ${alert.title}</div>
      <div class="alert-box-detail">
        <span>月末見込み: <strong>${alert.forecast}</strong></span>
        <span>必要ペース: <strong>${alert.requiredDaily}</strong></span>
      </div>
    </div>
  `;
}

function formatYen(n) {
  return '¥' + n.toLocaleString('ja-JP');
}

function renderRevenueGauge(revenue, { compact = false } = {}) {
  const displayCats = MOCK_DATA.revenueCategories.filter(c => (revenue[c.key] || 0) > 0);
  const total = displayCats.reduce((s, c) => s + (revenue[c.key] || 0), 0);
  const goalPct = Math.min((total / revenue.goal) * 100, 100);
  const goalClass = goalPct >= 80 ? 'success' : goalPct >= 60 ? 'warning' : 'danger';

  const segments = displayCats.map(c => {
    const amt = revenue[c.key] || 0;
    const pct = total > 0 ? (amt / total) * 100 : 0;
    return { ...c, amt, pct };
  });

  const stackHtml = `
    <div class="revenue-stack" title="合計 ${formatYen(total)}">
      ${segments.map(s => `
        <div class="revenue-stack-seg" style="width:${s.pct}%;background:${s.color}" title="${s.label} ${formatYen(s.amt)}"></div>
      `).join('')}
    </div>`;

  const goalHtml = `
    <div class="revenue-goal${compact ? ' revenue-goal--compact-row' : ''}">
      <span class="revenue-goal-label">目標 ${formatYen(revenue.goal)}</span>
      <div class="revenue-goal-bar">
        <div class="revenue-goal-fill ${goalClass}" style="width:${goalPct}%"></div>
      </div>
      <span class="revenue-goal-pct">${(total / revenue.goal * 100).toFixed(1)}%</span>
    </div>`;

  if (compact) {
    return `
      <div class="revenue-gauge revenue-gauge--compact">
        <div class="revenue-gauge-label">売上構成</div>
        ${stackHtml}
        ${goalHtml}
        <div class="revenue-legend revenue-legend--compact">
          ${segments.map(s => `
            <span class="revenue-legend-chip" title="${s.label} ${formatYen(s.amt)} (${s.pct.toFixed(1)}%)">
              <span class="revenue-legend-chip-head">
                <span class="revenue-legend-dot" style="background:${s.color}"></span>
                <span class="revenue-legend-chip-name">${s.label}</span>
              </span>
              <span class="revenue-legend-chip-amt">${formatYen(s.amt)}</span>
            </span>
          `).join('')}
        </div>
      </div>
    `;
  }

  return `
    <div class="revenue-gauge">
      <div class="revenue-gauge-label">売上構成</div>
      ${stackHtml}
      ${goalHtml}
      <div class="revenue-legend">
        ${segments.map(s => `
          <div class="revenue-legend-item">
            <span class="revenue-legend-dot" style="background:${s.color}"></span>
            <span class="revenue-legend-name">${s.label}</span>
            <span class="revenue-legend-amt">${formatYen(s.amt)}</span>
            <span class="revenue-legend-pct">${s.pct.toFixed(1)}%</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderPeriodCards(periods, highlightPeriod, clickable) {
  const changeLabels = { '前日': '前々日比', '本日': '前日比', '今月': '先月同日比', '今年': '前年同日比' };
  return periods.map((p) => {
    const isActive = highlightPeriod ? p.label === highlightPeriod : p.active;
    const clickAttrs = clickable
      ? `class="period-card period-card--clickable ${isActive ? 'active' : ''}" data-action="select-period" data-period="${p.label}" role="button" tabindex="0" aria-pressed="${isActive}"`
      : `class="period-card ${isActive ? 'active' : ''}" data-period="${p.label}"`;
    return `
    <div class="period-card-slot">
      <div ${clickAttrs}>
      <div class="period-card-header">
        <div class="period-card-top">
          <div class="period-card-label-row">
            <span class="period-card-label">${p.label}</span>
            ${p.visits != null ? '<span class="visits-sublabel">' + (p.visitsCumulative ? '延べ来院数' : '') + '</span>' : ''}
          </div>
          ${p.visits != null ? `
            <div class="period-card-metrics">
              <div class="period-card-value">${p.value}</div>
              <div class="period-card-visits"><span class="visits-slash">／</span>${p.visits.toLocaleString('ja-JP')}<span class="unit">人</span></div>
            </div>
          ` : `<div class="period-card-value">${p.value}</div>`}
        </div>
        <div class="period-card-icon">${ICONS.calendar}</div>
      </div>
      <div class="period-card-change ${p.changeUp ? 'up' : 'down'}">${p.changeUp ? '↑' : '↓'} ${p.change} ${changeLabels[p.label] || '前比'}</div>
      ${p.revenue ? renderRevenueGauge(p.revenue, { compact: true }) : ''}
      </div>
    </div>
  `;
  }).join('');
}

function barTotal(chart, i) {
  return (chart.insurance[i] || 0) + (chart.selfPay[i] || 0) + (chart.products[i] || 0) + (chart.other[i] || 0);
}

function visitTotal(chart, i) {
  if (chart.visitsFirst) {
    return (chart.visitsFirst[i] || 0) + (chart.visitsReFirst[i] || 0) + (chart.visitsReturn[i] || 0);
  }
  return chart.visits[i] || 0;
}

function getChartScale(barValues, compareValues = []) {
  const all = [...barValues, ...compareValues].filter(v => v > 0);
  return getYAxisScale(Math.max(...all, 1));
}

function buildCompareLineOverlay(values, axisMax, barCount) {
  if (!values?.length || barCount <= 0) return '';
  const coords = values.map((v, i) => ({
    x: ((i + 0.5) / barCount) * 100,
    y: 100 - Math.min(v / axisMax, 1) * 100,
  }));
  const points = coords.map(p => `${p.x},${p.y}`).join(' ');
  return `
    <div class="detail-compare-layer" aria-hidden="true">
      <svg class="detail-compare-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline class="detail-compare-line" points="${points}" fill="none" />
      </svg>
    </div>
  `;
}

function buildChartBars(labels, highlightIndex, renderPlotCell, compareValues, axisMax) {
  const compareOverlay = compareValues?.length
    ? buildCompareLineOverlay(compareValues, axisMax, labels.length)
    : '';

  const plotCells = labels.map((label, i) => {
    const comparePct = compareValues?.[i] != null
      ? Math.min(compareValues[i] / axisMax, 1) * 100
      : null;
    const marker = comparePct != null
      ? `<span class="detail-compare-point" style="bottom:${comparePct}%"></span>`
      : '';
    return `
    <div class="detail-bar-group ${i === highlightIndex ? 'highlight' : ''}">
      <div class="detail-bar-plot">
        ${marker}
        ${renderPlotCell(i)}
      </div>
    </div>
  `;
  }).join('');

  const labelCells = labels.map((label, i) => `
    <div class="detail-bar-label-cell ${i === highlightIndex ? 'highlight' : ''}">
      <span class="detail-bar-label">${label}</span>
    </div>
  `).join('');

  return `
    <div class="detail-chart-bars">
      <div class="detail-chart-bars-plot">
        ${compareOverlay}
        <div class="detail-chart-bars-columns">
          ${plotCells}
        </div>
      </div>
      <div class="detail-chart-bars-labels">${labelCells}</div>
    </div>
  `;
}

function renderCompareLegendItem(label) {
  if (!label) return '';
  return `
    <div class="chart-legend-item chart-legend-item--compare">
      <span class="chart-legend-compare-icon" aria-hidden="true">
        <span class="chart-legend-line"></span>
        <span class="chart-legend-point"></span>
      </span>
      <span>${label}</span>
      <span class="chart-legend-hint">（棒グラフとの比較）</span>
    </div>
  `;
}

function getYAxisScale(maxValue, divisions = 4) {
  const rawMax = maxValue <= 0 ? 1 : maxValue * 1.08;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const normalized = rawMax / magnitude;
  let niceUnit;
  if (normalized <= 1) niceUnit = 1;
  else if (normalized <= 2) niceUnit = 2;
  else if (normalized <= 5) niceUnit = 5;
  else niceUnit = 10;
  const axisMax = niceUnit * magnitude;
  const step = axisMax / divisions;
  const ticks = Array.from({ length: divisions + 1 }, (_, i) => Math.round(axisMax - i * step));
  return { axisMax, ticks };
}

function formatAxisYen(n) {
  if (n >= 1000000) {
    const m = n / 1000000;
    return '¥' + (m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)) + 'M';
  }
  if (n >= 10000) return '¥' + Math.round(n / 10000) + '万';
  return '¥' + n.toLocaleString('ja-JP');
}

function formatAxisCount(n) {
  return n.toLocaleString('ja-JP');
}

function renderChartWithYAxis(chartBarsHtml, scale, yLabel, formatTick) {
  return `
    <div class="detail-chart-plot">
      <div class="detail-chart-yaxis">
        <span class="detail-y-axis-label">${yLabel}</span>
        <div class="detail-y-ticks">
          ${scale.ticks.map(t => `<span class="detail-y-tick">${formatTick(t)}</span>`).join('')}
        </div>
      </div>
      <div class="detail-chart-plot-area">
        <div class="detail-chart-grid" aria-hidden="true">
          ${scale.ticks.map(() => '<div class="detail-grid-line"></div>').join('')}
        </div>
        ${chartBarsHtml}
      </div>
    </div>
  `;
}

function renderStackedRevenueChart(chart, options = {}) {
  const { showCompare = true } = options;
  const barValues = chart.labels.map((_, i) => barTotal(chart, i));
  const compareValues = showCompare && chart.compareRevenue ? chart.compareRevenue : [];
  const scale = getChartScale(barValues, compareValues);
  const segments = [
    { key: 'insurance', color: '#22c55e' },
    { key: 'selfPay', color: '#0ea5e9' },
    { key: 'products', color: '#eab308' },
    { key: 'other', color: '#94a3b8' },
  ];

  const barsHtml = buildChartBars(
    chart.labels,
    chart.highlightIndex,
    (i) => {
      const total = barTotal(chart, i);
      const barH = (total / scale.axisMax) * 100;
      return `
        <div class="detail-stacked-bar" style="height:${barH}%">
          ${segments.map(seg => {
            const val = chart[seg.key][i] || 0;
            if (val <= 0) return '';
            const h = total > 0 ? (val / total) * 100 : 0;
            return `<div class="detail-stack-seg" style="height:${h}%;background:${seg.color}" title="${seg.key === 'insurance' ? '保険' : seg.key === 'selfPay' ? '自費' : seg.key === 'products' ? '販売品' : 'その他'} ${formatYen(val)}"></div>`;
          }).join('')}
        </div>
      `;
    },
    showCompare && chart.compareRevenue ? chart.compareRevenue : null,
    scale.axisMax
  );

  const compareLine = showCompare && chart.compareRevenue
    ? { label: chart.compareLabel }
    : null;

  return `
    ${renderChartWithYAxis(barsHtml, scale, '売上（円）', formatAxisYen)}
    <div class="chart-legend">
      <div class="chart-legend-item"><span class="chart-legend-dot" style="background:#22c55e"></span>保険</div>
      <div class="chart-legend-item"><span class="chart-legend-dot" style="background:#0ea5e9"></span>自費</div>
      <div class="chart-legend-item"><span class="chart-legend-dot" style="background:#eab308"></span>販売品</div>
      <div class="chart-legend-item"><span class="chart-legend-dot" style="background:#94a3b8"></span>その他</div>
      ${renderCompareLegendItem(compareLine?.label)}
    </div>
  `;
}

function renderVisitsChart(chart) {
  const barValues = chart.labels.map((_, i) => visitTotal(chart, i));
  const compareValues = chart.compareVisits || [];
  const scale = getChartScale(barValues, compareValues);
  const segments = MOCK_DATA.visitCategories;

  const barsHtml = buildChartBars(
    chart.labels,
    chart.highlightIndex,
    (i) => {
      const total = visitTotal(chart, i);
      const barH = (total / scale.axisMax) * 100;
      return `
        <div class="detail-stacked-bar detail-stacked-bar--visits" style="height:${barH}%">
          <span class="detail-bar-tooltip">${total}人</span>
          ${segments.map(seg => {
            const val = chart[seg.key]?.[i] || 0;
            if (val <= 0) return '';
            const h = total > 0 ? (val / total) * 100 : 0;
            return `<div class="detail-stack-seg" style="height:${h}%;background:${seg.color}" title="${seg.label} ${val}人"></div>`;
          }).join('')}
        </div>
      `;
    },
    chart.compareVisits || null,
    scale.axisMax
  );

  const compareLine = chart.compareVisits
    ? { label: chart.compareLabel }
    : null;

  return `
    ${renderChartWithYAxis(barsHtml, scale, '患者数（人）', formatAxisCount)}
    <div class="chart-legend">
      ${segments.map(s => `
        <div class="chart-legend-item"><span class="chart-legend-dot" style="background:${s.color}"></span>${s.label}</div>
      `).join('')}
      ${renderCompareLegendItem(compareLine?.label)}
    </div>
  `;
}

const CARD_INSIGHT_PAGES = {
  '新患': 'visits',
  '新患累計': 'visits',
  '予約数': 'appointments',
  'キャンセル数 / キャンセル率': 'appointments',
};

function getInsightPageForLabel(label) {
  return CARD_INSIGHT_PAGES[label] || null;
}

const INSIGHT_PAGE_REDIRECTS = {
  newPatients: 'visits',
  receivables: 'unitPrice',
  dropout: 'visits',
  webBooking: 'appointments',
};

function resolveInsightPageId(pageId) {
  if (typeof normalizeInsightPageId === 'function') {
    return normalizeInsightPageId(pageId);
  }
  return INSIGHT_PAGE_REDIRECTS[pageId] || pageId;
}

function navigateToInsightPage(pageId) {
  const resolvedPage = resolveInsightPageId(pageId);
  const params = new URLSearchParams({
    page: resolvedPage,
    period: state.selectedPeriod,
    level: state.level,
  });
  if (state.clinicId) params.set('clinicId', state.clinicId);
  if (state.role) params.set('role', state.role);
  if (state.staffId) params.set('staffId', state.staffId);
  window.location.href = `insight.html?${params.toString()}`;
}

function renderClinicCards(cards) {
  return cards.map(c => {
    const insightPage = getInsightPageForLabel(c.label);
    const isClickable = !!insightPage;
    const valueHtml = c.cancelCount != null
      ? `<div class="clinic-card-value clinic-card-value--dual">
          <span>${c.cancelCount}<span class="unit">件</span></span>
          <span class="clinic-card-slash">／</span>
          <span>${c.cancelRate}<span class="unit">%</span></span>
        </div>`
      : `<div class="clinic-card-value">${c.value}<span class="unit">${c.unit || ''}</span></div>`;
    const clickAttrs = isClickable
      ? `class="clinic-card clinic-card--clickable" data-action="open-insight" data-insight-page="${insightPage}" role="button" tabindex="0"`
      : `class="clinic-card"`;
    return `
    <div ${clickAttrs}>
      <div class="clinic-card-label">${c.label}${isClickable ? '<span class="clinic-card-hint">クリックで詳細</span>' : ''}</div>
      ${valueHtml}
      <div class="clinic-card-sub">${c.sub}</div>
      ${c.progress != null ? `<div class="progress-bar"><div class="progress-fill ${progressClass(c.progress)}" style="width:${Math.min(c.progress, 100)}%"></div></div>` : ''}
    </div>
  `;
  }).join('');
}

function renderIntelTrend(p) {
  if (!p.trendText) return '';
  const arrow = p.trend === 'up' ? '↑' : p.trend === 'down' ? '↓' : '→';
  return `<span class="intel-trend intel-trend--${p.trend || 'flat'}">${arrow} ${p.trendText}<span class="intel-trend-label">${p.trendLabel || ''}</span></span>`;
}

const INTEL_MINI_CHART_COLORS = ['#0ea5e9', '#6366f1', '#10b981', '#94a3b8', '#f59e0b', '#ec4899'];
const INTEL_REVENUE_COLORS = {
  insurance: '#22c55e',
  selfPay: '#0ea5e9',
  products: '#eab308',
  other: '#94a3b8',
};
const INTEL_VISIT_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#94a3b8'];
const INTEL_APPOINTMENT_COLORS = ['#10b981', '#0ea5e9', '#f59e0b', '#ef4444'];

function normalizeChartSegments(segments) {
  const values = segments.map((s) => Math.max(0, Number(s.value) || 0));
  const total = values.reduce((sum, v) => sum + v, 0) || 1;
  return segments.map((seg, i) => ({
    ...seg,
    value: values[i],
    pct: (values[i] / total) * 100,
    color: seg.color || INTEL_MINI_CHART_COLORS[i % INTEL_MINI_CHART_COLORS.length],
  }));
}

function renderIntelMiniDonut(segments) {
  const segs = normalizeChartSegments(segments).filter((s) => s.value > 0);
  let acc = 0;
  const gradient = segs.length
    ? segs.map((s) => {
        const start = acc;
        acc += s.pct;
        return `${s.color} ${start}% ${acc}%`;
      }).join(', ')
    : '#e8edf2 0% 100%';
  return `<div class="intel-mini-donut" style="background:conic-gradient(${gradient})" role="img" aria-hidden="true"></div>`;
}

function renderIntelMiniBars(segments) {
  const segs = normalizeChartSegments(segments);
  const max = Math.max(...segs.map((s) => s.value), 1);
  return `
    <div class="intel-mini-bars intel-mini-bars--vertical" role="img" aria-hidden="true">
      ${segs.map((s) => `
        <div class="intel-mini-bar-col">
          <div class="intel-mini-bar-track">
            <div class="intel-mini-bar-fill" style="height:${Math.max((s.value / max) * 100, s.value > 0 ? 8 : 0)}%;background:${s.color}"></div>
          </div>
        </div>
      `).join('')}
    </div>`;
}

function renderIntelBreakdownWithChart(chartHtml, rows) {
  const aria = rows.map((r) => `${r.label} ${r.text}`.trim()).filter(Boolean).join('、');
  const rowsHtml = rows.map((r) => (r.metaOnly
    ? `<div class="intel-staff-row intel-staff-row--meta"><span class="intel-staff-row-label intel-staff-row-label--wide">${r.text}</span></div>`
    : `<div class="intel-staff-row">
          <span class="intel-staff-row-label">${r.label}</span>
          <span class="intel-staff-row-amt">${r.valueHtml}</span>
        </div>`
  )).join('');
  return `
    <div class="intel-breakdown-layout intel-breakdown-layout--uniform"${aria ? ` aria-label="${aria}"` : ''}>
      <div class="intel-breakdown-chart">${chartHtml}</div>
      ${rows.length ? `<div class="intel-staff-breakdown intel-staff-breakdown--rows intel-staff-breakdown--compact">${rowsHtml}</div>` : ''}
    </div>`;
}

function renderIntelBreakdownRows(chartHtml, rows) {
  return renderIntelBreakdownWithChart(chartHtml, rows);
}

function renderIntelStaffSalesBreakdown(p) {
  const b = p.staffBreakdown;
  const items = [
    { label: 'Dr', amount: b.dr, color: MOCK_DATA.roleColors.Dr },
    { label: 'DH', amount: b.dh, color: MOCK_DATA.roleColors.DH },
    { label: '未設定', amount: b.unset, color: '#94a3b8' },
  ];
  const chartHtml = renderIntelMiniDonut(items.map((item) => ({ value: item.amount, color: item.color })));
  const rows = items.map((item) => ({
    label: item.label,
    text: intelFormatYen(item.amount),
    valueHtml: intelFormatYen(item.amount),
  }));
  return renderIntelBreakdownRows(chartHtml, rows);
}

function renderIntelPaymentBreakdown(p) {
  const b = p.paymentBreakdown;
  const items = [
    { label: '入金', value: b.collected, color: '#10b981' },
    { label: '未収金', value: b.receivables, color: '#f59e0b' },
  ];
  const chartHtml = renderIntelMiniDonut(items.map((item) => ({ value: item.value, color: item.color })));
  return renderIntelBreakdownRows(chartHtml, items.map((item) => ({
    label: item.label,
    text: intelFormatYen(item.value),
    valueHtml: intelFormatYen(item.value),
  })));
}

function renderIntelCountBreakdown(items, unit, colors) {
  const chartHtml = renderIntelMiniBars(items.map((item, i) => ({
    value: item.count,
    color: colors[i % colors.length],
  })));
  const rows = items.map((item) => ({
    label: item.label,
    text: `${item.count}${unit}`,
    valueHtml: `${item.count.toLocaleString('ja-JP')}<span class="unit">${unit}</span>`,
  }));
  return renderIntelBreakdownRows(chartHtml, rows);
}

function renderIntelVisitBreakdown(p) {
  const b = p.visitBreakdown;
  return renderIntelCountBreakdown([
    { label: '純初診', count: b.pureFirst },
    { label: '初診', count: b.first },
    { label: '再診', count: b.return },
    { label: 'その他', count: b.other },
  ], '人', INTEL_VISIT_COLORS);
}

function renderIntelAppointmentBreakdown(p) {
  const raw = p.appointmentBreakdown;
  const b = typeof normalizeAppointmentBreakdown === 'function'
    ? normalizeAppointmentBreakdown(raw)
    : raw;
  const total = p.appointmentTotal
    || (b.visited + b.notVisited + b.cancelled);
  const pct = (v) => (total > 0 ? Math.round((v / total) * 1000) / 10 : 0);
  const cancelTotal = b.cancelled;
  const chartHtml = renderIntelMiniBars([
    { value: b.visited, color: '#10b981' },
    { value: b.notVisited, color: '#0ea5e9' },
    { value: cancelTotal, color: '#f59e0b' },
  ]);
  const rows = [
    {
      label: '来院済',
      text: `${b.visited}件`,
      valueHtml: `${b.visited.toLocaleString('ja-JP')}<span class="unit">件</span>`,
    },
    {
      label: '未来院',
      text: `${b.notVisited}件`,
      valueHtml: `${b.notVisited.toLocaleString('ja-JP')}<span class="unit">件</span>`,
    },
    {
      label: 'キャンセル',
      text: `${cancelTotal}件`,
      valueHtml: `
        <div class="intel-appt-cancel-block">
          <div class="intel-appt-cancel-summary">
            <span class="intel-appt-cancel-count">${cancelTotal.toLocaleString('ja-JP')}</span>
            <span class="intel-appt-cancel-rate">率 ${pct(cancelTotal)}%</span>
          </div>
          <div class="intel-appt-cancel-breakdown">
            <span class="intel-appt-cancel-item" style="--item-color:#eab308">当日 <strong>${b.cancelSameDay}</strong> <span>率 ${pct(b.cancelSameDay)}%</span></span>
            <span class="intel-appt-cancel-item" style="--item-color:#f59e0b">前日以降 <strong>${b.cancelAdvance}</strong> <span>率 ${pct(b.cancelAdvance)}%</span></span>
            <span class="intel-appt-cancel-item" style="--item-color:#ef4444">無断 <strong>${b.noShow}</strong> <span>率 ${pct(b.noShow)}%</span></span>
          </div>
        </div>`,
    },
  ];
  return renderIntelBreakdownRows(chartHtml, rows);
}

function renderIntelPanelSlot(p, grid, index) {
  if (!p) {
    return `<div class="intel-panel-slot intel-panel-slot--empty" data-grid="${grid}" data-slot-index="${index}" aria-hidden="true"></div>`;
  }
  return `
    <div class="intel-panel-slot" data-panel-id="${p.id}" data-grid="${grid}" data-slot-index="${index}">
      <button type="button" class="intel-panel-slot__drag-handle" aria-label="カードを並び替え" title="ドラッグして並び替え">${INTEL_DRAG_HANDLE_SVG}</button>
      ${renderIntelPanel(p)}
    </div>`;
}

function renderIntelPanelEmptySlot() {
  return '<div class="intel-panel-slot intel-panel-slot--empty" aria-hidden="true"></div>';
}

function renderIntelRevenueBreakdown(p) {
  const b = p.revenueBreakdown;
  const items = [
    { label: '保険', key: 'insurance', value: b.insurance },
    { label: '自費', key: 'selfPay', value: b.selfPay },
    { label: '販売品', key: 'products', value: b.products },
    { label: 'その他', key: 'other', value: b.other },
  ];
  const chartHtml = renderIntelMiniDonut(items.map((item) => ({
    value: item.value,
    color: INTEL_REVENUE_COLORS[item.key],
  })));
  return renderIntelBreakdownRows(chartHtml, items.map((item) => ({
    label: item.label,
    text: intelFormatYen(item.value),
    valueHtml: intelFormatYen(item.value),
  })));
}

function renderIntelMetricMain(p) {
  const progress = p.progress ?? 0;
  const chartHtml = p.progress != null
    ? renderIntelMiniDonut([
        { value: progress, color: p.accent || '#0ea5e9' },
        { value: Math.max(0, 100 - progress), color: '#e8edf2' },
      ])
    : '<div class="intel-mini-donut intel-mini-donut--empty" aria-hidden="true"></div>';
  if (!p.sub) {
    return renderIntelBreakdownWithChart(chartHtml, []);
  }
  return renderIntelBreakdownWithChart(chartHtml, [{ text: p.sub, metaOnly: true }]);
}

function renderIntelPanelHeaderValue(p) {
  if (p.type === 'visitBreakdown') {
    return `${p.visitTotal.toLocaleString('ja-JP')}<span class="unit">人</span>`;
  }
  if (p.type === 'appointmentBreakdown') {
    return `${p.appointmentTotal.toLocaleString('ja-JP')}<span class="unit">件</span>`;
  }
  if (p.type === 'salesBreakdown') return p.value;
  if (p.type === 'staffSales') return p.value;
  if (p.type === 'paymentRecord' && p.paymentBreakdown) {
    const { collected, receivables } = p.paymentBreakdown;
    return intelFormatYen(collected + receivables);
  }
  if (p.cancelCount != null) {
    return `${p.cancelCount}<span class="unit">件</span><span class="intel-panel-slash">／</span>${p.cancelRate}<span class="unit">%</span>`;
  }
  if (p.value != null) {
    return `${p.value}<span class="unit">${p.unit || ''}</span>`;
  }
  return '';
}

function renderIntelPanelHeader(p) {
  const headerValue = renderIntelPanelHeaderValue(p);
  const valueHtml = headerValue
    ? `<span class="intel-visit-header-value">${headerValue}</span>`
    : '';
  return `<div class="intel-panel-label intel-panel-label--split">
    <span class="intel-panel-label-text">${p.label}</span>
    ${valueHtml}
  </div>`;
}

function renderIntelPanel(p) {
  const breakdownTypes = ['salesBreakdown', 'staffSales', 'paymentRecord', 'visitBreakdown', 'appointmentBreakdown'];

  let valueHtml;
  if (p.type === 'salesBreakdown' && p.revenueBreakdown) {
    valueHtml = renderIntelRevenueBreakdown(p);
  } else if (p.type === 'staffSales' && p.staffBreakdown) {
    valueHtml = renderIntelStaffSalesBreakdown(p);
  } else if (p.type === 'paymentRecord' && p.paymentBreakdown) {
    valueHtml = renderIntelPaymentBreakdown(p);
  } else if (p.type === 'visitBreakdown' && p.visitBreakdown) {
    valueHtml = renderIntelVisitBreakdown(p);
  } else if (p.type === 'appointmentBreakdown' && p.appointmentBreakdown) {
    valueHtml = renderIntelAppointmentBreakdown(p);
  } else if (p.cancelCount != null) {
    valueHtml = renderIntelBreakdownWithChart('<div class="intel-mini-donut intel-mini-donut--empty" aria-hidden="true"></div>', []);
  } else {
    valueHtml = renderIntelMetricMain(p);
  }

  const panelClasses = ['intel-panel', 'intel-panel--navigable', 'intel-panel--clickable'];
  if (breakdownTypes.includes(p.type)) panelClasses.push('intel-panel--breakdown');
  if (!breakdownTypes.includes(p.type) && p.cancelCount == null) {
    panelClasses.push('intel-panel--metric');
  }

  const clickAttrs = `class="${panelClasses.join(' ')}" data-action="open-insight" data-insight-page="${p.id}" data-panel-id="${p.id}" role="button" tabindex="0" style="--intel-accent:${p.accent}"`;

  const showFootSub = (p.type === 'salesBreakdown' && p.sub)
    || ((p.type === 'visitBreakdown' || p.type === 'appointmentBreakdown') && p.sub);
  const footSub = showFootSub ? `<span class="intel-panel-sub">${p.sub || ''}</span>` : '';

  return `
    <div ${clickAttrs}>
      <div class="intel-panel-icon" aria-hidden="true">${p.icon}</div>
      <div class="intel-panel-body">
        ${renderIntelPanelHeader(p)}
        <div class="intel-panel-main">
          ${valueHtml}
        </div>
        <div class="intel-panel-foot">
          ${footSub}
          ${renderIntelTrend(p)}
        </div>
        ${p.progress != null ? `<div class="progress-bar intel-panel-progress"><div class="progress-fill ${progressClass(p.progress)}" style="width:${Math.min(p.progress, 100)}%"></div></div>` : ''}
      </div>
    </div>`;
}

function renderIntelStaffChart(chart) {
  const max = Math.max(...chart.labels.map((_, i) => (chart.insurance[i] || 0) + (chart.selfPay[i] || 0)), 1);
  const summary = chart.breakdown;
  const summaryHtml = summary ? `
    <div class="intel-hbar-summary">
      <span>Dr <strong>${intelFormatYen(summary.dr)}</strong></span>
      <span>DH <strong>${intelFormatYen(summary.dh)}</strong></span>
      <span class="intel-hbar-summary--unset">未設定 <strong>${intelFormatYen(summary.unset)}</strong></span>
      <span class="intel-hbar-summary-total">合計 <strong>${intelFormatYen(summary.dr + summary.dh + summary.unset)}</strong></span>
    </div>` : '';

  return `
    ${summaryHtml}
    <div class="intel-hbar-list">
      ${chart.labels.map((label, i) => {
        const ins = chart.insurance[i] || 0;
        const self = chart.selfPay[i] || 0;
        const total = ins + self;
        const w = (total / max) * 100;
        const insW = total > 0 ? (ins / total) * 100 : 0;
        const isUnset = label.includes('未設定');
        return `
          <div class="intel-hbar-row ${isUnset ? 'intel-hbar-row--unset' : ''}">
            <span class="intel-hbar-label">${label}</span>
            <div class="intel-hbar-track">
              <div class="intel-hbar-fill" style="width:${w}%">
                <span class="intel-hbar-seg intel-hbar-seg--ins" style="width:${insW}%"></span>
                <span class="intel-hbar-seg intel-hbar-seg--self" style="width:${100 - insW}%"></span>
              </div>
            </div>
            <span class="intel-hbar-amt">${formatYen(total)}</span>
          </div>`;
      }).join('')}
    </div>
    <div class="chart-legend intel-chart-legend">
      <div class="chart-legend-item"><span class="chart-legend-dot" style="background:#94a3b8"></span>保険</div>
      <div class="chart-legend-item"><span class="chart-legend-dot" style="background:var(--accent)"></span>自費</div>
    </div>`;
}

function renderIntelUtilizationChart(chart) {
  const max = Math.max(...chart.values, chart.goal, 100);
  return `
    <div class="intel-util-grid">
      ${chart.labels.map((label, i) => {
        const v = chart.values[i];
        const h = (v / max) * 100;
        const overGoal = v >= chart.goal;
        return `
          <div class="intel-util-col">
            <div class="intel-util-bar-wrap">
              <div class="intel-util-goal" style="bottom:${(chart.goal / max) * 100}%"></div>
              <div class="intel-util-bar ${overGoal ? 'intel-util-bar--ok' : ''}" style="height:${h}%">
                <span class="detail-bar-tooltip">${v}%</span>
              </div>
            </div>
            <span class="intel-util-label">${label}</span>
          </div>`;
      }).join('')}
    </div>
    <div class="intel-util-meta">目標 ${chart.goal}%<span class="intel-util-goal-dot"></span></div>`;
}

function renderIntelligenceSections(periodKey) {
  const intel = getIntelligenceData(periodKey, getMetricsContext(state));
  const order = getIntelPanelOrder();
  const { primary, secondary } = applyIntelPanelOrderToLayout(intel.panelLayout, order);

  return `
    <div class="intel-sections">
      <section class="intel-block">
        <header class="intel-block-head">
          <h2 class="intel-block-title">経営指標</h2>
        </header>
        <div class="intel-panel-grid intel-panel-grid--primary" data-intel-grid="primary">
          ${primary.map((p, i) => renderIntelPanelSlot(p, 'primary', i)).join('')}
        </div>
        <div class="intel-panel-grid intel-panel-grid--secondary" data-intel-grid="secondary">
          ${secondary.map((p, i) => renderIntelPanelSlot(p, 'secondary', i)).join('')}
        </div>
      </section>

      <section class="intel-block intel-block--charts">
        <div class="intel-chart-grid">
          <article class="intel-chart-card">
            <h3 class="intel-chart-title">稼働率</h3>
            <p class="intel-chart-sub">ユニット別 / 目標達成ライン</p>
            ${renderIntelUtilizationChart(intel.utilizationChart)}
          </article>
          <article class="intel-chart-card">
            <h3 class="intel-chart-title">職種別売上</h3>
            <p class="intel-chart-sub">保険・自費の内訳</p>
            ${renderIntelStaffChart(intel.staffSalesChart)}
          </article>
        </div>
      </section>

      <section class="intel-block intel-block--charts">
        <div class="intel-chart-grid">
          <article class="intel-chart-card intel-chart-card--wide">
            <h3 class="intel-chart-title">${intel.visitsChartTitle}</h3>
            <p class="intel-chart-sub">初診 / 再初診 / 再診 — 前年比較破線</p>
            ${renderVisitsChart(intel.charts)}
          </article>
          <article class="intel-chart-card intel-chart-card--wide">
            <h3 class="intel-chart-title">WEB予約メニュー構成</h3>
            <p class="intel-chart-sub">当月の予約メニュー比率（PDFデータ差し替え予定）</p>
            <div class="intel-donut-row">
              ${renderIntelDonutMock(periodKey)}
            </div>
          </article>
        </div>
      </section>
    </div>`;
}

function renderIntelDonutMock(periodKey) {
  const menus = {
    '前日': [['定期検診', 38], ['クリーニング', 28], ['初診', 18], ['その他', 16]],
    '本日': [['定期検診', 36], ['クリーニング', 30], ['初診', 20], ['その他', 14]],
    '今月': [['クリーニング', 34], ['定期検診', 32], ['初診', 22], ['その他', 12]],
    '今年': [['初診', 28], ['定期検診', 30], ['クリーニング', 26], ['その他', 16]],
  }[periodKey] || [['定期検診', 36], ['クリーニング', 30], ['初診', 20], ['その他', 14]];
  const colors = ['#0ea5e9', '#6366f1', '#10b981', '#94a3b8'];
  let acc = 0;
  const gradient = menus.map(([_, pct], i) => {
    const start = acc;
    acc += pct;
    return `${colors[i]} ${start}% ${acc}%`;
  }).join(', ');
  return `
    <div class="intel-donut" style="background:conic-gradient(${gradient})" aria-hidden="true"></div>
    <ul class="intel-donut-legend">
      ${menus.map(([name, pct], i) => `
        <li><span class="intel-donut-dot" style="background:${colors[i]}"></span>${name}<strong>${pct}%</strong></li>
      `).join('')}
    </ul>`;
}

function renderPeriodDividerTabs() {
  return PERIOD_KEYS.map((p) => `
    <button type="button"
      class="period-divider-tab clickable ${state.selectedPeriod === p ? 'active' : ''}"
      data-action="select-period"
      data-period="${p}"
      aria-pressed="${state.selectedPeriod === p}">${p}</button>
  `).join('');
}

function renderPeriodDetailDivider(periodKey, subtitle) {
  const dateTitle = `
    <span class="detail-period-sub">${subtitle}</span><span class="period-detail-divider__suffix">の詳細</span>`;
  const ariaLabel = `${periodKey}${subtitle}の詳細`;

  if (PERIOD_HEADER_MODE === 'unified') {
    return `
      <div class="period-detail-divider period-detail-divider--unified" role="separator" aria-label="${ariaLabel}">
        <div class="period-detail-divider__classic">
          <span class="period-detail-divider__line" aria-hidden="true"></span>
          <div class="period-detail-divider__label">
            <span class="detail-period-badge">${periodKey}</span>
            <span class="period-detail-divider__title">${dateTitle}</span>
          </div>
          <span class="period-detail-divider__line" aria-hidden="true"></span>
        </div>
        <div class="period-detail-divider__unified-bar">
          <div class="period-detail-divider__tabs" role="tablist" aria-label="表示期間">
            ${renderPeriodDividerTabs()}
          </div>
          <span class="period-detail-divider__line period-detail-divider__line--bridge" aria-hidden="true"></span>
          <div class="period-detail-divider__label period-detail-divider__label--date">
            <span class="period-detail-divider__title">${dateTitle}</span>
          </div>
        </div>
      </div>`;
  }

  return `
      <div class="period-detail-divider" role="separator" aria-label="${ariaLabel}">
        <span class="period-detail-divider__line" aria-hidden="true"></span>
        <div class="period-detail-divider__label">
          <span class="detail-period-badge">${periodKey}</span>
          <span class="period-detail-divider__title">${dateTitle}</span>
        </div>
        <span class="period-detail-divider__line" aria-hidden="true"></span>
      </div>`;
}

function renderPeriodDetailSections(periodKey, level) {
  const detail = getPeriodDetail(periodKey);
  const { subtitle } = detail;

  return `
    <div class="period-detail-wrap">
      <div class="period-detail-divider-anchor" aria-hidden="true"></div>
      ${renderPeriodDetailDivider(periodKey, subtitle)}

      <div class="period-detail-panel period-detail-panel--intel">
        ${renderIntelligenceSections(periodKey)}
      </div>
    </div>`;
}

function applyPeriodHeaderMode() {
  document.body.classList.toggle('period-header-unified', PERIOD_HEADER_MODE === 'unified');
  document.body.classList.toggle('period-header-split', PERIOD_HEADER_MODE === 'split');
}

function renderPeriodToolbar(show) {
  const el = document.getElementById('period-toolbar');
  el.classList.remove('revealed');
  document.body.classList.remove('period-toolbar-revealed');
  if (!show || PERIOD_HEADER_MODE === 'unified') {
    el.classList.remove('visible');
    el.innerHTML = '';
    return;
  }
  el.classList.add('visible');
  el.innerHTML = PERIOD_KEYS.map(p => `
    <button type="button" class="period-tab clickable ${state.selectedPeriod === p ? 'active' : ''}" data-action="select-period" data-period="${p}">${p}</button>
  `).join('');
}

let periodGridObserver = null;
let periodDividerObserver = null;

function getPeriodStickyTop() {
  if (PERIOD_HEADER_MODE === 'unified') return 0;
  const toolbar = document.getElementById('period-toolbar');
  const toolbarRevealed = toolbar && toolbar.classList.contains('revealed');
  return toolbarRevealed ? 42 : 0;
}

function setupPeriodDividerStuckObserver() {
  if (periodDividerObserver) {
    periodDividerObserver.disconnect();
    periodDividerObserver = null;
  }

  const anchor = document.querySelector('.period-detail-divider-anchor');
  const divider = document.querySelector('.period-detail-divider');
  if (!anchor || !divider) return;

  const top = getPeriodStickyTop();
  periodDividerObserver = new IntersectionObserver(
    ([entry]) => {
      divider.classList.toggle('is-stuck', !entry.isIntersecting);
    },
    { threshold: 0, rootMargin: `-${top}px 0px 0px 0px` }
  );
  periodDividerObserver.observe(anchor);
}

function setupPeriodToolbarObserver() {
  if (periodGridObserver) {
    periodGridObserver.disconnect();
    periodGridObserver = null;
  }

  const grid = document.querySelector('.period-grid');
  const toolbar = document.getElementById('period-toolbar');

  if (PERIOD_HEADER_MODE === 'split' && grid && toolbar && toolbar.classList.contains('visible')) {
    periodGridObserver = new IntersectionObserver(
      ([entry]) => {
        const revealed = !entry.isIntersecting;
        toolbar.classList.toggle('revealed', revealed);
        document.body.classList.toggle('period-toolbar-revealed', revealed);
        setupPeriodDividerStuckObserver();
      },
      { threshold: 0, rootMargin: '-100px 0px 0px 0px' }
    );
    periodGridObserver.observe(grid);
  }

  setupPeriodDividerStuckObserver();
}

function selectPeriod(period) {
  if (!PERIOD_KEYS.includes(period)) return;
  if (period === state.selectedPeriod) return;
  updatePeriodSelection(period);
}

function updatePeriodSelection(period) {
  state.selectedPeriod = period;

  document.querySelectorAll('.period-card[data-period]').forEach((card) => {
    const isActive = card.dataset.period === period;
    card.classList.toggle('active', isActive);
    card.setAttribute('aria-pressed', String(isActive));
  });

  document.querySelectorAll('.period-tab[data-period]').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.period === period);
  });

  document.querySelectorAll('.period-divider-tab[data-period]').forEach((tab) => {
    const isActive = tab.dataset.period === period;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-pressed', String(isActive));
  });

  const detailRoot = document.getElementById('period-detail-root');
  if (detailRoot) {
    detailRoot.innerHTML = renderPeriodDetailSections(period, state.level);
    setupPeriodDividerStuckObserver();
  }

}

function renderDashboard() {
  const data = getViewData();
  const { periods, showPeriodDetail, level } = data;

  document.getElementById('main-content').className = 'content';

  const html = `
    <div class="period-grid">
      ${renderPeriodCards(periods, state.selectedPeriod, showPeriodDetail)}
    </div>

    <div id="period-detail-root">
      ${showPeriodDetail ? renderPeriodDetailSections(state.selectedPeriod, level) : ''}
    </div>
  `;

  document.getElementById('main-content').innerHTML = html;
  renderPeriodToolbar(showPeriodDetail);
  if (showPeriodDetail) setupPeriodToolbarObserver();
}

function renderMeta() {
  const { meta } = MOCK_DATA;
  const footer = document.getElementById('sidebar-footer');
  if (!footer) return;

  const badgeText = meta.isRealData ? '実データ表示中' : 'モックデータ';
  const badgeClass = meta.isRealData ? 'sidebar-data-badge badge-live' : 'sidebar-data-badge badge-live badge-mock';

  footer.innerHTML = `
    <button type="button" class="sidebar-upload-btn" id="sidebar-upload-btn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      データをアップロード
    </button>
    <input type="file" class="sidebar-file-input" accept=".csv,.xlsx,.xls" hidden>
    <div class="sidebar-data-meta">
      <span class="${badgeClass}">${badgeText}</span>
      <span class="sidebar-data-chip"><strong>${meta.loadedCount.toLocaleString()}</strong>件</span>
      <span class="sidebar-data-sep" aria-hidden="true">·</span>
      <span class="sidebar-data-chip sidebar-data-file" title="${meta.fileName}">${meta.fileName}</span>
      <span class="sidebar-data-sep" aria-hidden="true">·</span>
      <span class="sidebar-data-chip sidebar-data-warn">欠損 ${meta.missingCount} / スキップ ${meta.skippedCount}</span>
    </div>
  `;
}

function initSidebarFooter() {
  const footer = document.getElementById('sidebar-footer');
  if (!footer || footer.dataset.init) return;
  footer.dataset.init = '1';

  footer.addEventListener('click', (e) => {
    if (e.target.closest('.sidebar-upload-btn')) {
      footer.querySelector('.sidebar-file-input')?.click();
    }
  });

  footer.addEventListener('change', (e) => {
    const input = e.target;
    if (!input.matches('.sidebar-file-input')) return;
    const file = input.files?.[0];
    if (!file) return;
    MOCK_DATA.meta.fileName = file.name;
    MOCK_DATA.meta.isRealData = true;
    renderMeta();
    input.value = '';
  });
}

const SIDEBAR_WIDTH_STORAGE_KEY = 'sidebarWidth';
const SIDEBAR_WIDTH_MIN = 200;
const SIDEBAR_WIDTH_MAX = 440;

function getSidebarWidth() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width').trim();
  return parseInt(raw, 10) || 260;
}

function setSidebarWidth(px) {
  const width = Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(px)));
  document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
  return width;
}

function initSidebarResize() {
  const saved = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
  if (saved) setSidebarWidth(Number(saved));

  const resizer = document.getElementById('sidebar-resizer');
  if (!resizer || resizer.dataset.init) return;
  resizer.dataset.init = '1';

  let startX = 0;
  let startW = 0;

  const onMove = (e) => {
    setSidebarWidth(startW + e.clientX - startX);
  };

  const onUp = (e) => {
    resizer.releasePointerCapture(e.pointerId);
    resizer.removeEventListener('pointermove', onMove);
    resizer.removeEventListener('pointerup', onUp);
    resizer.removeEventListener('pointercancel', onUp);
    document.body.classList.remove('sidebar-resizing');
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(getSidebarWidth()));
  };

  resizer.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    startX = e.clientX;
    startW = getSidebarWidth();
    document.body.classList.add('sidebar-resizing');
    resizer.setPointerCapture(e.pointerId);
    resizer.addEventListener('pointermove', onMove);
    resizer.addEventListener('pointerup', onUp);
    resizer.addEventListener('pointercancel', onUp);
  });
}

function render() {
  applyPeriodHeaderMode();
  renderNav();
  renderDashboard();
  renderMeta();
  setupIntelPanelDragDrop();
  setupNavDragDrop();
}

const IS_INSIGHT_PAGE = !!document.getElementById('insight-main');

function handleNavTreeClick(e) {
  if (e.target.closest('.nav-row__drag-handle')) return;

  const row = e.target.closest('.nav-row');
  const toggle = e.target.closest('[data-action="toggle"]');

  if (toggle) {
    e.stopPropagation();
    const key = toggle.dataset.key;
    state.expanded[key] = !state.expanded[key];
    renderNav();
    return;
  }

  if (!row) return;
  const action = row.dataset.action;

  if (action === 'select-clinic') {
    state.level = 'clinic';
    state.clinicId = row.dataset.clinic;
    state.role = null;
    state.staffId = null;
    if (!IS_INSIGHT_PAGE) state.selectedPeriod = '本日';
    state.expanded[row.dataset.clinic] = true;
  } else if (action === 'select-role') {
    state.level = 'role';
    state.clinicId = row.dataset.clinic;
    state.role = row.dataset.role;
    state.staffId = null;
    if (!IS_INSIGHT_PAGE) state.selectedPeriod = '本日';
  } else if (action === 'select-staff') {
    state.level = 'staff';
    state.clinicId = row.dataset.clinic;
    state.role = row.dataset.role;
    state.staffId = row.dataset.staff;
    if (!IS_INSIGHT_PAGE) state.selectedPeriod = '本日';
  }

  if (IS_INSIGHT_PAGE) {
    if (typeof window.onInsightNavChange === 'function') window.onInsightNavChange();
    return;
  }

  render();
}

// --- Event Handling ---
const navTree = document.getElementById('nav-tree');
if (navTree) navTree.addEventListener('click', handleNavTreeClick);

const periodToolbar = document.getElementById('period-toolbar');
if (periodToolbar) periodToolbar.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="select-period"]');
  if (!btn) return;
  selectPeriod(btn.dataset.period);
});

const mainContent = document.getElementById('main-content');
if (mainContent) mainContent.addEventListener('click', (e) => {
  if (e.target.closest('.intel-panel-slot__drag-handle')) return;

  const insightTarget = e.target.closest('[data-action="open-insight"]');
  if (insightTarget) {
    e.stopPropagation();
    navigateToInsightPage(insightTarget.dataset.insightPage || insightTarget.dataset.panelId);
    return;
  }

  const card = e.target.closest('[data-action="select-period"]');
  if (!card) return;
  selectPeriod(card.dataset.period);
});

if (mainContent) mainContent.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (e.target.closest('.intel-panel-slot__drag-handle')) return;

  const insightTarget = e.target.closest('[data-action="open-insight"]');
  if (insightTarget) {
    e.preventDefault();
    navigateToInsightPage(insightTarget.dataset.insightPage || insightTarget.dataset.panelId);
    return;
  }

  const card = e.target.closest('[data-action="select-period"]');
  if (!card) return;
  e.preventDefault();
  selectPeriod(card.dataset.period);
});

// Init
initSidebarFooter();
initSidebarResize();
if (!IS_INSIGHT_PAGE) render();
