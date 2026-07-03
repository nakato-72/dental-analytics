/**
 * インサイト詳細ページ — 経営指標カード別のモックデータ
 */

const INSIGHT_PAGE_ORDER = [
  'unitPrice', 'staffSales',
  'visits', 'appointments',
  'utilization', 'recall', 'selfPay', 'questionnaire',
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
  recall: { title: '予防管理', shortLabel: '予防', icon: '防', accent: '#14b8a6', group: '運営効率' },
  selfPay: { title: '自費売上', shortLabel: '自費', icon: '自', accent: '#ec4899', group: '売上・入金' },
  questionnaire: { title: '問診回答', shortLabel: '問診', icon: '問', accent: '#8b5cf6', group: '患者・予約' },
};

const PERIOD_LABELS_INSIGHT = { '前日': '前日', '本日': '本日', '今月': '今月', '今年': '今年' };

function insightTrend(text, up) {
  return { text, up: up !== false };
}

/**
 * 月別（1〜12月）を必ず出す。clinicOnly.chart を正本とし、なければ periodDetails から補完。
 */
function buildYearMonthRevenue(detail, weight = 1) {
  const clinicChart = MOCK_DATA.clinicOnly?.chart;
  if (clinicChart?.labels?.length >= 12) {
    return {
      labels: Array.from({ length: 12 }, (_, i) => `${i + 1}月`),
      insurance: clinicChart.insurance.map((v) => Math.round(v * weight)),
      selfPay: clinicChart.selfPay.map((v) => Math.round(v * weight)),
      products: clinicChart.products.map((v) => Math.round(v * weight)),
    };
  }
  const labels = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
  const idx = new Map((detail?.charts?.labels || []).map((l, i) => [String(l), i]));
  const pick = (arr, i) => (Array.isArray(arr) && arr[i] != null ? arr[i] : 0);
  const insurance = labels.map((m) => Math.round(pick(detail?.charts?.insurance, idx.get(m)) * weight));
  const selfPay = labels.map((m) => Math.round(pick(detail?.charts?.selfPay, idx.get(m)) * weight));
  const products = labels.map((m) => Math.round(pick(detail?.charts?.products, idx.get(m)) * weight));
  return { labels, insurance, selfPay, products };
}

/** 当月全日の日別売上（今月累計と前日/本日の確定値から派生） */
function buildMonthlyDailyRevenue(detail, period, metricsContext, weight = 1) {
  const ctx = metricsContext || { entityKey: 'clinic-sakura', weight };
  const monthDetail = typeof resolvePeriodDetail === 'function'
    ? resolvePeriodDetail('今月', ctx)
    : MOCK_DATA.periodDetails['今月'];
  if (typeof buildMonthlyDailyRevenueFromDetails === 'function') {
    return buildMonthlyDailyRevenueFromDetails(monthDetail, detail, weight);
  }
  return buildPeriodRevenueTrend(detail, weight);
}

/** 当月全日の日別職種別売上 */
function buildMonthlyDailyStaffSales(detail, period, metricsContext, weight = 1) {
  const ctx = metricsContext || { entityKey: 'clinic-sakura', weight };
  const monthDetail = typeof resolvePeriodDetail === 'function'
    ? resolvePeriodDetail('今月', ctx)
    : MOCK_DATA.periodDetails['今月'];
  if (typeof buildMonthlyDailyStaffSalesFromDetails === 'function') {
    return buildMonthlyDailyStaffSalesFromDetails(monthDetail, detail, weight, {
      entityKey: ctx.entityKey || 'clinic-sakura',
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
    { name: '未設定', color: '#94a3b8', values: data.unset },
  ];

  if (period === '今年') {
    const yearly = buildYearlyStaffSales(detail, weight, entityKey);
    return {
      title: '年別売上推移',
      subtitle: '年別（Dr / DH / 未設定）',
      type: 'stacked-bar',
      valueFormat: 'yen',
      labels: yearly.labels,
      series: series(yearly),
    };
  }

  if (period === '今月') {
    const monthly = buildYearMonthStaffSales(detail, weight, entityKey);
    return {
      title: '月別売上推移',
      subtitle: '1〜12月（Dr / DH / 未設定）',
      type: 'stacked-bar',
      valueFormat: 'yen',
      labels: monthly.labels,
      series: series(monthly),
    };
  }

  const daily = buildMonthlyDailyStaffSales(detail, period, metricsContext, weight);
  return {
    title: '日別売上推移',
    subtitle: '当月の全日（Dr / DH / 未設定）',
    type: 'stacked-bar',
    valueFormat: 'yen',
    denseLabels: true,
    denseLabels: true,
    labels: daily.labels,
    series: series(daily),
  };
}

/** 当月全日の日別予約ステータス（患者数・予約内訳から派生） */
function buildMonthlyDailyAppointments(detail, metricsContext, weight = 1) {
  const ctx = metricsContext || { entityKey: 'clinic-sakura', weight };
  const monthDetail = typeof resolvePeriodDetail === 'function'
    ? resolvePeriodDetail('今月', ctx)
    : MOCK_DATA.periodDetails['今月'];
  if (typeof buildMonthlyDailyAppointmentsFromDetails === 'function') {
    return buildMonthlyDailyAppointmentsFromDetails(monthDetail, detail, weight);
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

function buildAppointmentStatusTrendChart(period, detail, weight = 1, metricsContext = null) {
  const series = (data) => [
    { name: '来院済', color: '#10b981', values: data.visited },
    { name: '未来院', color: '#0ea5e9', values: data.notVisited ?? data.pending },
    { name: 'CX', color: '#f59e0b', values: data.cancelled ?? data.cancel },
    { name: '無断', color: '#ef4444', values: data.noShow },
  ];

  if (period === '今年') {
    const yearly = buildYearlyAppointments(detail, weight);
    return {
      title: '予約ステータス推移',
      subtitle: '年別（来院済 / 未来院 / CX / 無断）',
      type: 'stacked-bar',
      labels: yearly.labels,
      series: series(yearly),
    };
  }

  if (period === '今月') {
    const monthly = buildYearMonthAppointments(detail, weight);
    return {
      title: '予約ステータス推移',
      subtitle: '1〜12月（来院済 / 未来院 / CX / 無断）',
      type: 'stacked-bar',
      labels: monthly.labels,
      series: series(monthly),
    };
  }

  const daily = buildMonthlyDailyAppointments(detail, metricsContext, weight);
  return {
    title: '予約ステータス推移',
    subtitle: '当月の全日（来院済 / 未来院 / CX / 無断）',
    type: 'stacked-bar',
    denseLabels: true,
    labels: daily.labels,
    series: series(daily),
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
  if (typeof buildMonthlyDailyVisitBreakdownFromDetails === 'function') {
    return buildMonthlyDailyVisitBreakdownFromDetails(monthDetail, detail, weight);
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
    return {
      title: '来院内訳推移',
      subtitle: '年別（純初診 / 初診 / 再診 / その他）',
      type: 'stacked-bar',
      labels: yearly.labels,
      series: series(yearly),
    };
  }

  if (period === '今月') {
    const monthly = buildYearMonthVisitBreakdown(detail, weight);
    return {
      title: '来院内訳推移',
      subtitle: '1〜12月（純初診 / 初診 / 再診 / その他）',
      type: 'stacked-bar',
      labels: monthly.labels,
      series: series(monthly),
    };
  }

  const daily = buildMonthlyDailyVisitBreakdown(detail, metricsContext, weight);
  return {
    title: '来院内訳推移',
    subtitle: '当月の全日（純初診 / 初診 / 再診 / その他）',
    type: 'stacked-bar',
    denseLabels: true,
    labels: daily.labels,
    series: series(daily),
  };
}

function buildCancelRankingChart(weight = 1) {
  const base = [
    { label: '松本 優', count: 5, color: '#ef4444' },
    { label: '井上 拓也', count: 4, color: '#f59e0b' },
    { label: '佐藤 恵', count: 3, color: '#f97316' },
    { label: '高橋 大輔', count: 2, color: '#fb923c' },
    { label: '渡辺 健', count: 2, color: '#fdba74' },
  ];
  return {
    title: 'キャンセル多いランキング',
    subtitle: '累計CX件数（フォロー優先度）',
    type: 'hbar',
    unit: '件',
    items: base.map((it) => ({
      label: it.label,
      value: Math.max(1, Math.round(it.count * weight)),
      color: it.color,
    })),
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
  const colors = ['#0891b2', '#06b6d4', '#14b8a6', '#2dd4bf'];
  const items = chart
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
  return {
    title: 'DH別売上ランキング',
    subtitle: '生産性の偏りを確認',
    type: 'hbar',
    valueFormat: 'yen',
    items,
  };
}

function buildCompositeKpi({ accent, total, segments, popoverPageId, size }) {
  return { type: 'composite', accent, total, segments, popoverPageId, size };
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

function buildVisitingInsightKpi(detail, period, weight, periodSub, size) {
  const visiting = typeof getVisitingPatients === 'function'
    ? getVisitingPatients(detail)
    : { total: 0, breakdown: { pureFirst: 0, first: 0, return: 0, other: 0 } };
  const b = visiting.breakdown;
  const scaled = scaleInsightCount(visiting.total, [
    { label: '純初診', value: b.pureFirst, color: '#6366f1', rateMuted: true },
    { label: '初診', value: b.first, color: '#8b5cf6', rateMuted: true },
    { label: '再診', value: b.return, color: '#06b6d4', rateMuted: true },
    { label: 'その他', value: b.other, color: '#94a3b8' },
  ], weight);
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
  const weight = metricsContext?.weight ?? 1;
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
          const w = metricsContext?.weight ?? 1;
          if (period === '今年') {
            // 年別（データ側が既に年別のlabels/valuesを持つ）
            return {
              title: '年別売上推移',
              subtitle: '年別（保険・自費・販売品）',
              type: 'stacked-bar',
              valueFormat: 'yen',
              labels: detail.charts?.labels || [],
              series: [
                { name: '保険', color: '#22c55e', values: detail.charts?.insurance || [] },
                { name: '自費', color: '#0ea5e9', values: detail.charts?.selfPay || [] },
                { name: '販売品', color: '#eab308', values: detail.charts?.products || [] },
              ],
            };
          }

          if (period === '今月') {
            // 月別（1〜12月を固定表示）
            const ym = buildYearMonthRevenue(detail, w);
            return {
              title: '月別売上推移',
              subtitle: '1〜12月（保険・自費・販売品）',
              type: 'stacked-bar',
              valueFormat: 'yen',
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
          return {
            title: '日別売上推移',
            subtitle: '当月の全日（保険・自費・販売品）',
            type: 'stacked-bar',
            valueFormat: 'yen',
            denseLabels: true,
            labels: periodDaily.labels,
            series: [
              { name: '保険', color: '#22c55e', values: periodDaily.insurance },
              { name: '自費', color: '#0ea5e9', values: periodDaily.selfPay },
              { name: '販売品', color: '#eab308', values: periodDaily.products },
            ],
          };
        })(),
        {
          title: '売上構成比',
          subtitle: '当期の収益ミックス',
          type: 'donut',
          valueFormat: 'yen',
          segments: [
            { label: '保険', value: b.insurance || 0, color: '#22c55e' },
            { label: '自費', value: b.selfPay || 0, color: '#0ea5e9' },
            { label: '販売品', value: b.products || 0, color: '#eab308' },
            { label: 'その他', value: b.other || 0, color: '#94a3b8' },
          ],
        },
        buildYoYCompareChart(period, detail),
      ].filter(Boolean),
    };
    },
    staffSales: () => {
      const entityKey = metricsContext?.entityKey || 'clinic-sakura';
      const breakdown = typeof getStaffSalesBreakdown === 'function'
        ? getStaffSalesBreakdown(detail, entityKey)
        : splitStaffSalesTotal(detail.total);
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
      if (breakdown.unset > 0) {
        segments.push({
          label: '未設定',
          value: breakdown.unset,
          displayValue: intelFormatYen(breakdown.unset),
          color: '#94a3b8',
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
        buildStaffSalesTrendChart(period, detail, metricsContext?.weight ?? 1, metricsContext),
        buildDrSalesRankingChart(detail, entityKey),
        buildDhSalesRankingChart(detail, entityKey),
      ],
    };
    },
    recall: () => {
      const scaled = scaleInsightCount(142, [
        { label: '予約済', value: 105, color: '#14b8a6', rateMuted: true },
        { label: '連絡中', value: 22, color: '#f59e0b' },
        { label: '未着手', value: 15, color: '#ef4444' },
      ], weight);
      return {
      kpis: buildCompositeKpi({
        accent: '#14b8a6',
        total: {
          label: '予防対象',
          value: scaled.total,
          unit: '名',
          sub: '予防率 68.2%',
          trend: insightTrend('+1.4pt', true),
        },
        segments: scaled.segments,
      }),
      charts: [
        {
          title: '月別予防率',
          subtitle: '継続ケアの定着',
          type: 'sparkline',
          labels: ['1月', '2月', '3月', '4月', '5月', '6月'],
          values: [62, 64, 65, 66, 67, 68.2],
          goal: 75,
          unit: '%',
        },
        {
          title: '対象者ステータス',
          subtitle: '今月の進捗',
          type: 'donut',
          segments: [
            { label: '予約済', value: 105, color: '#14b8a6' },
            { label: '連絡中', value: 22, color: '#f59e0b' },
            { label: '未着手', value: 15, color: '#ef4444' },
          ],
        },
        {
          title: '担当別消化率',
          subtitle: 'フォロー品質の比較',
          type: 'hbar',
          items: [
            { label: '鈴木 DH', value: 82, color: '#14b8a6' },
            { label: '山田 DH', value: 71, color: '#06b6d4' },
            { label: '伊藤 DH', value: 68, color: '#0891b2' },
          ],
          unit: '%',
        },
        {
          title: '予防→来院転換',
          subtitle: '売上への貢献',
          type: 'funnel',
          steps: [
            { label: '対象', value: 142 },
            { label: '連絡', value: 128 },
            { label: '予約', value: 105 },
            { label: '来院', value: 89 },
          ],
        },
      ],
    };
    },
    selfPay: () => {
      const b = detail.breakdown || {};
      const total = Math.max(0, Math.round(b.selfPay || 0));
      const rateSub = typeof formatSelfPayRateSub === 'function'
        ? formatSelfPayRateSub(b, detail.total, 'インプラ上位')
        : '';
      const implant = Math.max(0, Math.round(total * 0.28));
      const ortho = Math.max(0, Math.round(total * 0.24));
      const whitening = Math.max(0, Math.round(total * 0.18));
      const other = Math.max(0, total - implant - ortho - whitening);
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
        segments: [
          { label: 'インプラ', value: implant, displayValue: intelFormatYen(implant), color: '#ec4899', rateMuted: true },
          { label: '矯正', value: ortho, displayValue: intelFormatYen(ortho), color: '#f472b6', rateMuted: true },
          { label: 'ホワイト', value: whitening, displayValue: intelFormatYen(whitening), color: '#db2777', rateMuted: true },
          { label: 'その他', value: other, displayValue: intelFormatYen(other), color: '#94a3b8' },
        ],
      }),
      charts: [
        {
          title: '自費メニュー推移',
          subtitle: 'インプラ / 矯正 / ホワイト / その他',
          type: 'stacked-bar',
          valueFormat: 'yen',
          labels: detail.charts?.labels?.slice(-6) || [],
          series: [
            { name: 'インプラ', color: '#ec4899', values: [12000, 14000, 11800, 15200, 13800, implant] },
            { name: '矯正', color: '#f472b6', values: [9800, 10200, 11000, 10500, 11200, ortho] },
            { name: 'ホワイト', color: '#db2777', values: [6200, 6800, 7100, 6900, 7400, whitening] },
            { name: 'その他', color: '#94a3b8', values: [4800, 5200, 4900, 5100, 5300, other] },
          ],
        },
        {
          title: 'メニュー別構成',
          subtitle: '売上ポートフォリオ',
          type: 'donut',
          valueFormat: 'yen',
          segments: [
            { label: 'インプラ', value: implant, color: '#ec4899' },
            { label: '矯正', value: ortho, color: '#f472b6' },
            { label: 'ホワイト', value: whitening, color: '#db2777' },
            { label: 'その他', value: other, color: '#94a3b8' },
          ],
        },
        {
          title: '担当別自費売上',
          subtitle: '提案力の比較',
          type: 'hbar',
          valueFormat: 'yen',
          items: [
            { label: '田中 Dr', value: Math.round(total * 0.38), color: '#ec4899' },
            { label: '佐藤 Dr', value: Math.round(total * 0.31), color: '#f472b6' },
            { label: 'DH', value: Math.round(total * 0.31), color: '#db2777' },
          ],
        },
        {
          title: '自費単価トレンド',
          subtitle: '4週移動平均',
          type: 'sparkline',
          labels: ['W1', 'W2', 'W3', 'W4'],
          values: [38200, 40100, 41800, 42800],
          goal: 45000,
          valueFormat: 'yen',
        },
      ],
    };
    },
    questionnaire: () => {
      const scaled = scaleInsightCount(29, [
        { label: '完了', value: 24, color: '#10b981', rateMuted: true },
        { label: '未回答', value: 3, color: '#f59e0b' },
        { label: '途中', value: 2, color: '#94a3b8' },
      ], weight);
      return {
      kpis: buildCompositeKpi({
        accent: '#8b5cf6',
        popoverPageId: 'questionnaire',
        total: {
          label: '問診合計',
          value: scaled.total,
          unit: '件',
          sub: '回答率 82.8%',
          trend: insightTrend('+3件', true),
        },
        segments: scaled.segments,
      }),
      charts: [
        {
          title: '回答率トレンド',
          subtitle: 'デジタル問診の浸透',
          type: 'sparkline',
          labels: ['W1', 'W2', 'W3', 'W4'],
          values: [76.2, 78.5, 80.1, 82.8],
          goal: 85,
          unit: '%',
        },
        {
          title: '回答ステータス',
          subtitle: '当日の進捗',
          type: 'donut',
          segments: [
            { label: '完了', value: 24, color: '#10b981' },
            { label: '未回答', value: 3, color: '#f59e0b' },
            { label: '途中', value: 2, color: '#94a3b8' },
          ],
        },
        {
          title: '問診タイプ別',
          subtitle: '初診 / 再診 / 予防',
          type: 'hbar',
          items: [
            { label: '初診問診', value: 8, color: '#8b5cf6' },
            { label: '再診問診', value: 14, color: '#6366f1' },
            { label: '予防問診', value: 7, color: '#14b8a6' },
          ],
        },
        {
          title: '未回答フォロー',
          subtitle: '受付対応の優先度',
          type: 'table',
          columns: ['患者', '予約', '問診', '担当'],
          rows: [
            ['山本 様', '10:30', '未回答', '受付A'],
            ['小林 様', '11:00', '途中', '受付B'],
            ['加藤 様', '14:00', '未回答', '受付A'],
          ],
        },
      ],
    };
    },
    visits: () => {
      const outpatientKpi = buildOutpatientInsightKpi(detail, periodSub, 'compact');
      const visitingKpi = buildVisitingInsightKpi(detail, period, weight, periodSub, 'compact');
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
        buildVisitBreakdownTrendChart(period, detail, metricsContext?.weight ?? 1, metricsContext),
        {
          title: '曜日別来院',
          subtitle: 'シフト・スタッフ配置の参考',
          type: 'bar',
          labels: ['月', '火', '水', '木', '金', '土'],
          values: [32, 28, 35, 30, 29, 18],
          color: '#06b6d4',
        },
        {
          title: '前年比較',
          subtitle: '患者数の季節変動',
          type: 'compare-line',
          labels: detail.charts?.labels?.slice(-5) || [],
          current: detail.charts?.visits?.slice(-5) || [],
          compare: detail.charts?.compareVisits?.slice(-5) || [],
          compareLabel: '前年',
        },
        {
          title: '患者単価 × 来院数',
          subtitle: '売上への寄与度',
          type: 'scatter-hint',
          items: [
            { label: '再診', x: '高頻度', y: '安定単価', color: '#06b6d4' },
            { label: '初診', x: '中頻度', y: '高単価', color: '#8b5cf6' },
            { label: '純初診', x: '低頻度', y: '最高単価', color: '#6366f1' },
          ],
        },
        ...buildVisitingInsightCharts(),
      ],
    };
    },
    appointments: () => {
      const appt = typeof getAppointments === 'function'
        ? getAppointments(detail)
        : { total: detail.visits, breakdown: { visited: detail.visits, notVisited: 0, cancelled: 0, noShow: 0 } };
      const b = appt.breakdown;
      const apptKpi = scaleInsightCount(appt.total, [
        { label: '来院済', value: b.visited, color: '#10b981', rateMuted: true },
        { label: 'キャンセル', value: b.cancelled, color: '#f59e0b' },
        { label: '無断CX', value: b.noShow, color: '#ef4444' },
        { label: '未来院', value: b.notVisited, color: '#0ea5e9', rateMuted: true },
      ], weight);
      return {
      kpis: buildCompositeKpi({
        accent: '#0891b2',
        total: {
          label: '予約合計',
          value: apptKpi.total,
          unit: '件',
          sub: periodSub,
          trend: insightTrend('±0', null),
        },
        segments: apptKpi.segments,
      }),
      charts: [
        buildAppointmentStatusTrendChart(period, detail, metricsContext?.weight ?? 1, metricsContext),
        buildCancelRankingChart(metricsContext?.weight ?? 1),
        {
          title: '時間帯別予約',
          subtitle: 'ピークタイムの把握',
          type: 'bar',
          labels: ['9時', '10時', '11時', '14時', '15時', '16時'],
          values: [4, 8, 6, 5, 7, 4],
          color: '#0891b2',
        },
        {
          title: 'キャンセル率トレンド',
          subtitle: '4週移動平均',
          type: 'sparkline',
          labels: ['W1', 'W2', 'W3', 'W4'],
          values: [6.2, 5.8, 5.2, 5.2],
          goal: 5,
          unit: '%',
        },
        {
          title: 'メニュー別予約',
          subtitle: '稼働計画に活用',
          type: 'hbar',
          items: [
            { label: '定期検診', value: 12, color: '#0891b2' },
            { label: 'クリーニング', value: 9, color: '#06b6d4' },
            { label: '初診', value: 6, color: '#6366f1' },
            { label: 'その他', value: 7, color: '#94a3b8' },
          ],
        },
      ],
    };
    },
    utilization: () => {
      const slots = Math.max(1, Math.round(40 * weight));
      const empty = Math.max(0, Math.round(14 * weight));
      const used = Math.max(0, slots - empty);
      return {
      kpis: buildCompositeKpi({
        accent: '#10b981',
        total: {
          label: '予約枠',
          value: slots,
          unit: '枠',
          sub: '稼働率 78.4%',
          trend: insightTrend('+2.1pt', true),
        },
        segments: [
          { label: '実績', value: used, color: '#10b981', rateMuted: true },
          { label: '空き枠', value: empty, color: '#94a3b8' },
        ],
      }),
      charts: [
        {
          title: 'ユニット別稼働率',
          subtitle: '設備投資の判断材料',
          type: 'hbar',
          items: [
            { label: 'ユニット1', value: 82, color: '#10b981' },
            { label: 'ユニット2', value: 76, color: '#14b8a6' },
            { label: 'ユニット3', value: 74, color: '#06b6d4' },
            { label: '平均', value: 78, color: '#94a3b8' },
          ],
          unit: '%',
        },
        {
          title: '週別稼働推移',
          subtitle: '目標ラインとの差',
          type: 'sparkline',
          labels: ['W1', 'W2', 'W3', 'W4'],
          values: [74, 76, 77, 78.4],
          goal: 82,
          unit: '%',
        },
        {
          title: '予約枠 vs 実績',
          subtitle: '過剰・不足の検知',
          type: 'grouped-bar',
          labels: ['月', '火', '水', '木', '金'],
          groups: [
            { name: '枠', color: '#e2e8f0', values: [40, 40, 40, 40, 40] },
            { name: '実績', color: '#10b981', values: [32, 35, 31, 34, 29] },
          ],
        },
        {
          title: '曜日ヒート',
          subtitle: 'シフト最適化',
          type: 'heatmap',
          rows: ['午前', '午後'],
          cols: ['月', '火', '水', '木', '金'],
          values: [[82, 78, 85, 80, 76], [74, 72, 79, 77, 70]],
        },
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
