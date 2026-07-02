/**
 * ポップオーバー拡大表示 — 専用ページ
 */

const detailSortState = {
  sortKey: null,
  sortDir: 'asc',
};

function renderDetailTable(type, rows) {
  const config = (typeof getInsightPopoverConfig === 'function' && getInsightPopoverConfig(type))
    || getPopoverConfig(type);
  if (!config) return '<p>データが見つかりません。</p>';

  return renderPopoverTable(type, rows, {
    sortKey: detailSortState.sortKey,
    sortDir: detailSortState.sortDir,
    wrapperClass: 'detail-page-table-wrap',
    tableClass: 'detail-page-table popover-table',
  });
}

function updateDetailTableSortInPlace(type, rows) {
  const config = (typeof getInsightPopoverConfig === 'function' && getInsightPopoverConfig(type))
    || getPopoverConfig(type);
  if (!config) return false;

  const table = document.querySelector('.detail-page-table');
  if (!table) return false;

  const tbody = table.querySelector('tbody');
  if (!tbody) return false;

  updatePopoverTableSortUI(table, config, detailSortState.sortKey, detailSortState.sortDir);
  tbody.innerHTML = renderPopoverTableBodyRows(
    config,
    rows,
    detailSortState.sortKey,
    detailSortState.sortDir,
  );
  return true;
}

function initDetailPage() {
  const params = new URLSearchParams(window.location.search);
  const type = params.get('type');
  const period = params.get('period') || '本日';
  const level = params.get('level') || 'clinic';

  const config = (typeof getInsightPopoverConfig === 'function' && getInsightPopoverConfig(type))
    || getPopoverConfig(type);
  if (!config) {
    document.getElementById('detail-title').textContent = '詳細が見つかりません';
    return;
  }

  const levelLabel = { all: '全院', clinic: '医院', role: '職種', staff: '担当' }[level] || '';
  const rows = (typeof getInsightPopoverRows === 'function' && getInsightPopoverRows(type).length
    ? getInsightPopoverRows(type)
    : getPopoverRows(type, period));

  document.title = `${config.title} | Dental Analytics`;
  document.getElementById('detail-title').textContent = config.title;
  document.getElementById('detail-meta').textContent = `${levelLabel} · ${period} · 全${rows.length}件`;

  const content = document.getElementById('detail-content');
  content.innerHTML = renderDetailTable(type, rows);

  content.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action !== 'popover-sort') return;
    const key = e.target.closest('[data-sort-key]')?.dataset.sortKey;
    if (!key) return;
    e.preventDefault();
    e.stopPropagation();
    togglePopoverSortState(detailSortState, key);
    if (!updateDetailTableSortInPlace(type, rows)) {
      content.innerHTML = renderDetailTable(type, rows);
    }
  });
}

initDetailPage();
