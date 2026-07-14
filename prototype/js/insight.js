/**
 * インサイト詳細ページ — 経営指標カード別の深掘りビュー
 */

const insightState = {
  page: 'unitPrice',
  period: '本日',
  level: 'clinic',
  clinicId: 'clinic-sakura',
  role: null,
  staffId: null,
};

const INSIGHT_PERIODS = ['前日', '本日', '今月', '今年'];
const INSIGHT_PAGE_NAV_ORDER_KEY = 'insightPageNavOrder';
const INSIGHT_CHART_ORDER_KEY = 'insightChartOrder';
const INSIGHT_KPI_ORDER_KEY = 'insightKpiOrder';
const INSIGHT_CARD_DRAG_HANDLE_SVG = '<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><circle cx="2.5" cy="2" r="1"/><circle cx="7.5" cy="2" r="1"/><circle cx="2.5" cy="5" r="1"/><circle cx="7.5" cy="5" r="1"/><circle cx="2.5" cy="8" r="1"/><circle cx="7.5" cy="8" r="1"/></svg>';
const INSIGHT_TAB_LONG_PRESS_MS = 480;
const INSIGHT_TAB_DRAG_MOVE_PX = 6;
const INSIGHT_TAB_CANCEL_MOVE_PX = 14;

let insightPageNavOrderCache = null;
let insightNavSuppressClick = false;

function loadInsightPageNavOrder() {
  const defaults = [...INSIGHT_PAGE_ORDER];
  try {
    const raw = localStorage.getItem(INSIGHT_PAGE_NAV_ORDER_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaults;
    const order = parsed.filter((id) => INSIGHT_PAGE_ORDER.includes(id));
    defaults.forEach((id) => {
      if (!order.includes(id)) order.push(id);
    });
    return order;
  } catch {
    return defaults;
  }
}

function getInsightPageNavOrder() {
  if (!insightPageNavOrderCache) {
    insightPageNavOrderCache = loadInsightPageNavOrder();
  }
  return insightPageNavOrderCache;
}

function saveInsightPageNavOrder(order) {
  insightPageNavOrderCache = [...order];
  localStorage.setItem(INSIGHT_PAGE_NAV_ORDER_KEY, JSON.stringify(order));
}

function readInsightNavOrderFromDom(nav) {
  return [...nav.querySelectorAll('.insight-top-nav-item[data-nav-key]')]
    .map((el) => el.dataset.navKey);
}

function getSortedInsightNavItems(nav) {
  return [...nav.querySelectorAll('.insight-top-nav-item[data-nav-key]')];
}

function flipApplyInsightNavOrder(nav, orderIds, skipItem = null) {
  const items = getSortedInsightNavItems(nav);
  const first = new Map(items.map((el) => [el, el.getBoundingClientRect()]));
  const byKey = new Map(items.map((el) => [el.dataset.navKey, el]));
  const ordered = orderIds.map((key) => byKey.get(key)).filter(Boolean);

  ordered.forEach((el) => nav.appendChild(el));

  ordered.forEach((item) => {
    if (item === skipItem) return;
    const from = first.get(item);
    if (!from) return;
    const to = item.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

    item.style.transform = `translate(${dx}px, ${dy}px)`;
    item.style.transition = 'transform 0s';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        item.style.transition = 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)';
        item.style.transform = '';
      });
    });
  });
}

function moveInsightNavOrderItem(order, fromIndex, toIndex) {
  if (fromIndex === toIndex) return order;
  const next = [...order];
  const [key] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, key);
  return next;
}

function getInsightNavTargetIndex(floatRect, nav) {
  const items = getSortedInsightNavItems(nav);
  const floatCx = floatRect.left + floatRect.width / 2;
  for (let i = 0; i < items.length; i++) {
    const rect = items[i].getBoundingClientRect();
    if (floatCx < rect.left + rect.width / 2) return i;
  }
  return Math.max(0, items.length - 1);
}

function initInsightTopNavDrag(scope) {
  const nav = scope.querySelector('.insight-top-nav');
  if (!nav || nav.dataset.dragInit) return;
  nav.dataset.dragInit = '1';

  let session = null;
  let dragRafId = null;

  const cleanupDragStyles = () => {
    nav.classList.remove('insight-top-nav--dragging');
    nav.querySelectorAll('.insight-top-nav-item').forEach((el) => {
      el.style.transform = '';
      el.style.transition = '';
      el.classList.remove(
        'insight-top-nav-item--source',
        'insight-top-nav-item--holding',
        'insight-top-nav-item--dragging',
      );
    });
    document.body.classList.remove('insight-tab-drag-active');
  };

  const endSession = (commit = false) => {
    if (!session) return;

    if (dragRafId != null) {
      cancelAnimationFrame(dragRafId);
      dragRafId = null;
    }

    clearTimeout(session.holdTimer);

    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);

    const {
      floatEl, initialOrder, previewOrder, dragging, blockedClick,
    } = session;

    floatEl?.remove();

    if (blockedClick || dragging) {
      insightNavSuppressClick = true;
      requestAnimationFrame(() => {
        insightNavSuppressClick = false;
      });
    }

    const changed = commit
      && dragging
      && JSON.stringify(previewOrder) !== JSON.stringify(initialOrder);

    if (changed) {
      saveInsightPageNavOrder(previewOrder);
      flipApplyInsightNavOrder(nav, previewOrder);
      updateInsightToolbarState();
    }

    cleanupDragStyles();

    session = null;
  };

  const updateInsightNavDrag = (clientX, clientY) => {
    if (!session?.dragging) return;

    const { floatEl, offsetX, offsetY, item } = session;
    floatEl.style.left = `${clientX - offsetX}px`;
    floatEl.style.top = `${clientY - offsetY}px`;

    const floatRect = floatEl.getBoundingClientRect();
    const targetIndex = getInsightNavTargetIndex(floatRect, nav);
    if (targetIndex === session.currentDragIndex) return;

    const nextOrder = moveInsightNavOrderItem(
      session.previewOrder,
      session.currentDragIndex,
      targetIndex,
    );
    session.previewOrder = nextOrder;
    session.currentDragIndex = targetIndex;
    flipApplyInsightNavOrder(nav, nextOrder, item);
  };

  const onPointerMove = (e) => {
    if (!session || e.pointerId !== session.pointerId) return;

    const dx = e.clientX - session.startX;
    const dy = e.clientY - session.startY;
    const dist = Math.hypot(dx, dy);

    if (!session.pickupReady && !session.dragging) {
      if (dist > INSIGHT_TAB_CANCEL_MOVE_PX) {
        session.longPressCancelled = true;
        clearTimeout(session.holdTimer);
      }
      return;
    }

    if (session.pickupReady && !session.dragging) {
      if (dist < INSIGHT_TAB_DRAG_MOVE_PX) return;
      e.preventDefault();
      startFloatDrag(e);
      return;
    }

    if (!session.dragging) return;

    e.preventDefault();
    session.pendingPointer = { x: e.clientX, y: e.clientY };
    if (dragRafId != null) return;
    dragRafId = requestAnimationFrame(() => {
      dragRafId = null;
      if (!session?.pendingPointer) return;
      const p = session.pendingPointer;
      updateInsightNavDrag(p.x, p.y);
    });
  };

  const startFloatDrag = (e) => {
    const { item } = session;
    const rect = item.getBoundingClientRect();
    const items = getSortedInsightNavItems(nav);
    const fromIndex = items.indexOf(item);
    const previewOrder = readInsightNavOrderFromDom(nav);

    const floatEl = item.cloneNode(true);
    floatEl.classList.remove(
      'insight-top-nav-item--active',
      'insight-top-nav-item--holding',
      'insight-top-nav-item--dragging',
    );
    floatEl.classList.add('insight-top-nav-item--float');
    floatEl.removeAttribute('data-insight-page');
    floatEl.style.width = `${rect.width}px`;
    floatEl.style.height = `${rect.height}px`;
    floatEl.style.left = `${rect.left}px`;
    floatEl.style.top = `${rect.top}px`;
    document.body.appendChild(floatEl);

    item.classList.remove('insight-top-nav-item--holding', 'insight-top-nav-item--dragging');
    item.classList.add('insight-top-nav-item--source');
    nav.classList.add('insight-top-nav--dragging');

    session.dragging = true;
    session.blockedClick = true;
    session.floatEl = floatEl;
    session.offsetX = e.clientX - rect.left;
    session.offsetY = e.clientY - rect.top;
    session.previewOrder = [...previewOrder];
    session.initialOrder = [...previewOrder];
    session.currentDragIndex = fromIndex;

    updateInsightNavDrag(e.clientX, e.clientY);
  };

  const onPointerUp = (e) => {
    if (!session || e.pointerId !== session.pointerId) return;
    endSession(true);
  };

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    const item = e.target.closest('.insight-top-nav-item');
    if (!item || !nav.contains(item)) return;

    session = {
      item,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
      pickupReady: false,
      blockedClick: false,
      longPressCancelled: false,
      floatEl: null,
      previewOrder: null,
      initialOrder: null,
      currentDragIndex: 0,
      pendingPointer: null,
      holdTimer: setTimeout(() => {
        if (!session || session.item !== item || session.longPressCancelled) return;
        session.pickupReady = true;
        session.blockedClick = true;
        item.classList.add('insight-top-nav-item--holding');
        document.body.classList.add('insight-tab-drag-active');
      }, INSIGHT_TAB_LONG_PRESS_MS),
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
  };

  nav.addEventListener('dragstart', (e) => {
    if (e.target.closest('.insight-top-nav-item')) e.preventDefault();
  });
  nav.addEventListener('pointerdown', onPointerDown);
}

// --- インサイトカード並び替え（TOP経営指標カードと同様） ---

let insightCardDragState = null;
let insightCardDragRafId = null;

function insightCardOrderStorageKey(gridType) {
  return gridType === 'kpis' ? INSIGHT_KPI_ORDER_KEY : INSIGHT_CHART_ORDER_KEY;
}

function loadInsightCardOrder(pageId, gridType, defaultKeys) {
  const defaults = [...defaultKeys];
  try {
    const raw = localStorage.getItem(insightCardOrderStorageKey(gridType));
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    const saved = parsed?.[pageId];
    if (!Array.isArray(saved)) return defaults;
    const order = saved.filter((id) => defaults.includes(id));
    defaults.forEach((id) => {
      if (!order.includes(id)) order.push(id);
    });
    return order;
  } catch {
    return defaults;
  }
}

function saveInsightCardOrder(pageId, gridType, order) {
  try {
    const key = insightCardOrderStorageKey(gridType);
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[pageId] = [...order];
    localStorage.setItem(key, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

function insightChartCardKey(chart, index) {
  if (chart?.id) return String(chart.id);
  const title = String(chart?.title || '').trim();
  return title || `chart-${index}`;
}

function insightKpiCardKey(item, index) {
  const label = item?.total?.label;
  const map = { 患者合計: 'summary', 外来合計: 'outpatient', 訪問合計: 'visiting' };
  if (label && map[label]) return map[label];
  return `kpi-${index}`;
}

function insightCardRectOverlap(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  if (right <= left || bottom <= top) return 0;
  return (right - left) * (bottom - top);
}

function insightCardHalfRect(rect, side) {
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

function insightCardFloatSide(floatRect, targetRect) {
  const floatCx = floatRect.left + floatRect.width / 2;
  const floatCy = floatRect.top + floatRect.height / 2;
  const targetCx = targetRect.left + targetRect.width / 2;
  const targetCy = targetRect.top + targetRect.height / 2;
  const dx = targetCx - floatCx;
  const dy = targetCy - floatCy;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'bottom' : 'top';
}

function insightCardHalfOverlaps(floatRect, targetRect, floatSide) {
  const targetArea = targetRect.width * targetRect.height;
  if (targetArea <= 0) return false;
  const overlap = insightCardRectOverlap(insightCardHalfRect(floatRect, floatSide), targetRect);
  return overlap / targetArea >= 0.48;
}

function insightCardFloatCenterIn(floatRect, rect) {
  const floatCx = floatRect.left + floatRect.width / 2;
  const floatCy = floatRect.top + floatRect.height / 2;
  return (
    floatCx >= rect.left + rect.width * 0.22
    && floatCx <= rect.right - rect.width * 0.22
    && floatCy >= rect.top + rect.height * 0.22
    && floatCy <= rect.bottom - rect.height * 0.22
  );
}

function getSortedInsightCardSlots(gridEl) {
  return [...gridEl.querySelectorAll('.insight-card-slot')].sort(
    (a, b) => Number(a.dataset.slotIndex) - Number(b.dataset.slotIndex),
  );
}

function resolveInsightCardSlots(gridEl, orderIds) {
  const withSlot = new Map();
  gridEl.querySelectorAll('.insight-card-slot').forEach((slot) => {
    if (slot.dataset.cardKey) withSlot.set(slot.dataset.cardKey, slot);
  });
  return orderIds.filter(Boolean).map((id) => withSlot.get(id)).filter(Boolean);
}

function flipApplyInsightCardOrder(gridEl, orderIds, skipSlot = null) {
  const slots = [...gridEl.querySelectorAll('.insight-card-slot')];
  const first = new Map(slots.map((s) => [s, s.getBoundingClientRect()]));
  const ordered = resolveInsightCardSlots(gridEl, orderIds);

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

function getInsightCardSwapTargetIndex(floatRect, gridEl, currentIndex) {
  const slots = getSortedInsightCardSlots(gridEl);
  if (currentIndex < 0 || currentIndex >= slots.length) return currentIndex;

  const curRect = slots[currentIndex].getBoundingClientRect();
  if (insightCardFloatCenterIn(floatRect, curRect)) return currentIndex;

  let best = { index: currentIndex, overlap: 0 };
  slots.forEach((slot, i) => {
    if (i === currentIndex) return;
    const rect = slot.getBoundingClientRect();
    const floatSide = insightCardFloatSide(floatRect, rect);
    if (!insightCardHalfOverlaps(floatRect, rect, floatSide)) return;
    const overlap = insightCardRectOverlap(floatRect, rect);
    if (overlap > best.overlap) best = { index: i, overlap };
  });
  return best.index;
}

function previewInsightCardSwap(fromIndex, toIndex) {
  if (!insightCardDragState || fromIndex === toIndex) return;
  const next = [...insightCardDragState.previewOrder];
  const temp = next[fromIndex];
  next[fromIndex] = next[toIndex];
  next[toIndex] = temp;
  insightCardDragState.previewOrder = next;
  insightCardDragState.currentDragIndex = toIndex;
  flipApplyInsightCardOrder(
    insightCardDragState.gridEl,
    next,
    insightCardDragState.sourceSlot,
  );
}

function updateInsightCardDrag(pointerX, pointerY) {
  if (!insightCardDragState) return;
  const { floatEl, offsetX, offsetY, gridEl, currentDragIndex } = insightCardDragState;
  floatEl.style.left = `${pointerX - offsetX}px`;
  floatEl.style.top = `${pointerY - offsetY}px`;

  const floatRect = floatEl.getBoundingClientRect();
  const targetIndex = getInsightCardSwapTargetIndex(floatRect, gridEl, currentDragIndex);
  if (targetIndex === currentDragIndex) {
    insightCardDragState.swapLock = null;
    return;
  }

  const lockKey = `${Math.min(currentDragIndex, targetIndex)}:${Math.max(currentDragIndex, targetIndex)}`;
  if (insightCardDragState.swapLock === lockKey) return;

  previewInsightCardSwap(currentDragIndex, targetIndex);
  insightCardDragState.swapLock = lockKey;
}

function onInsightCardPointerMove(e) {
  if (!insightCardDragState) return;
  e.preventDefault();
  insightCardDragState.pendingPointer = { x: e.clientX, y: e.clientY };
  if (insightCardDragRafId != null) return;
  insightCardDragRafId = requestAnimationFrame(() => {
    insightCardDragRafId = null;
    if (!insightCardDragState) return;
    const p = insightCardDragState.pendingPointer;
    if (p) updateInsightCardDrag(p.x, p.y);
  });
}

function endInsightCardDrag(commit) {
  const ds = insightCardDragState;
  if (!ds) return;

  insightCardDragState = null;
  if (insightCardDragRafId != null) {
    cancelAnimationFrame(insightCardDragRafId);
    insightCardDragRafId = null;
  }

  document.removeEventListener('pointermove', onInsightCardPointerMove);
  document.removeEventListener('pointerup', onInsightCardPointerUp);
  document.removeEventListener('pointercancel', onInsightCardPointerUp);
  document.body.classList.remove('insight-card-drag-active');

  ds.floatEl?.remove();
  ds.sourceSlot?.classList.remove('insight-card-slot--source');
  ds.gridEl?.classList.remove('insight-card-grid--dragging');
  ds.gridEl?.querySelectorAll('.insight-card-slot').forEach((slot) => {
    slot.style.transform = '';
    slot.style.transition = '';
    slot.classList.remove('insight-card-slot--drag-over');
  });

  const changed = commit && JSON.stringify(ds.previewOrder) !== JSON.stringify(ds.initialOrder);
  if (changed) {
    saveInsightCardOrder(ds.pageId, ds.gridType, ds.previewOrder);
  }
}

function onInsightCardPointerUp() {
  endInsightCardDrag(true);
}

function startInsightCardDrag(slot, handle, e, gridEl) {
  const fromIndex = Number(slot.dataset.slotIndex);
  const pageId = gridEl.dataset.pageId || insightState.page;
  const gridType = gridEl.dataset.cardGrid || 'charts';
  const previewOrder = getSortedInsightCardSlots(gridEl).map((s) => s.dataset.cardKey);
  const rect = slot.getBoundingClientRect();

  const floatEl = slot.cloneNode(true);
  floatEl.classList.add('insight-card-slot--float');
  floatEl.querySelector('.insight-card-slot__drag-handle')?.remove();
  floatEl.style.width = `${rect.width}px`;
  floatEl.style.height = `${rect.height}px`;
  floatEl.style.left = `${rect.left}px`;
  floatEl.style.top = `${rect.top}px`;
  document.body.appendChild(floatEl);

  slot.classList.add('insight-card-slot--source');
  gridEl.classList.add('insight-card-grid--dragging');
  document.body.classList.add('insight-card-drag-active');

  insightCardDragState = {
    gridEl,
    pageId,
    gridType,
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
  document.addEventListener('pointermove', onInsightCardPointerMove);
  document.addEventListener('pointerup', onInsightCardPointerUp);
  document.addEventListener('pointercancel', onInsightCardPointerUp);
}

function initInsightCardDrag(scope) {
  const root = scope || document.getElementById('insight-content-area');
  if (!root || root.dataset.cardDragInit) return;
  root.dataset.cardDragInit = '1';

  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const handle = e.target.closest('.insight-card-slot__drag-handle');
    if (!handle) return;
    const slot = handle.closest('.insight-card-slot');
    const gridEl = slot?.closest('.insight-card-grid');
    if (!slot || !gridEl) return;
    e.preventDefault();
    e.stopPropagation();
    startInsightCardDrag(slot, handle, e, gridEl);
  });
}

function renderInsightCardSlot(key, innerHtml, index, { hideHandle = false, fullWidth = false, halfWidth = false } = {}) {
  const handleHtml = hideHandle ? '' : `
    <button type="button" class="insight-card-slot__drag-handle" aria-label="カードを並び替え" title="ドラッグして並び替え">${INSIGHT_CARD_DRAG_HANDLE_SVG}</button>`;
  const layoutClass = fullWidth
    ? ' insight-card-slot--full'
    : (halfWidth ? ' insight-card-slot--half' : '');
  return `
    <div class="insight-card-slot${layoutClass}" data-card-key="${escapeHtml(key)}" data-slot-index="${index}">
      ${handleHtml}
      ${innerHtml}
    </div>`;
}

function parseInsightParams() {
  const params = new URLSearchParams(window.location.search);
  const rawPage = params.get('page') || 'unitPrice';
  insightState.page = typeof normalizeInsightPageId === 'function'
    ? normalizeInsightPageId(rawPage)
    : rawPage;
  insightState.period = params.get('period') || '本日';
  insightState.level = params.get('level') || 'clinic';
  insightState.clinicId = params.get('clinicId') || 'clinic-sakura';
  insightState.role = params.get('role') || null;
  insightState.staffId = params.get('staffId') || null;
  if (!INSIGHT_PAGES[insightState.page]) insightState.page = 'unitPrice';
  if (!INSIGHT_PERIODS.includes(insightState.period)) insightState.period = '本日';
}

function buildInsightUrl(overrides = {}) {
  const s = { ...insightState, ...overrides };
  const params = new URLSearchParams({ page: s.page, period: s.period, level: s.level });
  if (s.level !== 'all' && s.clinicId) params.set('clinicId', s.clinicId);
  if (s.role) params.set('role', s.role);
  if (s.staffId) params.set('staffId', s.staffId);
  return `insight.html?${params.toString()}`;
}

function syncAppStateFromInsight() {
  state.level = insightState.level;
  if (insightState.level === 'all') {
    state.clinicId = null;
    state.role = null;
    state.staffId = null;
  } else {
    state.clinicId = insightState.clinicId || 'clinic-sakura';
    state.role = insightState.role || null;
    state.staffId = insightState.staffId || null;
  }
  state.selectedPeriod = insightState.period;
}

function syncInsightFromAppState() {
  insightState.level = state.level;
  insightState.clinicId = state.clinicId;
  insightState.role = state.role;
  insightState.staffId = state.staffId;
  insightState.period = state.selectedPeriod;
}

function updateInsightUrl(mode = 'replace') {
  const url = buildInsightUrl();
  if (mode === 'push') {
    history.pushState({ insight: true }, '', url);
  } else {
    history.replaceState(null, '', url);
  }
}

function navigateInsight(overrides = {}) {
  if (typeof closePopover === 'function' && typeof popoverState !== 'undefined' && popoverState.open) {
    closePopover();
  }

  const prevPage = insightState.page;
  Object.assign(insightState, overrides);
  if (typeof normalizeInsightPageId === 'function') {
    insightState.page = normalizeInsightPageId(insightState.page);
  }
  if (!INSIGHT_PAGES[insightState.page]) insightState.page = 'unitPrice';
  if (!INSIGHT_PERIODS.includes(insightState.period)) insightState.period = '本日';

  updateInsightUrl('push');
  syncAppStateFromInsight();
  updateInsightToolbarState();
  renderInsightContent();

  if (overrides.page && insightState.page !== prevPage) {
    window.scrollTo(0, 0);
  }

  const meta = getInsightPageMeta(insightState.page);
  if (meta) document.title = `${meta.title} | Dental Analytics`;
}

function getContextLabel() {
  if (insightState.level === 'all') return '全院';
  const clinic = MOCK_DATA.clinics?.find((c) => c.id === insightState.clinicId);
  const clinicName = clinic?.name || '医院';
  if (insightState.level === 'staff' && insightState.staffId && clinic?.roles) {
    for (const members of Object.values(clinic.roles)) {
      const staff = members.find((s) => s.id === insightState.staffId);
      if (staff) return `${clinicName} · ${staff.name}`;
    }
  }
  if (insightState.level === 'role' && insightState.role) {
    return `${clinicName} · ${insightState.role}`;
  }
  return clinicName;
}

function renderKpiTrend(trend) {
  if (!trend) return '';
  const cls = trend.up === false
    ? 'insight-kpi-trend--down'
    : trend.up === true
      ? 'insight-kpi-trend--up'
      : '';
  return `<span class="insight-kpi-trend ${cls}">${trend.text}</span>`;
}

function isYenDisplay(val) {
  return typeof val === 'string' && val.startsWith('¥');
}

function fitTextInContainer(el, { min = 8, max = null } = {}) {
  if (!el) return;
  const maxSize = max ?? (parseFloat(getComputedStyle(el).fontSize) || 16);
  let size = maxSize;
  el.style.fontSize = `${size}px`;
  while (el.scrollWidth > el.clientWidth && size > min) {
    size -= 0.5;
    el.style.fontSize = `${size}px`;
  }
}

function fitCompositeKpiValues(scope = document) {
  scope.querySelectorAll('.insight-kpi-split__chip-value').forEach((el) => {
    el.style.fontSize = '';
    const split = el.closest('.insight-kpi-split');
    const isCompact = split?.classList.contains('insight-kpi-split--compact');
    const isSummary = split?.classList.contains('insight-kpi-split--summary');
    const max = el.classList.contains('insight-kpi-split__chip-value--yen')
      ? 18
      : (isCompact ? 18 : (isSummary ? 30 : 26));
    fitTextInContainer(el, { min: 8, max });
  });
  scope.querySelectorAll('.insight-kpi-split__total-value').forEach((el) => {
    el.style.fontSize = '';
    const split = el.closest('.insight-kpi-split');
    const isCompact = split?.classList.contains('insight-kpi-split--compact');
    const isSummary = split?.classList.contains('insight-kpi-split--summary');
    const max = el.classList.contains('insight-kpi-split__total-value--yen')
      ? 32
      : (isCompact ? 24 : (isSummary ? 44 : 40));
    fitTextInContainer(el, { min: 12, max });
  });
}

const INSIGHT_CHIP_CHEVRON = `
  <svg class="insight-kpi-split__chip-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
    <polyline points="6 9 12 15 18 9"/>
  </svg>`;

function computeChartYAxisTicks(maxValue, tickCount = 4) {
  const rawMax = Math.max(maxValue, 1);
  const rough = rawMax / tickCount;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  let step = mag;
  if (norm > 1) step = norm <= 2 ? 2 * mag : norm <= 5 ? 5 * mag : 10 * mag;
  const top = Math.ceil(rawMax / step) * step;
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { max: top, ticks };
}

function formatYAxisTickLabel(value) {
  const n = Math.round(value);
  if (n >= 100000000) return `${Math.round(n / 100000000)}億`;
  if (n >= 10000) return `${Math.round(n / 10000)}万`;
  if (n >= 1000) return `${Math.round(n / 1000)}千`;
  return String(n);
}

function renderKpiCompositionBar(segments, total, popoverPageId) {
  const visible = segments.filter((seg) => (Number(seg.value) || 0) > 0);
  if (!visible.length) return '';
  const stack = visible.map((seg) => {
    const v = Number(seg.value) || 0;
    const pct = total > 0 ? (v / total) * 100 : 0;
    const displayVal = seg.displayValue ?? (typeof formatYenDisplay === 'function' ? formatYenDisplay(v) : v);
    const popoverKey = popoverPageId && typeof getInsightPopoverKey === 'function'
      ? getInsightPopoverKey(popoverPageId, seg.label)
      : null;
    if (popoverKey) {
      return `<button type="button"
        class="insight-kpi-composition-seg insight-chart-clickable"
        style="width:${pct}%;background:${seg.color}"
        data-action="open-insight-popover"
        data-popover-type="${popoverKey}"
        data-popover-label="${seg.label}"
        data-popover-item-label="${seg.label}"
        title="${seg.label} ${displayVal}"
        aria-expanded="false"
        aria-label="${seg.label}の内訳を表示"></button>`;
    }
    return `<span class="insight-kpi-composition-seg" style="width:${pct}%;background:${seg.color}" title="${seg.label} ${displayVal}"></span>`;
  }).join('');
  return `
    <div class="insight-kpi-split__composition">
      <div class="insight-kpi-composition-label">売上構成</div>
      <div class="insight-kpi-composition-bar" role="img" aria-label="売上構成の横棒グラフ">${stack}</div>
    </div>`;
}

function renderInsightCompositeKpi(composite, pageId) {
  const total = composite.total || {};
  const segments = composite.segments || [];
  const popoverPageId = composite.popoverPageId || pageId;
  const unit = total.unit || '件';
  const segmentSum = segments.reduce((s, seg) => s + (Number(seg.value) || 0), 0);
  const displayTotal = Number(total.value) || segmentSum || 1;
  const totalVal = total.value ?? displayTotal;
  const accent = composite.accent || '#0891b2';
  const totalDisplay = total.displayValue ?? totalVal;
  const sizeClass = composite.size === 'compact'
    ? ' insight-kpi-split--compact'
    : (composite.size === 'summary' ? ' insight-kpi-split--summary' : '');
  const hideChipRate = composite.size === 'compact';
  const showChipHint = composite.size === 'summary';

  const chipsHtml = segments.map((seg) => {
    const v = Number(seg.value) || 0;
    const displayVal = seg.displayValue ?? v;
    const rate = seg.rate != null
      ? seg.rate
      : (displayTotal > 0 ? Math.round((v / displayTotal) * 1000) / 10 : 0);
    const rateText = typeof rate === 'string' ? rate : `${rate % 1 === 0 ? rate.toFixed(0) : rate}%`;

    const rateClass = seg.rateMuted
      ? 'insight-kpi-split__chip-rate insight-kpi-split__chip-rate--muted'
      : 'insight-kpi-split__chip-rate';

    const valueClass = isYenDisplay(displayVal)
      ? 'insight-kpi-split__chip-value insight-kpi-split__chip-value--yen'
      : 'insight-kpi-split__chip-value';
    const chipUnit = !isYenDisplay(displayVal) && (seg.unit || (composite.size === 'summary' && unit))
      ? `<span class="unit">${seg.unit || unit}</span>`
      : '';
    const hintHtml = showChipHint && seg.hint
      ? `<span class="insight-kpi-split__chip-hint">${seg.hint}</span>`
      : '';
    const rateHtml = hideChipRate ? '' : `<span class="${rateClass}">${rateText}</span>`;

    const nestedHtml = seg.nestedInline?.length
      ? `<div class="insight-kpi-split__cancel-breakdown">${seg.nestedInline.map((n) => {
        const nRate = typeof n.rate === 'number'
          ? `${n.rate % 1 === 0 ? n.rate.toFixed(0) : n.rate}%`
          : (n.rate || '0%');
        const itemColor = n.color ? ` style="--item-color:${n.color}"` : '';
        return `<span class="insight-kpi-split__cancel-breakdown-item"${itemColor}>
          <span class="insight-kpi-split__cancel-breakdown-label">${n.label}</span>
          <strong class="insight-kpi-split__cancel-breakdown-value">${n.value}</strong>
          <span class="insight-kpi-split__cancel-breakdown-rate">率 ${nRate}</span>
        </span>`;
      }).join('')}</div>`
      : (seg.nested?.length
        ? `<div class="insight-kpi-split__nested insight-kpi-split__nested--row">${seg.nested.map((n) => {
          const nRate = typeof n.rate === 'number'
            ? `${n.rate % 1 === 0 ? n.rate.toFixed(0) : n.rate}%`
            : (n.rate || '');
          return `<span class="insight-kpi-split__nested-item">
          <span class="insight-kpi-split__nested-label">${n.label}</span>
          <span class="insight-kpi-split__nested-value">${n.value}</span>
          ${nRate ? `<span class="insight-kpi-split__nested-rate">${nRate}</span>` : ''}
        </span>`;
        }).join('')}</div>`
        : '');

    const wideClass = seg.wide ? ' insight-kpi-split__chip--wide' : '';
    const inlineClass = seg.nestedInline?.length ? ' insight-kpi-split__chip--cancel-detail' : '';

    const popoverKey = popoverPageId && typeof getInsightPopoverKey === 'function'
      ? getInsightPopoverKey(popoverPageId, seg.label)
      : null;
    const cancelRateText = typeof rate === 'string' ? rate : `${rate % 1 === 0 ? rate.toFixed(0) : rate}%`;
    const chipInner = seg.nestedInline?.length
      ? `
        <div class="insight-kpi-split__cancel-summary">
          <span class="insight-kpi-split__cancel-summary-label">${seg.label}${hintHtml}</span>
          <span class="insight-kpi-split__cancel-summary-value">${displayVal}</span>
          <span class="insight-kpi-split__cancel-summary-rate">率 ${cancelRateText}</span>
        </div>
        ${nestedHtml}`
      : `
        <span class="insight-kpi-split__chip-label">${seg.label}${hintHtml}</span>
        <span class="${valueClass}">${displayVal}${chipUnit}</span>
        ${rateHtml}
        ${nestedHtml}`;

    if (popoverKey) {
      const tipAttrs = chartTipDataAttrs(seg.label, displayVal, rateText);
      return `
      <button type="button"
        class="insight-kpi-split__chip insight-kpi-split__chip--clickable${wideClass}${inlineClass}"
        style="--seg-color:${seg.color}"
        data-action="open-insight-popover"
        data-popover-type="${popoverKey}"
        data-popover-label="${seg.label}"
        data-popover-item-label="${seg.label}"
        ${tipAttrs}
        aria-expanded="false"
        aria-label="${seg.label}の内訳を表示">
        ${chipInner}
        ${INSIGHT_CHIP_CHEVRON}
      </button>`;
    }

    return `
      <span class="insight-kpi-split__chip${wideClass}${inlineClass}" style="--seg-color:${seg.color}">
        ${chipInner}
      </span>`;
  }).join('');

  const totalValueClass = isYenDisplay(totalDisplay)
    ? 'insight-kpi-split__total-value insight-kpi-split__total-value--yen'
    : 'insight-kpi-split__total-value';
  const totalUnit = !isYenDisplay(totalDisplay) && (total.displayValue ? total.unit : unit);
  const totalFigureHtml = totalUnit
    ? `<div class="insight-kpi-split__total-figure">
        <span class="${totalValueClass}">${totalDisplay}</span>
        <span class="insight-kpi-split__total-unit">${totalUnit}</span>
      </div>`
    : `<span class="${totalValueClass}">${totalDisplay}</span>`;
  const subHtml = composite.size === 'compact'
    ? (total.trend
      ? `<span class="insight-kpi-sub insight-kpi-sub--compact">${renderKpiTrend(total.trend)}</span>`
      : '')
    : `<span class="insight-kpi-sub">
          ${total.sub || ''}
          ${total.trend ? renderKpiTrend(total.trend) : ''}
        </span>`;

  const compositionHtml = composite.showCompositionBar
    ? renderKpiCompositionBar(segments, displayTotal, popoverPageId)
    : '';
  const compositionClass = composite.showCompositionBar ? ' insight-kpi-split--with-composition' : '';

  return `
    <div class="insight-kpi-split${sizeClass}${compositionClass}" style="--composite-accent:${accent}">
      <div class="insight-kpi-split__body">
        <div class="insight-kpi-split__total">
          <span class="insight-kpi-split__total-label">${total.label || '合計'}</span>
          ${totalFigureHtml}
          ${subHtml}
        </div>
        <div class="insight-kpi-split__equation" aria-label="内訳の合計">
          <span class="insight-kpi-split__eq">＝</span>
          <div class="insight-kpi-split__chips" style="--seg-count:${segments.length}">${chipsHtml}</div>
        </div>
      </div>
      ${compositionHtml}
    </div>`;
}

function renderInsightKpis(kpis, pageId) {
  if (kpis?.type === 'composite-stack' && Array.isArray(kpis.items)) {
    const keyed = [];
    if (kpis.summary) keyed.push({ key: 'summary', item: kpis.summary });
    kpis.items.forEach((item, i) => {
      keyed.push({ key: insightKpiCardKey(item, kpis.summary ? i + 1 : i), item });
    });
    const keys = keyed.map((k) => k.key);
    const order = loadInsightCardOrder(pageId, 'kpis', keys);
    const map = new Map(keyed.map((k) => [k.key, k.item]));
    const ordered = order.map((key) => ({ key, item: map.get(key) })).filter((x) => x.item);
    const hideHandle = ordered.length <= 1;
    const slots = ordered.map(({ key, item }, index) => renderInsightCardSlot(
      key,
      renderInsightCompositeKpi(item, pageId),
      index,
      { hideHandle },
    )).join('');
    const gridClass = kpis.summary
      ? 'insight-card-grid insight-kpi-stack insight-kpi-stack--patient'
      : 'insight-card-grid insight-kpi-stack';
    return `<div class="${gridClass}" data-card-grid="kpis" data-page-id="${escapeHtml(pageId)}">${slots}</div>`;
  }
  if (kpis?.type === 'composite') {
    const key = insightKpiCardKey(kpis, 0);
    return `
      <div class="insight-card-grid insight-kpi-stack" data-card-grid="kpis" data-page-id="${escapeHtml(pageId)}">
        ${renderInsightCardSlot(key, renderInsightCompositeKpi(kpis, pageId), 0, { hideHandle: true })}
      </div>`;
  }
  if (!kpis?.length) return '';
  const keyed = kpis.map((k, i) => ({
    key: `kpi-${String(k.label || i).replace(/\s+/g, '-')}`,
    kpi: k,
  }));
  const keys = keyed.map((k) => k.key);
  const order = loadInsightCardOrder(pageId, 'kpis', keys);
  const map = new Map(keyed.map((k) => [k.key, k.kpi]));
  const ordered = order.map((key) => ({ key, kpi: map.get(key) })).filter((x) => x.kpi);
  const hideHandle = ordered.length <= 1;
  const slots = ordered.map(({ key, kpi }, index) => renderInsightCardSlot(key, `
        <div class="insight-kpi">
          <span class="insight-kpi-label">${kpi.label}</span>
          <span class="insight-kpi-value">${kpi.value}</span>
          <span class="insight-kpi-sub">
            ${kpi.sub || ''}
            ${kpi.trend ? renderKpiTrend(kpi.trend) : ''}
          </span>
        </div>
      `, index, { hideHandle })).join('');
  return `
    <div class="insight-card-grid insight-kpi-row" data-card-grid="kpis" data-page-id="${escapeHtml(pageId)}">
      ${slots}
    </div>`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function formatChartTipValue(value, chart) {
  if (value == null || value === '') return '—';
  return formatInsightChartValue(value, chart);
}

function chartValueFormat(chart) {
  if (!chart) return null;
  if (chart.valueFormat) return chart.valueFormat;
  if (chart.unit === '%') return 'percent';
  return null;
}

function formatInsightChartValue(value, chart) {
  if (value == null || value === '') return '—';
  const fmt = chartValueFormat(chart);
  if (fmt === 'yen') return formatYenDisplay(value);
  if (fmt === 'percent') return `${value}${chart.unit || '%'}`;
  if (typeof value === 'number') return value.toLocaleString('ja-JP');
  const s = String(value);
  if (s.startsWith('¥')) return s;
  return s;
}

function chartTipDataAttrs(label, value, sub, chart) {
  const tipLabel = String(label || '').trim();
  const tipValue = formatChartTipValue(value, chart);
  let attrs = `
    data-chart-tip="1"
    data-chart-tip-label="${escapeHtml(tipLabel)}"
    data-chart-tip-value="${escapeHtml(tipValue)}"`;
  if (sub != null && sub !== '') {
    attrs += ` data-chart-tip-sub="${escapeHtml(String(sub))}"`;
  }
  return attrs;
}

function chartPopoverDataAttrs(pageId, itemLabel, chartTitle, extra = {}, chart = null) {
  const type = typeof resolveChartPopoverType === 'function'
    ? resolveChartPopoverType(pageId, itemLabel)
    : null;
  if (!type) return '';
  const triggerId = [chartTitle, extra.series, itemLabel].filter(Boolean).join(':');
  const tipLabel = extra.tipLabel || itemLabel;
  const tipValue = extra.tipValue ?? formatInsightChartValue(extra.value, chart);
  const tipSub = extra.tipSub ?? (extra.series && extra.series !== itemLabel ? extra.series : '');
  let attrs = `
    data-action="open-insight-popover"
    data-popover-type="${type}"
    data-popover-label="${escapeHtml(triggerId)}"
    data-popover-item-label="${escapeHtml(itemLabel)}"
    data-chart-title="${escapeHtml(chartTitle)}"
    aria-expanded="false"
    aria-label="${escapeHtml(itemLabel)}の内訳を表示"`;
  attrs += chartTipDataAttrs(tipLabel, tipValue, tipSub, chart);
  if (extra.value != null && extra.value !== '') {
    attrs += ` data-popover-value="${escapeHtml(formatInsightChartValue(extra.value, chart))}"`;
  }
  if (extra.series) {
    attrs += ` data-popover-series="${escapeHtml(extra.series)}"`;
  }
  if (extra.donutIdx != null) {
    attrs += ` data-donut-idx="${extra.donutIdx}"`;
  }
  return attrs;
}

function polarToCartesian(cx, cy, r, angleRad) {
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeDonutSegment(cx, cy, rOut, rIn, startAngle, endAngle) {
  let sweep = endAngle - startAngle;
  if (sweep >= 2 * Math.PI - 0.0001) sweep = 2 * Math.PI - 0.0001;
  if (sweep <= 0.0001) return '';

  const startOut = polarToCartesian(cx, cy, rOut, startAngle);
  const endOut = polarToCartesian(cx, cy, rOut, endAngle);
  const startIn = polarToCartesian(cx, cy, rIn, endAngle);
  const endIn = polarToCartesian(cx, cy, rIn, startAngle);
  const largeArc = sweep > Math.PI ? 1 : 0;

  return [
    `M ${startOut.x.toFixed(2)} ${startOut.y.toFixed(2)}`,
    `A ${rOut} ${rOut} 0 ${largeArc} 1 ${endOut.x.toFixed(2)} ${endOut.y.toFixed(2)}`,
    `L ${startIn.x.toFixed(2)} ${startIn.y.toFixed(2)}`,
    `A ${rIn} ${rIn} 0 ${largeArc} 0 ${endIn.x.toFixed(2)} ${endIn.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

function insightDateLabelClass(label) {
  return typeof chartDateLabelClass === 'function' ? chartDateLabelClass(label) : '';
}

function renderStackedBar(chart, pageId, chartTitle) {
  const labels = chart.labels || [];
  const series = chart.series || [];
  const totals = labels.map((_, i) => series.reduce((sum, s) => sum + (s.values?.[i] || 0), 0));
  const positiveTotals = totals.filter((t) => t > 0);
  const dataMax = Number.isFinite(chart.yAxisMax) && chart.yAxisMax > 0
    ? chart.yAxisMax
    : Math.max(...positiveTotals, 1);
  const useYAxis = chart.showYAxis || chartValueFormat(chart) === 'yen';
  const axis = useYAxis ? computeChartYAxisTicks(dataMax) : { max: dataMax, ticks: [0, dataMax] };
  const scaleMax = axis.max || dataMax;
  const fitWidth = chart.layout === 'full';
  const dense = !fitWidth && (chart.denseLabels || labels.length > 12);
  const focusIdx = Number.isInteger(chart.focusIndex) ? chart.focusIndex : null;
  const focusLabel = chart.focusLabel || '';
  const hasSpotlight = focusIdx != null && focusIdx >= 0 && focusIdx < labels.length;

  const cols = labels.map((label, i) => {
    const total = totals[i];
    const h = total > 0 ? (total / scaleMax) * 100 : 0;
    const isFocus = hasSpotlight && i === focusIdx;
    const segs = total > 0
      ? series.map((s) => {
        const v = s.values?.[i] || 0;
        if (v <= 0) return '';
        const w = (v / total) * 100;
        const attrs = chartPopoverDataAttrs(pageId, s.name, chartTitle, {
          value: v,
          series: label,
          tipSub: label,
        }, chart);
        return `<button type="button" class="insight-bar-seg insight-chart-clickable" style="height:${w}%;background:${s.color}" ${attrs}></button>`;
      }).join('')
      : '';
    const colAttrs = chartPopoverDataAttrs(pageId, label, chartTitle, { value: total }, chart);
    const labelInner = isFocus && focusLabel
      ? `<span class="insight-bar-focus-badge">${focusLabel}</span><span class="insight-bar-label-text">${label}</span>`
      : `<span class="insight-bar-label-text">${label}</span>`;
    const labelClasses = [
      'insight-bar-label',
      total > 0 ? 'insight-chart-clickable insight-chart-clickable--label' : 'insight-bar-label--empty',
      isFocus ? 'insight-bar-label--focus' : '',
      insightDateLabelClass(label),
    ].filter(Boolean).join(' ');
    const labelHtml = total > 0
      ? `<button type="button" class="${labelClasses}" ${colAttrs}>${labelInner}</button>`
      : `<span class="${labelClasses}">${labelInner}</span>`;
    return `
      <div class="insight-bar-col${total > 0 ? '' : ' insight-bar-col--no-data'}${isFocus ? ' insight-bar-col--focus' : ''}"${isFocus ? ' data-chart-focus="true"' : ''}>
        <div class="insight-bar-plot">
          ${isFocus ? '<span class="insight-bar-focus-marker" aria-hidden="true"></span>' : ''}
          ${total > 0
            ? `<div class="insight-bar-stack" style="height:${h}%">${segs}</div>`
            : '<div class="insight-bar-col--empty" aria-hidden="true"></div>'}
        </div>
        ${labelHtml}
      </div>`;
  }).join('');

  const wrapClass = dense ? 'insight-chart-bars-wrap insight-chart-bars-wrap--scroll' : 'insight-chart-bars-wrap';
  const barsClass = [
    'insight-chart-bars',
    'insight-chart-bars--stacked',
    dense ? 'insight-chart-bars--dense' : '',
    fitWidth ? 'insight-chart-bars--fit' : '',
  ].filter(Boolean).join(' ');
  const barsStyle = dense && !fitWidth ? ` style="--bar-count:${labels.length}"` : '';

  const barsBlock = `
    <div class="${wrapClass}">
      <div class="${barsClass}"${barsStyle}>${cols}</div>
    </div>`;

  const plotInner = useYAxis
    ? `
      <div class="insight-chart-plot-area">
        <div class="insight-chart-y-grid" aria-hidden="true">
          ${axis.ticks.slice().reverse().map(() => '<span class="insight-chart-y-grid-line"></span>').join('')}
        </div>
        ${barsBlock}
      </div>`
    : barsBlock;

  const axisBlock = useYAxis
    ? `
    <div class="insight-chart-bars-with-axis">
      <div class="insight-chart-y-axis" aria-hidden="true">
        ${axis.ticks.slice().reverse().map((tick) => `<span class="insight-chart-y-axis-tick">${formatYAxisTickLabel(tick)}</span>`).join('')}
      </div>
      ${plotInner}
    </div>`
    : barsBlock;

  return `
    ${axisBlock}
    <div class="insight-chart-legend">
      ${series.map((s) => {
        const attrs = chartPopoverDataAttrs(pageId, s.name, chartTitle, {}, chart);
        return `<button type="button" class="insight-legend-item insight-chart-clickable insight-chart-clickable--legend" ${attrs}><i style="background:${s.color}"></i>${s.name}</button>`;
      }).join('')}
    </div>`;
}

function renderGroupedBar(chart, pageId, chartTitle) {
  const labels = chart.labels || [];
  const groups = chart.groups || [];
  const max = Math.max(...labels.map((_, i) => groups.reduce((s, g) => s + (g.values?.[i] || 0), 0)), 1);

  return `
    <div class="insight-chart-bars insight-chart-bars--grouped">
      ${labels.map((label, i) => {
        const colTotal = groups.reduce((s, g) => s + (g.values?.[i] || 0), 0);
        const labelHtml = colTotal > 0
          ? `<button type="button" class="insight-bar-label insight-chart-clickable insight-chart-clickable--label ${insightDateLabelClass(label)}" ${chartPopoverDataAttrs(pageId, label, chartTitle, {}, chart)}>${label}</button>`
          : `<span class="insight-bar-label insight-bar-label--empty ${insightDateLabelClass(label)}">${label}</span>`;
        return `
        <div class="insight-bar-col insight-bar-col--grouped${colTotal > 0 ? '' : ' insight-bar-col--no-data'}">
          <div class="insight-bar-group">
            ${groups.map((g) => {
              const v = g.values?.[i] || 0;
              if (v <= 0) return '<div class="insight-bar-single insight-bar-single--empty" aria-hidden="true"></div>';
              const h = (v / max) * 100;
              const attrs = chartPopoverDataAttrs(pageId, g.name, chartTitle, { value: v, series: label }, chart);
              return `<button type="button" class="insight-bar-single insight-chart-clickable" style="height:${h}%;background:${g.color}" ${attrs}></button>`;
            }).join('')}
          </div>
          ${labelHtml}
        </div>`;
      }).join('')}
    </div>
    <div class="insight-chart-legend">
      ${groups.map((g) => {
        const attrs = chartPopoverDataAttrs(pageId, g.name, chartTitle, {}, chart);
        return `<button type="button" class="insight-legend-item insight-chart-clickable insight-chart-clickable--legend" ${attrs}><i style="background:${g.color}"></i>${g.name}</button>`;
      }).join('')}
    </div>`;
}

function renderSimpleBar(chart, pageId, chartTitle) {
  const values = chart.values || [];
  const labels = chart.labels || [];
  const dataMax = Number.isFinite(chart.yAxisMax) && chart.yAxisMax > 0
    ? chart.yAxisMax
    : Math.max(...values, chart.goal || 0, 1);
  const useYAxis = chart.showYAxis || chartValueFormat(chart) === 'yen' || chart.unit === '%';
  const axis = useYAxis ? computeChartYAxisTicks(dataMax) : { max: dataMax, ticks: [0, dataMax] };
  const scaleMax = axis.max || dataMax;

  const cols = values.map((v, i) => {
    const h = v > 0 ? (v / scaleMax) * 100 : 0;
    const label = labels[i] || '';
    const attrs = chartPopoverDataAttrs(pageId, label, chartTitle, { value: v }, chart);
    if (v <= 0) {
      return `
          <div class="insight-bar-col insight-bar-col--no-data">
            <div class="insight-bar-col--empty" aria-hidden="true"></div>
            <span class="insight-bar-label insight-bar-label--empty ${insightDateLabelClass(label)}">${label}</span>
          </div>`;
    }
    return `
          <div class="insight-bar-col">
            <div class="insight-bar-plot">
              <button type="button" class="insight-bar-single insight-chart-clickable" style="height:${h}%;background:${chart.color || '#0ea5e9'}" ${attrs}></button>
            </div>
            <button type="button" class="insight-bar-label insight-chart-clickable insight-chart-clickable--label ${insightDateLabelClass(label)}" ${attrs}>${label}</button>
          </div>`;
  }).join('');

  const barsBlock = `<div class="insight-chart-bars">${cols}</div>`;
  const plotInner = useYAxis
    ? `<div class="insight-chart-plot-area">
        <div class="insight-chart-y-grid" aria-hidden="true">
          ${axis.ticks.slice().reverse().map(() => '<span class="insight-chart-y-grid-line"></span>').join('')}
        </div>
        ${barsBlock}
      </div>`
    : barsBlock;

  if (!useYAxis) return barsBlock;

  return `
    <div class="insight-chart-bars-with-axis">
      <div class="insight-chart-y-axis" aria-hidden="true">
        ${axis.ticks.slice().reverse().map((tick) => {
          const label = chart.unit === '%' ? `${tick}%` : formatYAxisTickLabel(tick);
          return `<span class="insight-chart-y-axis-tick">${label}</span>`;
        }).join('')}
      </div>
      ${plotInner}
    </div>`;
}

function describePieSegment(cx, cy, r, startAngle, endAngle) {
  let sweep = endAngle - startAngle;
  if (sweep >= 2 * Math.PI - 0.0001) sweep = 2 * Math.PI - 0.0001;
  if (sweep <= 0.0001) return '';

  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = sweep > Math.PI ? 1 : 0;

  return [
    `M ${cx.toFixed(2)} ${cy.toFixed(2)}`,
    `L ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
    `A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

function renderSurveyPie(chart, pageId, chartTitle) {
  const segments = chart.segments || [];
  const total = segments.reduce((s, seg) => s + Math.max(0, seg.value || 0), 0) || 1;
  const cx = 100;
  const cy = 100;
  const r = 88;
  let acc = 0;

  const segParts = segments.map((seg, idx) => {
    const v = Math.max(0, seg.value || 0);
    const pct = total > 0 ? v / total : 0;
    const startAngle = acc * 2 * Math.PI - Math.PI / 2;
    acc += pct;
    if (v <= 0) return { path: '', label: '' };
    const endAngle = acc * 2 * Math.PI - Math.PI / 2;
    const d = describePieSegment(cx, cy, r, startAngle, endAngle);
    const midAngle = (startAngle + endAngle) / 2;
    const labelR = r * 0.58;
    const lx = cx + labelR * Math.cos(midAngle);
    const ly = cy + labelR * Math.sin(midAngle);
    const pctText = `${Math.round(pct * 1000) / 10}%`;
    const attrs = chartPopoverDataAttrs(pageId, seg.label, chartTitle, {
      value: v,
      tipSub: pctText,
      donutIdx: idx,
    }, chart);
    const path = d
      ? `<path role="button" tabindex="0" class="insight-survey-pie-seg insight-chart-clickable" d="${d}" fill="${seg.color}" ${attrs} />`
      : '';
    const label = pct >= 0.08
      ? `<text class="insight-survey-pie-label" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${pctText}</text>`
      : '';
    return { path, label };
  });

  return `
    <div class="insight-survey-pie-wrap">
      <svg class="insight-survey-pie-svg" viewBox="0 0 200 200" aria-label="${escapeHtml(chartTitle)}">
        ${segParts.map((p) => p.path).join('')}
        ${segParts.map((p) => p.label).join('')}
      </svg>
      <ul class="insight-survey-pie-legend">
        ${segments.map((seg, idx) => {
          const v = Math.max(0, seg.value || 0);
          const pct = total > 0 ? Math.round((v / total) * 1000) / 10 : 0;
          const attrs = chartPopoverDataAttrs(pageId, seg.label, chartTitle, {
            value: v,
            tipSub: `${pct}%`,
            donutIdx: idx,
          }, chart);
          return `<li><button type="button" class="insight-survey-pie-legend-btn insight-chart-clickable" ${attrs}><i style="background:${seg.color}"></i><span>${seg.label}</span></button></li>`;
        }).join('')}
      </ul>
    </div>`;
}

function renderDonut(chart, pageId, chartTitle) {
  const segments = chart.segments || [];
  const total = segments.reduce((s, seg) => s + Math.max(0, seg.value || 0), 0) || 1;
  const donutId = `donut-${chartTitle.replace(/\s+/g, '-')}-${Math.random().toString(36).slice(2, 7)}`;
  const cx = 60;
  const cy = 60;
  const rOut = 54;
  const rIn = 34;
  let acc = 0;

  const segPaths = segments.map((seg, idx) => {
    const v = Math.max(0, seg.value || 0);
    const pct = total > 0 ? v / total : 0;
    const startAngle = acc * 2 * Math.PI - Math.PI / 2;
    acc += pct;
    if (v <= 0) return '';
    const endAngle = acc * 2 * Math.PI - Math.PI / 2;
    const d = describeDonutSegment(cx, cy, rOut, rIn, startAngle, endAngle);
    if (!d) return '';
    const pctText = `${Math.round(pct * 100)}%`;
    const attrs = chartPopoverDataAttrs(pageId, seg.label, chartTitle, {
      value: v,
      tipSub: pctText,
      donutIdx: idx,
    }, chart);
    return `<path role="button" tabindex="0" class="insight-donut-seg insight-chart-clickable" d="${d}" fill="${seg.color}" ${attrs} />`;
  }).join('');

  return `
    <div class="insight-donut-wrap" data-donut-group="${donutId}">
      <svg class="insight-donut-svg" viewBox="0 0 120 120" aria-label="${escapeHtml(chartTitle)}">
        ${segPaths}
      </svg>
      <ul class="insight-donut-legend">
        ${segments.map((seg, idx) => {
          const v = Math.max(0, seg.value || 0);
          const pct = total > 0 ? Math.round((v / total) * 100) : 0;
          if (v <= 0) {
            return `<li><span class="insight-donut-legend-btn insight-donut-legend-btn--empty"><i style="background:${seg.color}"></i><span>${seg.label}</span><strong>${pct}%</strong></span></li>`;
          }
          const attrs = chartPopoverDataAttrs(pageId, seg.label, chartTitle, {
            value: v,
            tipSub: `${pct}%`,
            donutIdx: idx,
          }, chart);
          return `<li><button type="button" class="insight-donut-legend-btn insight-chart-clickable" ${attrs}><i style="background:${seg.color}"></i><span>${seg.label}</span><strong>${pct}%</strong></button></li>`;
        }).join('')}
      </ul>
    </div>`;
}

function renderHbar(chart, pageId, chartTitle) {
  const items = chart.items || [];
  const max = Math.max(...items.map((it) => it.value), 1);
  const unit = chart.unit || '';
  const useYen = chartValueFormat(chart) === 'yen';

  return `
    <div class="insight-hbar-list">
      ${items.map((it) => {
        const w = (it.value / max) * 100;
        const display = useYen
          ? formatYenDisplay(it.value)
          : (typeof it.value === 'number' && it.value > 1000
            ? it.value.toLocaleString('ja-JP')
            : `${it.value}${unit}`);
        const attrs = chartPopoverDataAttrs(pageId, it.label, chartTitle, { value: it.value }, chart);
        return `
          <button type="button" class="insight-hbar-row insight-chart-clickable" ${attrs}>
            <span class="insight-hbar-label">${it.label}</span>
            <div class="insight-hbar-track"><div class="insight-hbar-fill" style="width:${w}%;background:${it.color}"></div></div>
            <span class="insight-hbar-val">${display}</span>
          </button>`;
      }).join('')}
    </div>`;
}

function renderCompareLine(chart, pageId, chartTitle) {
  const labels = chart.labels || [];
  const current = chart.current || [];
  const compare = chart.compare || [];
  const dataMax = Math.max(...current, ...compare, 1);
  const useYAxis = chart.showYAxis;
  const axis = useYAxis ? computeChartYAxisTicks(dataMax) : { max: dataMax, ticks: [0, dataMax] };
  const max = axis.max || dataMax;
  const h = 120;

  const toPoints = (vals) => vals.map((v, i) => {
    const x = labels.length > 1 ? (i / (labels.length - 1)) * 100 : 50;
    const y = h - (v / max) * (h - 8);
    return `${x},${y}`;
  }).join(' ');

  const chartBody = `
    <div class="insight-line-chart">
      <svg viewBox="0 0 100 ${h}" preserveAspectRatio="none" class="insight-line-svg" aria-hidden="true">
        <polyline class="insight-line insight-line--compare" points="${toPoints(compare)}" />
        <polyline class="insight-line insight-line--current" points="${toPoints(current)}" />
      </svg>
      <div class="insight-line-labels insight-line-labels--clickable">
        ${labels.map((l, i) => {
          const compareVal = compare[i];
          const attrs = chartPopoverDataAttrs(pageId, l, chartTitle, {
            value: current[i],
            tipSub: compareVal != null ? `比較 ${formatInsightChartValue(compareVal, chart)}` : '',
          }, chart);
          return `<button type="button" class="insight-line-label-btn insight-chart-clickable ${insightDateLabelClass(l)}" ${attrs}>${l}</button>`;
        }).join('')}
      </div>
      <div class="insight-chart-legend">
        <button type="button" class="insight-legend-item insight-chart-clickable insight-chart-clickable--legend" ${chartPopoverDataAttrs(pageId, '当期', chartTitle, {}, chart)}><i style="background:#0ea5e9"></i>当期</button>
        <button type="button" class="insight-legend-item insight-chart-clickable insight-chart-clickable--legend" ${chartPopoverDataAttrs(pageId, chart.compareLabel || '比較', chartTitle, {}, chart)}><i style="background:#cbd5e1"></i>${chart.compareLabel || '比較'}</button>
      </div>
    </div>`;

  if (!useYAxis) return chartBody;

  return `
    <div class="insight-chart-bars-with-axis insight-chart-bars-with-axis--line">
      <div class="insight-chart-y-axis" aria-hidden="true">
        ${axis.ticks.slice().reverse().map((tick) => `<span class="insight-chart-y-axis-tick">${formatYAxisTickLabel(tick)}</span>`).join('')}
      </div>
      ${chartBody}
    </div>`;
}

function renderSparkline(chart, pageId, chartTitle) {
  const values = chart.values || [];
  const dataMax = Math.max(...values, chart.goal || 0, 1);
  const useYAxis = chart.showYAxis;
  const axis = useYAxis ? computeChartYAxisTicks(dataMax) : null;
  const max = axis?.max || dataMax;
  const min = useYAxis ? 0 : Math.min(...values, chart.goal || values[0] || 0);
  const range = max - min || 1;
  const h = 80;
  const labels = chart.labels || [];

  const points = values.map((v, i) => {
    const x = values.length > 1 ? (i / (values.length - 1)) * 100 : 50;
    const y = h - ((v - min) / range) * (h - 12) - 6;
    return `${x},${y}`;
  }).join(' ');

  const goalY = chart.goal != null ? h - ((chart.goal - min) / range) * (h - 12) - 6 : null;
  const lastVal = values[values.length - 1];

  const chartBody = `
    <div class="insight-sparkline">
      <button type="button" class="insight-sparkline-value insight-chart-clickable" ${chartPopoverDataAttrs(pageId, labels[labels.length - 1] || chartTitle, chartTitle, { value: lastVal }, chart)}>${formatInsightChartValue(lastVal, chart)}</button>
      <svg viewBox="0 0 100 ${h}" preserveAspectRatio="none" class="insight-line-svg" aria-hidden="true">
        ${goalY != null ? `<line x1="0" y1="${goalY}" x2="100" y2="${goalY}" class="insight-goal-line" />` : ''}
        <polyline class="insight-line insight-line--current" points="${points}" />
      </svg>
      <div class="insight-line-labels insight-line-labels--clickable">
        ${labels.map((l, i) => {
          const attrs = chartPopoverDataAttrs(pageId, l, chartTitle, { value: values[i] }, chart);
          return `<button type="button" class="insight-line-label-btn insight-chart-clickable ${insightDateLabelClass(l)}" ${attrs}>${l}</button>`;
        }).join('')}
      </div>
      ${chart.goal != null ? `<div class="insight-sparkline-goal">目標 ${formatInsightChartValue(chart.goal, chart)}</div>` : ''}
    </div>`;

  if (!useYAxis) return chartBody;

  return `
    <div class="insight-chart-bars-with-axis insight-chart-bars-with-axis--line">
      <div class="insight-chart-y-axis" aria-hidden="true">
        ${axis.ticks.slice().reverse().map((tick) => {
          const label = chart.unit === '%' ? `${tick}%` : formatYAxisTickLabel(tick);
          return `<span class="insight-chart-y-axis-tick">${label}</span>`;
        }).join('')}
      </div>
      ${chartBody}
    </div>`;
}

function renderDeltaBars(chart, pageId, chartTitle) {
  const items = chart.items || [];
  const max = Math.max(...items.map((it) => Math.abs(it.delta)), 1);

  return `
    <div class="insight-delta-bars">
      ${items.map((it) => {
        const w = (Math.abs(it.delta) / max) * 50;
        const isPos = it.delta >= 0;
        const attrs = chartPopoverDataAttrs(pageId, it.label, chartTitle, { value: `${it.delta > 0 ? '+' : ''}${it.delta}%` });
        return `
          <button type="button" class="insight-delta-row insight-chart-clickable" ${attrs}>
            <span class="insight-delta-label">${it.label}</span>
            <div class="insight-delta-track">
              <div class="insight-delta-fill ${isPos ? 'insight-delta-fill--pos' : 'insight-delta-fill--neg'}" style="width:${w}%;background:${it.color}"></div>
            </div>
            <span class="insight-delta-val ${isPos ? 'insight-kpi-trend--up' : 'insight-kpi-trend--down'}">${it.delta > 0 ? '+' : ''}${it.delta}%</span>
          </button>`;
      }).join('')}
    </div>`;
}

function renderFunnel(chart, pageId, chartTitle) {
  const steps = chart.steps || [];
  const max = steps[0]?.value || 1;

  return `
    <div class="insight-funnel">
      ${steps.map((step, i) => {
        const w = Math.max(30, (step.value / max) * 100);
        const rate = i > 0 ? Math.round((step.value / steps[i - 1].value) * 100) : 100;
        const attrs = chartPopoverDataAttrs(pageId, step.label, chartTitle, {
          value: step.value,
          tipSub: i > 0 ? `転換率 ${rate}%` : '',
        });
        return `
          <button type="button" class="insight-funnel-step insight-chart-clickable" style="width:${w}%" ${attrs}>
            <span class="insight-funnel-label">${step.label}</span>
            <span class="insight-funnel-value">${step.value.toLocaleString()}</span>
            ${i > 0 ? `<span class="insight-funnel-rate">${rate}%</span>` : ''}
          </button>`;
      }).join('')}
    </div>`;
}

function renderTable(chart, pageId, chartTitle) {
  return `
    <div class="insight-table-wrap">
      <table class="insight-table">
        <thead><tr>${chart.columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>
          ${chart.rows.map((row) => {
            const itemLabel = row[0] || chartTitle;
            const attrs = chartPopoverDataAttrs(pageId, itemLabel, chartTitle, { value: row.join(' / ') }, chart);
            return `<tr class="insight-chart-clickable insight-table-row--clickable" role="button" tabindex="0" ${attrs}>${row.map((cell, ci) => {
              const colName = chart.columns[ci] || '';
              const display = /金額|売上|未収|入金|LTV|保険|自費|合計/.test(colName)
                ? formatYenDisplay(cell)
                : cell;
              return `<td>${display}</td>`;
            }).join('')}</tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderHeatmap(chart, pageId, chartTitle) {
  const flat = chart.values.flat();
  const max = Math.max(...flat, 1);
  const min = Math.min(...flat, 0);

  return `
    <div class="insight-heatmap">
      <div class="insight-heatmap-cols">
        <span></span>
        ${chart.cols.map((c) => `<span>${c}</span>`).join('')}
      </div>
      ${chart.rows.map((row, ri) => `
        <div class="insight-heatmap-row">
          <span class="insight-heatmap-row-label">${row}</span>
          ${chart.cols.map((col, ci) => {
            const v = chart.values[ri][ci];
            const t = max > min ? (v - min) / (max - min) : 0;
            const bg = `color-mix(in srgb, #10b981 ${Math.round(t * 100)}%, #f1f5f9)`;
            const itemLabel = `${row} ${col}`;
            const attrs = chartPopoverDataAttrs(pageId, itemLabel, chartTitle, { value: `${v}%`, series: row });
            return `<button type="button" class="insight-heatmap-cell insight-chart-clickable" style="background:${bg}" ${attrs}>${v}</button>`;
          }).join('')}
        </div>
      `).join('')}
    </div>`;
}

function renderScatterHint(chart, pageId, chartTitle) {
  return `
    <div class="insight-scatter-hint">
      ${chart.items.map((it) => {
        const attrs = chartPopoverDataAttrs(pageId, it.label, chartTitle, { value: `${it.x} · ${it.y}` });
        return `
        <button type="button" class="insight-scatter-card insight-chart-clickable" style="--card-accent:${it.color}" ${attrs}>
          <span class="insight-scatter-title">${it.label}</span>
          <span class="insight-scatter-axis">頻度 <strong>${it.x}</strong></span>
          <span class="insight-scatter-axis">単価 <strong>${it.y}</strong></span>
        </button>`;
      }).join('')}
    </div>`;
}

function riskLevelClass(level) {
  if (level === '高') return 'insight-risk-level--high';
  if (level === '中') return 'insight-risk-level--mid';
  return 'insight-risk-level--low';
}

function renderRiskTable(chart, pageId, chartTitle) {
  const rows = chart.rows || [];
  const initial = chart.initialVisible || 10;
  const columns = chart.columns || [];
  const hasMore = rows.length > initial;
  const chartId = chart.id || `risk-${Math.random().toString(36).slice(2, 7)}`;

  const bodyRows = rows.map((row, idx) => {
    const hiddenClass = idx >= initial ? ' insight-risk-row--hidden' : '';
    const attrs = [
      'type="button"',
      'class="insight-risk-row insight-table-row--clickable' + hiddenClass + '"',
      'data-action="open-insight-popover"',
      'data-popover-type="insightAtRiskPatient"',
      'data-popover-patient-id="' + escapeHtml(row.id) + '"',
      'data-popover-label="' + escapeHtml(row.name) + '"',
      'data-popover-item-label="' + escapeHtml(row.name) + '"',
      'data-chart-title="' + escapeHtml(chartTitle) + '"',
      'aria-expanded="false"',
      'aria-label="' + escapeHtml(row.name) + 'の予約履歴を表示"',
    ].join(' ');
    return `<tr ${attrs}>
      <td>${escapeHtml(row.name)}</td>
      <td>${escapeHtml(row.lastVisit)}</td>
      <td>${escapeHtml(row.nextAppt)}</td>
      <td>${row.cancelPastYear}</td>
      <td>${escapeHtml(String(row.cancelRate))}</td>
      <td><span class="insight-risk-level ${riskLevelClass(row.riskLevel)}">${row.riskScore} <small>${row.riskLevel}</small></span></td>
    </tr>`;
  }).join('');

  const expandBtn = hasMore
    ? `<button type="button" class="insight-risk-expand" data-action="expand-risk-table" data-risk-chart="${chartId}" data-initial="${initial}">
        さらに表示（残り${rows.length - initial}名）
      </button>`
    : '';

  return `
    <div class="insight-risk-table-wrap" data-risk-chart-id="${chartId}" data-risk-initial="${initial}">
      <table class="insight-table insight-risk-table">
        <thead><tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      ${expandBtn}
    </div>`;
}

function renderChart(chart, pageId) {
  const chartTitle = chart.title || '';
  const renderers = {
    'stacked-bar': renderStackedBar,
    'grouped-bar': renderGroupedBar,
    bar: renderSimpleBar,
    donut: renderDonut,
    hbar: renderHbar,
    'compare-line': renderCompareLine,
    sparkline: renderSparkline,
    'delta-bars': renderDeltaBars,
    funnel: renderFunnel,
    table: renderTable,
    heatmap: renderHeatmap,
    'scatter-hint': renderScatterHint,
    'risk-table': renderRiskTable,
    'survey-pie': renderSurveyPie,
  };
  const fn = renderers[chart.type];
  return fn ? fn(chart, pageId, chartTitle) : '';
}

function renderInsightLeadingTabsMarkup() {
  return `
    <button type="button"
      class="insight-period-tab insight-period-tab--top"
      data-action="insight-go-top"
      title="ダッシュボードに戻る"
      aria-label="ダッシュボード（TOP）に戻る">TOP</button>`;
}

function renderInsightPeriodTabsMarkup() {
  return INSIGHT_PERIODS.map((p) => {
    const active = p === insightState.period;
    return `
      <button type="button"
        class="insight-period-tab ${active ? 'insight-period-tab--active' : ''}"
        data-insight-period="${p}"
        role="tab"
        aria-selected="${active}">${p}</button>`;
  }).join('');
}

function renderInsightTopNavMarkup() {
  return getInsightPageNavOrder().map((id) => {
    const meta = INSIGHT_PAGES[id];
    const active = id === insightState.page;
    const label = meta.shortLabel || meta.title;
    return `
      <button type="button"
        class="insight-top-nav-item ${active ? 'insight-top-nav-item--active' : ''}"
        style="--nav-accent:${meta.accent}"
        title="${meta.title}"
        data-insight-page="${id}"
        data-nav-key="${id}"
        draggable="false"
        aria-current="${active ? 'page' : 'false'}">${label}</button>`;
  }).join('');
}

function refreshInsightTopNavMarkup() {
  const nav = document.getElementById('insight-top-nav');
  if (!nav) return;
  nav.innerHTML = renderInsightTopNavMarkup();
}

function updateInsightToolbarState() {
  const header = document.getElementById('insight-header');
  const meta = getInsightPageMeta(insightState.page);
  if (header && meta) {
    header.style.setProperty('--page-accent', meta.accent);
  }

  document.querySelectorAll('[data-insight-period]').forEach((el) => {
    const active = el.dataset.insightPeriod === insightState.period;
    el.classList.toggle('insight-period-tab--active', active);
    el.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  document.querySelectorAll('[data-insight-page]').forEach((el) => {
    const active = el.dataset.insightPage === insightState.page;
    el.classList.toggle('insight-top-nav-item--active', active);
    el.setAttribute('aria-current', active ? 'page' : 'false');
  });
}

function onInsightToolbarClick(e) {
  if (insightNavSuppressClick) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  const periodBtn = e.target.closest('[data-insight-period]');
  if (periodBtn) {
    e.preventDefault();
    if (periodBtn.dataset.insightPeriod !== insightState.period) {
      navigateInsight({ period: periodBtn.dataset.insightPeriod });
    }
    return;
  }

  const pageBtn = e.target.closest('[data-insight-page]');
  if (pageBtn) {
    e.preventDefault();
    if (pageBtn.dataset.insightPage !== insightState.page) {
      navigateInsight({ page: pageBtn.dataset.insightPage });
      if (typeof pageBtn.blur === 'function') pageBtn.blur();
    }
    return;
  }

  const topBtn = e.target.closest('[data-action="insight-go-top"]');
  if (topBtn) {
    e.preventDefault();
    syncAppStateFromInsight();
    window.location.href = 'index.html';
  }
}

function ensureInsightShell(root) {
  if (root.dataset.shellInit) return;
  root.dataset.shellInit = '1';

  root.innerHTML = `
    <header class="insight-header" id="insight-header">
      <div class="insight-toolbar">
        <div class="insight-period-tabs" role="group" aria-label="TOP" id="insight-period-leading"></div>
        <span class="insight-toolbar-divider" aria-hidden="true"></span>
        <div class="insight-period-tabs" role="tablist" aria-label="表示期間" id="insight-period-tabs"></div>
        <span class="insight-toolbar-divider" aria-hidden="true"></span>
        <nav class="insight-top-nav" aria-label="インサイト切替" id="insight-top-nav"></nav>
      </div>
    </header>
    <main class="insight-content" id="insight-content-area"></main>
  `;

  document.getElementById('insight-period-leading').innerHTML = renderInsightLeadingTabsMarkup();
  document.getElementById('insight-period-tabs').innerHTML = renderInsightPeriodTabsMarkup();
  document.getElementById('insight-top-nav').innerHTML = renderInsightTopNavMarkup();
  root.addEventListener('click', onInsightToolbarClick);
  initInsightTopNavDrag(root);
}

function renderInsightChartCardInner(chart, pageId) {
  const focusIdx = Number.isInteger(chart.focusIndex) ? chart.focusIndex : null;
  const focusLabel = chart.focusLabel || '';
  const focusDate = focusIdx != null && chart.labels?.[focusIdx] ? chart.labels[focusIdx] : '';
  const focusPill = focusLabel && focusDate
    ? `<span class="insight-chart-focus-pill ${insightDateLabelClass(focusDate)}" aria-label="${focusLabel} ${focusDate} を表示中">
        <span class="insight-chart-focus-pill-dot" aria-hidden="true"></span>
        ${focusLabel} <span class="${insightDateLabelClass(focusDate)}">${focusDate}</span>
      </span>`
    : '';
  return `
    <section class="insight-chart-card insight-chart-card--interactive${focusPill ? ' insight-chart-card--focused' : ''}">
      <header class="insight-chart-header">
        <div class="insight-chart-header__main">
          <h2 class="insight-chart-title">${chart.title}</h2>
          ${chart.subtitle ? `<p class="insight-chart-subtitle">${chart.subtitle}</p>` : ''}
        </div>
        ${focusPill}
      </header>
      <div class="insight-chart-body">${renderChart(chart, pageId)}</div>
    </section>`;
}

function initInsightChartFocus(scope) {
  const focusCol = scope?.querySelector('[data-chart-focus="true"]');
  if (!focusCol) return;
  requestAnimationFrame(() => {
    const scrollWrap = focusCol.closest('.insight-chart-bars-wrap--scroll');
    if (scrollWrap) {
      const wrapRect = scrollWrap.getBoundingClientRect();
      const colRect = focusCol.getBoundingClientRect();
      scrollWrap.scrollLeft += colRect.left - wrapRect.left - (wrapRect.width / 2) + (colRect.width / 2);
    }
    focusCol.classList.add('insight-bar-col--focus-enter');
    window.setTimeout(() => focusCol.classList.remove('insight-bar-col--focus-enter'), 800);
  });
}

function scheduleInsightLayoutPass(content) {
  if (!content) return;
  fitCompositeKpiValues(content);
  requestAnimationFrame(() => {
    fitCompositeKpiValues(content);
    initInsightChartFocus(content);
  });
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => fitCompositeKpiValues(content));
  }
}

function renderInsightChartsMarkup(charts, pageId) {
  const keyed = (charts || []).map((chart, i) => ({
    key: insightChartCardKey(chart, i),
    chart,
  }));
  const keys = keyed.map((k) => k.key);
  const order = loadInsightCardOrder(pageId, 'charts', keys);
  const map = new Map(keyed.map((k) => [k.key, k.chart]));
  const ordered = order.map((key) => ({ key, chart: map.get(key) })).filter((x) => x.chart);
  const hideHandle = ordered.length <= 1;
  return ordered.map(({ key, chart }, index) => renderInsightCardSlot(
    key,
    renderInsightChartCardInner(chart, pageId),
    index,
    {
      hideHandle,
      fullWidth: chart.layout === 'full',
      halfWidth: chart.layout === 'half',
    },
  )).join('');
}

function renderInsightContent() {
  const content = document.getElementById('insight-content-area');
  if (!content) return;

  const data = getInsightPageData(insightState.page, insightState.period, getMetricsContext(insightState));
  if (!data) return;

  content.innerHTML = `
    ${renderInsightKpis(data.kpis, insightState.page)}
    <div class="insight-card-grid insight-chart-grid" data-card-grid="charts" data-page-id="${escapeHtml(insightState.page)}">
      ${renderInsightChartsMarkup(data.charts, insightState.page)}
    </div>
  `;

  initInsightCardDrag(content);
  scheduleInsightLayoutPass(content);
  bindInsightPopoverTriggers(content);
  bindRiskTableControls(content);
  bindInsightChartTooltips(content);
  bindDonutHoverSync(content);
}

function renderInsightPage() {
  const root = document.getElementById('insight-main');
  if (!root) return;

  ensureInsightShell(root);
  updateInsightToolbarState();
  renderInsightContent();

  const meta = getInsightPageMeta(insightState.page);
  if (meta) document.title = `${meta.title} | Dental Analytics`;
}

let insightChartTipEl = null;

function ensureInsightChartTip() {
  if (!insightChartTipEl) {
    insightChartTipEl = document.createElement('div');
    insightChartTipEl.id = 'insight-chart-tip';
    insightChartTipEl.className = 'insight-chart-tip';
    insightChartTipEl.hidden = true;
    document.body.appendChild(insightChartTipEl);
  }
  return insightChartTipEl;
}

function positionInsightChartTip(event, tip) {
  const margin = 14;
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  let x = event.clientX + margin;
  let y = event.clientY + margin;
  if (x + w > window.innerWidth - 8) x = event.clientX - w - margin;
  if (y + h > window.innerHeight - 8) y = event.clientY - h - margin;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}

function showInsightChartTip(el, event) {
  const tip = ensureInsightChartTip();
  const label = el.dataset.chartTipLabel || '';
  const value = el.dataset.chartTipValue || '';
  const sub = el.dataset.chartTipSub || '';
  tip.innerHTML = `
    <div class="insight-chart-tip__main">
      <span class="insight-chart-tip__label">${label}</span>
      <span class="insight-chart-tip__value">${value}</span>
    </div>
    ${sub ? `<span class="insight-chart-tip__sub">${sub}</span>` : ''}
    <span class="insight-chart-tip__hint">クリックで内訳</span>`;
  tip.hidden = false;
  positionInsightChartTip(event, tip);
}

function hideInsightChartTip() {
  if (insightChartTipEl) insightChartTipEl.hidden = true;
}

function bindInsightChartTooltips(scope = document) {
  scope.querySelectorAll('[data-chart-tip]').forEach((el) => {
    if (el.dataset.tipBound) return;
    el.dataset.tipBound = '1';

    el.addEventListener('mouseenter', (e) => showInsightChartTip(el, e));
    el.addEventListener('mousemove', (e) => {
      if (insightChartTipEl && !insightChartTipEl.hidden) {
        positionInsightChartTip(e, insightChartTipEl);
      }
    });
    el.addEventListener('mouseleave', hideInsightChartTip);
    el.addEventListener('blur', hideInsightChartTip);
  });
}

function bindDonutHoverSync(scope = document) {
  scope.querySelectorAll('[data-donut-group]').forEach((wrap) => {
    wrap.querySelectorAll('[data-donut-idx]').forEach((el) => {
      if (el.dataset.donutHoverBound) return;
      el.dataset.donutHoverBound = '1';
      const idx = el.dataset.donutIdx;
      el.addEventListener('mouseenter', () => {
        wrap.querySelectorAll(`[data-donut-idx="${idx}"]`).forEach((node) => {
          node.classList.add('insight-donut-seg--active');
        });
      });
      el.addEventListener('mouseleave', () => {
        wrap.querySelectorAll('[data-donut-idx]').forEach((node) => {
          node.classList.remove('insight-donut-seg--active');
        });
      });
    });
  });
}

function bindRiskTableControls(scope = document) {
  scope.querySelectorAll('[data-action="expand-risk-table"]').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const wrap = btn.closest('.insight-risk-table-wrap');
      if (!wrap) return;
      wrap.querySelectorAll('.insight-risk-row--hidden').forEach((row) => {
        row.classList.remove('insight-risk-row--hidden');
      });
      btn.remove();
    });
  });
}

function bindInsightPopoverTriggers(scope = document) {
  if (typeof openPopover !== 'function') return;

  const handleOpen = (btn, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    hideInsightChartTip();
    const type = btn.dataset.popoverType;
    if (!type) return;

    const triggerId = `${insightState.page}:${btn.dataset.popoverLabel || type}`;
    const options = typeof buildChartPopoverOptions === 'function'
      ? buildChartPopoverOptions(insightState.page, btn.dataset.popoverItemLabel || '', {
        chartTitle: btn.dataset.chartTitle || '',
        period: insightState.period,
        value: btn.dataset.popoverValue,
        series: btn.dataset.popoverSeries,
        patientId: btn.dataset.popoverPatientId,
      })
      : {};

    scope.querySelectorAll('[data-action="open-insight-popover"][aria-expanded="true"]')
      .forEach((el) => { el.setAttribute('aria-expanded', 'false'); });

    openPopover(type, insightState.period, btn.getBoundingClientRect(), triggerId, options);

    if (typeof popoverState !== 'undefined' && popoverState.open && popoverState.triggerId === triggerId) {
      btn.setAttribute('aria-expanded', 'true');
    }
  };

  scope.querySelectorAll('[data-action="open-insight-popover"]').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', (e) => handleOpen(btn, e));
    if (btn.tagName === 'path' || btn.getAttribute('role') === 'button') {
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') handleOpen(btn, e);
      });
    }
  });

  scope.querySelectorAll('.insight-table-row--clickable').forEach((row) => {
    if (row.dataset.bound) return;
    row.dataset.bound = '1';
    row.addEventListener('click', (e) => handleOpen(row, e));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        handleOpen(row, e);
      }
    });
  });
}

function initInsightPage() {
  parseInsightParams();
  syncAppStateFromInsight();
  renderNav();
  renderMeta();
  setupNavDragDrop();
  renderInsightPage();
  initPopoverEvents();
  if (!window.__insightKpiFitBound) {
    window.__insightKpiFitBound = true;
    window.addEventListener('resize', () => {
      const root = document.getElementById('insight-main');
      if (root) fitCompositeKpiValues(root);
    });
  }
}

window.onInsightNavChange = function onInsightNavChange() {
  syncInsightFromAppState();
  updateInsightUrl('replace');
  renderNav();
  setupNavDragDrop();
  updateInsightToolbarState();
  renderInsightContent();
};

if (!window.__insightPopstateBound) {
  window.__insightPopstateBound = true;
  window.addEventListener('popstate', () => {
    parseInsightParams();
    syncAppStateFromInsight();
    updateInsightToolbarState();
    renderInsightContent();
    const meta = getInsightPageMeta(insightState.page);
    if (meta) document.title = `${meta.title} | Dental Analytics`;
  });
}

initInsightPage();
