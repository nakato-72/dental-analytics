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
  sidebarView: 'nav', // 'nav' | 'settings'
  settingsPage: null, // null | 'holidays' | 'goals'
  settingsCalYear: 2026,
  settingsCalMonth: 6,
  settingsVersionId: null,
  settingsDraft: null, // 休日設定画面の未保存下書き
  settingsAddForm: { from: '', note: '' },
  settingsGoalsDraft: null, // 目標設定の入力中下書き
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
function renderSettingsNav() {
  const items = [
    {
      id: 'goals',
      label: '目標設定',
      desc: '月間の売上・患者・予約・定着',
      action: 'open-goals-settings',
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>`,
    },
    {
      id: 'holidays',
      label: '休日設定',
      desc: '医院の休診日を登録',
      action: 'open-holiday-settings',
      icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    },
  ];

  return `
    <li class="nav-item nav-item--settings-header">
      <div class="nav-row nav-row--settings-back" data-action="close-sidebar-settings" role="button" tabindex="0">
        <span class="nav-settings-back-icon" aria-hidden="true">←</span>
        <span class="nav-label">設定</span>
      </div>
    </li>
    ${items.map((item) => {
      const active = state.settingsPage === item.id;
      return `
      <li class="nav-item">
        <button type="button" class="nav-row nav-row--settings-item${active ? ' nav-row--settings-item-active' : ''}" data-action="${item.action}" data-settings-id="${item.id}" aria-current="${active ? 'page' : 'false'}">
          <span class="nav-settings-item-icon">${item.icon}</span>
          <span class="nav-settings-item-text">
            <span class="nav-label">${item.label}</span>
            <span class="nav-settings-item-desc">${item.desc}</span>
          </span>
        </button>
      </li>`;
    }).join('')}
  `;
}

function renderNav() {
  const tree = document.getElementById('nav-tree');
  if (!tree) return;

  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('sidebar--settings', state.sidebarView === 'settings');
  }

  if (state.sidebarView === 'settings') {
    tree.innerHTML = renderSettingsNav();
    return;
  }

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
      <span class="detail-bar-label ${typeof chartDateLabelClass === 'function' ? chartDateLabelClass(label) : ''}">${label}</span>
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
      if (total <= 0) return '<div class="detail-bar-empty" aria-hidden="true"></div>';
      const barH = (total / scale.axisMax) * 100;
      return `
        <div class="detail-stacked-bar" style="height:${barH}%">
          ${segments.map(seg => {
            const val = chart[seg.key][i] || 0;
            if (val <= 0) return '';
            const h = (val / total) * 100;
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
      if (total <= 0) return '<div class="detail-bar-empty" aria-hidden="true"></div>';
      const barH = (total / scale.axisMax) * 100;
      return `
        <div class="detail-stacked-bar detail-stacked-bar--visits" style="height:${barH}%">
          <span class="detail-bar-tooltip">${total}人</span>
          ${segments.map(seg => {
            const val = chart[seg.key]?.[i] || 0;
            if (val <= 0) return '';
            const h = (val / total) * 100;
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
  return renderIntelCountBreakdown([
    { label: '来院済', count: b.visited },
    { label: '未来院', count: b.notVisited },
    { label: '当日キャンセル', count: b.cancelSameDay || 0 },
    { label: '前日以降キャンセル', count: b.cancelAdvance || 0 },
    { label: '無断キャンセル', count: b.noShow || 0 },
  ], '件', ['#10b981', '#0ea5e9', '#eab308', '#f59e0b', '#ef4444']);
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
  const segments = Array.isArray(p.progressSegments) && p.progressSegments.length
    ? p.progressSegments.filter((s) => (s.value || 0) > 0)
    : null;
  const progress = p.progress ?? 0;
  const chartHtml = segments
    ? renderIntelMiniDonut(segments.map((s) => ({
      value: s.value,
      color: s.color || p.accent || '#0ea5e9',
    })))
    : (p.progress != null
      ? renderIntelMiniDonut([
        { value: progress, color: p.accent || '#0ea5e9' },
        { value: Math.max(0, 100 - progress), color: '#e8edf2' },
      ])
      : '<div class="intel-mini-donut intel-mini-donut--empty" aria-hidden="true"></div>');

  if (segments) {
    const isYen = p.id === 'selfPay' || p.label === '自費';
    const unit = isYen ? '' : (p.id === 'utilization' || p.label === '稼働率' ? '枠' : '件');
    const rows = segments.map((s) => {
      const valueHtml = isYen
        ? intelFormatYen(s.value)
        : `${Number(s.value).toLocaleString('ja-JP')}<span class="unit">${unit}</span>`;
      return {
        label: s.label,
        text: isYen ? intelFormatYen(s.value) : `${s.value}${unit}`,
        valueHtml,
      };
    });
    return renderIntelBreakdownRows(chartHtml, rows);
  }

  if (!p.sub) {
    return renderIntelBreakdownWithChart(chartHtml, []);
  }
  return renderIntelBreakdownWithChart(chartHtml, [{ text: p.sub, metaOnly: true }]);
}

function renderIntelProgressBar(p) {
  if (Array.isArray(p.progressSegments) && p.progressSegments.length) {
    const segments = p.progressSegments.filter((s) => (s.value || 0) > 0);
    const total = segments.reduce((sum, s) => sum + (s.value || 0), 0);
    if (!total) return '';
    const segsHtml = segments.map((s) => {
      const pct = ((s.value || 0) / total) * 100;
      return `<span class="progress-seg" style="width:${pct}%;background:${s.color || p.accent || '#0ea5e9'}" title="${s.label || ''} ${s.value}"></span>`;
    }).join('');
    return `<div class="progress-bar intel-panel-progress intel-panel-progress--segments" role="img" aria-label="構成比">${segsHtml}</div>`;
  }
  if (p.progress == null) return '';
  return `<div class="progress-bar intel-panel-progress"><div class="progress-fill ${progressClass(p.progress)}" style="width:${Math.min(p.progress, 100)}%"></div></div>`;
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
    || ((p.type === 'visitBreakdown' || p.type === 'appointmentBreakdown') && p.sub)
    || (!breakdownTypes.includes(p.type) && p.cancelCount == null && p.sub);
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
        ${renderIntelProgressBar(p)}
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
  const settingsOpen = state.sidebarView === 'settings';

  footer.innerHTML = `
    <button type="button" class="sidebar-upload-btn" id="sidebar-upload-btn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      データをアップロード
    </button>
    <div class="sidebar-footer-tools">
      <button type="button"
        class="sidebar-settings-btn${settingsOpen ? ' sidebar-settings-btn--active' : ''}"
        id="sidebar-settings-btn"
        data-action="toggle-sidebar-settings"
        aria-pressed="${settingsOpen ? 'true' : 'false'}"
        aria-label="設定"
        title="設定">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        <span>設定</span>
      </button>
    </div>
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

async function toggleSidebarSettings() {
  if (state.sidebarView === 'settings') await closeSidebarSettings();
  else await openSidebarSettings();
}

function getHolidaySettingsClinicId() {
  if (typeof insightState !== 'undefined' && insightState.clinicId) return insightState.clinicId;
  if (typeof state !== 'undefined' && state.clinicId) return state.clinicId;
  return MOCK_DATA?.clinics?.[0]?.id || 'clinic-sakura';
}

function getHolidaySettingsClinicName(clinicId) {
  const clinic = typeof getClinicById === 'function'
    ? getClinicById(clinicId)
    : MOCK_DATA?.clinics?.find((c) => c.id === clinicId);
  return clinic?.name || '医院';
}

function getAppMainRoot() {
  return document.getElementById('insight-main') || document.getElementById('main-content');
}

function formatHolidayKeyLabel(key) {
  const parsed = typeof parseDateKey === 'function' ? parseDateKey(key) : null;
  if (!parsed) return key;
  const weekday = (typeof WEEKDAY_LABELS_JP !== 'undefined' ? WEEKDAY_LABELS_JP : ['日', '月', '火', '水', '木', '金', '土'])[
    typeof getWeekday === 'function' ? getWeekday(parsed.year, parsed.month, parsed.day) : 0
  ];
  const pub = typeof getPublicHolidayName === 'function'
    ? getPublicHolidayName(parsed.year, parsed.month, parsed.day)
    : null;
  return `${parsed.month}/${parsed.day}（${weekday}）${pub ? ` · ${pub}` : ''}`;
}

function cloneHolidaySettings(settings) {
  return JSON.parse(JSON.stringify(settings || {}));
}

function getActiveHolidaySettingsDraft(clinicId) {
  if (state.settingsPage !== 'holidays') return null;
  if (!state.settingsDraft || state.settingsDraft._clinicId !== clinicId) return null;
  const { _clinicId, ...rest } = state.settingsDraft;
  return rest;
}

function ensureHolidaySettingsDraft(clinicId = getHolidaySettingsClinicId()) {
  const id = clinicId;
  if (state.settingsDraft && state.settingsDraft._clinicId === id) {
    return state.settingsDraft;
  }
  const persisted = typeof getClinicCalendarSettings === 'function'
    ? getClinicCalendarSettings(id, { persisted: true })
    : { versions: [], specialClosed: [], specialOpen: [] };
  state.settingsDraft = {
    _clinicId: id,
    ...cloneHolidaySettings(persisted),
  };
  return state.settingsDraft;
}

function clearHolidaySettingsDraft() {
  state.settingsDraft = null;
}

function resetHolidayAddForm() {
  state.settingsAddForm = { from: '', note: '' };
}

function getHolidayAddForm() {
  if (!state.settingsAddForm) resetHolidayAddForm();
  return state.settingsAddForm;
}

function syncHolidayAddFormFromDom() {
  const form = getHolidayAddForm();
  const fromInput = document.getElementById('settings-new-version-from');
  const noteInput = document.getElementById('settings-new-version-note');
  if (fromInput) form.from = fromInput.value || '';
  if (noteInput) form.note = noteInput.value || '';
}

function normalizeSettingsComparePayload(settings) {
  return {
    versions: [...(settings?.versions || [])]
      .map((v) => ({
        id: v.id,
        effectiveFrom: v.effectiveFrom,
        note: v.note || '',
        weeklyClosed: [...(v.weeklyClosed || [])].sort((a, b) => a - b),
        schedule: v.schedule || {},
      }))
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)),
    specialClosed: [...(settings?.specialClosed || [])].sort(),
    specialOpen: [...(settings?.specialOpen || [])].sort(),
    specialOpenHours: settings?.specialOpenHours || {},
  };
}

function isHolidaySettingsDirty(clinicId = getHolidaySettingsClinicId()) {
  if (state.settingsPage !== 'holidays') return false;
  syncHolidayAddFormFromDom();
  const form = getHolidayAddForm();
  if ((form.from || '').trim() || (form.note || '').trim()) return true;
  if (!state.settingsDraft || state.settingsDraft._clinicId !== clinicId) return false;
  const draft = getActiveHolidaySettingsDraft(clinicId);
  const persisted = getClinicCalendarSettings(clinicId, { persisted: true });
  return JSON.stringify(normalizeSettingsComparePayload(draft))
    !== JSON.stringify(normalizeSettingsComparePayload(persisted));
}

function showSettingsToast(message) {
  let host = document.getElementById('settings-toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'settings-toast-host';
    host.className = 'settings-toast-host';
    document.body.appendChild(host);
  }
  const toast = document.createElement('div');
  toast.className = 'settings-toast';
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  host.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => toast.remove(), 220);
  }, 2200);
}

function showUnsavedSettingsDialog() {
  return new Promise((resolve) => {
    const existing = document.getElementById('settings-unsaved-dialog');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'settings-unsaved-dialog';
    overlay.className = 'settings-unsaved-dialog';
    overlay.innerHTML = `
      <div class="settings-unsaved-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="settings-unsaved-title">
        <h3 id="settings-unsaved-title" class="settings-unsaved-dialog__title">確認</h3>
        <p class="settings-unsaved-dialog__body">情報が更新されています。変更を保存しますか？</p>
        <div class="settings-unsaved-dialog__actions">
          <button type="button" class="settings-unsaved-dialog__btn settings-unsaved-dialog__btn--primary" data-choice="yes">はい</button>
          <button type="button" class="settings-unsaved-dialog__btn" data-choice="no">いいえ</button>
          <button type="button" class="settings-unsaved-dialog__btn" data-choice="cancel">キャンセル</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const finish = (choice) => {
      overlay.remove();
      resolve(choice);
    };
    overlay.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-choice]');
      if (btn) {
        finish(btn.dataset.choice);
        return;
      }
      if (e.target === overlay) finish('cancel');
    });
    const onKey = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey, true);
        finish('cancel');
      }
    };
    document.addEventListener('keydown', onKey, true);
  });
}

async function confirmLeaveHolidaySettings(clinicId = getHolidaySettingsClinicId()) {
  if (!isHolidaySettingsDirty(clinicId)) return true;
  const choice = await showUnsavedSettingsDialog();
  if (choice === 'cancel') return false;
  if (choice === 'yes') {
    ensureHolidaySettingsDraft(clinicId);
    commitDraftVersions(clinicId);
    commitDraftSpecialDays(clinicId);
    resetHolidayAddForm();
    showSettingsToast('更新しました。');
    return true;
  }
  clearHolidaySettingsDraft();
  resetHolidayAddForm();
  return true;
}

function leaveHolidaySettingsView() {
  state.settingsPage = null;
  clearHolidaySettingsDraft();
  resetHolidayAddForm();
  clearGoalsSettingsDraft();
  restoreAppMainView();
}

function findDraftVersion(draft, versionId) {
  return (draft.versions || []).find((v) => v.id === versionId) || null;
}

function draftToggleWeeklyClosed(weekday, versionId) {
  const draft = ensureHolidaySettingsDraft();
  const ver = findDraftVersion(draft, versionId || state.settingsVersionId);
  if (!ver) return;
  const day = Number(weekday);
  const set = new Set(ver.weeklyClosed || []);
  if (set.has(day)) set.delete(day);
  else set.add(day);
  ver.weeklyClosed = [...set].sort((a, b) => a - b);
  if (!ver.schedule) ver.schedule = {};
  const row = ver.schedule[day] || {};
  const closed = set.has(day);
  ver.schedule[day] = {
    ...row,
    closed,
    openStart: closed ? '' : (row.openStart || '09:00'),
    openEnd: closed ? '' : (row.openEnd || '18:30'),
    breakStart: closed ? '' : (row.breakStart || '13:00'),
    breakEnd: closed ? '' : (row.breakEnd || '14:30'),
  };
}

function draftUpdateWeekdaySchedule(weekday, patch, versionId) {
  const draft = ensureHolidaySettingsDraft();
  const ver = findDraftVersion(draft, versionId || state.settingsVersionId);
  if (!ver) return;
  const day = Number(weekday);
  const closed = (ver.weeklyClosed || []).includes(day);
  if (!ver.schedule) ver.schedule = {};
  ver.schedule[day] = {
    ...(ver.schedule[day] || {}),
    ...patch,
    closed,
  };
  if (closed) {
    ver.schedule[day].openStart = '';
    ver.schedule[day].openEnd = '';
    ver.schedule[day].breakStart = '';
    ver.schedule[day].breakEnd = '';
  }
}

function draftCycleSpecialDay(year, month, day, hours = null) {
  const draft = ensureHolidaySettingsDraft();
  const key = typeof toDateKey === 'function'
    ? toDateKey(year, month, day)
    : `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const weekday = typeof getWeekday === 'function' ? getWeekday(year, month, day) : 0;
  const snap = typeof resolveScheduleVersion === 'function'
    ? resolveScheduleVersion(draft, key)
    : (draft.versions || [])[0];
  const weeklyClosed = (snap?.weeklyClosed || []).includes(weekday);
  const closedSet = new Set(draft.specialClosed || []);
  const openSet = new Set(draft.specialOpen || []);
  if (!draft.specialOpenHours) draft.specialOpenHours = {};

  if (closedSet.has(key)) {
    closedSet.delete(key);
  } else if (openSet.has(key)) {
    openSet.delete(key);
    delete draft.specialOpenHours[key];
  } else if (weeklyClosed) {
    if (!hours) return { ok: false, needsHours: true, key, snap };
    openSet.add(key);
    draft.specialOpenHours[key] = typeof normalizeSpecialOpenHoursRow === 'function'
      ? normalizeSpecialOpenHoursRow(hours)
      : { ...hours, closed: false };
  } else {
    closedSet.add(key);
  }

  draft.specialClosed = [...closedSet].sort();
  draft.specialOpen = [...openSet].sort();
  if (typeof normalizeSpecialOpenHoursMap === 'function') {
    draft.specialOpenHours = normalizeSpecialOpenHoursMap(draft.specialOpenHours, draft.specialOpen);
  }
  return { ok: true };
}

function showSpecialOpenHoursDialog({ dateLabel, defaults }) {
  return new Promise((resolve) => {
    const existing = document.getElementById('settings-special-open-dialog');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'settings-special-open-dialog';
    overlay.className = 'settings-unsaved-dialog';
    overlay.innerHTML = `
      <div class="settings-unsaved-dialog__panel settings-special-open-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="settings-special-open-title">
        <h3 id="settings-special-open-title" class="settings-unsaved-dialog__title">臨時開院の時間</h3>
        <p class="settings-unsaved-dialog__body">${dateLabel} の診療時間・休憩時間を指定してください。</p>
        <div class="settings-special-open-fields">
          <label class="settings-special-open-field">診療
            <span class="settings-special-open-times">
              <input type="time" data-field="openStart" value="${defaults.openStart || '09:00'}">
              <span>〜</span>
              <input type="time" data-field="openEnd" value="${defaults.openEnd || '18:30'}">
            </span>
          </label>
          <label class="settings-special-open-field">休憩
            <span class="settings-special-open-times">
              <input type="time" data-field="breakStart" value="${defaults.breakStart || '13:00'}">
              <span>〜</span>
              <input type="time" data-field="breakEnd" value="${defaults.breakEnd || '14:30'}">
            </span>
          </label>
        </div>
        <div class="settings-unsaved-dialog__actions">
          <button type="button" class="settings-unsaved-dialog__btn settings-unsaved-dialog__btn--primary" data-choice="ok">OK</button>
          <button type="button" class="settings-unsaved-dialog__btn" data-choice="cancel">キャンセル</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const finish = (value) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(value);
    };

    const readHours = () => ({
      openStart: overlay.querySelector('[data-field="openStart"]')?.value || '',
      openEnd: overlay.querySelector('[data-field="openEnd"]')?.value || '',
      breakStart: overlay.querySelector('[data-field="breakStart"]')?.value || '',
      breakEnd: overlay.querySelector('[data-field="breakEnd"]')?.value || '',
    });

    const onKey = (e) => {
      if (e.key === 'Escape') {
        finish(null);
      }
    };
    document.addEventListener('keydown', onKey, true);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-choice="cancel"]')) {
        finish(null);
        return;
      }
      const okBtn = e.target.closest('[data-choice="ok"]');
      if (!okBtn) return;
      const hours = readHours();
      if (!hours.openStart || !hours.openEnd) {
        window.alert('診療時間を入力してください。');
        return;
      }
      finish(hours);
    });
  });
}

function draftApplyVersionMeta(versionId, { effectiveFrom, note } = {}) {
  const draft = ensureHolidaySettingsDraft();
  const ver = findDraftVersion(draft, versionId);
  if (!ver) return { ok: false, reason: 'missing' };
  if (effectiveFrom != null && effectiveFrom !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) return { ok: false, reason: 'invalid' };
    const conflict = (draft.versions || []).some((v) => v.id !== versionId && v.effectiveFrom === effectiveFrom);
    if (conflict) return { ok: false, reason: 'conflict' };
    ver.effectiveFrom = effectiveFrom;
  }
  if (note != null) ver.note = String(note);
  return { ok: true };
}

function draftAddScheduleVersion(effectiveFrom, note, sourceVersionId) {
  const draft = ensureHolidaySettingsDraft();
  const from = String(effectiveFrom || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;
  if ((draft.versions || []).some((v) => v.effectiveFrom === from)) return null;

  const source = findDraftVersion(draft, sourceVersionId)
    || (typeof resolveScheduleVersion === 'function'
      ? resolveScheduleVersion(draft, from)
      : draft.versions[draft.versions.length - 1]);
  const id = typeof createVersionId === 'function'
    ? createVersionId()
    : `ver-${Date.now()}`;
  const ver = typeof normalizeScheduleVersion === 'function'
    ? normalizeScheduleVersion({
      id,
      effectiveFrom: from,
      note: note || `${from.slice(0, 7).replace('-', '/')}〜`,
      weeklyClosed: source?.weeklyClosed,
      schedule: source?.schedule,
    })
    : {
      id,
      effectiveFrom: from,
      note: note || '',
      weeklyClosed: [...(source?.weeklyClosed || [0])],
      schedule: cloneHolidaySettings(source?.schedule || {}),
    };
  draft.versions.push(ver);
  return ver.id;
}

function draftDeleteScheduleVersion(versionId) {
  const draft = ensureHolidaySettingsDraft();
  if ((draft.versions || []).length <= 1) return false;
  draft.versions = draft.versions.filter((v) => v.id !== versionId);
  return draft.versions.length > 0;
}

function commitDraftVersions(clinicId = getHolidaySettingsClinicId()) {
  const draft = ensureHolidaySettingsDraft(clinicId);
  const persisted = getClinicCalendarSettings(clinicId, { persisted: true });
  setClinicCalendarSettings(clinicId, {
    ...persisted,
    versions: cloneHolidaySettings(draft.versions),
  });
  const saved = getClinicCalendarSettings(clinicId, { persisted: true });
  draft.versions = cloneHolidaySettings(saved.versions);
}

function commitDraftSpecialDays(clinicId = getHolidaySettingsClinicId()) {
  const draft = ensureHolidaySettingsDraft(clinicId);
  const persisted = getClinicCalendarSettings(clinicId, { persisted: true });
  setClinicCalendarSettings(clinicId, {
    ...persisted,
    specialClosed: [...(draft.specialClosed || [])],
    specialOpen: [...(draft.specialOpen || [])],
    specialOpenHours: cloneHolidaySettings(draft.specialOpenHours || {}),
  });
  const saved = getClinicCalendarSettings(clinicId, { persisted: true });
  draft.specialClosed = [...(saved.specialClosed || [])];
  draft.specialOpen = [...(saved.specialOpen || [])];
  draft.specialOpenHours = cloneHolidaySettings(saved.specialOpenHours || {});
}

function selectLatestSettingsVersion(clinicId) {
  const settings = typeof getClinicCalendarSettings === 'function'
    ? getClinicCalendarSettings(clinicId)
    : { versions: [] };
  const versions = typeof getSortedScheduleVersions === 'function'
    ? getSortedScheduleVersions(settings)
    : [...(settings.versions || [])].sort((a, b) => String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)));
  state.settingsVersionId = versions.length ? versions[versions.length - 1].id : null;
  return state.settingsVersionId;
}

function ensureSettingsVersionSelection(clinicId) {
  const settings = typeof getClinicCalendarSettings === 'function'
    ? getClinicCalendarSettings(clinicId)
    : { versions: [] };
  const versions = typeof getSortedScheduleVersions === 'function'
    ? getSortedScheduleVersions(settings)
    : (settings.versions || []);
  if (!versions.length) {
    state.settingsVersionId = null;
    return null;
  }
  if (state.settingsVersionId && versions.some((v) => v.id === state.settingsVersionId)) {
    return versions.find((v) => v.id === state.settingsVersionId);
  }
  state.settingsVersionId = versions[versions.length - 1].id;
  return versions[versions.length - 1];
}

function defaultNextVersionStartDate() {
  const shifted = typeof shiftCalendarMonth === 'function'
    ? shiftCalendarMonth(state.settingsCalYear, state.settingsCalMonth, 1)
    : { year: state.settingsCalYear, month: state.settingsCalMonth + 1 };
  const y = shifted.year;
  const m = shifted.month;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

function formatScheduleVersionOptionLabel(ver, nextVer = null) {
  const rangeLabel = typeof formatScheduleVersionRangeLabel === 'function'
    ? formatScheduleVersionRangeLabel(ver, nextVer)
    : (typeof formatEffectiveFromLabel === 'function'
      ? formatEffectiveFromLabel(ver.effectiveFrom)
      : ver.effectiveFrom);
  const note = (ver.note || '').trim();
  return note ? `${rangeLabel}（${note}）` : rangeLabel;
}

function buildHistorySettingsHtml(clinicId, activeVersion) {
  const settings = typeof getClinicCalendarSettings === 'function'
    ? getClinicCalendarSettings(clinicId)
    : { versions: [] };
  const versionsAsc = typeof getSortedScheduleVersions === 'function'
    ? getSortedScheduleVersions(settings)
    : [...(settings.versions || [])].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const versions = [...versionsAsc].reverse();
  const canDelete = versions.length > 1;
  const versionId = activeVersion?.id || '';

  const options = versions.map((ver) => {
    const ascIndex = versionsAsc.findIndex((v) => v.id === ver.id);
    const nextVer = ascIndex >= 0 ? (versionsAsc[ascIndex + 1] || null) : null;
    const label = formatScheduleVersionOptionLabel(ver, nextVer)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
    return `<option value="${ver.id}"${ver.id === versionId ? ' selected' : ''}>${label}</option>`;
  }).join('');

  return `
    <div class="settings-basic-block">
      <h3 class="settings-basic-label">適用開始</h3>
      <div class="settings-history-bar">
        <select class="settings-history-combo" data-action="select-schedule-version" aria-label="適用開始の履歴">
          ${options}
        </select>
        <button type="button" class="settings-history-update-btn" data-action="update-schedule-version" data-version-id="${versionId}">更新</button>
        ${canDelete ? `<button type="button" class="settings-history-delete" data-action="delete-schedule-version" data-version-id="${versionId}">削除</button>` : ''}
      </div>
    </div>`;
}

function buildAddVersionBarHtml() {
  const form = getHolidayAddForm();
  const fromValue = form.from || '';
  const noteValue = (form.note || '').replace(/"/g, '&quot;');
  return `
    <div class="settings-add-version-bar">
      <label class="settings-add-version-field">適用開始日
        <input type="date" id="settings-new-version-from" data-action="settings-add-form" data-field="from" value="${fromValue}">
      </label>
      <label class="settings-add-version-field settings-add-version-field--note">メモ
        <input type="text" id="settings-new-version-note" data-action="settings-add-form" data-field="note" value="${noteValue}" placeholder="例: 代替わり休診日見直しのため">
      </label>
      <button type="button" class="settings-history-add-btn" data-action="add-schedule-version">追加</button>
    </div>`;
}

function buildBasicInfoSettingsHtml(clinicId) {
  const activeVersion = ensureSettingsVersionSelection(clinicId);
  const weekly = new Set(activeVersion?.weeklyClosed || [0]);
  const schedule = activeVersion?.schedule || {};
  const labels = typeof WEEKDAY_LABELS_JP !== 'undefined'
    ? WEEKDAY_LABELS_JP
    : ['日', '月', '火', '水', '木', '金', '土'];
  const versionId = activeVersion?.id || '';

  const weekdayBtns = labels.map((label, day) => {
    const closed = weekly.has(day);
    return `<button type="button"
      class="settings-weekday-btn${closed ? ' settings-weekday-btn--closed' : ''}${day === 0 ? ' settings-weekday-btn--sun' : ''}"
      data-action="toggle-weekly-closed"
      data-weekday="${day}"
      data-version-id="${versionId}"
      aria-pressed="${closed ? 'true' : 'false'}">${label}</button>`;
  }).join('');

  const scheduleRows = labels.map((label, day) => {
    const row = schedule[day] || {};
    const closed = weekly.has(day);
    if (closed) {
      return `
        <div class="settings-schedule-row settings-schedule-row--closed">
          <span class="settings-schedule-day">${label}</span>
          <span class="settings-schedule-closed-tag">定休日</span>
        </div>`;
    }
    return `
      <div class="settings-schedule-row" data-weekday="${day}">
        <span class="settings-schedule-day">${label}</span>
        <div class="settings-schedule-fields">
          <label class="settings-time-field">
            <span>診療</span>
            <input type="time" data-action="update-schedule" data-weekday="${day}" data-field="openStart" data-version-id="${versionId}" value="${row.openStart || ''}">
            <span class="settings-time-sep">〜</span>
            <input type="time" data-action="update-schedule" data-weekday="${day}" data-field="openEnd" data-version-id="${versionId}" value="${row.openEnd || ''}">
          </label>
          <label class="settings-time-field">
            <span>休憩</span>
            <input type="time" data-action="update-schedule" data-weekday="${day}" data-field="breakStart" data-version-id="${versionId}" value="${row.breakStart || ''}">
            <span class="settings-time-sep">〜</span>
            <input type="time" data-action="update-schedule" data-weekday="${day}" data-field="breakEnd" data-version-id="${versionId}" value="${row.breakEnd || ''}">
          </label>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="settings-section">
      <h2 class="settings-section-heading">基本情報設定</h2>
      <section class="settings-card settings-card--basic">
        ${buildHistorySettingsHtml(clinicId, activeVersion)}

        <div class="settings-basic-block">
          <h3 class="settings-basic-label">定休日</h3>
          <div class="settings-weekday-row" role="group" aria-label="定休日">${weekdayBtns}</div>
        </div>

        <div class="settings-basic-block">
          <h3 class="settings-basic-label">曜日別の診療時間</h3>
          <div class="settings-schedule-list">${scheduleRows}</div>
        </div>

        ${buildAddVersionBarHtml()}
      </section>
    </div>`;
}

function buildHolidaySettingsPageHtml() {
  const clinicId = getHolidaySettingsClinicId();
  if (!state.settingsCalYear) state.settingsCalYear = typeof CALENDAR_YEAR_DEFAULT !== 'undefined' ? CALENDAR_YEAR_DEFAULT : 2026;
  if (!state.settingsCalMonth) state.settingsCalMonth = 6;
  const year = state.settingsCalYear;
  const month = state.settingsCalMonth;

  const settings = typeof getClinicCalendarSettings === 'function'
    ? getClinicCalendarSettings(clinicId)
    : { specialClosed: [], specialOpen: [], specialOpenHours: {} };
  const specialClosed = settings.specialClosed || [];
  const specialOpen = settings.specialOpen || [];
  const closedSet = new Set(specialClosed);
  const openSet = new Set(specialOpen);

  const cells = typeof buildMonthHolidayGrid === 'function'
    ? buildMonthHolidayGrid(year, month, clinicId)
    : [];

  const weekdayHeads = (typeof WEEKDAY_LABELS_JP !== 'undefined' ? WEEKDAY_LABELS_JP : ['日', '月', '火', '水', '木', '金', '土'])
    .map((w, i) => `<span class="holiday-cal-head${i === 0 ? ' holiday-cal-head--sun' : ''}">${w}</span>`)
    .join('');

  const dayCells = cells.map((cell) => {
    if (!cell) return '<span class="holiday-cal-day holiday-cal-day--empty"></span>';
    const specialClosedCls = closedSet.has(cell.key) ? ' holiday-cal-day--selected' : '';
    const specialOpenCls = openSet.has(cell.key) ? ' holiday-cal-day--open' : '';
    const weeklyCls = cell.isWeeklyClosed ? ' holiday-cal-day--weekly' : '';
    const sunCls = cell.isSunday ? ' holiday-cal-day--sun' : '';
    const pubCls = cell.isPublicHoliday ? ' holiday-cal-day--public' : '';
    const openHours = settings.specialOpenHours?.[cell.key];
    const openHoursLabel = openHours
      ? `臨時開院 ${openHours.openStart}〜${openHours.openEnd}`
      : '';
    const title = [
      cell.isPublicHoliday ? cell.holidayName : '',
      closedSet.has(cell.key) ? '突発休診' : '',
      openSet.has(cell.key) ? (openHoursLabel || '臨時開院') : '',
      cell.isWeeklyClosed ? '定休日' : '',
      cell.isSunday ? '日曜' : '',
    ].filter(Boolean).join(' / ') || `${month}/${cell.day}`;
    return `<button type="button"
      class="holiday-cal-day${specialClosedCls}${specialOpenCls}${weeklyCls}${sunCls}${pubCls}"
      data-action="toggle-clinic-holiday"
      data-date-key="${cell.key}"
      title="${title}"
      aria-pressed="${closedSet.has(cell.key) || openSet.has(cell.key) ? 'true' : 'false'}">${cell.day}</button>`;
  }).join('');

  const stats = typeof calcMonthlyOperatingStats === 'function'
    ? calcMonthlyOperatingStats(clinicId, year, month)
    : { operatingDays: 0, closedDays: 0, operatingHoursLabel: '0時間', daysInMonth: 0 };

  return `
    <div class="settings-page" id="settings-page" data-settings-page="holidays">
      <header class="settings-page-header">
        <p class="settings-page-eyebrow">設定</p>
        <h1 class="settings-page-title">休日設定</h1>
      </header>

      ${buildBasicInfoSettingsHtml(clinicId)}

      <div class="settings-section">
        <h2 class="settings-section-heading">臨時設定</h2>
        <div class="settings-page-grid">
        <section class="settings-card">
          <header class="settings-card-header settings-card-header--cal">
            <div class="settings-cal-nav">
              <button type="button" class="settings-cal-nav-btn" data-action="cal-prev-month" aria-label="前の月">‹</button>
              <h2 class="settings-card-title">${year}年${month}月</h2>
              <button type="button" class="settings-cal-nav-btn" data-action="cal-next-month" aria-label="次の月">›</button>
            </div>
          </header>
          <div class="holiday-cal-legend">
            <span><i class="holiday-leg holiday-leg--sun"></i>日曜・定休</span>
            <span><i class="holiday-leg holiday-leg--public"></i>祝日</span>
            <span><i class="holiday-leg holiday-leg--clinic"></i>突発休診</span>
            <span><i class="holiday-leg holiday-leg--open"></i>臨時開院</span>
          </div>
          <div class="holiday-cal holiday-cal--page">
            <div class="holiday-cal-weekdays">${weekdayHeads}</div>
            <div class="holiday-cal-grid">${dayCells}</div>
          </div>
          <div class="settings-cal-footer">
            <button type="button" class="settings-history-update-btn" data-action="update-special-days">更新</button>
          </div>
        </section>

        <section class="settings-card">
          <header class="settings-card-header">
            <h2 class="settings-card-title">当月の稼働</h2>
            <p class="settings-card-sub">${year}年${month}月 · 全${stats.daysInMonth}日</p>
          </header>
          <div class="settings-ops-stats">
            <div class="settings-ops-stat">
              <span class="settings-ops-stat-label">稼働日数</span>
              <span class="settings-ops-stat-value">${stats.operatingDays}<small>日</small></span>
              <span class="settings-ops-stat-note">休診 ${stats.closedDays}日</span>
            </div>
            <div class="settings-ops-stat">
              <span class="settings-ops-stat-label">稼働時間</span>
              <span class="settings-ops-stat-value settings-ops-stat-value--hours">${stats.operatingHoursLabel}</span>
              <span class="settings-ops-stat-note">診療時間 − 休憩</span>
            </div>
          </div>
        </section>
      </div>
      </div>
    </div>
  `;
}

function bindSettingsPageEvents(root) {
  if (!root || root.dataset.settingsBound) return;
  root.dataset.settingsBound = '1';
  root.addEventListener('click', onHolidaySettingsClick);
  root.addEventListener('change', onHolidaySettingsChange);
  root.addEventListener('input', onHolidaySettingsChange);
}

function renderSettingsMain() {
  const root = getAppMainRoot();
  if (!root) return;

  const toolbar = document.getElementById('period-toolbar');
  if (toolbar) toolbar.hidden = true;

  root.classList.add('is-settings-view');
  if (root.id === 'main-content') root.className = 'content is-settings-view';
  if (root.id === 'insight-main') {
    delete root.dataset.shellInit;
  }

  delete root.dataset.settingsBound;

  if (state.settingsPage === 'goals') {
    root.innerHTML = buildGoalsSettingsPageHtml();
    bindGoalsSettingsPageEvents(root);
    document.title = '目標設定 | Dental Analytics';
    return;
  }

  root.innerHTML = buildHolidaySettingsPageHtml();
  bindSettingsPageEvents(root);
  document.title = '休日設定 | Dental Analytics';
}

function restoreAppMainView() {
  const root = getAppMainRoot();
  if (root) root.classList.remove('is-settings-view');

  const toolbar = document.getElementById('period-toolbar');
  if (toolbar) toolbar.hidden = false;

  if (IS_INSIGHT_PAGE) {
    const insightRoot = document.getElementById('insight-main');
    if (insightRoot) delete insightRoot.dataset.shellInit;
    if (typeof renderInsightPage === 'function') renderInsightPage();
    return;
  }
  renderDashboard();
  setupIntelPanelDragDrop();
}

function getGoalsSettingsClinicId() {
  return state.clinicId || 'clinic-sakura';
}

function ensureGoalsSettingsDraft() {
  const clinicId = getGoalsSettingsClinicId();
  if (state.settingsGoalsDraft && state.settingsGoalsDraft._clinicId === clinicId) {
    return state.settingsGoalsDraft;
  }
  const base = typeof getClinicGoals === 'function'
    ? getClinicGoals(clinicId)
    : (typeof normalizeClinicGoals === 'function'
      ? normalizeClinicGoals({})
      : { monthlyRevenue: 6300000, monthlyPatients: 1000 });
  state.settingsGoalsDraft = { _clinicId: clinicId, ...base };
  return state.settingsGoalsDraft;
}

function clearGoalsSettingsDraft() {
  state.settingsGoalsDraft = null;
}

function formatGoalsYenInput(value) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  return n.toLocaleString('ja-JP');
}

function parseGoalsYenInput(raw) {
  const n = Number(String(raw || '').replace(/[¥￥,\s]/g, ''));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function formatGoalsCount(value, { decimals = 0 } = {}) {
  const n = Number(value) || 0;
  const safe = Math.max(0, decimals > 0 ? n : Math.round(n));
  return String(safe.toLocaleString('ja-JP', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }));
}

/** number input 向け：カンマなし（type=number が拒否するのを防ぐ） */
function formatGoalsCountRaw(value, { decimals = 0 } = {}) {
  const n = Number(value) || 0;
  const safe = Math.max(0, decimals > 0 ? n : Math.round(n));
  if (decimals > 0) {
    const fixed = safe.toFixed(decimals).replace(/\.?0+$/, '');
    return fixed === '' ? '0' : fixed;
  }
  return String(Math.round(safe));
}

function parseGoalsCountInput(raw) {
  const n = Number(String(raw || '').replace(/[,\s人点件％%]/g, ''));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function formatGoalsPct(value) {
  const n = Math.max(0, Number(value) || 0);
  return n.toLocaleString('ja-JP', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function parseGoalsPctInput(raw) {
  const n = Number(String(raw || '').replace(/[%,\s]/g, ''));
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 10) / 10) : 0;
}

function recomputeGoalsDraft(draft) {
  if (!draft) return draft;
  const computed = typeof deriveClinicGoalTotals === 'function'
    ? deriveClinicGoalTotals(draft)
    : draft;
  Object.assign(draft, computed);
  return draft;
}

function resolveGoalsOperatingDays(clinicId) {
  const year = state.settingsCalYear
    || (typeof CALENDAR_YEAR_DEFAULT !== 'undefined' ? CALENDAR_YEAR_DEFAULT : 2026);
  const month = state.settingsCalMonth || 6;
  if (typeof calcMonthlyOperatingStats === 'function') {
    const stats = calcMonthlyOperatingStats(clinicId, year, month);
    if (stats?.operatingDays > 0) {
      return {
        operatingDays: stats.operatingDays,
        year,
        month,
        note: `${year}年${month}月・診療 ${stats.operatingDays}日`,
      };
    }
  }
  return {
    operatingDays: 22,
    year,
    month,
    note: `診療日数 22日（目安）`,
  };
}

function computeGoalsLanding(draft, clinicId = getGoalsSettingsClinicId()) {
  const d = recomputeGoalsDraft({ ...(draft || {}) });
  const { operatingDays, note } = resolveGoalsOperatingDays(clinicId);
  const days = operatingDays > 0 ? operatingDays : 1;

  /**
   * 患者の着地計算
   * 1日患者数   = 延べ患者数 ÷ 診療日数
   * 新患数/日   = 新患数 ÷ 診療日数
   * 1人平均来院 = 延べ患者数 ÷ 目標患者数（実人数）
   */
  const dailyVisits = Math.round((d.monthlyVisitCount / days) * 10) / 10;
  const dailyNewPatients = Math.round((d.monthlyNewPatients / days) * 10) / 10;
  const avgVisitsPerPatient = d.monthlyPatients > 0
    ? Math.round((d.monthlyVisitCount / d.monthlyPatients) * 10) / 10
    : 0;

  /** 1日のキャンセル率 = キャンセル数 ÷ 1日患者数 × 100 */
  const dailyCancelRatePct = dailyVisits > 0
    ? Math.round((d.monthlyCancelCount / dailyVisits) * 1000) / 10
    : 0;

  return {
    ...d,
    operatingDays,
    operatingNote: note,
    dailyVisits,
    dailyNewPatients,
    avgVisitsPerPatient,
    dailyCancelRatePct,
  };
}

function computeGoalsBreakdown(draft) {
  return computeGoalsLanding(draft);
}

function goalsFieldHtml({
  field,
  label,
  value,
  kind = 'number',
  suffix = '',
  prefix = '',
  badge = '',
  readonly = false,
  decimals = 0,
}) {
  const badgeHtml = badge
    ? `<span class="goals-field__badge">${badge}</span>`
    : '';
  let displayValue = value;
  if (kind === 'yen') displayValue = formatGoalsYenInput(value);
  else if (kind === 'pct') displayValue = formatGoalsPct(value);
  else displayValue = formatGoalsCountRaw(value, { decimals });

  const inputAttrs = readonly
    ? 'readonly tabindex="-1"'
    : `data-action="goals-input" data-field="${field}" data-kind="${kind}"`;

  const controlClass = [
    'goals-field__control',
    readonly ? 'goals-field__control--readonly' : '',
    kind === 'yen' ? 'goals-field__control--yen' : '',
  ].filter(Boolean).join(' ');

  return `
    <label class="goals-field${readonly ? ' goals-field--derived' : ''}">
      <span class="goals-field__label-row">
        <span class="goals-field__label">${label}</span>
        ${badgeHtml}
        ${readonly ? '<span class="goals-field__badge goals-field__badge--derived">自動</span>' : ''}
      </span>
      <span class="${controlClass}">
        ${prefix ? `<span class="goals-field__prefix">${prefix}</span>` : ''}
        <input type="text"
          inputmode="${kind === 'pct' || decimals > 0 ? 'decimal' : 'numeric'}"
          data-goal-field="${field}"
          value="${displayValue}"
          aria-label="${label}"
          ${inputAttrs}>
        ${suffix ? `<span class="goals-field__suffix">${suffix}</span>` : ''}
      </span>
    </label>
  `;
}

function goalsLandingStat(label, valueHtml, previewKey) {
  return `
    <div class="goals-landing__stat">
      <span class="goals-landing__stat-label">${label}</span>
      <strong class="goals-landing__stat-value" data-goal-preview="${previewKey}">${valueHtml}</strong>
    </div>
  `;
}

function buildGoalsRevenueLandingHtml(b) {
  return `
    <aside class="goals-landing goals-landing--revenue" aria-label="売上の着地イメージ">
      <p class="goals-landing__eyebrow">着地イメージ</p>
      <div class="goals-landing__hero goals-landing__hero--split">
        <div class="goals-landing__hero-col">
          <span class="goals-landing__hero-label">保険単価１人あたり</span>
          <strong class="goals-landing__hero-value goals-landing__hero-value--sm" data-goal-preview="insuranceUnitPrice">¥${(b.insuranceRevenuePerPatient || 0).toLocaleString('ja-JP')}</strong>
        </div>
        <div class="goals-landing__hero-col">
          <span class="goals-landing__hero-label">自費単価１人あたり</span>
          <strong class="goals-landing__hero-value goals-landing__hero-value--sm" data-goal-preview="selfPayUnitPrice">¥${(b.selfPayPerPatient || 0).toLocaleString('ja-JP')}</strong>
        </div>
      </div>
      <div class="goals-landing__stats">
        ${goalsLandingStat('保険点数', `${formatGoalsCount(b.insurancePointsPerPatient, { decimals: 1 })}点/人`, 'insurancePointsPerPatient')}
        ${goalsLandingStat('保険売上', `¥${(b.monthlyInsuranceRevenue || 0).toLocaleString('ja-JP')}`, 'monthlyInsuranceRevenue')}
        ${goalsLandingStat('自費売上', `¥${(b.monthlySelfPayRevenue || 0).toLocaleString('ja-JP')}`, 'monthlySelfPayRevenue')}
      </div>
    </aside>
  `;
}

function buildGoalsPatientLandingHtml(b) {
  return `
    <aside class="goals-landing goals-landing--patients" aria-label="患者の着地イメージ">
      <p class="goals-landing__eyebrow">着地イメージ</p>
      <p class="goals-landing__note" data-goal-preview="operatingNote">${b.operatingNote}</p>
      <div class="goals-landing__hero">
        <span class="goals-landing__hero-label">1日患者数</span>
        <strong class="goals-landing__hero-value" data-goal-preview="dailyVisits">${formatGoalsCount(b.dailyVisits, { decimals: 1 })}人</strong>
      </div>
      <div class="goals-landing__stats">
        ${goalsLandingStat('新患数', `${formatGoalsCount(b.dailyNewPatients, { decimals: 1 })}人/日`, 'dailyNewPatients')}
        ${goalsLandingStat('1人平均来院', `${formatGoalsCount(b.avgVisitsPerPatient, { decimals: 1 })}回`, 'avgVisitsPerPatient')}
      </div>
    </aside>
  `;
}

function buildGoalsApptLandingHtml(b) {
  return `
    <aside class="goals-landing goals-landing--appt" aria-label="予約の着地イメージ">
      <p class="goals-landing__eyebrow">着地イメージ</p>
      <div class="goals-landing__hero goals-landing__hero--compact">
        <span class="goals-landing__hero-label">1日のキャンセル率</span>
        <strong class="goals-landing__hero-value" data-goal-preview="dailyCancelRatePct">${formatGoalsPct(b.dailyCancelRatePct)}%</strong>
      </div>
      <div class="goals-landing__stats">
        ${goalsLandingStat('予約充足率', `${formatGoalsPct(b.monthlyBookingFillRatePct)}%`, 'monthlyBookingFillRatePct')}
        ${goalsLandingStat('キャンセル数', `${formatGoalsCount(b.monthlyCancelCount)}件`, 'monthlyCancelCount')}
        ${goalsLandingStat('無断キャンセル', `${formatGoalsCount(b.monthlyNoShowCount)}件`, 'monthlyNoShowCount')}
      </div>
    </aside>
  `;
}

function buildGoalsRetentionLandingHtml(b) {
  return `
    <aside class="goals-landing goals-landing--retention" aria-label="定着の着地イメージ">
      <p class="goals-landing__eyebrow">着地イメージ</p>
      <div class="goals-landing__stats goals-landing__stats--stack">
        ${goalsLandingStat('リコール率', `${formatGoalsPct(b.monthlyRecallRatePct)}%`, 'monthlyRecallRatePct')}
        ${goalsLandingStat('次回予約取得率', `${formatGoalsPct(b.monthlyNextApptRatePct)}%`, 'monthlyNextApptRatePct')}
        ${goalsLandingStat('治療中断率', `${formatGoalsPct(b.monthlyTreatmentDropoutRatePct)}%`, 'monthlyTreatmentDropoutRatePct')}
      </div>
    </aside>
  `;
}

function buildGoalsSectionHtml(title, fieldsHtml, landingHtml) {
  return `
    <section class="goals-section">
      <header class="goals-section__head">
        <h2 class="goals-section__title">${title}</h2>
      </header>
      <div class="goals-section__body">
        <div class="goals-section__fields">
          <div class="goals-section__grid">
            ${fieldsHtml}
          </div>
        </div>
        ${landingHtml}
      </div>
    </section>
  `;
}

function updateGoalsPreviewDom(root = document.getElementById('settings-page')) {
  if (!root) return;
  const b = computeGoalsLanding(ensureGoalsSettingsDraft());
  const set = (key, text) => {
    const el = root.querySelector(`[data-goal-preview="${key}"]`);
    if (el) el.textContent = text;
  };

  set('insurancePointsPerPatient', `${formatGoalsCount(b.insurancePointsPerPatient, { decimals: 1 })}点/人`);
  set('insuranceUnitPrice', `¥${(b.insuranceRevenuePerPatient || 0).toLocaleString('ja-JP')}`);
  set('selfPayUnitPrice', `¥${(b.selfPayPerPatient || 0).toLocaleString('ja-JP')}`);
  set('monthlyInsuranceRevenue', `¥${(b.monthlyInsuranceRevenue || 0).toLocaleString('ja-JP')}`);
  set('monthlySelfPayRevenue', `¥${(b.monthlySelfPayRevenue || 0).toLocaleString('ja-JP')}`);
  set('operatingNote', b.operatingNote);
  set('dailyVisits', `${formatGoalsCount(b.dailyVisits, { decimals: 1 })}人`);
  set('dailyNewPatients', `${formatGoalsCount(b.dailyNewPatients, { decimals: 1 })}人/日`);
  set('avgVisitsPerPatient', `${formatGoalsCount(b.avgVisitsPerPatient, { decimals: 1 })}回`);
  set('dailyCancelRatePct', `${formatGoalsPct(b.dailyCancelRatePct)}%`);
  set('monthlyBookingFillRatePct', `${formatGoalsPct(b.monthlyBookingFillRatePct)}%`);
  set('monthlyCancelCount', `${formatGoalsCount(b.monthlyCancelCount)}件`);
  set('monthlyNoShowCount', `${formatGoalsCount(b.monthlyNoShowCount)}件`);
  set('monthlyRecallRatePct', `${formatGoalsPct(b.monthlyRecallRatePct)}%`);
  set('monthlyNextApptRatePct', `${formatGoalsPct(b.monthlyNextApptRatePct)}%`);
  set('monthlyTreatmentDropoutRatePct', `${formatGoalsPct(b.monthlyTreatmentDropoutRatePct)}%`);
}

function buildGoalsSettingsPageHtml() {
  const clinicId = getGoalsSettingsClinicId();
  const clinic = (typeof getClinics === 'function' ? getClinics() : [])
    .find((c) => c.id === clinicId);
  const draft = recomputeGoalsDraft(ensureGoalsSettingsDraft());
  const clinicName = clinic?.name || '医院';
  const landing = computeGoalsLanding(draft, clinicId);

  // 売上：月間売上目標 + 自費売上（月間）を入力
  const revenueFields = [
    goalsFieldHtml({
      field: 'monthlyRevenue',
      label: '月間売上目標',
      value: draft.monthlyRevenue,
      kind: 'yen',
      prefix: '¥',
    }),
    goalsFieldHtml({
      field: 'monthlySelfPayRevenue',
      label: '自費売上',
      value: draft.monthlySelfPayRevenue,
      kind: 'yen',
      prefix: '¥',
      badge: '月間',
    }),
  ].join('');

  const patientFields = [
    goalsFieldHtml({
      field: 'monthlyPatients',
      label: '目標患者数',
      value: draft.monthlyPatients,
      kind: 'number',
      suffix: '人/月',
      badge: '実人数',
    }),
    goalsFieldHtml({
      field: 'monthlyNewPatients',
      label: '新患数',
      value: draft.monthlyNewPatients,
      kind: 'number',
      suffix: '人/月',
    }),
    goalsFieldHtml({
      field: 'monthlySelfPayPatients',
      label: '自費患者',
      value: draft.monthlySelfPayPatients,
      kind: 'number',
      suffix: '人/月',
      badge: '実人数',
    }),
    goalsFieldHtml({
      field: 'monthlyVisitCount',
      label: '延べ患者数',
      value: draft.monthlyVisitCount,
      kind: 'number',
      suffix: '人/月',
    }),
  ].join('');

  const apptFields = [
    goalsFieldHtml({
      field: 'monthlyCancelCount',
      label: 'キャンセル数',
      value: draft.monthlyCancelCount,
      kind: 'number',
      suffix: '件/日',
    }),
    goalsFieldHtml({
      field: 'monthlyNoShowCount',
      label: '無断キャンセル数',
      value: draft.monthlyNoShowCount,
      kind: 'number',
      suffix: '件/日',
    }),
    goalsFieldHtml({
      field: 'monthlyBookingFillRatePct',
      label: '予約充足率',
      value: draft.monthlyBookingFillRatePct,
      kind: 'pct',
      suffix: '%/日',
    }),
  ].join('');

  const retentionFields = [
    goalsFieldHtml({
      field: 'monthlyRecallRatePct',
      label: 'リコール率',
      value: draft.monthlyRecallRatePct,
      kind: 'pct',
      suffix: '%',
    }),
    goalsFieldHtml({
      field: 'monthlyNextApptRatePct',
      label: '次回予約取得率',
      value: draft.monthlyNextApptRatePct,
      kind: 'pct',
      suffix: '%',
    }),
    goalsFieldHtml({
      field: 'monthlyTreatmentDropoutRatePct',
      label: '治療中断率',
      value: draft.monthlyTreatmentDropoutRatePct,
      kind: 'pct',
      suffix: '%',
    }),
  ].join('');

  return `
    <div class="settings-page settings-page--goals" id="settings-page" data-settings-page="goals">
      <header class="settings-page-header settings-page-header--goals">
        <p class="settings-page-eyebrow">設定</p>
        <h1 class="settings-page-title">目標設定</h1>
        <p class="settings-page-lead">月間目標を入力すると、各カード右側に着地イメージが更新されます。</p>
        <p class="goals-clinic-chip">${clinicName}</p>
      </header>

      <div class="goals-editor-stack">
        ${buildGoalsSectionHtml('売上', revenueFields, buildGoalsRevenueLandingHtml(landing))}
        ${buildGoalsSectionHtml('患者', patientFields, buildGoalsPatientLandingHtml(landing))}
        ${buildGoalsSectionHtml('予約', apptFields, buildGoalsApptLandingHtml(landing))}
        ${buildGoalsSectionHtml('定着', retentionFields, buildGoalsRetentionLandingHtml(landing))}

        <div class="goals-editor__actions goals-editor__actions--bar">
          <button type="button" class="goals-save-btn" data-action="save-goals-settings">保存する</button>
        </div>
      </div>
    </div>
  `;
}

function bindGoalsSettingsPageEvents(root) {
  if (!root || root.dataset.settingsBound === 'goals') return;
  root.dataset.settingsBound = 'goals';

  const editableKeys = new Set([
    'monthlyRevenue',
    'monthlySelfPayRevenue',
    'monthlyPatients',
    'monthlyNewPatients',
    'monthlySelfPayPatients',
    'monthlyVisitCount',
    'monthlyCancelCount',
    'monthlyNoShowCount',
    'monthlyBookingFillRatePct',
    'monthlyRecallRatePct',
    'monthlyNextApptRatePct',
    'monthlyTreatmentDropoutRatePct',
  ]);

  const syncDraftFromInput = (input) => {
    const field = input.dataset.field;
    if (!editableKeys.has(field)) return;
    const draft = ensureGoalsSettingsDraft();
    const kind = input.dataset.kind || 'number';
    const raw = input.value;

    // 入力途中の空欄は draft を更新しない（消えたように見えるのを防ぐ）
    if (String(raw).trim() === '') {
      updateGoalsPreviewDom(root);
      return;
    }

    if (kind === 'yen') {
      draft[field] = parseGoalsYenInput(raw);
    } else if (kind === 'pct') {
      draft[field] = parseGoalsPctInput(raw);
    } else {
      draft[field] = parseGoalsCountInput(raw);
    }
    recomputeGoalsDraft(draft);
    updateGoalsPreviewDom(root);
  };

  root.addEventListener('input', (e) => {
    const input = e.target.closest('[data-action="goals-input"]');
    if (!input) return;
    syncDraftFromInput(input);
  });
  root.addEventListener('blur', (e) => {
    const input = e.target.closest('[data-action="goals-input"]');
    if (!input) return;
    const field = input.dataset.field;
    if (!editableKeys.has(field)) return;
    const draft = ensureGoalsSettingsDraft();
    const kind = input.dataset.kind || 'number';
    const raw = input.value;

    if (kind === 'yen') {
      draft[field] = parseGoalsYenInput(raw);
      recomputeGoalsDraft(draft);
      input.value = formatGoalsYenInput(draft[field]);
    } else if (kind === 'pct') {
      draft[field] = parseGoalsPctInput(raw);
      recomputeGoalsDraft(draft);
      input.value = formatGoalsPct(draft[field]);
    } else {
      draft[field] = parseGoalsCountInput(raw);
      recomputeGoalsDraft(draft);
      // type=text なのでカンマ付きでも消えないが、入力中は素の数字のままがわかりやすい
      input.value = formatGoalsCountRaw(draft[field]);
    }
    updateGoalsPreviewDom(root);
  }, true);
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="save-goals-settings"]');
    if (!btn) return;
    e.preventDefault();
    const draft = recomputeGoalsDraft(ensureGoalsSettingsDraft());
    const clinicId = getGoalsSettingsClinicId();
    if (typeof saveClinicGoals === 'function') {
      const saved = saveClinicGoals(clinicId, draft);
      state.settingsGoalsDraft = { _clinicId: clinicId, ...saved };
    }
    showSettingsToast('更新しました。');
    invalidateMetricsCachesAfterGoalsSave();
    updateGoalsPreviewDom(root);
  });
}

function invalidateMetricsCachesAfterGoalsSave() {
  if (typeof clearPeriodDetailsCache === 'function') clearPeriodDetailsCache();
}

async function openGoalsSettings() {
  if (state.settingsPage === 'holidays') {
    const ok = await confirmLeaveHolidaySettings();
    if (!ok) return;
    clearHolidaySettingsDraft();
    resetHolidayAddForm();
  }
  state.settingsPage = 'goals';
  state.sidebarView = 'settings';
  clearGoalsSettingsDraft();
  ensureGoalsSettingsDraft();
  renderNav();
  renderMeta();
  renderSettingsMain();
}

async function openHolidaySettings() {
  if (typeof buildMonthHolidayGrid !== 'function') return;
  if (state.settingsPage === 'goals') {
    clearGoalsSettingsDraft();
  }
  state.settingsPage = 'holidays';
  state.sidebarView = 'settings';
  if (!state.settingsCalYear) {
    state.settingsCalYear = typeof CALENDAR_YEAR_DEFAULT !== 'undefined' ? CALENDAR_YEAR_DEFAULT : 2026;
  }
  if (!state.settingsCalMonth) state.settingsCalMonth = 6;
  clearHolidaySettingsDraft();
  resetHolidayAddForm();
  ensureHolidaySettingsDraft(getHolidaySettingsClinicId());
  selectLatestSettingsVersion(getHolidaySettingsClinicId());
  renderNav();
  renderMeta();
  renderSettingsMain();
}

async function closeHolidaySettingsPage() {
  if (!state.settingsPage) return false;
  if (state.settingsPage === 'holidays') {
    const ok = await confirmLeaveHolidaySettings();
    if (!ok) return false;
  }
  leaveHolidaySettingsView();
  return true;
}

async function openSidebarSettings() {
  await openGoalsSettings();
}

async function closeSidebarSettings() {
  const hadSettingsPage = !!state.settingsPage;
  if (state.settingsPage === 'holidays') {
    const ok = await confirmLeaveHolidaySettings();
    if (!ok) return false;
  }
  state.sidebarView = 'nav';
  state.settingsPage = null;
  clearHolidaySettingsDraft();
  resetHolidayAddForm();
  clearGoalsSettingsDraft();
  renderNav();
  renderMeta();
  if (hadSettingsPage) restoreAppMainView();
  return true;
}

function onHolidaySettingsChange(e) {
  const versionSelect = e.target.closest('[data-action="select-schedule-version"]');
  if (versionSelect) {
    syncHolidayAddFormFromDom();
    state.settingsVersionId = versionSelect.value || null;
    renderSettingsMain();
    return;
  }

  const addFormInput = e.target.closest('[data-action="settings-add-form"]');
  if (addFormInput) {
    const form = getHolidayAddForm();
    const field = addFormInput.dataset.field;
    if (field === 'from') form.from = addFormInput.value || '';
    if (field === 'note') form.note = addFormInput.value || '';
    return;
  }

  const scheduleInput = e.target.closest('[data-action="update-schedule"]');
  if (scheduleInput) {
    const weekday = Number(scheduleInput.dataset.weekday);
    const field = scheduleInput.dataset.field;
    const versionId = scheduleInput.dataset.versionId || state.settingsVersionId;
    if (!field || Number.isNaN(weekday)) return;
    draftUpdateWeekdaySchedule(weekday, { [field]: scheduleInput.value }, versionId);
  }
}

function onHolidaySettingsClick(e) {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  if (actionEl.matches('input[type="time"], input[type="date"], input[type="text"], select')) return;

  const action = actionEl.dataset.action;
  const clinicId = getHolidaySettingsClinicId();
  ensureHolidaySettingsDraft(clinicId);

  if (action === 'update-schedule-version') {
    e.preventDefault();
    const versionId = actionEl.dataset.versionId || state.settingsVersionId;
    if (!versionId) return;
    syncHolidayAddFormFromDom();
    const form = getHolidayAddForm();
    const patch = {};
    if (form.from) patch.effectiveFrom = form.from;
    if ((form.note || '').trim()) patch.note = form.note.trim();
    if (Object.keys(patch).length) {
      const result = draftApplyVersionMeta(versionId, patch);
      if (!result?.ok) {
        if (result?.reason === 'conflict') {
          window.alert('同じ適用開始日が既にあります。別の日付に変更してください。');
        } else if (result?.reason === 'invalid') {
          window.alert('適用開始日の形式が不正です。');
        } else {
          window.alert('更新に失敗しました。');
        }
        return;
      }
    }
    commitDraftVersions(clinicId);
    state.settingsVersionId = versionId;
    resetHolidayAddForm();
    showSettingsToast('更新しました。');
    renderSettingsMain();
    return;
  }

  if (action === 'update-special-days') {
    e.preventDefault();
    commitDraftSpecialDays(clinicId);
    showSettingsToast('更新しました。');
    renderSettingsMain();
    return;
  }

  if (action === 'add-schedule-version') {
    e.preventDefault();
    syncHolidayAddFormFromDom();
    const form = getHolidayAddForm();
    const from = form.from || '';
    const note = (form.note || '').trim();
    if (!from) {
      window.alert('適用開始日を入力してください。');
      return;
    }
    const newId = draftAddScheduleVersion(from, note, state.settingsVersionId);
    if (!newId) {
      window.alert('同じ適用開始日が既にあるか、日付形式が不正です。日付を変えてから再度追加してください。');
      return;
    }
    commitDraftVersions(clinicId);
    state.settingsVersionId = newId;
    resetHolidayAddForm();
    showSettingsToast('追加しました。');
    renderSettingsMain();
    return;
  }

  if (action === 'delete-schedule-version') {
    e.preventDefault();
    const versionId = actionEl.dataset.versionId || state.settingsVersionId;
    if (!versionId) return;
    if (!window.confirm('この適用期間を削除しますか？')) return;
    const ok = draftDeleteScheduleVersion(versionId);
    if (!ok) return;
    commitDraftVersions(clinicId);
    if (state.settingsVersionId === versionId) state.settingsVersionId = null;
    ensureSettingsVersionSelection(clinicId);
    showSettingsToast('更新しました。');
    renderSettingsMain();
    return;
  }

  if (action === 'toggle-weekly-closed') {
    e.preventDefault();
    syncHolidayAddFormFromDom();
    const weekday = Number(actionEl.dataset.weekday);
    const versionId = actionEl.dataset.versionId || state.settingsVersionId;
    if (Number.isNaN(weekday)) return;
    draftToggleWeeklyClosed(weekday, versionId);
    renderSettingsMain();
    return;
  }

  if (action === 'cal-prev-month' || action === 'cal-next-month') {
    e.preventDefault();
    syncHolidayAddFormFromDom();
    const delta = action === 'cal-prev-month' ? -1 : 1;
    const shifted = typeof shiftCalendarMonth === 'function'
      ? shiftCalendarMonth(state.settingsCalYear, state.settingsCalMonth, delta)
      : { year: state.settingsCalYear, month: state.settingsCalMonth + delta };
    state.settingsCalYear = shifted.year;
    state.settingsCalMonth = shifted.month;
    renderSettingsMain();
    return;
  }

  if (action === 'toggle-clinic-holiday') {
    e.preventDefault();
    syncHolidayAddFormFromDom();
    const key = actionEl.dataset.dateKey;
    const parsed = typeof parseDateKey === 'function' ? parseDateKey(key) : null;
    if (!parsed) return;
    const result = draftCycleSpecialDay(parsed.year, parsed.month, parsed.day);
    if (result?.needsHours) {
      const defaults = typeof getDefaultOpenHoursFromSchedule === 'function'
        ? getDefaultOpenHoursFromSchedule(result.snap)
        : { openStart: '09:00', openEnd: '18:30', breakStart: '13:00', breakEnd: '14:30' };
      const dateLabel = `${parsed.month}/${parsed.day}`;
      showSpecialOpenHoursDialog({ dateLabel, defaults }).then((hours) => {
        if (!hours) return;
        draftCycleSpecialDay(parsed.year, parsed.month, parsed.day, hours);
        renderSettingsMain();
      });
      return;
    }
    renderSettingsMain();
  }
}

function initSidebarFooter() {
  const footer = document.getElementById('sidebar-footer');
  if (!footer || footer.dataset.init) return;
  footer.dataset.init = '1';

  footer.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="toggle-sidebar-settings"]') || e.target.closest('#sidebar-settings-btn')) {
      e.preventDefault();
      toggleSidebarSettings();
      return;
    }
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

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('settings-unsaved-dialog')) return;
    if (state.settingsPage) {
      closeHolidaySettingsPage().then((ok) => {
        if (!ok) return;
        renderNav();
        renderMeta();
      });
      return;
    }
    if (state.sidebarView === 'settings') closeSidebarSettings();
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
  renderMeta();
  setupNavDragDrop();
  if (state.settingsPage) {
    renderSettingsMain();
    return;
  }
  renderDashboard();
  setupIntelPanelDragDrop();
}

const IS_INSIGHT_PAGE = !!document.getElementById('insight-main');

function handleNavTreeClick(e) {
  if (e.target.closest('.nav-row__drag-handle')) return;

  const settingsActionEl = e.target.closest('[data-action="close-sidebar-settings"], [data-action="open-holiday-settings"], [data-action="open-goals-settings"]');
  if (settingsActionEl) {
    e.preventDefault();
    e.stopPropagation();
    const action = settingsActionEl.dataset.action;
    if (action === 'close-sidebar-settings') {
      closeSidebarSettings();
      return;
    }
    if (action === 'open-holiday-settings') {
      openHolidaySettings();
      return;
    }
    if (action === 'open-goals-settings') {
      openGoalsSettings();
      return;
    }
  }

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

  const applyNavSelection = () => {
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
  };

  if (state.settingsPage && (action === 'select-clinic' || action === 'select-role' || action === 'select-staff')) {
    e.preventDefault();
    const leave = state.settingsPage === 'holidays'
      ? confirmLeaveHolidaySettings()
      : Promise.resolve(true);
    leave.then((ok) => {
      if (!ok) return;
      leaveHolidaySettingsView();
      applyNavSelection();
      renderNav();
      renderMeta();
    });
    return;
  }

  applyNavSelection();
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
window.addEventListener('beforeunload', (e) => {
  if (!isHolidaySettingsDirty()) return;
  e.preventDefault();
  e.returnValue = '';
});
if (!IS_INSIGHT_PAGE) render();
