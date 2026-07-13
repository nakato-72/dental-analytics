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
  const payment = typeof getPaymentRecord === 'function'
    ? getPaymentRecord(detail)
    : null;
  const periodTotal = payment?.total ?? detail?.total ?? MOCK_DATA.periodDetails[periodKey]?.total ?? 142800;
  const receivablesAmt = override.receivables != null
    ? parseYen(override.receivables)
    : (payment?.receivables ?? parseYen(override.receivableAmount ?? override.value ?? 12400));
  let collectedAmt;
  if (override.collected != null) {
    collectedAmt = parseYen(override.collected);
  } else {
    collectedAmt = payment?.collected ?? Math.max(periodTotal - receivablesAmt, 0);
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

function buildUtilizationIntelPanel(periodDetail, override = {}) {
  const util = typeof getUtilization === 'function'
    ? getUtilization(periodDetail)
    : { slots: 40, used: 31, empty: 9, ratePct: 78.4 };
  const rate = util.ratePct ?? (typeof getUtilizationRatePct === 'function' ? getUtilizationRatePct(util) : 78.4);
  return {
    icon: INTELLIGENCE_ICONS.utilization,
    label: '稼働率',
    value: String(rate),
    unit: '%',
    sub: override.sub ?? `目標 82% / 予約枠 ${util.slots}`,
    trend: override.trend ?? 'up',
    trendText: override.trendText ?? '+2.1pt',
    trendLabel: override.trendLabel ?? '前週比',
    progress: Math.min(100, Math.round((rate / 82) * 100)),
    accent: '#10b981',
  };
}

function buildRecallIntelPanel(periodDetail, override = {}) {
  const recall = typeof getRecall === 'function' ? getRecall(periodDetail) : { total: 142, breakdown: { booked: 105, contact: 22, pending: 15 } };
  const rate = typeof getRecallBookedRatePct === 'function'
    ? getRecallBookedRatePct(recall)
    : Math.round(((recall.breakdown.booked / recall.total) || 0) * 1000) / 10;
  return {
    id: 'recall',
    icon: INTELLIGENCE_ICONS.recall,
    label: '予防',
    value: String(rate),
    unit: '%',
    sub: override.sub ?? `対象 ${recall.total}名 / 予約済 ${recall.breakdown.booked}名`,
    trend: override.trend ?? 'up',
    trendText: override.trendText ?? '+1.4pt',
    trendLabel: override.trendLabel ?? '前月比',
    progress: Math.min(100, Math.round((rate / 75) * 100)),
    accent: '#14b8a6',
  };
}

function buildQuestionnaireIntelPanel(periodDetail, override = {}) {
  const q = typeof getQuestionnaire === 'function'
    ? getQuestionnaire(periodDetail)
    : { total: 29, breakdown: { done: 24, pending: 3, partial: 2 } };
  const rate = typeof getQuestionnaireDoneRatePct === 'function'
    ? getQuestionnaireDoneRatePct(q)
    : Math.round(((q.breakdown.done / q.total) || 0) * 1000) / 10;
  return {
    id: 'questionnaire',
    icon: INTELLIGENCE_ICONS.questionnaire,
    label: '問診',
    value: String(rate),
    unit: '%',
    sub: override.sub ?? `完了 ${q.breakdown.done}件 / 未回答 ${q.breakdown.pending}件`,
    trend: override.trend ?? 'up',
    trendText: override.trendText ?? '+3件',
    trendLabel: override.trendLabel ?? '前日比',
    progress: Math.min(100, Math.round((rate / 85) * 100)),
    accent: '#8b5cf6',
  };
}

function buildIntelPanels(overrides = {}, periodKey = '本日', metricsContext = null) {
  const periodDetail = getActivePeriodDetail(periodKey, metricsContext);
  const periodTotal = periodDetail?.total ?? 142800;
  const entityKey = metricsContext?.entityKey || 'clinic-sakura';
  const staffParts = typeof getStaffSalesBreakdown === 'function'
    ? getStaffSalesBreakdown(periodDetail, entityKey)
    : splitStaffSalesTotal(periodTotal, typeof resolveClinicIdFromEntity === 'function'
      ? resolveClinicIdFromEntity(entityKey)
      : 'clinic-sakura');
  const defaultStaff = buildStaffSalesPanel({
    total: periodTotal,
    dr: staffParts.dr,
    dh: staffParts.dh,
    unset: staffParts.unset,
    trend: 'up',
    trendText: '+3.2%',
  });

  const base = {
    unitPrice: buildSalesBreakdownPanel(periodKey, overrides.unitPrice, periodDetail),
    staffSales: defaultStaff,
    utilization: buildUtilizationIntelPanel(periodDetail, overrides.utilization),
    appointments: buildAppointmentsPanel(periodKey, overrides.appointments, periodDetail),
    selfPay: {
      id: 'selfPay',
      icon: INTELLIGENCE_ICONS.selfPay,
      label: '自費',
      value: intelFormatYen(Math.round((periodDetail?.breakdown?.selfPay) || 0)),
      unit: '',
      sub: formatSelfPayRateSub(periodDetail?.breakdown, periodTotal, 'インプラ上位'),
      trend: 'up',
      trendText: '+4.2%',
      trendLabel: '前日比',
      progress: 72,
      accent: '#ec4899',
    },
    questionnaire: buildQuestionnaireIntelPanel(periodDetail, overrides.questionnaire),
  };

  const merged = { ...base, ...overrides };
  if (overrides.selfPay && base.selfPay) {
    merged.selfPay = { ...base.selfPay, ...overrides.selfPay };
  }
  if (overrides.utilization && base.utilization) {
    merged.utilization = buildUtilizationIntelPanel(periodDetail, { ...base.utilization, ...overrides.utilization });
  }
  if (overrides.questionnaire && base.questionnaire) {
    merged.questionnaire = buildQuestionnaireIntelPanel(periodDetail, { ...base.questionnaire, ...overrides.questionnaire });
  }
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
    const entityKey = metricsContext?.entityKey || 'clinic-sakura';
    const parts = typeof getStaffSalesBreakdown === 'function'
      ? getStaffSalesBreakdown(periodDetail, entityKey)
      : splitStaffSalesTotal(total, typeof resolveClinicIdFromEntity === 'function'
        ? resolveClinicIdFromEntity(entityKey)
        : 'clinic-sakura');
    merged.staffSales = buildStaffSalesPanel({
      total,
      dr: s.dr ?? s.staffBreakdown?.dr ?? parts.dr,
      dh: s.dh ?? s.staffBreakdown?.dh ?? parts.dh,
      unset: s.unset ?? s.staffBreakdown?.unset ?? parts.unset,
      trend: s.trend ?? base.staffSales.trend,
      trendText: s.trendText ?? base.staffSales.trendText,
      trendLabel: s.trendLabel ?? base.staffSales.trendLabel,
      accent: s.accent ?? base.staffSales.accent,
    });
  }
  return orderIntelPanels(merged, periodKey, periodDetail);
}

const INTEL_PANEL_PRIMARY_IDS = [
  'unitPrice', 'staffSales',
  'visits', 'appointments',
];
const INTEL_PANEL_SECONDARY_IDS = [
  'utilization', 'selfPay', 'questionnaire',
];

function buildVisitTypeBreakdown(periodKey, total, override = {}, periodDetail = null) {
  const detail = periodDetail || getActivePeriodDetail(periodKey);
  const targetTotal = total ?? detail.visits ?? 0;
  const base = typeof getOutpatientBreakdown === 'function'
    ? getOutpatientBreakdown(detail)
    : { pureFirst: 0, first: 0, return: 0, other: 0 };
  const merged = {
    pureFirst: override.pureFirst ?? override.visitBreakdown?.pureFirst ?? base.pureFirst,
    first: override.first ?? override.visitBreakdown?.first ?? base.first,
    return: override.return ?? override.visitBreakdown?.return ?? base.return,
    other: override.other ?? override.visitBreakdown?.other ?? base.other,
  };
  return typeof reconcileVisitBreakdown === 'function'
    ? reconcileVisitBreakdown(merged, targetTotal)
    : merged;
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
  const detail = periodDetail || getActivePeriodDetail(periodKey);
  const outpatient = buildClinicVisitsPanel(periodKey, outpatientOverride, detail);
  const visiting = buildVisitingPatientsPanel(periodKey, visitingOverride, detail);
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

/** 訪問患者数カード（来院患者数と同デザイン） */
function buildVisitingPatientsPanel(periodKey, override = {}, periodDetail = null) {
  const detail = periodDetail || getActivePeriodDetail(periodKey);
  const visiting = typeof getVisitingPatients === 'function'
    ? getVisitingPatients(detail)
    : { total: 0, breakdown: { pureFirst: 0, first: 0, return: 0, other: 0 } };
  const total = override.total ?? visiting.total;
  const visitBreakdown = typeof reconcileVisitBreakdown === 'function'
    ? reconcileVisitBreakdown({
      pureFirst: override.pureFirst ?? visiting.breakdown.pureFirst,
      first: override.first ?? visiting.breakdown.first,
      return: override.return ?? visiting.breakdown.return,
      other: override.other ?? visiting.breakdown.other,
    }, total)
    : visiting.breakdown;

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
function buildAppointmentsPanel(periodKey, override = {}, periodDetail = null) {
  const detail = periodDetail || getActivePeriodDetail(periodKey);
  const stored = typeof getAppointments === 'function'
    ? getAppointments(detail)
    : null;
  const defaults = stored?.breakdown
    ? { total: stored.total, ...stored.breakdown }
    : (APPOINTMENT_BREAKDOWN_DEFAULTS[periodKey] || APPOINTMENT_BREAKDOWN_DEFAULTS['本日']);
  const normalized = typeof normalizeAppointmentBreakdown === 'function'
    ? normalizeAppointmentBreakdown(defaults)
    : defaults;
  const total = override.total ?? override.appointmentTotal ?? defaults.total;
  const appointmentBreakdown = {
    visited: override.visited ?? normalized.visited,
    notVisited: override.notVisited ?? normalized.notVisited,
    cancelSameDay: override.cancelSameDay ?? normalized.cancelSameDay,
    cancelAdvance: override.cancelAdvance ?? normalized.cancelAdvance,
    noShow: override.noShow ?? normalized.noShow,
    cancelled: override.cancelled ?? normalized.cancelled,
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
  merged.appointments = buildAppointmentsPanel(periodKey, appointmentsOverride, detail);

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
    staffSales: { trendText: '+5.4%' },
    utilization: { value: '81.2', progress: 99, trendText: '+3.0pt' },
    appointments: { trendText: '+8件' },
    newPatients: { trend: 'up', trendText: '+1名', sub: '前日予約 2名' },
  },
  '本日': {},
  '今月': {
    unitPrice: { trend: 'up', trendText: '+3.8%' },
    staffSales: { trendText: '+4.8%' },
    utilization: { value: '76.8', progress: 94, sub: '目標 82% / 当月平均', trendText: '+1.2pt' },
    appointments: { trendText: '+48件' },
    newPatients: { trend: 'up', trendText: '+6名', sub: '目標 50名', progress: 76 },
    recall: { value: '71.5', progress: 88, trendText: '+2.1pt' },
    selfPay: { trendText: '+5.8%' },
    questionnaire: { value: '84.2', progress: 85, trendText: '+12件', sub: '完了 812件 / 未回答 48件' },
  },
  '今年': {
    unitPrice: { trend: 'up', trendText: '+5.2%' },
    staffSales: { trendText: '+9.6%' },
    utilization: { value: '74.2', progress: 90, sub: '目標 80% / 年間平均', trendText: '+0.8pt' },
    appointments: { trendText: '+412件' },
    newPatients: { trend: 'up', trendText: '+24名', sub: '前年比 +12%' },
    recall: { value: '69.8', progress: 85, trendText: '+0.9pt' },
    selfPay: { trendText: '+8.4%' },
    questionnaire: { value: '81.6', progress: 82, trendText: '+186件', sub: '年間 4,268件 / 未回答 312件' },
  },
};

function getIntelligenceData(periodKey, metricsContext = null) {
  const detail = getActivePeriodDetail(periodKey, metricsContext);
  const entityKey = metricsContext?.entityKey || 'clinic-sakura';
  const baseOverrides = (entityKey === 'clinic-sakura' || entityKey === 'all')
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
  const chartSource = typeof buildStaffSalesChartFromDetail === 'function'
    ? buildStaffSalesChartFromDetail(detail, entityKey)
    : (typeof buildStaffSalesChartForEntity === 'function'
      ? buildStaffSalesChartForEntity(entityKey, periodKey, breakdown, detail)
      : getDefaultStaffSalesChart(periodKey, detail));
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

function getDefaultStaffSalesChart(periodKey, detail = null) {
  if (detail && typeof buildStaffSalesChartFromDetail === 'function') {
    return buildStaffSalesChartFromDetail(detail, 'clinic-sakura');
  }
  if (typeof getDefaultStaffSalesChartBase === 'function') {
    return getDefaultStaffSalesChartBase(periodKey);
  }
  return { labels: ['未設定'], insurance: [0], selfPay: [0] };
}

function getStaffBreakdownFromPanels(panels) {
  const panel = panels.find((p) => p.type === 'staffSales');
  return panel?.staffBreakdown || { dr: 0, dh: 0, unset: 0 };
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
