/**
 * インサイト詳細ページ — 経営指標カード別のモックデータ
 */

const INSIGHT_PAGE_ORDER = [
  'unitPrice', 'staffSales',
  'visits', 'appointments',
  'utilization', 'selfPay', 'questionnaire',
];

/** 廃止タブなど旧 page パラメータ → 現行ページ */
const INSIGHT_PAGE_ALIASES = {
  newPatients: 'visits',
  receivables: 'unitPrice',
  dropout: 'visits',
  webBooking: 'appointments',
};

const INSIGHT_PAGES = {
  unitPrice: { title: '売上内訳', shortLabel: '売上', icon: '¥', accent: '#0ea5e9', group: '売上・入金' },
  staffSales: { title: '職種別売上', shortLabel: '職種別', icon: 'Dr', accent: '#6366f1', group: '売上・入金' },
  visits: { title: '患者数', shortLabel: '患者', icon: '患', accent: '#06b6d4', group: '患者・予約' },
  appointments: { title: '予約数', shortLabel: '予約', icon: '予', accent: '#0891b2', group: '患者・予約' },
  utilization: { title: '稼働率', shortLabel: '稼働', icon: '%', accent: '#10b981', group: '運営効率' },
  selfPay: { title: '自費売上', shortLabel: '自費', icon: '自', accent: '#ec4899', group: '売上・入金' },
  questionnaire: { title: '問診回答率', shortLabel: '問診', icon: '問', accent: '#8b5cf6', group: '患者・予約' },
};

const PERIOD_LABELS_INSIGHT = { '前日': '前日', '本日': '本日', '今月': '今月', '今年': '今年' };

function insightTrend(text, up) {
  return { text, up: up !== false };
}

/**
 * インサイトの「現在日」から月（1〜12）を取得。本日=6/23 → 6
 */
function resolveInsightAsOfMonth(detail) {
  const sub = detail?.subtitle
    || (typeof MOCK_DATA !== 'undefined' && MOCK_DATA.periodDetails?.['本日']?.subtitle)
    || '';
  const m = String(sub).match(/(\d{1,2})月/);
  if (m) return Number(m[1]);
  return 12;
}

/** 年別チャートのフォーカス（今年タブ → 2026 など） */
function resolveInsightYearlyFocus(detail) {
  const labels = detail?.charts?.labels || [];
  let focusIndex = detail?.charts?.highlightIndex;
  if (!Number.isInteger(focusIndex) || focusIndex < 0 || focusIndex >= labels.length) {
    const sub = detail?.subtitle || '';
    const yearMatch = String(sub).match(/(\d{4})年/);
    if (yearMatch) {
      const idx = labels.findIndex((l) => String(l) === yearMatch[1]);
      focusIndex = idx >= 0 ? idx : Math.max(0, labels.length - 1);
    } else {
      focusIndex = Math.max(0, labels.length - 1);
    }
  }
  return { focusIndex, focusLabel: '今年' };
}

/** 前日/本日タブの日別チャートフォーカス */
function resolveInsightDailyFocus(period, detail) {
  const anchorDay = typeof parseAnchorDayFromSubtitle === 'function'
    ? parseAnchorDayFromSubtitle(detail?.subtitle)
    : 1;
  return {
    focusIndex: Math.max(0, anchorDay - 1),
    focusLabel: period === '本日' ? '今日' : (period === '前日' ? '前日' : ''),
  };
}

/** 日別積み上げチャートの共通表示オプション（全幅・Y軸・フォーカス） */
function buildInsightDailyStackedExtras(period, detail, metricsContext, weight, yAxisResolver) {
  const { focusIndex, focusLabel } = resolveInsightDailyFocus(period, detail);
  const yAxisMax = typeof yAxisResolver === 'function'
    ? yAxisResolver(metricsContext, weight)
    : undefined;
  return {
    layout: 'full',
    showYAxis: true,
    denseLabels: true,
    focusIndex,
    focusLabel,
    yAxisMax,
  };
}

function appendFocusSubtitle(subtitle, focusLabel) {
  if (!focusLabel) return subtitle;
  return `${subtitle} — ${focusLabel}をハイライト`;
}

function withChartAxis(chart) {
  if (!chart || chart.type === 'donut' || chart.type === 'table' || chart.type === 'risk-table' || chart.type === 'survey-pie') {
    return chart;
  }
  if (chart.type === 'stacked-bar' || chart.type === 'bar' || chart.type === 'grouped-bar' || chart.type === 'hbar') {
    return { showYAxis: true, ...chart };
  }
  if (chart.type === 'sparkline' || chart.type === 'compare-line') {
    return { showYAxis: true, ...chart };
  }
  return chart;
}

/**
 * 月別（1〜12月）。periodDetails の charts を正本とし、未来月は 0。
 */
function buildYearMonthRevenue(detail, weight = 1) {
  const labels = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
  const idx = new Map((detail?.charts?.labels || []).map((l, i) => [String(l), i]));
  const pick = (arr, label) => {
    const i = idx.get(label);
    return i != null && Array.isArray(arr) ? arr[i] : 0;
  };
  const asOfMonth = resolveInsightAsOfMonth(detail);

  const mapSeries = (arr) => labels.map((m, mi) => {
    if (mi + 1 > asOfMonth) return 0;
    return Math.round(pick(arr, m) * weight);
  });

  return {
    labels,
    insurance: mapSeries(detail?.charts?.insurance),
    selfPay: mapSeries(detail?.charts?.selfPay),
    products: mapSeries(detail?.charts?.products),
    asOfMonth,
    focusIndex: asOfMonth - 1,
  };
}

/** 当月全日の日別売上（今月累計と前日/本日の確定値から派生） */
function buildMonthlyDailyRevenue(detail, period, metricsContext, weight = 1) {
  const ctx = metricsContext || { entityKey: 'clinic-sakura', weight };
  const monthDetail = typeof resolvePeriodDetail === 'function'
    ? resolvePeriodDetail('今月', ctx)
    : MOCK_DATA.periodDetails['今月'];
  const todayDetail = typeof resolvePeriodDetail === 'function'
    ? resolvePeriodDetail('本日', ctx)
    : MOCK_DATA.periodDetails['本日'];
  const yesterdayDetail = typeof resolvePeriodDetail === 'function'
    ? resolvePeriodDetail('前日', ctx)
    : MOCK_DATA.periodDetails['前日'];
  if (typeof buildMonthlyDailyRevenueFromDetails === 'function') {
    return buildMonthlyDailyRevenueFromDetails(monthDetail, detail, weight, {
      entityKey: ctx.entityKey || 'clinic-sakura',
      todayDetail,
      yesterdayDetail,
      throughDay: typeof parseAnchorDayFromSubtitle === 'function'
        ? parseAnchorDayFromSubtitle(todayDetail?.subtitle)
        : undefined,
    });
  }
  return buildPeriodRevenueTrend(detail, weight);
}

/** 当月全日の日別職種別売上 */
function buildMonthlyDailyStaffSales(detail, period, metricsContext, weight = 1) {
  const ctx = metricsContext || { entityKey: 'clinic-sakura', weight };
  const monthDetail = typeof resolvePeriodDetail === 'function'
    ? resolvePeriodDetail('今月', ctx)
    : MOCK_DATA.periodDetails['今月'];
  const todayDetail = typeof resolvePeriodDetail === 'function'
    ? resolvePeriodDetail('本日', ctx)
    : MOCK_DATA.periodDetails['本日'];
  const yesterdayDetail = typeof resolvePeriodDetail === 'function'
    ? resolvePeriodDetail('前日', ctx)
    : MOCK_DATA.periodDetails['前日'];
  if (typeof buildMonthlyDailyStaffSalesFromDetails === 'function') {
    return buildMonthlyDailyStaffSalesFromDetails(monthDetail, detail, weight, {
      entityKey: ctx.entityKey || 'clinic-sakura',
      todayDetail,
      yesterdayDetail,
      splitDetail: todayDetail,
      throughDay: typeof parseAnchorDayFromSubtitle === 'function'
        ? parseAnchorDayFromSubtitle(todayDetail?.subtitle)
        : undefined,
    });
  }
  const daily = buildMonthlyDailyRevenue(detail, period, ctx, weight);
  const totals = daily.labels.map((_, i) =>
    (daily.insurance[i] || 0) + (daily.selfPay[i] || 0) + (daily.products[i] || 0),
  );
  const split = typeof splitStaffTotalsFromDetail === 'function'
    ? splitStaffTotalsFromDetail(detail, ctx.entityKey, totals)
    : splitStaffSalesTotals(totals);
  return { labels: daily.labels, ...split };
}

/** 月別（1〜12月）職種別売上 */
function buildYearMonthStaffSales(detail, weight = 1, entityKey = 'clinic-sakura') {
  const ym = buildYearMonthRevenue(detail, weight);
  const totals = ym.labels.map((_, i) =>
    (ym.insurance[i] || 0) + (ym.selfPay[i] || 0) + (ym.products[i] || 0),
  );
  const split = typeof splitStaffTotalsFromDetail === 'function'
    ? splitStaffTotalsFromDetail(detail, entityKey, totals)
    : splitStaffSalesTotals(totals);
  return { labels: ym.labels, ...split };
}

/** 年別職種別売上 */
function buildYearlyStaffSales(detail, weight = 1, entityKey = 'clinic-sakura') {
  const labels = detail.charts?.labels || [];
  const totals = labels.map((_, i) => Math.round(
    ((detail.charts?.insurance?.[i] || 0)
      + (detail.charts?.selfPay?.[i] || 0)
      + (detail.charts?.products?.[i] || 0)) * weight,
  ));
  const split = typeof splitStaffTotalsFromDetail === 'function'
    ? splitStaffTotalsFromDetail(detail, entityKey, totals)
    : splitStaffSalesTotals(totals);
  return { labels, ...split };
}

function buildStaffSalesTrendChart(period, detail, weight = 1, metricsContext = null) {
  const entityKey = metricsContext?.entityKey || 'clinic-sakura';
  const series = (data) => [
    { name: 'Dr', color: '#2563eb', values: data.dr },
    { name: 'DH', color: '#0891b2', values: data.dh },
  ];

  if (period === '今年') {
    const yearly = buildYearlyStaffSales(detail, weight, entityKey);
    const { focusIndex, focusLabel } = resolveInsightYearlyFocus(detail);
    return {
      title: '年別売上推移',
      subtitle: appendFocusSubtitle('年別（Dr / DH）', focusLabel),
      type: 'stacked-bar',
      valueFormat: 'yen',
      focusIndex,
      focusLabel,
      labels: yearly.labels,
      series: series(yearly),
    };
  }

  if (period === '今月') {
    const monthly = buildYearMonthStaffSales(detail, weight, entityKey);
    const asOfMonth = typeof resolveInsightAsOfMonth === 'function'
      ? resolveInsightAsOfMonth(detail)
      : 6;
    return {
      title: '月別売上推移',
      subtitle: `2026年1〜${asOfMonth}月（6/23時点・Dr / DH）`,
      type: 'stacked-bar',
      valueFormat: 'yen',
      focusIndex: asOfMonth - 1,
      focusLabel: '今月',
      labels: monthly.labels,
      series: series(monthly),
    };
  }

  const daily = buildMonthlyDailyStaffSales(detail, period, metricsContext, weight);
  const { focusLabel } = resolveInsightDailyFocus(period, detail);
  return {
    id: 'daily-staff-sales-trend',
    title: '日別売上推移',
    subtitle: appendFocusSubtitle('当月の全日（Dr / DH）', focusLabel),
    type: 'stacked-bar',
    valueFormat: 'yen',
    labels: daily.labels,
    series: series(daily),
    ...buildInsightDailyStackedExtras(
      period,
      detail,
      metricsContext,
      weight,
      typeof resolveMonthlyDailyYAxisMax === 'function' ? resolveMonthlyDailyYAxisMax : null,
    ),
  };
}

/** 当月全日の日別予約ステータス（患者数・予約内訳から派生） */
function buildMonthlyDailyAppointments(detail, metricsContext, weight = 1) {
  const ctx = metricsContext || { entityKey: 'clinic-sakura', weight };
  const monthDetail = typeof resolvePeriodDetail === 'function'
    ? resolvePeriodDetail('今月', ctx)
    : MOCK_DATA.periodDetails['今月'];
  const todayDetail = typeof resolvePeriodDetail === 'function'
    ? resolvePeriodDetail('本日', ctx)
    : MOCK_DATA.periodDetails['本日'];
  const yesterdayDetail = typeof resolvePeriodDetail === 'function'
    ? resolvePeriodDetail('前日', ctx)
    : MOCK_DATA.periodDetails['前日'];
  if (typeof buildMonthlyDailyAppointmentsFromDetails === 'function') {
    return buildMonthlyDailyAppointmentsFromDetails(monthDetail, detail, weight, {
      entityKey: ctx.entityKey || 'clinic-sakura',
      todayDetail,
      yesterdayDetail,
      throughDay: typeof parseAnchorDayFromSubtitle === 'function'
        ? parseAnchorDayFromSubtitle(todayDetail?.subtitle)
        : undefined,
    });
  }
  return { labels: [], visited: [], notVisited: [], cancelled: [], noShow: [] };
}

function buildYearMonthAppointments(detail, weight = 1) {
  if (typeof buildYearMonthAppointmentsFromDetails === 'function') {
    return buildYearMonthAppointmentsFromDetails(detail, weight);
  }
  return { labels: [], visited: [], notVisited: [], cancelled: [], noShow: [] };
}

function buildYearlyAppointments(detail, weight = 1) {
  if (typeof buildYearlyAppointmentsFromDetails === 'function') {
    return buildYearlyAppointmentsFromDetails(detail, weight);
  }
  return { labels: [], visited: [], notVisited: [], cancelled: [], noShow: [] };
}

function normalizeApptChartData(data) {
  const visited = data.visited || [];
  const len = visited.length;
  const cancelSameDay = data.cancelSameDay || [];
  const cancelAdvance = data.cancelAdvance || [];
  const cancelled = data.cancelled || [];
  const noShow = data.noShow || [];
  return {
    visited,
    notVisited: data.notVisited || [],
    cancelSameDay: Array.from({ length: len }, (_, i) => {
      if (cancelSameDay[i] != null) return cancelSameDay[i];
      const c = cancelled[i] || 0;
      return Math.round(c * 0.45);
    }),
    cancelAdvance: Array.from({ length: len }, (_, i) => {
      if (cancelAdvance[i] != null) return cancelAdvance[i];
      const c = cancelled[i] || 0;
      const sd = cancelSameDay[i] != null ? cancelSameDay[i] : Math.round(c * 0.45);
      return Math.max(0, c - sd);
    }),
    noShow: Array.from({ length: len }, (_, i) => noShow[i] || 0),
  };
}

function buildAppointmentStatusTrendChart(period, detail, weight = 1, metricsContext = null) {
  const series = (raw) => {
    const data = normalizeApptChartData(raw);
    return [
      { name: '来院済', color: '#10b981', values: data.visited },
      { name: '未来院', color: '#0ea5e9', values: data.notVisited },
      { name: '当日CXL', color: '#eab308', values: data.cancelSameDay },
      { name: '前日以降CXL', color: '#f59e0b', values: data.cancelAdvance },
      { name: '無断', color: '#ef4444', values: data.noShow },
    ];
  };
  const subBase = '来院済 / 未来院 / 当日CXL / 前日以降CXL / 無断';

  if (period === '今年') {
    const yearly = buildYearlyAppointments(detail, weight);
    const { focusIndex, focusLabel } = resolveInsightYearlyFocus(detail);
    return {
      title: '予約ステータス推移',
      subtitle: appendFocusSubtitle(`年別（${subBase}）`, focusLabel),
      type: 'stacked-bar',
      focusIndex,
      focusLabel,
      labels: yearly.labels,
      series: series(yearly),
    };
  }

  if (period === '今月') {
    const monthly = buildYearMonthAppointments(detail, weight);
    const asOfMonth = typeof resolveInsightAsOfMonth === 'function'
      ? resolveInsightAsOfMonth(detail)
      : 6;
    return {
      title: '予約ステータス推移',
      subtitle: `2026年1〜${asOfMonth}月（6/23時点・${subBase}）— 今月をハイライト`,
      type: 'stacked-bar',
      focusIndex: asOfMonth - 1,
      focusLabel: '今月',
      labels: monthly.labels,
      series: series(monthly),
    };
  }

  const daily = buildMonthlyDailyAppointments(detail, metricsContext, weight);
  const { focusLabel } = resolveInsightDailyFocus(period, detail);
  return {
    id: 'daily-appointment-trend',
    title: '予約ステータス推移',
    subtitle: appendFocusSubtitle(`当月の全日（${subBase}）`, focusLabel),
    type: 'stacked-bar',
    labels: daily.labels,
    series: series(daily),
    ...buildInsightDailyStackedExtras(
      period,
      detail,
      metricsContext,
      weight,
      typeof resolveMonthlyDailyAppointmentYAxisMax === 'function'
        ? resolveMonthlyDailyAppointmentYAxisMax
        : null,
    ),
  };
}

function pickVisitBreakdownAt(detail, i) {
  const total = detail?.charts?.visits?.[i] ?? 0;
  if (typeof buildVisitBreakdownAtTotal === 'function') {
    return buildVisitBreakdownAtTotal(detail, total, 1);
  }
  const firstVal = detail?.charts?.visitsFirst?.[i] ?? 0;
  return {
    pureFirst: Math.max(0, Math.round(firstVal * 0.25)),
    first: firstVal,
    return: detail?.charts?.visitsReturn?.[i] ?? 0,
    other: detail?.charts?.visitsReFirst?.[i] ?? 0,
  };
}

function buildMonthlyDailyVisitBreakdown(detail, metricsContext, weight = 1) {
  const ctx = metricsContext || { entityKey: 'clinic-sakura', weight };
  const monthDetail = typeof resolvePeriodDetail === 'function'
    ? resolvePeriodDetail('今月', ctx)
    : MOCK_DATA.periodDetails['今月'];
  const todayDetail = typeof resolvePeriodDetail === 'function'
    ? resolvePeriodDetail('本日', ctx)
    : MOCK_DATA.periodDetails['本日'];
  const yesterdayDetail = typeof resolvePeriodDetail === 'function'
    ? resolvePeriodDetail('前日', ctx)
    : MOCK_DATA.periodDetails['前日'];
  if (typeof buildMonthlyDailyVisitBreakdownFromDetails === 'function') {
    return buildMonthlyDailyVisitBreakdownFromDetails(monthDetail, detail, weight, {
      entityKey: ctx.entityKey || 'clinic-sakura',
      todayDetail,
      yesterdayDetail,
      throughDay: typeof parseAnchorDayFromSubtitle === 'function'
        ? parseAnchorDayFromSubtitle(todayDetail?.subtitle)
        : undefined,
    });
  }
  return { labels: [], pureFirst: [], first: [], return: [], other: [] };
}

/** 月別（1〜12月）来院内訳 */
function buildYearMonthVisitBreakdown(detail, weight = 1) {
  const labels = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
  const idx = new Map((detail?.charts?.labels || []).map((l, i) => [String(l), i]));
  const pureFirst = [];
  const first = [];
  const returnV = [];
  const other = [];

  labels.forEach((m, i) => {
    const chartIdx = idx.get(m);
    if (chartIdx != null) {
      const part = pickVisitBreakdownAt(detail, chartIdx);
      pureFirst.push(Math.max(0, Math.round(part.pureFirst * weight)));
      first.push(Math.max(0, Math.round(part.first * weight)));
      returnV.push(Math.max(0, Math.round(part.return * weight)));
      other.push(Math.max(0, Math.round(part.other * weight)));
      return;
    }
    const part = typeof buildVisitBreakdownAtTotal === 'function'
      ? buildVisitBreakdownAtTotal(detail, Math.max(0, Math.round((680 + i * 24) * weight)), weight)
      : { pureFirst: 0, first: 0, return: 0, other: 0 };
    pureFirst.push(part.pureFirst);
    first.push(part.first);
    returnV.push(part.return);
    other.push(part.other);
  });

  return { labels, pureFirst, first, return: returnV, other };
}

/** 年別来院内訳 */
function buildYearlyVisitBreakdown(detail, weight = 1) {
  const labels = detail.charts?.labels || [];
  const pureFirst = [];
  const first = [];
  const returnV = [];
  const other = [];

  labels.forEach((_, i) => {
    const part = pickVisitBreakdownAt(detail, i);
    pureFirst.push(Math.max(0, Math.round(part.pureFirst * weight)));
    first.push(Math.max(0, Math.round(part.first * weight)));
    returnV.push(Math.max(0, Math.round(part.return * weight)));
    other.push(Math.max(0, Math.round(part.other * weight)));
  });

  return { labels, pureFirst, first, return: returnV, other };
}

function buildVisitBreakdownTrendChart(period, detail, weight = 1, metricsContext = null) {
  const series = (data) => [
    { name: '純初診', color: '#6366f1', values: data.pureFirst },
    { name: '初診', color: '#8b5cf6', values: data.first },
    { name: '再診', color: '#06b6d4', values: data.return },
    { name: 'その他', color: '#94a3b8', values: data.other },
  ];

  if (period === '今年') {
    const yearly = buildYearlyVisitBreakdown(detail, weight);
    const { focusIndex, focusLabel } = resolveInsightYearlyFocus(detail);
    return {
      title: '来院患者推移',
      subtitle: appendFocusSubtitle('年別（純初診 / 初診 / 再診 / その他）', focusLabel),
      type: 'stacked-bar',
      focusIndex,
      focusLabel,
      labels: yearly.labels,
      series: series(yearly),
    };
  }

  if (period === '今月') {
    const monthly = buildYearMonthVisitBreakdown(detail, weight);
    const asOfMonth = typeof resolveInsightAsOfMonth === 'function'
      ? resolveInsightAsOfMonth(detail)
      : 6;
    return {
      title: '来院患者推移',
      subtitle: `2026年1〜${asOfMonth}月（6/23時点・純初診 / 初診 / 再診 / その他）— 今月をハイライト`,
      type: 'stacked-bar',
      focusIndex: asOfMonth - 1,
      focusLabel: '今月',
      labels: monthly.labels,
      series: series(monthly),
    };
  }

  const daily = buildMonthlyDailyVisitBreakdown(detail, metricsContext, weight);
  const { focusLabel } = resolveInsightDailyFocus(period, detail);
  return {
    id: 'daily-visit-trend',
    title: '来院患者推移',
    subtitle: appendFocusSubtitle('当月の全日（純初診 / 初診 / 再診 / その他）', focusLabel),
    type: 'stacked-bar',
    labels: daily.labels,
    series: series(daily),
    ...buildInsightDailyStackedExtras(
      period,
      detail,
      metricsContext,
      weight,
      typeof resolveMonthlyDailyVisitYAxisMax === 'function'
        ? resolveMonthlyDailyVisitYAxisMax
        : null,
    ),
  };
}

function buildSelfPayMenuSeriesFromTotals(selfPayTotals, detail) {
  const menu = typeof buildSelfPayMenuAmounts === 'function'
    ? buildSelfPayMenuAmounts(detail)
    : { implant: 0, ortho: 0, whitening: 0, other: 0, total: 0 };
  const baseTotal = menu.total || 1;
  const ratios = {
    implant: menu.implant / baseTotal,
    ortho: menu.ortho / baseTotal,
    whitening: menu.whitening / baseTotal,
  };
  const implant = [];
  const ortho = [];
  const whitening = [];
  const other = [];
  selfPayTotals.forEach((raw) => {
    const t = Math.max(0, Math.round(raw));
    if (t <= 0) {
      implant.push(0);
      ortho.push(0);
      whitening.push(0);
      other.push(0);
      return;
    }
    const iVal = Math.round(t * ratios.implant);
    const oVal = Math.round(t * ratios.ortho);
    const wVal = Math.round(t * ratios.whitening);
    implant.push(iVal);
    ortho.push(oVal);
    whitening.push(wVal);
    other.push(Math.max(0, t - iVal - oVal - wVal));
  });
  return { implant, ortho, whitening, other };
}

function buildSelfPayMenuTrendChart(period, detail, weight = 1, metricsContext = null) {
  const seriesFrom = (data) => [
    { name: 'インプラ', color: '#ec4899', values: data.implant },
    { name: '矯正', color: '#f472b6', values: data.ortho },
    { name: 'ホワイト', color: '#db2777', values: data.whitening },
    { name: 'その他', color: '#94a3b8', values: data.other },
  ];

  if (period === '今年') {
    const labels = detail.charts?.labels || [];
    const totals = (detail.charts?.selfPay || []).map((v) => Math.round(v * weight));
    const data = buildSelfPayMenuSeriesFromTotals(totals, detail);
    const { focusIndex, focusLabel } = resolveInsightYearlyFocus(detail);
    return {
      title: '自費メニュー推移',
      subtitle: appendFocusSubtitle('インプラ / 矯正 / ホワイト / その他', focusLabel),
      type: 'stacked-bar',
      valueFormat: 'yen',
      focusIndex,
      focusLabel,
      labels,
      series: seriesFrom(data),
    };
  }

  if (period === '今月') {
    const ym = buildYearMonthRevenue(detail, weight);
    const data = buildSelfPayMenuSeriesFromTotals(ym.selfPay, detail);
    const asOfMonth = ym.asOfMonth || resolveInsightAsOfMonth(detail);
    return {
      title: '自費メニュー推移',
      subtitle: `2026年1〜${asOfMonth}月（6/23時点・インプラ / 矯正 / ホワイト / その他）— 今月をハイライト`,
      type: 'stacked-bar',
      valueFormat: 'yen',
      focusIndex: ym.focusIndex,
      focusLabel: '今月',
      labels: ym.labels,
      series: seriesFrom(data),
    };
  }

  const daily = buildMonthlyDailyRevenue(detail, period, metricsContext, weight);
  const data = buildSelfPayMenuSeriesFromTotals(daily.selfPay, detail);
  const { focusLabel } = resolveInsightDailyFocus(period, detail);
  const throughDay = typeof resolveInsightDailyThroughDay === 'function'
    ? resolveInsightDailyThroughDay(metricsContext)
    : daily.labels.length;
  let yAxisMax = 1;
  for (let i = 0; i < throughDay && i < daily.selfPay.length; i++) {
    if ((daily.selfPay[i] || 0) > yAxisMax) yAxisMax = daily.selfPay[i];
  }
  return {
    id: 'daily-selfpay-trend',
    title: '自費メニュー推移',
    subtitle: appendFocusSubtitle('当月の全日（インプラ / 矯正 / ホワイト / その他）', focusLabel),
    type: 'stacked-bar',
    valueFormat: 'yen',
    labels: daily.labels,
    series: seriesFrom(data),
    ...buildInsightDailyStackedExtras(period, detail, metricsContext, weight, () => yAxisMax),
  };
}

function buildAtRiskPatientListChart() {
  const patients = typeof getAtRiskPatientList === 'function'
    ? getAtRiskPatientList()
    : (MOCK_DATA?.atRiskPatients || []);
  return {
    id: 'at-risk-patient-list',
    title: '要注意患者リスト',
    subtitle: '次回予約あり・過去6か月にキャンセル1回以上（リスクスコア順）',
    type: 'risk-table',
    columns: ['患者名', '直近来院', '次回予約日', '過去1年CXL', 'CXL率', 'リスク'],
    rows: patients.map((p) => ({
      id: p.id,
      name: p.name,
      lastVisit: p.lastVisit,
      nextAppt: p.nextAppt || '—',
      cancelPastYear: p.cancelPastYear,
      cancelRate: `${p.cancelRate}%`,
      riskScore: p.riskScore,
      riskLevel: p.riskLevel,
      appointments: p.appointments || [],
    })),
    initialVisible: 10,
  };
}

function buildStaffRoleRanking(items, total) {
  const positive = items.filter((it) => it.weight > 0);
  const sum = positive.reduce((s, it) => s + it.weight, 0) || 1;
  const target = Math.max(0, Math.round(total));
  const scaled = positive.map((it) => ({
    label: it.label,
    value: Math.max(0, Math.round((it.weight / sum) * target)),
    color: it.color,
  }));
  const diff = target - scaled.reduce((s, it) => s + it.value, 0);
  if (scaled.length > 0 && diff !== 0) {
    scaled[0].value = Math.max(0, scaled[0].value + diff);
  }
  return scaled;
}

function buildDrSalesRankingChart(detail, entityKey = 'clinic-sakura') {
  const chart = typeof getReconciledStaffSalesChart === 'function'
    ? getReconciledStaffSalesChart(detail, entityKey)
    : null;
  const colors = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd'];
  const items = chart
    ? chart.labels
      .map((label, i) => ({
        label: typeof mapStaffChartLabelToName === 'function'
          ? mapStaffChartLabelToName(label)
          : label,
        value: (chart.insurance[i] || 0) + (chart.selfPay[i] || 0),
        role: typeof staffChartRowRole === 'function' ? staffChartRowRole(label) : 'dr',
      }))
      .filter((r) => r.role === 'dr')
      .map((r, i) => ({ label: r.label, value: r.value, color: colors[i % colors.length] }))
    : buildStaffRoleRanking([
      { label: '田中 健一', weight: 90400, color: '#2563eb' },
      { label: '佐藤 誠', weight: 52400, color: '#3b82f6' },
    ], typeof getStaffSalesBreakdown === 'function'
      ? getStaffSalesBreakdown(detail, entityKey).dr
      : splitStaffSalesTotal(detail.total).dr);
  return {
    title: 'Dr別売上ランキング',
    subtitle: '生産性の偏りを確認',
    type: 'hbar',
    valueFormat: 'yen',
    items,
  };
}

function buildDhSalesRankingChart(detail, entityKey = 'clinic-sakura') {
  const chart = typeof getReconciledStaffSalesChart === 'function'
    ? getReconciledStaffSalesChart(detail, entityKey)
    : null;
  const colors = ['#0891b2', '#06b6d4', '#14b8a6', '#2dd4bf', '#94a3b8'];
  let items = chart
    ? chart.labels
      .map((label, i) => ({
        label: typeof mapStaffChartLabelToName === 'function'
          ? mapStaffChartLabelToName(label)
          : label,
        value: (chart.insurance[i] || 0) + (chart.selfPay[i] || 0),
        role: typeof staffChartRowRole === 'function' ? staffChartRowRole(label) : 'dh',
      }))
      .filter((r) => r.role === 'dh')
      .map((r, i) => ({ label: r.label, value: r.value, color: colors[i % colors.length] }))
    : buildStaffRoleRanking([
      { label: '鈴木 美咲', weight: 31000, color: '#0891b2' },
      { label: '山田 恵', weight: 24000, color: '#06b6d4' },
      { label: '伊藤 彩', weight: 20200, color: '#14b8a6' },
    ], typeof getStaffSalesBreakdown === 'function'
      ? getStaffSalesBreakdown(detail, entityKey).dh
      : splitStaffSalesTotal(detail.total).dh);
  const breakdown = typeof getStaffSalesBreakdown === 'function'
    ? getStaffSalesBreakdown(detail, entityKey)
    : splitStaffSalesTotal(detail.total, entityKey);
  if (breakdown.unset > 0 && !items.some((it) => it.label === '未設定')) {
    items.push({ label: '未設定', value: breakdown.unset, color: '#94a3b8' });
  }
  return {
    title: 'DH別売上ランキング',
    subtitle: '生産性の偏りを確認',
    type: 'hbar',
    valueFormat: 'yen',
    items,
  };
}

function buildCompositeKpi({ accent, total, segments, popoverPageId, size, showCompositionBar }) {
  return { type: 'composite', accent, total, segments, popoverPageId, size, showCompositionBar };
}

function buildCompositeStackKpi(items, options = {}) {
  if (options.summary) {
    return { type: 'composite-stack', summary: options.summary, items };
  }
  return { type: 'composite-stack', items };
}

const VISITING_TREND_META = {
  '本日': insightTrend('-1名', false),
  '前日': insightTrend('+1名', true),
  '今月': insightTrend('+6名', true),
  '今年': insightTrend('+24名', true),
};

function buildVisitingInsightKpi(detail, period, periodSub, size) {
  const visiting = typeof getVisitingPatients === 'function'
    ? getVisitingPatients(detail)
    : { total: 0, breakdown: { pureFirst: 0, first: 0, return: 0, other: 0 } };
  const b = visiting.breakdown;
  const scaled = typeof buildInsightCountFromParts === 'function'
    ? buildInsightCountFromParts(visiting.total, [
      { label: '純初診', value: b.pureFirst, color: '#6366f1', rateMuted: true },
      { label: '初診', value: b.first, color: '#8b5cf6', rateMuted: true },
      { label: '再診', value: b.return, color: '#06b6d4', rateMuted: true },
      { label: 'その他', value: b.other, color: '#94a3b8' },
    ])
    : scaleInsightCount(visiting.total, [
      { label: '純初診', value: b.pureFirst, color: '#6366f1', rateMuted: true },
      { label: '初診', value: b.first, color: '#8b5cf6', rateMuted: true },
      { label: '再診', value: b.return, color: '#06b6d4', rateMuted: true },
      { label: 'その他', value: b.other, color: '#94a3b8' },
    ], 1);
  return buildCompositeKpi({
    accent: '#8b5cf6',
    popoverPageId: 'newPatients',
    size,
    total: {
      label: '訪問合計',
      value: scaled.total,
      unit: '人',
      sub: periodSub,
      trend: VISITING_TREND_META[period] || insightTrend('±0', null),
    },
    segments: scaled.segments,
  });
}

function buildOutpatientInsightKpi(detail, periodSub, size) {
  const b = typeof getOutpatientBreakdown === 'function'
    ? getOutpatientBreakdown(detail)
    : { pureFirst: 0, first: 0, return: 0, other: 0 };
  return buildCompositeKpi({
    accent: '#06b6d4',
    size,
    total: {
      label: '外来合計',
      value: detail.visits,
      unit: '人',
      sub: periodSub,
      trend: insightTrend(detail.change?.text || '', detail.change?.up),
    },
    segments: [
      { label: '純初診', value: b.pureFirst, color: '#6366f1', rateMuted: true },
      { label: '初診', value: b.first, color: '#8b5cf6', rateMuted: true },
      { label: '再診', value: b.return, color: '#06b6d4', rateMuted: true },
      { label: 'その他', value: b.other, color: '#94a3b8' },
    ],
  });
}

const VISIT_TYPE_SEGMENT_META = [
  { label: '純初診', color: '#6366f1', rateMuted: true },
  { label: '初診', color: '#8b5cf6', rateMuted: true },
  { label: '再診', color: '#06b6d4', rateMuted: true },
  { label: 'その他', color: '#94a3b8' },
];

function mergeVisitTypeSegments(...kpis) {
  return VISIT_TYPE_SEGMENT_META.map((meta) => ({
    ...meta,
    value: kpis.reduce((sum, kpi) => {
      const seg = (kpi.segments || []).find((s) => s.label === meta.label);
      return sum + (Number(seg?.value) || 0);
    }, 0),
  }));
}

function buildVisitingInsightCharts() {
  return [
    {
      title: '訪問タイプ推移',
      subtitle: '新規パイプラインの質',
      type: 'stacked-bar',
      labels: ['4週前', '3週前', '2週前', '先週', '今週'],
      series: [
        { name: '純初診', color: '#6366f1', values: [2, 3, 2, 4, 1] },
        { name: '初診', color: '#8b5cf6', values: [3, 2, 4, 3, 1] },
        { name: '再診', color: '#06b6d4', values: [5, 4, 6, 5, 1] },
        { name: 'その他', color: '#94a3b8', values: [1, 2, 1, 2, 1] },
      ],
    },
    {
      title: '獲得チャネル',
      subtitle: 'マーケ投資の効果測定',
      type: 'donut',
      segments: [
        { label: '紹介', value: 38, color: '#6366f1' },
        { label: 'WEB', value: 28, color: '#2563eb' },
        { label: '看板', value: 18, color: '#10b981' },
        { label: 'その他', value: 16, color: '#94a3b8' },
      ],
    },
    {
      title: '初診成約率',
      subtitle: '来院→治療開始の歩留まり',
      type: 'funnel',
      steps: [
        { label: '問合せ', value: 12 },
        { label: '予約', value: 8 },
        { label: '来院', value: 6 },
        { label: '成約', value: 4 },
      ],
    },
    {
      title: '担当別新規獲得',
      subtitle: 'チーム貢献度',
      type: 'hbar',
      items: [
        { label: '田中 Dr', value: 2, color: '#2563eb' },
        { label: '佐藤 Dr', value: 1, color: '#3b82f6' },
        { label: 'DH', value: 1, color: '#0891b2' },
      ],
    },
  ];
}

function normalizeInsightPageId(pageId) {
  return INSIGHT_PAGE_ALIASES[pageId] || pageId;
}

function scaleInsightCount(totalValue, parts, weight = 1) {
  const total = Math.max(0, Math.round(totalValue * weight));
  const scaled = parts.map((p) => ({ ...p, value: Math.max(0, Math.round(p.value * weight)) }));
  const sum = scaled.reduce((s, p) => s + p.value, 0);
  if (sum !== total && scaled.length > 0) {
    scaled[scaled.length - 1].value = Math.max(0, scaled[scaled.length - 1].value + (total - sum));
  }
  return { total, segments: scaled };
}

function periodSubLabel(period, detail) {
  if (period === '本日' || period === '前日') return PERIOD_LABELS_INSIGHT[period];
  return detail?.change?.label || PERIOD_LABELS_INSIGHT[period] || '';
}

/** 売上インサイト用：期間に応じた前年比較チャート（今年は null） */
function buildYoYCompareChart(period, detail) {
  if (period === '今年') return null;

  if (period === '今月') {
    const labels = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
    const idx = new Map((detail?.charts?.labels || []).map((l, i) => [String(l), i]));
    const pick = (arr, label) => {
      const i = idx.get(label);
      return i != null && Array.isArray(arr) ? arr[i] : 0;
    };
    const current = labels.map((m) =>
      pick(detail.charts?.insurance, m) + pick(detail.charts?.selfPay, m) + pick(detail.charts?.products, m),
    );
    const compare = labels.map((m) => pick(detail.charts?.compareRevenue, m));
    return {
      title: '前年同月比',
      subtitle: '売上の季節変動を把握',
      type: 'compare-line',
      valueFormat: 'yen',
      labels,
      current,
      compare,
      compareLabel: '前年同月',
    };
  }

  const allLabels = detail.charts?.labels || [];
  const labels = allLabels.slice(-5);
  const offset = allLabels.length - labels.length;
  const current = labels.map((_, j) => {
    const i = offset + j;
    return (detail.charts?.insurance?.[i] || 0)
      + (detail.charts?.selfPay?.[i] || 0)
      + (detail.charts?.products?.[i] || 0);
  });
  const compare = labels.map((_, j) => detail.charts?.compareRevenue?.[offset + j] || 0);

  return {
    title: '前年同日比',
    subtitle: '売上の季節変動を把握',
    type: 'compare-line',
    valueFormat: 'yen',
    labels,
    current,
    compare,
    compareLabel: '前年同日',
  };
}

function getInsightPageData(pageId, period = '本日', metricsContext = null) {
  const detail = resolvePeriodDetail(period, metricsContext || getMetricsContext({ level: 'clinic', clinicId: 'clinic-sakura' }));
  const b = detail.breakdown || {};
  const entityKey = metricsContext?.entityKey || 'clinic-sakura';
  const chartWeight = 1;
  const periodSub = periodSubLabel(period, detail);
  const builders = {
    unitPrice: () => {
      const ins = Math.round((b.insurance || 0));
      const self = Math.round((b.selfPay || 0));
      const prod = Math.round((b.products || 0));
      const other = Math.max(0, detail.total - ins - self - prod);
      return {
      kpis: buildCompositeKpi({
        accent: '#0ea5e9',
        popoverPageId: 'unitPrice',
        showCompositionBar: true,
        total: {
          label: '売上合計',
          value: detail.total,
          displayValue: intelFormatYen(detail.total),
          unit: '',
          sub: periodSub,
          trend: insightTrend(detail.change?.text || '—', detail.change?.up),
        },
        segments: [
          { label: '保険', value: ins, displayValue: intelFormatYen(ins), color: '#22c55e', rateMuted: true },
          { label: '自費', value: self, displayValue: intelFormatYen(self), color: '#0ea5e9', rateMuted: true },
          { label: '販売品', value: prod, displayValue: intelFormatYen(prod), color: '#eab308' },
          { label: 'その他', value: other, displayValue: intelFormatYen(other), color: '#94a3b8', rateMuted: true },
        ],
      }),
      charts: [
        (() => {
          const w = chartWeight;
          if (period === '今年') {
            const { focusIndex, focusLabel } = resolveInsightYearlyFocus(detail);
            return {
              title: '年別売上推移',
              subtitle: `年別（保険・自費・販売品）— ${focusLabel}をハイライト`,
              type: 'stacked-bar',
              valueFormat: 'yen',
              focusIndex,
              focusLabel,
              labels: detail.charts?.labels || [],
              series: [
                { name: '保険', color: '#22c55e', values: detail.charts?.insurance || [] },
                { name: '自費', color: '#0ea5e9', values: detail.charts?.selfPay || [] },
                { name: '販売品', color: '#eab308', values: detail.charts?.products || [] },
              ],
            };
          }

          if (period === '今月') {
            // 月別（1〜12月、未来月は0）
            const ym = buildYearMonthRevenue(detail, w);
            const asOfMonth = ym.asOfMonth || resolveInsightAsOfMonth(detail);
            return {
              title: '月別売上推移',
              subtitle: `2026年1〜${asOfMonth}月（6/23時点・保険・自費・販売品）`,
              type: 'stacked-bar',
              valueFormat: 'yen',
              focusIndex: ym.focusIndex,
              focusLabel: '今月',
              labels: ym.labels,
              series: [
                { name: '保険', color: '#22c55e', values: ym.insurance },
                { name: '自費', color: '#0ea5e9', values: ym.selfPay },
                { name: '販売品', color: '#eab308', values: ym.products },
              ],
            };
          }

          // 前日/本日：当月の全日（日別）
          const periodDaily = buildMonthlyDailyRevenue(detail, period, metricsContext, w);
          const { focusLabel } = resolveInsightDailyFocus(period, detail);
          return {
            id: 'daily-revenue-trend',
            title: '日別売上推移',
            subtitle: appendFocusSubtitle('当月の全日（保険・自費・販売品）', focusLabel),
            type: 'stacked-bar',
            valueFormat: 'yen',
            labels: periodDaily.labels,
            series: [
              { name: '保険', color: '#22c55e', values: periodDaily.insurance },
              { name: '自費', color: '#0ea5e9', values: periodDaily.selfPay },
              { name: '販売品', color: '#eab308', values: periodDaily.products },
            ],
            ...buildInsightDailyStackedExtras(
              period,
              detail,
              metricsContext,
              w,
              typeof resolveMonthlyDailyYAxisMax === 'function' ? resolveMonthlyDailyYAxisMax : null,
            ),
          };
        })(),
        buildYoYCompareChart(period, detail),
      ].filter(Boolean),
    };
    },
    staffSales: () => {
      const entityKey = metricsContext?.entityKey || 'clinic-sakura';
      const breakdown = typeof getStaffSalesBreakdown === 'function'
        ? getStaffSalesBreakdown(detail, entityKey)
        : splitStaffSalesTotal(detail.total, typeof resolveClinicIdFromEntity === 'function'
          ? resolveClinicIdFromEntity(entityKey)
          : 'clinic-sakura');
      const segments = [];
      if (breakdown.dr > 0) {
        segments.push({
          label: 'Dr',
          value: breakdown.dr,
          displayValue: intelFormatYen(breakdown.dr),
          color: '#2563eb',
          rateMuted: true,
        });
      }
      if (breakdown.dh > 0) {
        segments.push({
          label: 'DH',
          value: breakdown.dh,
          displayValue: intelFormatYen(breakdown.dh),
          color: '#0891b2',
          rateMuted: true,
        });
      }
      return {
      kpis: buildCompositeKpi({
        accent: '#6366f1',
        popoverPageId: 'staffSales',
        total: {
          label: '合計売上',
          value: detail.total,
          displayValue: intelFormatYen(detail.total),
          unit: '',
          sub: '職種内訳',
        },
        segments,
      }),
      charts: [
        withChartAxis(buildStaffSalesTrendChart(period, detail, chartWeight, metricsContext)),
        withChartAxis(buildDrSalesRankingChart(detail, entityKey)),
        withChartAxis(buildDhSalesRankingChart(detail, entityKey)),
      ],
    };
    },
    selfPay: () => {
      const topMenu = typeof buildTopSelfPaySegments === 'function'
        ? buildTopSelfPaySegments(detail)
        : { segments: [], total: detail?.breakdown?.selfPay || 0 };
      const { segments, total } = topMenu;
      const rateSub = typeof formatSelfPayRateSub === 'function'
        ? formatSelfPayRateSub(detail.breakdown || {}, detail.total, `${segments[0]?.label || ''}上位`)
        : '';
      const staffItems = typeof buildSelfPayStaffRanking === 'function'
        ? buildSelfPayStaffRanking(detail, total)
        : [];
      return {
      kpis: buildCompositeKpi({
        accent: '#ec4899',
        popoverPageId: 'selfPay',
        total: {
          label: '自費合計',
          value: total,
          displayValue: intelFormatYen(total),
          unit: '',
          sub: rateSub || periodSub,
          trend: insightTrend('+4.2%', true),
        },
        segments: segments.map((s) => ({
          ...s,
          displayValue: intelFormatYen(s.value),
        })),
      }),
      charts: [
        buildSelfPayMenuTrendChart(period, detail, chartWeight, metricsContext),
        {
          title: 'メニュー別構成',
          subtitle: '売上ポートフォリオ',
          type: 'donut',
          valueFormat: 'yen',
          segments: segments.map((s) => ({ label: s.label, value: s.value, color: s.color })),
        },
        {
          title: '担当別自費売上',
          subtitle: 'Dr / DH別・未設定含む',
          type: 'hbar',
          valueFormat: 'yen',
          showYAxis: true,
          items: staffItems,
        },
      ].map(withChartAxis),
    };
    },
    questionnaire: () => {
      const q = typeof getQuestionnaire === 'function'
        ? getQuestionnaire(detail)
        : { total: 29, breakdown: { done: 24, pending: 3 } };
      const qb = q.breakdown;
      const doneRate = typeof getQuestionnaireDoneRatePct === 'function'
        ? getQuestionnaireDoneRatePct(q)
        : Math.round(((qb.done / q.total) || 0) * 1000) / 10;
      const scaled = typeof buildInsightCountFromParts === 'function'
        ? buildInsightCountFromParts(q.total, [
          { label: '完了', value: qb.done, color: '#10b981', rateMuted: true },
          { label: '未回答', value: qb.pending, color: '#f59e0b' },
        ])
        : scaleInsightCount(q.total, [
          { label: '完了', value: qb.done, color: '#10b981', rateMuted: true },
          { label: '未回答', value: qb.pending, color: '#f59e0b' },
        ], 1);
      const clinicId = metricsContext?.entityKey
        ? (typeof resolveClinicIdFromEntity === 'function'
          ? resolveClinicIdFromEntity(metricsContext.entityKey)
          : 'clinic-sakura')
        : 'clinic-sakura';
      const surveys = typeof getQuestionnaireSurveys === 'function'
        ? getQuestionnaireSurveys(clinicId)
        : (MOCK_DATA?.questionnaireSurveys?.[clinicId] || []);
      const surveyCharts = surveys.map((survey, si) => {
        const total = (survey.options || []).reduce((s, o) => s + (o.value || 0), 0);
        return {
          id: `survey-${survey.id || si}`,
          title: survey.question,
          subtitle: `${total} 件の回答`,
          type: 'survey-pie',
          layout: 'full',
          segments: (survey.options || []).map((o) => ({
            label: o.label,
            value: o.value,
            color: o.color,
          })),
        };
      });
      return {
      kpis: buildCompositeKpi({
        accent: '#8b5cf6',
        popoverPageId: 'questionnaire',
        total: {
          label: '問診合計',
          value: scaled.total,
          unit: '件',
          sub: `回答率 ${doneRate}%`,
          trend: insightTrend('+3件', true),
        },
        segments: scaled.segments,
      }),
      charts: [
        {
          id: 'questionnaire-done-rate',
          title: '問診回答率',
          subtitle: '完了 / 未回答',
          type: 'donut',
          layout: 'half',
          segments: [
            { label: '完了', value: qb.done, color: '#10b981' },
            { label: '未回答', value: qb.pending, color: '#f59e0b' },
          ],
        },
        {
          id: 'questionnaire-pending-follow',
          title: '未回答フォロー',
          subtitle: '受付対応の優先度',
          type: 'table',
          layout: 'half',
          columns: ['患者', '予約', '問診', '担当'],
          rows: [
            ['山本 様', '10:30', '未回答', '受付A'],
            ['加藤 様', '14:00', '未回答', '受付A'],
          ],
        },
        ...surveyCharts,
      ],
    };
    },
    visits: () => {
      const outpatientKpi = buildOutpatientInsightKpi(detail, periodSub, 'compact');
      const visitingKpi = buildVisitingInsightKpi(detail, period, periodSub, 'compact');
      const weekdayVals = typeof distributeByPattern === 'function'
        ? distributeByPattern(detail.visits, [32, 28, 35, 30, 29, 18])
        : [32, 28, 35, 30, 29, 18];
      const outpatientTotal = Number(outpatientKpi.total.value) || 0;
      const visitingTotal = Number(visitingKpi.total.value) || 0;
      const patientTotal = outpatientTotal + visitingTotal;
      return {
      kpis: buildCompositeStackKpi(
        [outpatientKpi, visitingKpi],
        {
          summary: buildCompositeKpi({
            accent: '#0891b2',
            size: 'summary',
            total: {
              label: '患者合計',
              value: patientTotal,
              unit: '人',
              sub: periodSub,
              trend: insightTrend(detail.change?.text || '', detail.change?.up),
            },
            segments: mergeVisitTypeSegments(outpatientKpi, visitingKpi),
          }),
        },
      ),
      charts: [
        withChartAxis(buildVisitBreakdownTrendChart(period, detail, chartWeight, metricsContext)),
        withChartAxis({
          title: '曜日別来院数',
          subtitle: 'シフト・スタッフ配置の参考',
          type: 'bar',
          labels: ['月', '火', '水', '木', '金', '土'],
          values: weekdayVals,
          color: '#06b6d4',
        }),
        withChartAxis({
          title: '前年比較',
          subtitle: '患者数の季節変動',
          type: 'compare-line',
          labels: detail.charts?.labels?.slice(-5) || [],
          current: detail.charts?.visits?.slice(-5) || [],
          compare: detail.charts?.compareVisits?.slice(-5) || [],
          compareLabel: '前年',
        }),
      ],
    };
    },
    appointments: () => {
      const appt = typeof getAppointments === 'function'
        ? getAppointments(detail)
        : { total: detail.visits, breakdown: { visited: detail.visits, notVisited: 0, cancelSameDay: 0, cancelAdvance: 0, noShow: 0, cancelled: 0 } };
      const ab = appt.breakdown;
      const cancelTotal = (ab.cancelSameDay || 0) + (ab.cancelAdvance || 0) + (ab.noShow || 0);
      const pct = (v) => (appt.total > 0 ? Math.round((v / appt.total) * 1000) / 10 : 0);
      const slotVals = typeof distributeByPattern === 'function'
        ? distributeByPattern(appt.total, [4, 8, 6, 5, 7, 4])
        : [4, 8, 6, 5, 7, 4];
      const cancelRate = pct(cancelTotal);
      const segments = [
        { label: '来院済', value: ab.visited, color: '#10b981', rateMuted: true },
        { label: '未来院', value: ab.notVisited, color: '#0ea5e9', rateMuted: true },
        {
          label: 'キャンセル',
          value: cancelTotal,
          color: '#f59e0b',
          rateMuted: true,
          nestedInline: [
            { label: '当日', value: ab.cancelSameDay || 0, rate: pct(ab.cancelSameDay || 0), color: '#eab308' },
            { label: '前日以降', value: ab.cancelAdvance || 0, rate: pct(ab.cancelAdvance || 0), color: '#f59e0b' },
            { label: '無断', value: ab.noShow || 0, rate: pct(ab.noShow || 0), color: '#ef4444' },
          ],
        },
      ];
      return {
      kpis: buildCompositeKpi({
        accent: '#0891b2',
        popoverPageId: 'appointments',
        total: {
          label: '予約合計',
          value: appt.total,
          unit: '件',
          sub: periodSub,
          trend: insightTrend('±0', null),
        },
        segments,
      }),
      charts: [
        withChartAxis(buildAppointmentStatusTrendChart(period, detail, chartWeight, metricsContext)),
        buildAtRiskPatientListChart(),
        withChartAxis({
          title: '時間帯別予約',
          subtitle: 'ピークタイムの把握',
          type: 'bar',
          labels: ['9時', '10時', '11時', '14時', '15時', '16時'],
          values: slotVals,
          color: '#0891b2',
        }),
        withChartAxis({
          title: 'キャンセル率トレンド',
          subtitle: '4週移動平均',
          type: 'sparkline',
          labels: ['W1', 'W2', 'W3', 'W4'],
          values: [cancelRate + 1, cancelRate + 0.6, cancelRate + 0.2, cancelRate].map((v) => Math.round(v * 10) / 10),
          goal: 5,
          unit: '%',
        }),
      ],
    };
    },
    utilization: () => {
      const util = typeof getUtilization === 'function'
        ? getUtilization(detail)
        : { slots: 40, used: 31, empty: 9, ratePct: 77.5 };
      const rate = util.ratePct ?? (util.slots > 0 ? Math.round((util.used / util.slots) * 1000) / 10 : 0);
      const unitVals = typeof scaleCountsToTotal === 'function'
        ? scaleCountsToTotal([82, 76, 74, 78], rate)
        : [82, 76, 74, 78];
      const dailyUtil = typeof buildDailyUtilizationSeries === 'function'
        ? buildDailyUtilizationSeries(metricsContext, chartWeight)
        : { labels: [], values: [rate] };
      const goal = 82;
      const remaining = typeof calcRemainingBookingsForGoal === 'function'
        ? calcRemainingBookingsForGoal(util, goal)
        : Math.max(0, Math.round((goal - rate) / 100 * util.slots));
      return {
      kpis: buildCompositeKpi({
        accent: '#10b981',
        popoverPageId: 'utilization',
        total: {
          label: '予約枠',
          value: util.slots,
          unit: '枠',
          sub: `稼働率 ${rate}%`,
          trend: insightTrend('+2.1pt', true),
        },
        segments: [
          { label: '実績', value: util.used, color: '#10b981', rateMuted: true },
          { label: '空き枠', value: util.empty, color: '#94a3b8' },
        ],
      }),
      charts: [
        withChartAxis({
          title: '日別稼働推移',
          subtitle: `目標 ${goal}%・あと${remaining}予約で達成`,
          type: 'bar',
          labels: dailyUtil.labels,
          values: dailyUtil.values,
          color: '#10b981',
          goal,
          unit: '%',
        }),
        withChartAxis({
          title: 'ユニット別稼働率',
          subtitle: 'チェア別の稼働状況',
          type: 'hbar',
          items: [
            { label: 'ユニット1', value: unitVals[0], color: '#10b981' },
            { label: 'ユニット2', value: unitVals[1], color: '#14b8a6' },
            { label: 'ユニット3', value: unitVals[2], color: '#06b6d4' },
            { label: '平均', value: unitVals[3], color: '#94a3b8' },
          ],
          unit: '%',
        }),
      ],
    };
    },
  };

  const builder = builders[normalizeInsightPageId(pageId)];
  if (!builder) return null;
  return builder();
}

function getInsightPageMeta(pageId) {
  return INSIGHT_PAGES[pageId] || null;
}
