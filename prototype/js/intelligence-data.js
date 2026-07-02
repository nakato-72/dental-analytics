/**
 * Intelligence 風パネルデータ（PDF本番データは後から差し替え）
 * 期間カードに既出の「売上・来院数・売上構成」は含めない
 *
 * 維持するUI: ポップオーバー / カードホバー / チャートアニメーション（app.js・popover.js）
 */
const INTELLIGENCE_ICONS = {
  unitPrice: '¥',
  staffSales: 'Dr',
  utilization: '%',
  cancel: '!',
  appointments: '予',
  newPatients: '新',
  recall: '防',
  selfPay: '自',
  questionnaire: '問',
};

/** 内訳合計が total と一致することを保証（PDF差し替え時もこの関数経由） */
function buildStaffSalesPanel({ total, dr, dh, unset = null, ...meta }) {
  const totalAmt = Math.round(total);
  const drAmt = Math.round(dr);
  const dhAmt = Math.round(dh);
  let unsetAmt = unset != null ? Math.round(unset) : totalAmt - drAmt - dhAmt;

  if (drAmt + dhAmt + unsetAmt !== totalAmt) {
    unsetAmt = totalAmt - drAmt - dhAmt;
  }

  const accent = meta.accent || '#6366f1';
  return {
    type: 'staffSales',
    icon: INTELLIGENCE_ICONS.staffSales,
    label: '職種別売上',
    total: totalAmt,
    value: intelFormatYen(totalAmt),
    unit: '',
    staffBreakdown: { dr: drAmt, dh: dhAmt, unset: unsetAmt },
    trend: meta.trend || 'up',
    trendText: meta.trendText || '+3.2%',
    trendLabel: meta.trendLabel || '前日比',
    accent,
  };
}

function intelFormatYen(n) {
  return '¥' + Math.round(n).toLocaleString('ja-JP');
}

function parseYen(str) {
  if (typeof str === 'number') return Math.round(str);
  if (!str) return 0;
  return Math.round(Number(String(str).replace(/[¥,]/g, '')) || 0);
}

function getActivePeriodDetail(periodKey, metricsContext) {
  if (metricsContext && typeof resolvePeriodDetail === 'function') {
    return resolvePeriodDetail(periodKey, metricsContext);
  }
  return MOCK_DATA.periodDetails[periodKey] || MOCK_DATA.periodDetails['本日'];
}

/** 入金実績カード（入金・未収金の内訳） */
function buildPaymentRecordPanel(periodKey, override = {}, periodDetail = null) {
  const detail = periodDetail || getActivePeriodDetail(periodKey);
  const receivablesAmt = parseYen(
    override.receivables ?? override.receivableAmount ?? override.value ?? 12400
  );
  let collectedAmt;
  if (override.collected != null) {
    collectedAmt = parseYen(override.collected);
  } else {
    const periodTotal = detail?.total ?? MOCK_DATA.periodDetails[periodKey]?.total ?? 142800;
    collectedAmt = Math.max(periodTotal - receivablesAmt, 0);
  }

  return {
    type: 'paymentRecord',
    id: 'receivables',
    icon: INTELLIGENCE_ICONS.receivables,
    label: '入金実績',
    paymentBreakdown: {
      collected: collectedAmt,
      receivables: receivablesAmt,
    },
    sub: override.sub ?? '前日比 -8%',
    trend: override.trend ?? 'down',
    trendText: override.trendText ?? '-8%',
    trendLabel: override.trendLabel ?? '前日比',
    accent: override.accent ?? '#64748b',
    popoverLabel: '未収金',
  };
}

/** 売上内訳カード（保険・自費・販売品・その他） */
function buildSalesBreakdownPanel(periodKey, override = {}, periodDetail = null) {
  const detail = periodDetail || getActivePeriodDetail(periodKey);
  const raw = override.revenueBreakdown || override.breakdown || detail.breakdown || {};
  const periodTotal = Math.round(override.salesTotal ?? detail.total ?? 142800);

  let insurance = Math.round(override.insurance ?? raw.insurance ?? 0);
  let selfPay = Math.round(override.selfPay ?? raw.selfPay ?? 0);
  let products = Math.round(override.products ?? raw.products ?? 0);
  let other = Math.round(override.other ?? raw.other ?? 0);

  const sum = insurance + selfPay + products + other;
  if (sum !== periodTotal) {
    other = Math.max(0, periodTotal - insurance - selfPay - products);
  }

  return {
    type: 'salesBreakdown',
    id: 'unitPrice',
    icon: INTELLIGENCE_ICONS.unitPrice,
    label: '売上内訳',
    value: intelFormatYen(periodTotal),
    salesTotal: periodTotal,
    revenueBreakdown: { insurance, selfPay, products, other },
    sub: override.sub ?? '',
    trend: override.trend ?? 'down',
    trendText: override.trendText ?? '-1.8%',
    trendLabel: override.trendLabel ?? '前日比',
    accent: override.accent ?? '#0ea5e9',
  };
}

function buildIntelPanels(overrides = {}, periodKey = '本日', metricsContext = null) {
  const periodDetail = getActivePeriodDetail(periodKey, metricsContext);
  const periodTotal = periodDetail?.total;
  const defaultStaff = buildStaffSalesPanel({
    total: periodTotal ?? 142800,
    dr: Math.round((periodTotal ?? 142800) * 0.633),
    dh: Math.round((periodTotal ?? 142800) * 0.307),
    unset: Math.max(0, (periodTotal ?? 142800) - Math.round((periodTotal ?? 142800) * 0.633) - Math.round((periodTotal ?? 142800) * 0.307)),
    trend: 'up',
    trendText: '+3.2%',
  });

  const base = {
    unitPrice: buildSalesBreakdownPanel(periodKey, overrides.unitPrice, periodDetail),
    staffSales: defaultStaff,
    utilization: {
      icon: INTELLIGENCE_ICONS.utilization,
      label: '稼働率',
      value: '78.4',
      unit: '%',
      sub: '目標 82% / ユニット平均',
      trend: 'up',
      trendText: '+2.1pt',
      trendLabel: '前週比',
      progress: 96,
      accent: '#10b981',
    },
    appointments: buildAppointmentsPanel(periodKey),
    recall: {
      id: 'recall',
      icon: INTELLIGENCE_ICONS.recall,
      label: '予防',
      value: '68.2',
      unit: '%',
      sub: '予約率 74% / 継続率 91%',
      trend: 'up',
      trendText: '+1.4pt',
      trendLabel: '前月比',
      progress: 83,
      accent: '#14b8a6',
    },
    selfPay: {
      id: 'selfPay',
      icon: INTELLIGENCE_ICONS.selfPay,
      label: '自費',
      value: intelFormatYen(Math.round((periodDetail?.breakdown?.selfPay) || 42800)),
      unit: '',
      sub: '売上比 32% / インプラ上位',
      trend: 'up',
      trendText: '+4.2%',
      trendLabel: '前日比',
      progress: 72,
      accent: '#ec4899',
    },
    questionnaire: {
      id: 'questionnaire',
      icon: INTELLIGENCE_ICONS.questionnaire,
      label: '問診',
      value: '82.8',
      unit: '%',
      sub: '完了 24件 / 未回答 3件',
      trend: 'up',
      trendText: '+3件',
      trendLabel: '前日比',
      progress: 83,
      accent: '#8b5cf6',
    },
  };

  const merged = { ...base, ...overrides };
  if (merged.unitPrice && merged.unitPrice.type !== 'salesBreakdown') {
    merged.unitPrice = buildSalesBreakdownPanel(periodKey, merged.unitPrice, periodDetail);
  } else if (merged.unitPrice?.type === 'salesBreakdown') {
    const total = periodDetail?.total;
    const breakdown = periodDetail?.breakdown;
    if (total != null) {
      merged.unitPrice.salesTotal = total;
      merged.unitPrice.value = intelFormatYen(total);
    }
    if (breakdown && !merged.unitPrice.revenueBreakdown) {
      merged.unitPrice.revenueBreakdown = { ...breakdown };
    }
  }
  if (merged.staffSales && merged.staffSales.type !== 'staffSales') {
    const s = merged.staffSales;
    const total = s.total ?? periodTotal ?? base.staffSales.total;
    merged.staffSales = buildStaffSalesPanel({
      total,
      dr: s.dr ?? s.staffBreakdown?.dr ?? 0,
      dh: s.dh ?? s.staffBreakdown?.dh ?? 0,
      unset: s.unset ?? s.staffBreakdown?.unset,
      trend: s.trend,
      trendText: s.trendText,
      trendLabel: s.trendLabel,
      accent: s.accent,
    });
  }
  return orderIntelPanels(merged, periodKey, periodDetail);
}

const INTEL_PANEL_PRIMARY_IDS = [
  'unitPrice', 'staffSales',
  'visits', 'appointments',
];
const INTEL_PANEL_SECONDARY_IDS = [
  'utilization', 'recall', 'selfPay', 'questionnaire',
];

function buildVisitTypeBreakdown(periodKey, total, override = {}, periodDetail = null) {
  const detail = periodDetail || getActivePeriodDetail(periodKey);
  const charts = detail?.charts;
  const i = Math.max(0, (charts?.visits?.length ?? 1) - 1);
  const pureFirstDefaults = { '本日': 2, '前日': 3, '今月': 38, '今年': 218 };
  const returnVisit = override.return ?? charts?.visitsReturn?.[i] ?? 0;
  const other = override.other ?? charts?.visitsReFirst?.[i] ?? 0;
  const pureFirst = override.pureFirst ?? pureFirstDefaults[periodKey] ?? 0;
  const first = override.first ?? Math.max(0, total - pureFirst - returnVisit - other);
  return { pureFirst, first, return: returnVisit, other };
}

/** 来院＋訪問を統合した患者数カード */
function mergeVisitBreakdowns(a, b) {
  return {
    pureFirst: (a?.pureFirst || 0) + (b?.pureFirst || 0),
    first: (a?.first || 0) + (b?.first || 0),
    return: (a?.return || 0) + (b?.return || 0),
    other: (a?.other || 0) + (b?.other || 0),
  };
}

function buildPatientsPanel(periodKey, outpatientOverride = {}, visitingOverride = {}, periodDetail = null) {
  const outpatient = buildClinicVisitsPanel(periodKey, outpatientOverride, periodDetail);
  const visiting = buildVisitingPatientsPanel(periodKey, visitingOverride);
  const patientTotal = outpatient.visitTotal + visiting.visitTotal;

  return {
    type: 'visitBreakdown',
    id: 'visits',
    icon: '患',
    label: '患者数',
    visitTotal: patientTotal,
    visitBreakdown: mergeVisitBreakdowns(outpatient.visitBreakdown, visiting.visitBreakdown),
    unit: '人',
    sub: `外来 ${outpatient.visitTotal}人 / 訪問 ${visiting.visitTotal}人`,
    trend: outpatient.trend,
    trendText: outpatient.trendText,
    trendLabel: outpatient.trendLabel,
    accent: '#0891b2',
    popoverLabel: '患者数',
  };
}

/** 来院患者数カード（合計＋純初診/初診/再診/その他） */
function buildClinicVisitsPanel(periodKey, override = {}, periodDetail = null) {
  const detail = periodDetail || getActivePeriodDetail(periodKey);
  const periodCard = MOCK_DATA.unified.shared.periods.find((p) => p.label === periodKey);
  const change = detail.change || {};
  const total = override.total ?? detail.visits ?? 29;
  const visitBreakdown = buildVisitTypeBreakdown(periodKey, total, override.visitBreakdown || override, detail);

  return {
    type: 'visitBreakdown',
    id: 'visits',
    icon: '院',
    label: '来院患者数',
    visitTotal: total,
    visitBreakdown,
    unit: '人',
    sub: periodCard?.visitsCumulative ? '延べ来院数' : '',
    trend: change.up ? 'up' : (String(change.text || '').includes('±') ? 'flat' : 'down'),
    trendText: change.text || '',
    trendLabel: change.label || '前比',
    accent: '#06b6d4',
    ...override,
    type: 'visitBreakdown',
    visitTotal: total,
    visitBreakdown,
  };
}

const VISITING_PATIENT_DEFAULTS = {
  '本日': { total: 4, pureFirst: 1, first: 1, return: 1, other: 1 },
  '前日': { total: 3, pureFirst: 1, first: 1, return: 0, other: 1 },
  '今月': { total: 52, pureFirst: 12, first: 14, return: 18, other: 8 },
  '今年': { total: 286, pureFirst: 62, first: 78, return: 102, other: 44 },
};

/** 訪問患者数カード（来院患者数と同デザイン） */
function buildVisitingPatientsPanel(periodKey, override = {}) {
  const defaults = VISITING_PATIENT_DEFAULTS[periodKey] || VISITING_PATIENT_DEFAULTS['本日'];
  const total = override.total ?? defaults.total;
  const visitBreakdown = {
    pureFirst: override.pureFirst ?? defaults.pureFirst,
    first: override.first ?? defaults.first,
    return: override.return ?? defaults.return,
    other: override.other ?? defaults.other,
  };

  const trendDefaults = {
    '本日': { trend: 'down', trendText: '-1名', trendLabel: '前日比' },
    '前日': { trend: 'up', trendText: '+1名', trendLabel: '前日比' },
    '今月': { trend: 'up', trendText: '+6名', trendLabel: '前月比' },
    '今年': { trend: 'up', trendText: '+24名', trendLabel: '前年比' },
  };
  const trendMeta = trendDefaults[periodKey] || { trend: 'flat', trendText: '±0', trendLabel: '前日比' };

  return {
    type: 'visitBreakdown',
    id: 'newPatients',
    icon: '訪',
    label: '訪問患者数',
    visitTotal: total,
    visitBreakdown,
    unit: '人',
    sub: override.sub ?? '',
    trend: override.trend ?? trendMeta.trend,
    trendText: override.trendText ?? trendMeta.trendText,
    trendLabel: override.trendLabel ?? trendMeta.trendLabel,
    accent: override.accent ?? '#8b5cf6',
    ...override,
    type: 'visitBreakdown',
    label: '訪問患者数',
    visitTotal: total,
    visitBreakdown,
  };
}

const APPOINTMENT_BREAKDOWN_DEFAULTS = {
  '本日': { total: 34, visited: 29, notVisited: 2, cancelled: 2, noShow: 1 },
  '前日': { total: 42, visited: 38, notVisited: 2, cancelled: 1, noShow: 1 },
  '今月': { total: 912, visited: 847, notVisited: 55, cancelled: 7, noShow: 3 },
  '今年': { total: 5240, visited: 4892, notVisited: 280, cancelled: 48, noShow: 20 },
};

/** 予約数カード（合計＋来院済/未来院/キャンセル/無断キャンセル） */
function buildAppointmentsPanel(periodKey, override = {}) {
  const defaults = APPOINTMENT_BREAKDOWN_DEFAULTS[periodKey] || APPOINTMENT_BREAKDOWN_DEFAULTS['本日'];
  const total = override.total ?? override.appointmentTotal ?? defaults.total;
  const appointmentBreakdown = {
    visited: override.visited ?? defaults.visited,
    notVisited: override.notVisited ?? defaults.notVisited,
    cancelled: override.cancelled ?? defaults.cancelled,
    noShow: override.noShow ?? defaults.noShow,
  };

  return {
    type: 'appointmentBreakdown',
    id: 'appointments',
    icon: INTELLIGENCE_ICONS.appointments,
    label: '予約数',
    appointmentTotal: total,
    appointmentBreakdown,
    countUnit: '件',
    sub: override.sub ?? '',
    trend: override.trend ?? 'flat',
    trendText: override.trendText ?? '±0',
    trendLabel: override.trendLabel ?? '前日比',
    accent: override.accent ?? '#0891b2',
    popoverLabel: '予約数',
    ...override,
    type: 'appointmentBreakdown',
    label: '予約数',
    appointmentTotal: total,
    appointmentBreakdown,
    countUnit: '件',
    popoverLabel: '予約数',
  };
}

function orderIntelPanels(merged, periodKey, periodDetail = null) {
  const detail = periodDetail || getActivePeriodDetail(periodKey);
  const visitsOverride = merged.visits && merged.visits.type !== 'visitBreakdown'
    ? merged.visits
    : { ...(merged.visits || {}) };
  const visitingOverride = merged.newPatients && merged.newPatients.type !== 'visitBreakdown'
    ? merged.newPatients
    : { ...(merged.newPatients || {}) };
  merged.visits = buildPatientsPanel(periodKey, visitsOverride, visitingOverride, detail);
  delete merged.newPatients;

  const appointmentsOverride = merged.appointments && merged.appointments.type !== 'appointmentBreakdown'
    ? merged.appointments
    : { ...(merged.appointments || {}) };
  merged.appointments = buildAppointmentsPanel(periodKey, appointmentsOverride);

  if (merged.staffSales?.type === 'staffSales') {
    merged.staffSales.label = '職種別売上';
    merged.staffSales.id = 'staffSales';
  }
  Object.entries(merged).forEach(([key, panel]) => {
    if (panel && typeof panel === 'object' && !panel.id) panel.id = key;
  });

  const primary = INTEL_PANEL_PRIMARY_IDS.map((id) => merged[id]).filter(Boolean);
  const secondary = INTEL_PANEL_SECONDARY_IDS.map((id) => merged[id]).filter(Boolean);
  return { primary, secondary };
}

const PERIOD_INTEL_OVERRIDES = {
  '前日': {
    unitPrice: { trend: 'up', trendText: '+2.1%' },
    staffSales: { dr: 118600, dh: 59800, unset: 8000, trendText: '+5.4%' },
    utilization: { value: '81.2', progress: 99, trendText: '+3.0pt' },
    appointments: { total: 42, trend: 'up', trendText: '+8件' },
    newPatients: { total: 3, trend: 'up', trendText: '+1名', sub: '前日予約 2名' },
  },
  '本日': {},
  '今月': {
    unitPrice: { trend: 'up', trendText: '+3.8%' },
    staffSales: { dr: 2640000, dh: 1520000, unset: 120000, trendText: '+4.8%' },
    utilization: { value: '76.8', progress: 94, sub: '目標 82% / 当月平均', trendText: '+1.2pt' },
    appointments: { total: 912, trend: 'up', trendText: '+48件' },
    newPatients: { total: 52, trend: 'up', trendText: '+6名', sub: '目標 50名', progress: 76 },
    recall: { value: '71.5', progress: 88, trendText: '+2.1pt' },
    selfPay: { value: intelFormatYen(1284000), trendText: '+5.8%', sub: '売上比 33%' },
    questionnaire: { value: '84.2', progress: 85, trendText: '+12件', sub: '完了 812件 / 未回答 48件' },
  },
  '今年': {
    unitPrice: { trend: 'up', trendText: '+5.2%' },
    staffSales: { dr: 15100000, dh: 8050000, unset: 1000000, trendText: '+9.6%' },
    utilization: { value: '74.2', progress: 90, sub: '目標 80% / 年間平均', trendText: '+0.8pt' },
    appointments: { total: 5240, trend: 'up', trendText: '+412件' },
    newPatients: { total: 286, trend: 'up', trendText: '+24名', sub: '前年比 +12%' },
    recall: { value: '69.8', progress: 85, trendText: '+0.9pt' },
    selfPay: { value: intelFormatYen(7620000), trendText: '+8.4%', sub: '売上比 31%' },
    questionnaire: { value: '81.6', progress: 82, trendText: '+186件', sub: '年間 4,268件 / 未回答 312件' },
  },
};

function getIntelligenceData(periodKey, metricsContext = null) {
  const detail = getActivePeriodDetail(periodKey, metricsContext);
  const entityKey = metricsContext?.entityKey || 'clinic-sakura';
  const baseOverrides = entityKey === 'clinic-sakura'
    ? (PERIOD_INTEL_OVERRIDES[periodKey] || PERIOD_INTEL_OVERRIDES['本日'])
    : {};
  const entityOverrides = typeof buildIntelOverridesForEntity === 'function'
    ? buildIntelOverridesForEntity(entityKey, periodKey, detail)
    : {};
  const panelLayout = buildIntelPanels(
    { ...baseOverrides, ...entityOverrides },
    periodKey,
    metricsContext,
  );
  const allPanels = [
    ...panelLayout.primary.filter(Boolean),
    ...panelLayout.secondary,
  ];
  const breakdown = getStaffBreakdownFromPanels(allPanels);
  const chartSource = typeof buildStaffSalesChartForEntity === 'function'
    ? buildStaffSalesChartForEntity(entityKey, periodKey, breakdown, detail)
    : getDefaultStaffSalesChart(periodKey);
  const staffSalesChart = reconcileStaffSalesChart(chartSource, breakdown);
  const utilizationChart = typeof buildUtilizationChartForEntity === 'function'
    ? buildUtilizationChartForEntity(entityKey, periodKey)
    : getDefaultUtilizationChart(periodKey);
  return {
    panelLayout,
    charts: detail.charts,
    revenueChartTitle: detail.revenueChartTitle,
    visitsChartTitle: detail.visitsChartTitle,
    staffSalesChart,
    utilizationChart,
  };
}

function getDefaultStaffSalesChart(periodKey) {
  const maps = {
    '前日': {
      labels: ['田中 Dr', '佐藤 Dr', '鈴木 DH', '山田 DH', '未設定'],
      insurance: [52000, 42000, 18200, 17400, 4800],
      selfPay: [28000, 26400, 9800, 8600, 3200],
    },
    '本日': {
      labels: ['田中 Dr', '佐藤 Dr', '鈴木 DH', '山田 DH', '未設定'],
      insurance: [38000, 20600, 14200, 12800, 5200],
      selfPay: [18600, 13200, 7200, 9600, 3400],
    },
    '今月': {
      labels: ['田中 Dr', '佐藤 Dr', '鈴木 DH', '山田 DH', '未設定'],
      insurance: [820000, 780000, 420000, 380000, 48000],
      selfPay: [520000, 480000, 280000, 240000, 72000],
    },
    '今年': {
      labels: ['田中 Dr', '佐藤 Dr', '鈴木 DH', '山田 DH', '未設定'],
      insurance: [4200000, 3900000, 2100000, 1900000, 240000],
      selfPay: [2800000, 2600000, 1400000, 1200000, 760000],
    },
  };
  return maps[periodKey] || maps['本日'];
}

function getStaffBreakdownFromPanels(panels) {
  const panel = panels.find((p) => p.type === 'staffSales');
  return panel?.staffBreakdown || { dr: 0, dh: 0, unset: 0 };
}

/** チャート各行の合計がパネル内訳（Dr+DH+未設定）と一致するよう未設定行を調整 */
function reconcileStaffSalesChart(chart, breakdown) {
  const chartCopy = {
    labels: [...chart.labels],
    insurance: [...chart.insurance],
    selfPay: [...chart.selfPay],
  };

  if (breakdown.unset === 0) {
    const unsetIdx = chartCopy.labels.findIndex((l) => l.includes('未設定'));
    if (unsetIdx >= 0) {
      chartCopy.labels.splice(unsetIdx, 1);
      chartCopy.insurance.splice(unsetIdx, 1);
      chartCopy.selfPay.splice(unsetIdx, 1);
    }
  }

  const targetTotal = breakdown.dr + breakdown.dh + breakdown.unset;
  const rows = chartCopy.labels.map((label, i) => ({
    label,
    insurance: chartCopy.insurance[i] || 0,
    selfPay: chartCopy.selfPay[i] || 0,
    total: (chartCopy.insurance[i] || 0) + (chartCopy.selfPay[i] || 0),
    role: label.includes('未設定') ? 'unset' : label.includes('DH') ? 'dh' : 'dr',
  }));

  let drSum = rows.filter((r) => r.role === 'dr').reduce((s, r) => s + r.total, 0);
  let dhSum = rows.filter((r) => r.role === 'dh').reduce((s, r) => s + r.total, 0);
  const unsetRow = rows.find((r) => r.role === 'unset');

  if (unsetRow) {
    unsetRow.total = breakdown.unset;
    const insRatio = chartCopy.insurance[chartCopy.labels.indexOf(unsetRow.label)] /
      ((chartCopy.insurance[chartCopy.labels.indexOf(unsetRow.label)] || 0) + (chartCopy.selfPay[chartCopy.labels.indexOf(unsetRow.label)] || 1));
    unsetRow.insurance = Math.round(breakdown.unset * (Number.isFinite(insRatio) ? insRatio : 0.6));
    unsetRow.selfPay = breakdown.unset - unsetRow.insurance;
  }

  drSum = rows.filter((r) => r.role === 'dr').reduce((s, r) => s + r.total, 0);
  dhSum = rows.filter((r) => r.role === 'dh').reduce((s, r) => s + r.total, 0);
  const unsetSum = rows.filter((r) => r.role === 'unset').reduce((s, r) => s + r.total, 0);

  if (drSum !== breakdown.dr || dhSum !== breakdown.dh) {
    const drRows = rows.filter((r) => r.role === 'dr');
    const dhRows = rows.filter((r) => r.role === 'dh');
    scaleRoleRows(drRows, breakdown.dr);
    scaleRoleRows(dhRows, breakdown.dh);
  }

  return {
    labels: rows.map((r) => r.label),
    insurance: rows.map((r) => r.insurance),
    selfPay: rows.map((r) => r.selfPay),
    breakdown,
  };
}

function scaleRoleRows(rows, target) {
  const current = rows.reduce((s, r) => s + r.total, 0);
  if (!rows.length || current === 0) return;
  const factor = target / current;
  rows.forEach((r) => {
    r.total = Math.round(r.total * factor);
    r.insurance = Math.round(r.insurance * factor);
    r.selfPay = r.total - r.insurance;
  });
  const diff = target - rows.reduce((s, r) => s + r.total, 0);
  if (diff !== 0 && rows.length) {
    rows[0].total += diff;
    rows[0].selfPay += diff;
  }
}

function getDefaultUtilizationChart(periodKey) {
  const maps = {
    '前日': { labels: ['U1', 'U2', 'U3', 'U4'], values: [84, 79, 82, 80], goal: 82 },
    '本日': { labels: ['U1', 'U2', 'U3', 'U4'], values: [76, 81, 74, 82], goal: 82 },
    '今月': { labels: ['第1週', '第2週', '第3週', '第4週'], values: [74, 76, 78, 77], goal: 82 },
    '今年': { labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [72, 74, 75, 74], goal: 80 },
  };
  return maps[periodKey] || maps['本日'];
}

/** カード並び順のデフォルト（ドラッグ並び替えの初期値） */
function getDefaultIntelPanelOrder() {
  return {
    primary: [...INTEL_PANEL_PRIMARY_IDS],
    secondary: [...INTEL_PANEL_SECONDARY_IDS],
  };
}
