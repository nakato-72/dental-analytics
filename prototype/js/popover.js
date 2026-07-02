/**
 * リサイズ・ドラッグ可能な非モーダルポップオーバー
 */

const popoverState = {
  open: false,
  type: null,
  period: null,
  triggerId: null,
  titleSuffix: null,
  customRows: null,
  sortKey: null,
  sortDir: 'asc',
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  rowGap: 1,
};

const POPOVER_ANCHOR_MARGIN = 16;
const POPOVER_ANCHOR_GAP = 8;

let resizeSession = null;
let dragSession = null;
let suppressOutsideClose = false;

function getPopoverDateLabel(period) {
  const sub = MOCK_DATA.periodDetails[period]?.subtitle || '';
  const m = sub.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (m) return `${m[1]}/${String(m[2]).padStart(2, '0')}/${String(m[3]).padStart(2, '0')}`;
  const m2 = sub.match(/(\d{4})年(\d{1,2})月/);
  if (m2) return `${m2[1]}/${String(m2[2]).padStart(2, '0')}`;
  return sub.split('（')[0] || period;
}

function getDefaultPopoverRect() {
  const margin = 20;
  const width = Math.min(POPOVER_DEFAULT_SIZE.width, window.innerWidth - margin * 2);
  const height = Math.min(POPOVER_DEFAULT_SIZE.height, window.innerHeight - margin * 2);
  return {
    width,
    height,
    left: Math.round((window.innerWidth - width) / 2),
    top: Math.round(window.innerHeight * 0.1),
  };
}

function computeAnchorPopoverRect(anchorRect, rowCount = 3) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(
    POPOVER_DEFAULT_SIZE.width,
    viewportWidth - POPOVER_ANCHOR_MARGIN * 2,
  );
  const listHeight = rowCount === 0 ? 80 : Math.min(280, 56 + rowCount * 40);
  const height = Math.min(
    64 + listHeight,
    viewportHeight - POPOVER_ANCHOR_MARGIN * 2,
  );

  const spaceBelow = viewportHeight - anchorRect.bottom - POPOVER_ANCHOR_MARGIN - POPOVER_ANCHOR_GAP;
  const spaceAbove = anchorRect.top - POPOVER_ANCHOR_MARGIN - POPOVER_ANCHOR_GAP;
  const preferAbove = spaceBelow < height && spaceAbove > spaceBelow;

  let top = preferAbove
    ? anchorRect.top - POPOVER_ANCHOR_GAP - height
    : anchorRect.bottom + POPOVER_ANCHOR_GAP;

  let left = anchorRect.left;
  left = Math.min(left, viewportWidth - width - POPOVER_ANCHOR_MARGIN);
  left = Math.max(left, POPOVER_ANCHOR_MARGIN);
  top = Math.min(top, viewportHeight - height - POPOVER_ANCHOR_MARGIN);
  top = Math.max(top, POPOVER_ANCHOR_MARGIN);

  return clampPopoverRect({ left, top, width, height });
}

function openPopover(type, period, anchorRect, triggerId, options = {}) {
  if (triggerId && popoverState.open && popoverState.triggerId === triggerId) {
    closePopover();
    return;
  }

  popoverState.titleSuffix = options.titleSuffix || null;
  popoverState.customRows = options.rows || null;
  popoverState.sortKey = null;
  popoverState.sortDir = 'asc';

  const rows = resolvePopoverRows(type, period);
  const defaults = anchorRect
    ? computeAnchorPopoverRect(anchorRect, rows.length)
    : getDefaultPopoverRect();

  popoverState.open = true;
  popoverState.type = type;
  popoverState.period = period;
  popoverState.triggerId = triggerId || null;
  popoverState.width = defaults.width;
  popoverState.height = defaults.height;
  popoverState.left = defaults.left;
  popoverState.top = defaults.top;
  renderPopover();
}

function closePopover() {
  popoverState.open = false;
  popoverState.type = null;
  popoverState.period = null;
  popoverState.triggerId = null;
  popoverState.titleSuffix = null;
  popoverState.customRows = null;
  popoverState.sortKey = null;
  popoverState.sortDir = 'asc';
  document.querySelectorAll('[data-action="open-insight-popover"][aria-expanded="true"]')
    .forEach((el) => { el.setAttribute('aria-expanded', 'false'); });
  renderPopover();
}

function navigateToDetailPage(type, period) {
  const navState = typeof state !== 'undefined' ? state : {
    level: 'clinic',
    clinicId: '',
    role: '',
    staffId: '',
  };
  const params = new URLSearchParams({
    type,
    period,
    level: navState.level,
    clinicId: navState.clinicId || '',
    role: navState.role || '',
    staffId: navState.staffId || '',
  });
  window.location.href = `detail.html?${params.toString()}`;
}

function resolvePopoverConfig(type) {
  if (typeof getInsightPopoverConfig === 'function') {
    const insight = getInsightPopoverConfig(type);
    if (insight) return insight;
  }
  return typeof getPopoverConfig === 'function' ? getPopoverConfig(type) : null;
}

function resolvePopoverRows(type, period) {
  if (popoverState.customRows) return popoverState.customRows;
  if (typeof getInsightPopoverRows === 'function') {
    const insightRows = getInsightPopoverRows(type);
    if (insightRows.length) return insightRows;
  }
  return typeof getPopoverRows === 'function' ? getPopoverRows(type, period) : [];
}

const POPOVER_DRAG_HANDLE = `
  <svg class="popover-drag-icon" width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">
    <circle cx="2" cy="2" r="1.2" fill="currentColor"/>
    <circle cx="8" cy="2" r="1.2" fill="currentColor"/>
    <circle cx="2" cy="8" r="1.2" fill="currentColor"/>
    <circle cx="8" cy="8" r="1.2" fill="currentColor"/>
    <circle cx="2" cy="14" r="1.2" fill="currentColor"/>
    <circle cx="8" cy="14" r="1.2" fill="currentColor"/>
  </svg>
`;

const POPOVER_YEN_COLUMN_KEYS = new Set([
  'amount', 'insurance', 'selfPay', 'total', 'ltv', 'collected', 'receivable', 'receivables',
]);

function isPopoverYenColumn(col) {
  if (!col) return false;
  if (col.format === 'yen') return true;
  if (POPOVER_YEN_COLUMN_KEYS.has(col.key)) return true;
  const label = col.label || '';
  return /金額|売上|未収|入金|保険|自費|合計|LTV|単価/.test(label);
}

function formatYenDisplay(val) {
  if (val == null || val === '' || val === '—') return '—';
  const s = String(val).trim();
  if (s.startsWith('¥')) return s;
  const n = typeof val === 'number' ? val : Number(s.replace(/[¥,\s]/g, ''));
  if (!Number.isNaN(n) && (typeof val === 'number' || /^[\d,.¥\s-]+$/.test(s))) {
    return `¥${Math.round(n).toLocaleString('ja-JP')}`;
  }
  return `¥${s}`;
}

function formatPopoverCellDisplay(col, val) {
  if (val == null || val === '') return '—';
  if (isPopoverYenColumn(col)) return formatYenDisplay(val);
  return val;
}

function parsePopoverCellSortValue(val) {
  if (val == null || val === '—') return null;
  const s = String(val).trim();
  const yen = s.match(/¥\s*([\d,]+)/);
  if (yen) return Number(yen[1].replace(/,/g, ''));
  const plainNum = s.replace(/,/g, '').match(/^-?\d+(?:\.\d+)?$/);
  if (plainNum) return Number(plainNum[0]);
  const embedded = s.match(/-?\d+(?:\.\d+)?/);
  if (embedded && /^[\d¥+-]/.test(s)) return Number(embedded[0].replace(/,/g, ''));
  return s.toLowerCase();
}

function comparePopoverCellValues(va, vb, dir) {
  const mult = dir === 'desc' ? -1 : 1;
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;
  if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mult;
  return String(va).localeCompare(String(vb), 'ja') * mult;
}

function sortPopoverTableRows(rows, sortKey, sortDir) {
  if (!sortKey || !rows?.length) return rows || [];
  return [...rows].sort((a, b) =>
    comparePopoverCellValues(
      parsePopoverCellSortValue(a[sortKey]),
      parsePopoverCellSortValue(b[sortKey]),
      sortDir,
    ),
  );
}

function togglePopoverSortState(state, key) {
  if (state.sortKey === key) {
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortKey = key;
    state.sortDir = 'asc';
  }
}

function renderPopoverSortIcon(sortKey, sortDir, colKey) {
  if (sortKey !== colKey) return '↕';
  return sortDir === 'asc' ? '↑' : '↓';
}

function renderPopoverTableCell(col, val) {
  const display = formatPopoverCellDisplay(col, val);
  if (col.key === 'cancelType') {
    const cls = CANCEL_TYPE_CLASS[display] || '';
    return `<td><span class="cancel-type-badge ${cls}">${display}</span></td>`;
  }
  return `<td>${display}</td>`;
}

function renderPopoverTableHeadRow(config, sortKey, sortDir) {
  return config.columns.map((c) => {
    const active = sortKey === c.key ? ' popover-sort-btn--active' : '';
    const icon = renderPopoverSortIcon(sortKey, sortDir, c.key);
    return `<th class="popover-th-sortable"><button type="button" class="popover-sort-btn${active}" data-action="popover-sort" data-sort-key="${c.key}" title="クリックで並び替え">${c.label}<span class="popover-sort-icon" aria-hidden="true">${icon}</span></button></th>`;
  }).join('');
}

function renderPopoverTableBodyRows(config, rows, sortKey, sortDir) {
  const sortedRows = sortPopoverTableRows(rows, sortKey, sortDir);
  return sortedRows.map((row) => `
    <tr>
      ${config.columns.map((col) => renderPopoverTableCell(col, row[col.key] ?? '—')).join('')}
    </tr>
  `).join('');
}

function updatePopoverTableSortUI(table, config, sortKey, sortDir) {
  config.columns.forEach((col) => {
    const btn = table.querySelector(`[data-sort-key="${col.key}"]`);
    if (!btn) return;
    btn.classList.toggle('popover-sort-btn--active', sortKey === col.key);
    const icon = btn.querySelector('.popover-sort-icon');
    if (icon) icon.textContent = renderPopoverSortIcon(sortKey, sortDir, col.key);
  });
}

function updatePopoverTableSortInPlace(type, rows, sortState) {
  const config = resolvePopoverConfig(type);
  if (!config) return false;

  const table = document.querySelector('.popover-panel .popover-table');
  if (!table) return false;

  const tbody = table.querySelector('tbody');
  if (!tbody) return false;

  const { sortKey, sortDir } = sortState;
  updatePopoverTableSortUI(table, config, sortKey, sortDir);
  tbody.innerHTML = renderPopoverTableBodyRows(config, rows, sortKey, sortDir);
  return true;
}

function renderPopoverTable(type, rows, options = {}) {
  const config = resolvePopoverConfig(type);
  if (!config) return '';

  const {
    sortKey = null,
    sortDir = 'asc',
    rowGap = 1,
    wrapperClass = 'popover-table-wrap',
    tableClass = 'popover-table',
  } = options;

  const head = renderPopoverTableHeadRow(config, sortKey, sortDir);
  const body = renderPopoverTableBodyRows(config, rows, sortKey, sortDir);

  return `
    <div class="${wrapperClass}">
      <table class="${tableClass} popover-table--gap-${rowGap}">
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function renderPopover() {
  const root = document.getElementById('popover-root');
  if (!root) return;

  if (!popoverState.open || !popoverState.type) {
    root.innerHTML = '';
    root.classList.remove('is-open');
    return;
  }

  const config = resolvePopoverConfig(popoverState.type);
  const rows = resolvePopoverRows(popoverState.type, popoverState.period);
  const { left, top, width, height } = popoverState;
  const dateLabel = getPopoverDateLabel(popoverState.period);

  const titleExtra = popoverState.titleSuffix ? ` — ${popoverState.titleSuffix}` : '';
  root.classList.add('is-open');
  root.innerHTML = `
    <div class="popover-panel" style="left:${left}px;top:${top}px;width:${width}px;height:${height}px" role="dialog" aria-label="${config.title}">
      <div class="popover-resize popover-resize--n" data-resize="n" aria-hidden="true"></div>
      <div class="popover-resize popover-resize--s" data-resize="s" aria-hidden="true"></div>
      <div class="popover-resize popover-resize--e" data-resize="e" aria-hidden="true"></div>
      <div class="popover-resize popover-resize--w" data-resize="w" aria-hidden="true"></div>
      <div class="popover-resize popover-resize--nw" data-resize="nw" aria-hidden="true"></div>
      <div class="popover-resize popover-resize--ne" data-resize="ne" aria-hidden="true"></div>
      <div class="popover-resize popover-resize--sw" data-resize="sw" aria-hidden="true"></div>
      <div class="popover-resize popover-resize--se" data-resize="se" aria-hidden="true"></div>
      <div class="popover-header">
        <button type="button" class="popover-drag-handle" data-action="popover-drag" aria-label="ドラッグして移動">
          ${POPOVER_DRAG_HANDLE}
        </button>
        <div class="popover-header-text">
          <h3 class="popover-title">${config.title}${titleExtra}（${rows.length}件）</h3>
          <span class="popover-date">${dateLabel}</span>
        </div>
        <div class="popover-header-controls">
          <label class="popover-row-gap" title="行間">
            <span class="popover-row-gap-label">行間</span>
            <input type="range" class="popover-row-gap-input" min="0" max="2" step="1" value="${popoverState.rowGap}" data-action="popover-row-gap" aria-label="行間" />
          </label>
          <button type="button" class="popover-btn popover-btn--expand" data-action="popover-expand" title="拡大表示（専用ページ）" aria-label="拡大表示">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          </button>
          <button type="button" class="popover-btn popover-btn--close" data-action="popover-close" title="閉じる" aria-label="閉じる">×</button>
        </div>
      </div>
      <div class="popover-body">
        ${renderPopoverTable(popoverState.type, rows, {
          sortKey: popoverState.sortKey,
          sortDir: popoverState.sortDir,
          rowGap: popoverState.rowGap,
        })}
      </div>
    </div>
  `;
}

function clampPopoverRect(rect) {
  const minW = 640;
  const minH = 320;
  const maxW = window.innerWidth - 16;
  const maxH = window.innerHeight - 16;
  let { left, top, width, height } = rect;
  width = Math.max(minW, Math.min(width, maxW));
  height = Math.max(minH, Math.min(height, maxH));
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
  top = Math.max(8, Math.min(top, window.innerHeight - height - 8));
  return { left, top, width, height };
}

function applyPanelRect(rect) {
  Object.assign(popoverState, rect);
  const panel = document.querySelector('.popover-panel');
  if (panel) {
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.width = `${rect.width}px`;
    panel.style.height = `${rect.height}px`;
  }
}

function onResizeMove(e) {
  if (!resizeSession) return;
  const dx = e.clientX - resizeSession.startX;
  const dy = e.clientY - resizeSession.startY;
  const { corner, startLeft, startTop, startWidth, startHeight } = resizeSession;
  let left = startLeft;
  let top = startTop;
  let width = startWidth;
  let height = startHeight;

  if (corner.includes('e')) width = startWidth + dx;
  if (corner.includes('w')) {
    width = startWidth - dx;
    left = startLeft + dx;
  }
  if (corner.includes('s')) height = startHeight + dy;
  if (corner.includes('n')) {
    height = startHeight - dy;
    top = startTop + dy;
  }

  applyPanelRect(clampPopoverRect({ left, top, width, height }));
}

function onDragMove(e) {
  if (!dragSession) return;
  const dx = e.clientX - dragSession.startX;
  const dy = e.clientY - dragSession.startY;
  applyPanelRect(clampPopoverRect({
    left: dragSession.startLeft + dx,
    top: dragSession.startTop + dy,
    width: dragSession.startWidth,
    height: dragSession.startHeight,
  }));
}

function onPointerEnd() {
  if (resizeSession || dragSession) {
    suppressOutsideClose = true;
    requestAnimationFrame(() => { suppressOutsideClose = false; });
  }
  resizeSession = null;
  dragSession = null;
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onPointerEnd);
  document.body.classList.remove('popover-resizing', 'popover-dragging', 'popover-resize-ew', 'popover-resize-ns');
}

function startResize(corner, e) {
  e.preventDefault();
  e.stopPropagation();
  suppressOutsideClose = true;
  resizeSession = {
    corner,
    startX: e.clientX,
    startY: e.clientY,
    startLeft: popoverState.left,
    startTop: popoverState.top,
    startWidth: popoverState.width,
    startHeight: popoverState.height,
  };
  document.body.classList.add('popover-resizing');
  if (corner === 'e' || corner === 'w') document.body.classList.add('popover-resize-ew');
  if (corner === 'n' || corner === 's') document.body.classList.add('popover-resize-ns');
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', onPointerEnd);
}

function startDrag(e) {
  e.preventDefault();
  e.stopPropagation();
  suppressOutsideClose = true;
  dragSession = {
    startX: e.clientX,
    startY: e.clientY,
    startLeft: popoverState.left,
    startTop: popoverState.top,
    startWidth: popoverState.width,
    startHeight: popoverState.height,
  };
  document.body.classList.add('popover-dragging');
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onPointerEnd);
}

function initPopoverEvents() {
  const root = document.getElementById('popover-root');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = '1';

  document.addEventListener('mousedown', (e) => {
    if (!popoverState.open) return;

    const handle = e.target.closest('[data-resize]');
    if (handle) {
      startResize(handle.dataset.resize, e);
      return;
    }

    const panel = e.target.closest('.popover-panel');
    if (!panel) return;

    if (e.target.closest('[data-action="popover-drag"]') || e.target.closest('.popover-header-text')) {
      if (!e.target.closest('.popover-header-controls')) startDrag(e);
    }
  });

  root.addEventListener('input', (e) => {
    if (e.target.dataset.action === 'popover-row-gap') {
      popoverState.rowGap = Number(e.target.value);
      const table = document.querySelector('.popover-table');
      if (table) {
        table.classList.remove('popover-table--gap-0', 'popover-table--gap-1', 'popover-table--gap-2');
        table.classList.add(`popover-table--gap-${popoverState.rowGap}`);
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && popoverState.open) closePopover();
  });

  document.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'popover-close') {
      closePopover();
      return;
    }
    if (action === 'popover-expand' && popoverState.type) {
      navigateToDetailPage(popoverState.type, popoverState.period);
      return;
    }
    if (action === 'popover-sort') {
      const key = e.target.closest('[data-sort-key]')?.dataset.sortKey;
      if (!key || !popoverState.open) return;
      e.preventDefault();
      e.stopPropagation();
      togglePopoverSortState(popoverState, key);
      const rows = resolvePopoverRows(popoverState.type, popoverState.period);
      if (!updatePopoverTableSortInPlace(popoverState.type, rows, popoverState)) {
        renderPopover();
      }
      return;
    }

    if (!popoverState.open || suppressOutsideClose) return;
    if (e.target.closest('.popover-panel')) return;
    if (e.target.closest('[data-action="open-popover"]')) return;
    if (e.target.closest('[data-action="open-insight-popover"]')) return;
    closePopover();
  });
}
