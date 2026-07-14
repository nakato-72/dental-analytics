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

function setupDetailBackLink(params) {
  const back = document.getElementById('detail-page-back');
  const label = document.getElementById('detail-page-back-label');
  if (!back) return;

  const safeReturn = typeof sanitizeDetailReturnUrl === 'function'
    ? sanitizeDetailReturnUrl(params.get('return'))
    : null;

  if (safeReturn) {
    back.href = safeReturn;
    if (label) {
      label.textContent = safeReturn.startsWith('insight.html')
        ? 'インサイトに戻る'
        : 'ダッシュボードに戻る';
    }
    return;
  }

  // return が無い場合は階層パラメータからインサイトURLを復元
  const level = params.get('level') || 'clinic';
  const period = params.get('period') || '本日';
  const clinicId = params.get('clinicId') || '';
  const role = params.get('role') || '';
  const staffId = params.get('staffId') || '';
  const page = params.get('page');
  if (page) {
    const insightParams = new URLSearchParams({ page, period, level });
    if (clinicId) insightParams.set('clinicId', clinicId);
    if (role) insightParams.set('role', role);
    if (staffId) insightParams.set('staffId', staffId);
    back.href = `insight.html?${insightParams.toString()}`;
    if (label) label.textContent = 'インサイトに戻る';
  }
}

function initDetailPage() {
  const params = new URLSearchParams(window.location.search);
  const type = typeof normalizePopoverType === 'function'
    ? normalizePopoverType(params.get('type'))
    : params.get('type');
  const period = params.get('period') || '本日';
  const level = params.get('level') || 'clinic';

  setupDetailBackLink(params);

  const config = (typeof getInsightPopoverConfig === 'function' && getInsightPopoverConfig(type))
    || getPopoverConfig(type);
  if (!config) {
    document.getElementById('detail-title').textContent = '詳細が見つかりません';
    return;
  }

  const levelLabel = { all: '全院', clinic: '医院', role: '職種', staff: '担当' }[level] || '';
  const clinicId = params.get('clinicId') || 'clinic-sakura';
  const role = params.get('role') || null;
  const staffId = params.get('staffId') || null;
  const metricsContext = typeof getMetricsContext === 'function'
    ? getMetricsContext({ level, clinicId, role, staffId })
    : { entityKey: 'clinic-sakura', weight: 1 };
  const detail = typeof resolvePeriodDetail === 'function'
    ? resolvePeriodDetail(period, metricsContext)
    : null;
  const popoverOpts = { period, detail, metricsContext, entityKey: metricsContext.entityKey };
  const insightRows = typeof getInsightPopoverRows === 'function'
    ? getInsightPopoverRows(type, popoverOpts)
    : [];
  const rows = insightRows.length ? insightRows : getPopoverRows(type, period, popoverOpts);

  document.title = `${config.title} | Dental Analytics`;
  document.getElementById('detail-title').textContent = config.title;
  document.getElementById('detail-meta').textContent = `${levelLabel} · ${period} · 全${rows.length}件`;

  const content = document.getElementById('detail-content');
  content.innerHTML = renderDetailTable(type, rows);
  if (typeof initPopoverColumnResizeForDetail === 'function') {
    initPopoverColumnResizeForDetail();
  }

  content.addEventListener('click', (e) => {
    if (e.target.closest('[data-col-resize]')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
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
