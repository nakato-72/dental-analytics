/**
 * 階層別サンプルデータ — 医院 / 職種 / 担当ごとに数値を切り替え
 * ベースは MOCK_DATA.periodDetails（さくら歯科）を weight でスケール
 */

const PERIOD_KEYS = ['前日', '本日', '今月', '今年'];

/** 職種別売上按分 — 日次トレンドのフォールバック（KPIはチャート行合計が正） */
const STAFF_SALES_ROLE_RATIOS = { dr: 0.64, dh: 0.29, unset: 0.07 };

const PERIOD_REVENUE_GOALS = {
  前日: 202000,
  本日: 210000,
  今月: 6300000,
  今年: 33900000,
};

const SAKURA_STAFF_CHART_LABELS = ['田中 Dr', '佐藤 Dr', '鈴木 DH', '山田 DH', '未設定'];
/** 医院売上に対する担当別シェア（dr-tanaka 0.4 + dr-sato 0.24 = Dr合計 0.64） */
const SAKURA_STAFF_ROW_SHARES = [0.4, 0.24, 0.15, 0.14];
const SAKURA_DR_STAFF_SHARE_SUM = 0.4 + 0.24;
const SAKURA_DH_STAFF_SHARE_SUM = 0.15 + 0.14 + 0.11;
const SAKURA_DA_STAFF_SHARE_SUM = 0.04 + 0.03;

const HARBOR_CLINIC_WEIGHT = 0.44;
const HARBOR_DR_STAFF_SHARE_SUM = 0.52;
const HARBOR_DH_STAFF_SHARE_SUM = 0.28 + 0.14;

const HARBOR_STAFF_CHART_LABELS = ['中村 Dr', '高橋 DH', '森 DH', '未設定'];
const HARBOR_STAFF_ROW_SHARES = [0.52, 0.28, 0.14];

function splitStaffSalesTotal(total) {
  const t = Math.max(0, Math.round(total));
  const dr = Math.round(t * STAFF_SALES_ROLE_RATIOS.dr);
  const dh = Math.round(t * STAFF_SALES_ROLE_RATIOS.dh);
  const unset = Math.max(0, t - dr - dh);
  return { dr, dh, unset };
}

/** 日別合計を period の職種内訳比率で按分（トレンドチャート用） */
function splitStaffTotalsFromDetail(detail, entityKey, totals) {
  const bd = typeof getStaffSalesBreakdown === 'function'
    ? getStaffSalesBreakdown(detail, entityKey || 'clinic-sakura')
    : splitStaffSalesTotal(detail?.total || 0);
  const base = detail?.total || 0;
  if (!base || !totals?.length) {
    return { dr: [], dh: [], unset: [] };
  }
  const drR = bd.dr / base;
  const dhR = bd.dh / base;
  const unsetR = bd.unset / base;
  const dr = totals.map((v) => Math.round(v * drR));
  const dh = totals.map((v) => Math.round(v * dhR));
  const unset = totals.map((v) => Math.round(v * unsetR));
  const targetSum = totals.reduce((a, b) => a + b, 0);
  let sum = 0;
  for (let i = 0; i < totals.length; i++) {
    sum += dr[i] + dh[i] + unset[i];
  }
  const diff = targetSum - sum;
  if (diff !== 0 && unset.length) {
    unset[unset.length - 1] += diff;
  }
  return { dr, dh, unset };
}

function splitStaffSalesTotals(totals) {
  const dr = [];
  const dh = [];
  const unset = [];
  totals.forEach((total) => {
    const part = splitStaffSalesTotal(total);
    dr.push(part.dr);
    dh.push(part.dh);
    unset.push(part.unset);
  });
  return { dr, dh, unset };
}

function calcSelfPayRatePct(breakdown, total) {
  const t = total || 0;
  if (t <= 0) return 0;
  return Math.round(((breakdown?.selfPay || 0) / t) * 1000) / 10;
}

function formatSelfPayRateSub(breakdown, total, extra = '') {
  const pct = calcSelfPayRatePct(breakdown, total);
  const suffix = extra ? ` / ${extra}` : '';
  return `売上比 ${pct}%${suffix}`;
}

function buildRevenueWindowFromDetail(detail, weight = 1) {
  const c = detail?.charts || {};
  const labels = (c.labels || []).map(String);
  const map = (arr) => (arr || []).map((v) => Math.round(v * weight));
  return {
    labels,
    insurance: map(c.insurance),
    selfPay: map(c.selfPay),
    products: map(c.products),
  };
}

function buildStaffSalesWindowFromDetail(detail, weight = 1, entityKey = 'clinic-sakura') {
  const rev = buildRevenueWindowFromDetail(detail, weight);
  const totals = rev.labels.map((_, i) =>
    (rev.insurance[i] || 0) + (rev.selfPay[i] || 0) + (rev.products[i] || 0),
  );
  const split = splitStaffTotalsFromDetail(detail, entityKey, totals);
  return { labels: rev.labels, ...split };
}

const MONTHLY_CLOSED_DAYS = new Set([1, 8, 15, 29]);
const MONTH_DAYS_IN_MONTH = 30;
const MONTH_DAY_LABEL_PREFIX = '6/';

function parseAnchorDayFromSubtitle(subtitle) {
  const m = String(subtitle || '').match(/(\d{1,2})月(\d{1,2})日/);
  if (m) return Number(m[2]);
  return 23;
}

/**
 * 当月全日の日別売上（休診日・未来日は0、アンカー日は期間詳細と一致）
 * monthDetail: 今月の累計、anchorDetail: 前日/本日の確定値
 */
function buildMonthlyDailyRevenueFromDetails(monthDetail, anchorDetail, weight = 1, options = {}) {
  const daysInMonth = options.daysInMonth || MONTH_DAYS_IN_MONTH;
  const closedDays = options.closedDays || MONTHLY_CLOSED_DAYS;
  const monthPrefix = options.monthPrefix || MONTH_DAY_LABEL_PREFIX;
  const anchorDay = options.anchorDay ?? parseAnchorDayFromSubtitle(anchorDetail?.subtitle);

  const monthB = monthDetail?.breakdown || {};
  const anchorB = anchorDetail?.breakdown || {};

  const openDaysThroughAnchor = [];
  for (let d = 1; d <= anchorDay; d++) {
    if (!closedDays.has(d) || d === anchorDay) openDaysThroughAnchor.push(d);
  }
  const otherDays = openDaysThroughAnchor.filter((d) => d !== anchorDay);

  const remaining = {
    insurance: (monthB.insurance || 0) - (anchorB.insurance || 0),
    selfPay: (monthB.selfPay || 0) - (anchorB.selfPay || 0),
    products: (monthB.products || 0) - (anchorB.products || 0),
  };

  const dayMap = new Map();
  dayMap.set(anchorDay, {
    insurance: anchorB.insurance || 0,
    selfPay: anchorB.selfPay || 0,
    products: anchorB.products || 0,
  });

  if (otherDays.length) {
    const weights = otherDays.map((d) => 0.85 + ((d * 37) % 28) / 28);
    const wSum = weights.reduce((a, b) => a + b, 0) || 1;
    otherDays.forEach((d, i) => {
      const w = weights[i] / wSum;
      dayMap.set(d, {
        insurance: Math.round(remaining.insurance * w),
        selfPay: Math.round(remaining.selfPay * w),
        products: Math.round(remaining.products * w),
      });
    });
    const last = otherDays[otherDays.length - 1];
    const allocated = { insurance: 0, selfPay: 0, products: 0 };
    otherDays.forEach((d) => {
      const v = dayMap.get(d);
      allocated.insurance += v.insurance;
      allocated.selfPay += v.selfPay;
      allocated.products += v.products;
    });
    const lastEntry = dayMap.get(last);
    lastEntry.insurance += remaining.insurance - allocated.insurance;
    lastEntry.selfPay += remaining.selfPay - allocated.selfPay;
    lastEntry.products += remaining.products - allocated.products;
  }

  const labels = [];
  const insurance = [];
  const selfPay = [];
  const products = [];

  for (let d = 1; d <= daysInMonth; d++) {
    labels.push(`${monthPrefix}${d}`);
    const isFuture = d > anchorDay;
    const isClosed = closedDays.has(d) && d !== anchorDay;
    if (isFuture || isClosed) {
      insurance.push(0);
      selfPay.push(0);
      products.push(0);
      continue;
    }
    const v = dayMap.get(d) || { insurance: 0, selfPay: 0, products: 0 };
    insurance.push(Math.round(v.insurance * weight));
    selfPay.push(Math.round(v.selfPay * weight));
    products.push(Math.round(v.products * weight));
  }

  return { labels, insurance, selfPay, products };
}

function buildMonthlyDailyStaffSalesFromDetails(monthDetail, anchorDetail, weight = 1, options = {}) {
  const daily = buildMonthlyDailyRevenueFromDetails(monthDetail, anchorDetail, weight, options);
  const totals = daily.labels.map((_, i) =>
    (daily.insurance[i] || 0) + (daily.selfPay[i] || 0) + (daily.products[i] || 0),
  );
  const entityKey = options.entityKey || 'clinic-sakura';
  const split = splitStaffTotalsFromDetail(anchorDetail, entityKey, totals);
  return { labels: daily.labels, ...split };
}

// --- 患者メトリクス（外来・訪問・予約） ---

function sumVisitBreakdown(breakdown) {
  if (!breakdown) return 0;
  return (breakdown.pureFirst || 0) + (breakdown.first || 0)
    + (breakdown.return || 0) + (breakdown.other || 0);
}

function reconcileVisitBreakdown(breakdown, total) {
  const t = Math.max(0, Math.round(total));
  const b = {
    pureFirst: Math.max(0, Math.round(breakdown?.pureFirst || 0)),
    first: Math.max(0, Math.round(breakdown?.first || 0)),
    return: Math.max(0, Math.round(breakdown?.return || 0)),
    other: Math.max(0, Math.round(breakdown?.other || 0)),
  };
  const sum = sumVisitBreakdown(b);
  if (sum !== t) {
    b.first = Math.max(0, t - b.pureFirst - b.return - b.other);
  }
  return b;
}

function getOutpatientBreakdown(detail) {
  const total = detail?.visits ?? 0;
  if (detail?.patients?.outpatient?.breakdown) {
    return reconcileVisitBreakdown(detail.patients.outpatient.breakdown, total);
  }
  const charts = detail?.charts;
  const i = Math.max(0, (charts?.visits?.length ?? 1) - 1);
  const returnVisit = charts?.visitsReturn?.[i] ?? 0;
  const other = charts?.visitsReFirst?.[i] ?? 0;
  const visitsFirst = charts?.visitsFirst?.[i] ?? 0;
  const pureFirst = Math.max(0, Math.round(visitsFirst * 0.25));
  const first = Math.max(0, visitsFirst - pureFirst);
  return reconcileVisitBreakdown({ pureFirst, first, return: returnVisit, other }, total);
}

function getVisitingPatients(detail) {
  const stored = detail?.patients?.visiting;
  if (stored?.breakdown) {
    const total = stored.total ?? sumVisitBreakdown(stored.breakdown);
    return { total, breakdown: reconcileVisitBreakdown(stored.breakdown, total) };
  }
  return { total: 0, breakdown: { pureFirst: 0, first: 0, return: 0, other: 0 } };
}

function getPatientTotals(detail) {
  const outpatientTotal = detail?.visits ?? 0;
  const visiting = getVisitingPatients(detail);
  return {
    outpatient: outpatientTotal,
    visiting: visiting.total,
    total: outpatientTotal + visiting.total,
    outpatientBreakdown: getOutpatientBreakdown(detail),
    visitingBreakdown: visiting.breakdown,
  };
}

function getAppointments(detail) {
  const stored = detail?.appointments;
  if (stored?.breakdown) {
    const b = stored.breakdown;
    const total = stored.total ?? (b.visited + b.notVisited + b.cancelled + b.noShow);
    return { total, breakdown: { ...b } };
  }
  const outpatient = detail?.visits ?? 0;
  return {
    total: outpatient,
    breakdown: { visited: outpatient, notVisited: 0, cancelled: 0, noShow: 0 },
  };
}

function scaleVisitBreakdown(breakdown, weight) {
  return {
    pureFirst: Math.max(0, scaleNum(breakdown.pureFirst, weight)),
    first: Math.max(0, scaleNum(breakdown.first, weight)),
    return: Math.max(0, scaleNum(breakdown.return, weight)),
    other: Math.max(0, scaleNum(breakdown.other, weight)),
  };
}

function scalePatientsBlock(patients, weight, outpatientTotal) {
  if (!patients) return patients;
  const outB = scaleVisitBreakdown(patients.outpatient?.breakdown || {}, weight);
  const outTotal = Math.max(weight >= 0.05 ? 1 : 0, scaleNum(outpatientTotal, weight));
  const visB = scaleVisitBreakdown(patients.visiting?.breakdown || {}, weight);
  const visTotal = Math.max(0, scaleNum(patients.visiting?.total ?? sumVisitBreakdown(visB), weight));
  return {
    outpatient: { breakdown: reconcileVisitBreakdown(outB, outTotal) },
    visiting: {
      total: visTotal,
      breakdown: reconcileVisitBreakdown(visB, visTotal),
    },
  };
}

function scaleAppointmentsBlock(appointments, weight, outpatientTotal) {
  if (!appointments?.breakdown) return appointments;
  const b = appointments.breakdown;
  const visited = Math.max(0, scaleNum(outpatientTotal, weight));
  const total = Math.max(visited, scaleNum(appointments.total, weight));
  const scalePart = (n) => Math.max(0, scaleNum(n, weight));
  let notVisited = scalePart(b.notVisited);
  let cancelled = scalePart(b.cancelled);
  let noShow = scalePart(b.noShow);
  if (visited + notVisited + cancelled + noShow !== total) {
    noShow = Math.max(0, total - visited - notVisited - cancelled);
  }
  return {
    total,
    breakdown: { visited, notVisited, cancelled, noShow },
  };
}

function buildVisitBreakdownAtTotal(detail, total, weight = 1) {
  const base = getOutpatientBreakdown(detail);
  const baseTotal = detail?.visits || 1;
  const t = Math.max(0, Math.round(total * weight));
  if (baseTotal <= 0 || t <= 0) {
    return { pureFirst: 0, first: 0, return: 0, other: 0 };
  }
  const ratio = t / baseTotal;
  return reconcileVisitBreakdown({
    pureFirst: Math.round(base.pureFirst * ratio),
    first: Math.round(base.first * ratio),
    return: Math.round(base.return * ratio),
    other: Math.round(base.other * ratio),
  }, t);
}

function splitVisitBreakdownSeries(totals, detail, weight = 1) {
  const pureFirst = [];
  const first = [];
  const returnV = [];
  const other = [];
  totals.forEach((total) => {
    const part = buildVisitBreakdownAtTotal(detail, total, weight);
    pureFirst.push(part.pureFirst);
    first.push(part.first);
    returnV.push(part.return);
    other.push(part.other);
  });
  return { pureFirst, first, return: returnV, other };
}

function buildMonthlyDailyVisitBreakdownFromDetails(monthDetail, anchorDetail, weight = 1, options = {}) {
  const daysInMonth = options.daysInMonth || MONTH_DAYS_IN_MONTH;
  const closedDays = options.closedDays || MONTHLY_CLOSED_DAYS;
  const monthPrefix = options.monthPrefix || MONTH_DAY_LABEL_PREFIX;
  const anchorDay = options.anchorDay ?? parseAnchorDayFromSubtitle(anchorDetail?.subtitle);

  const monthTotal = monthDetail?.visits ?? 0;
  const anchorTotal = anchorDetail?.visits ?? 0;
  const anchorBreakdown = getOutpatientBreakdown(anchorDetail);

  const openDaysThroughAnchor = [];
  for (let d = 1; d <= anchorDay; d++) {
    if (!closedDays.has(d) || d === anchorDay) openDaysThroughAnchor.push(d);
  }
  const otherDays = openDaysThroughAnchor.filter((d) => d !== anchorDay);
  const remaining = monthTotal - anchorTotal;

  const dayTotals = new Map();
  dayTotals.set(anchorDay, anchorTotal);

  if (otherDays.length) {
    const weights = otherDays.map((d) => 0.85 + ((d * 11) % 9) / 9);
    const wSum = weights.reduce((a, b) => a + b, 0) || 1;
    const allocated = [];
    otherDays.forEach((d, i) => {
      const v = Math.round(remaining * (weights[i] / wSum));
      allocated.push(v);
      dayTotals.set(d, v);
    });
    const diff = remaining - allocated.reduce((a, b) => a + b, 0);
    if (diff !== 0 && otherDays.length) {
      const last = otherDays[otherDays.length - 1];
      dayTotals.set(last, (dayTotals.get(last) || 0) + diff);
    }
  }

  const labels = [];
  const totals = [];
  for (let d = 1; d <= daysInMonth; d++) {
    labels.push(`${monthPrefix}${d}`);
    const isFuture = d > anchorDay;
    const isClosed = closedDays.has(d) && d !== anchorDay;
    if (isFuture || isClosed) {
      totals.push(0);
      continue;
    }
    totals.push(Math.max(0, Math.round((dayTotals.get(d) || 0) * weight)));
  }

  if (anchorTotal > 0) {
    const anchorIdx = anchorDay - 1;
    const anchorScaled = Math.max(0, Math.round(anchorTotal * weight));
    totals[anchorIdx] = anchorScaled;
    const anchorB = {
      pureFirst: Math.round(anchorBreakdown.pureFirst * weight),
      first: Math.round(anchorBreakdown.first * weight),
      return: Math.round(anchorBreakdown.return * weight),
      other: Math.round(anchorBreakdown.other * weight),
    };
    const split = {
      pureFirst: [],
      first: [],
      return: [],
      other: [],
    };
    totals.forEach((t, i) => {
      if (i === anchorIdx && t > 0) {
        split.pureFirst.push(anchorB.pureFirst);
        split.first.push(anchorB.first);
        split.return.push(anchorB.return);
        split.other.push(anchorB.other);
      } else {
        const part = buildVisitBreakdownAtTotal(anchorDetail, t / weight, weight);
        split.pureFirst.push(part.pureFirst);
        split.first.push(part.first);
        split.return.push(part.return);
        split.other.push(part.other);
      }
    });
    return { labels, ...split };
  }

  return { labels, ...splitVisitBreakdownSeries(totals, anchorDetail, weight) };
}

// --- 予約メトリクス ---

function splitAppointmentBreakdown(apptTotal, breakdown, weight = 1) {
  const t = Math.max(0, Math.round(apptTotal * weight));
  if (!breakdown || t <= 0) {
    return { visited: 0, notVisited: 0, cancelled: 0, noShow: 0 };
  }
  const baseSum = (breakdown.visited || 0) + (breakdown.notVisited || 0)
    + (breakdown.cancelled || 0) + (breakdown.noShow || 0) || 1;
  const scale = t / baseSum;
  let visited = Math.round((breakdown.visited || 0) * scale);
  let notVisited = Math.round((breakdown.notVisited || 0) * scale);
  let cancelled = Math.round((breakdown.cancelled || 0) * scale);
  let noShow = Math.round((breakdown.noShow || 0) * scale);
  const sum = visited + notVisited + cancelled + noShow;
  if (sum !== t) {
    noShow = Math.max(0, t - visited - notVisited - cancelled);
  }
  return { visited, notVisited, cancelled, noShow };
}

function splitAppointmentBreakdownSeries(totals, detail, weight = 1) {
  const breakdown = getAppointments(detail).breakdown;
  const visited = [];
  const notVisited = [];
  const cancelled = [];
  const noShow = [];
  totals.forEach((total) => {
    const part = splitAppointmentBreakdown(total, breakdown, weight);
    visited.push(part.visited);
    notVisited.push(part.notVisited);
    cancelled.push(part.cancelled);
    noShow.push(part.noShow);
  });
  return { visited, notVisited, cancelled, noShow };
}

function buildMonthlyDailyAppointmentsFromDetails(monthDetail, anchorDetail, weight = 1, options = {}) {
  const visitDaily = buildMonthlyDailyVisitBreakdownFromDetails(monthDetail, anchorDetail, weight, options);
  const dayVisitTotals = visitDaily.labels.map((_, i) =>
    (visitDaily.pureFirst[i] || 0) + (visitDaily.first[i] || 0)
    + (visitDaily.return[i] || 0) + (visitDaily.other[i] || 0),
  );

  const monthAppt = getAppointments(monthDetail);
  const monthVisits = monthDetail?.visits || 1;
  const apptRatio = monthAppt.total / monthVisits;
  const anchorAppt = getAppointments(anchorDetail);
  const anchorDay = options.anchorDay ?? parseAnchorDayFromSubtitle(anchorDetail?.subtitle);
  const anchorIdx = anchorDay - 1;

  const visited = [];
  const notVisited = [];
  const cancelled = [];
  const noShow = [];

  dayVisitTotals.forEach((dayVisits, i) => {
    if (dayVisits <= 0) {
      visited.push(0);
      notVisited.push(0);
      cancelled.push(0);
      noShow.push(0);
      return;
    }
    if (i === anchorIdx) {
      const b = anchorAppt.breakdown;
      visited.push(Math.round(b.visited * weight));
      notVisited.push(Math.round(b.notVisited * weight));
      cancelled.push(Math.round(b.cancelled * weight));
      noShow.push(Math.round(b.noShow * weight));
      return;
    }
    const dayApptTotal = Math.max(0, Math.round(dayVisits * apptRatio));
    const part = splitAppointmentBreakdown(dayApptTotal, monthAppt.breakdown, 1);
    visited.push(part.visited);
    notVisited.push(part.notVisited);
    cancelled.push(part.cancelled);
    noShow.push(part.noShow);
  });

  return { labels: visitDaily.labels, visited, notVisited, cancelled, noShow };
}

function buildYearMonthAppointmentsFromDetails(detail, weight = 1) {
  const labels = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
  const idx = new Map((detail?.charts?.labels || []).map((l, i) => [String(l), i]));
  const pick = (arr, label) => {
    const i = idx.get(label);
    return i != null && Array.isArray(arr) ? arr[i] : null;
  };

  const monthAppt = getAppointments(detail);
  const monthVisits = detail?.visits || 1;
  const apptRatio = monthAppt.total / monthVisits;

  const totals = labels.map((m) => {
    const visits = pick(detail?.charts?.visits, m);
    if (visits != null) return Math.max(0, Math.round(visits * apptRatio * weight));
    return 0;
  });

  return { labels, ...splitAppointmentBreakdownSeries(totals, detail, 1) };
}

function buildYearlyAppointmentsFromDetails(detail, weight = 1) {
  const labels = detail.charts?.labels || [];
  const monthAppt = getAppointments(detail);
  const monthVisits = detail?.visits || 1;
  const apptRatio = monthAppt.total / monthVisits;

  const totals = labels.map((_, i) => {
    const visits = detail.charts?.visits?.[i] || 0;
    return Math.max(0, Math.round(visits * apptRatio * weight));
  });

  return { labels, ...splitAppointmentBreakdownSeries(totals, detail, 1) };
}

function getPopoverSegmentCount(type, detail, pageId, segmentLabel) {
  if (!detail) return null;
  const appt = getAppointments(detail);
  const out = getOutpatientBreakdown(detail);
  const vis = getVisitingPatients(detail);
  const b = detail.breakdown || {};

  if (segmentLabel && pageId && typeof getInsightPopoverKey === 'function') {
    const key = getInsightPopoverKey(pageId, segmentLabel);
    if (key) type = key;
  }

  const counts = {
    insightApptVisited: appt.breakdown.visited,
    insightApptCancel: appt.breakdown.cancelled,
    insightApptNoShow: appt.breakdown.noShow,
    insightApptPending: appt.breakdown.notVisited,
    insightVisitPureFirst: out.pureFirst + vis.breakdown.pureFirst,
    insightVisitFirst: out.first + vis.breakdown.first,
    insightVisitReturn: out.return + vis.breakdown.return,
    insightVisitOther: out.other + vis.breakdown.other,
  };

  if (type && counts[type] != null) return counts[type];

  return null;
}

const POPOVER_MAX_ROWS = 25;

function expandPopoverRows(templates, count) {
  if (!templates.length || !count || count <= 0) return [];
  const n = Math.min(Math.max(0, Math.round(count)), POPOVER_MAX_ROWS);
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({ ...templates[i % templates.length] });
  }
  return rows;
}

function parsePopoverYen(val) {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') return Math.round(val);
  return Math.round(Number(String(val).replace(/[¥,\s]/g, '')) || 0);
}

function formatPopoverYen(n) {
  return `¥${Math.round(n).toLocaleString('ja-JP')}`;
}

function scalePopoverAmounts(values, target) {
  const amounts = values.map((v) => Math.max(0, Math.round(v)));
  const sum = amounts.reduce((a, b) => a + b, 0);
  const t = Math.round(target);
  if (sum <= 0 || t <= 0) return amounts.map(() => 0);
  const scaled = amounts.map((v) => Math.round((v * t) / sum));
  const diff = t - scaled.reduce((a, b) => a + b, 0);
  if (diff !== 0 && scaled.length) scaled[scaled.length - 1] += diff;
  return scaled;
}

const SELF_PAY_MENU_RATIOS = {
  insightSelfPayImplant: 0.28,
  insightSelfPayOrtho: 0.24,
  insightSelfPayWhitening: 0.18,
};

function getPopoverSegmentAmount(type, detail, entityKey = 'clinic-sakura') {
  if (!detail || !type) return null;
  const b = detail.breakdown || {};
  const revenueMap = {
    insightRevenueInsurance: b.insurance || 0,
    insightRevenueSelfPay: b.selfPay || 0,
    insightRevenueProducts: b.products || 0,
    insightRevenueOther: b.other ?? Math.max(
      0,
      (detail.total || 0) - (b.insurance || 0) - (b.selfPay || 0) - (b.products || 0),
    ),
  };
  if (revenueMap[type] != null) return revenueMap[type];

  if (SELF_PAY_MENU_RATIOS[type] != null) {
    return Math.round((b.selfPay || 0) * SELF_PAY_MENU_RATIOS[type]);
  }
  if (type === 'insightSelfPayOther') {
    const selfTotal = b.selfPay || 0;
    const allocated = Object.values(SELF_PAY_MENU_RATIOS).reduce(
      (s, r) => s + Math.round(selfTotal * r),
      0,
    );
    return Math.max(0, selfTotal - allocated);
  }

  if (typeof getStaffSalesBreakdown === 'function') {
    const parts = getStaffSalesBreakdown(detail, entityKey);
    const staffMap = {
      insightStaffDr: parts.dr,
      insightStaffDh: parts.dh,
      insightStaffUnset: parts.unset,
    };
    if (staffMap[type] != null) return staffMap[type];
  }

  return null;
}

const POPOVER_AMOUNT_TYPES = new Set([
  'insightRevenueInsurance',
  'insightRevenueSelfPay',
  'insightRevenueProducts',
  'insightRevenueOther',
  'insightStaffDr',
  'insightStaffDh',
  'insightStaffUnset',
  'insightSelfPayImplant',
  'insightSelfPayOrtho',
  'insightSelfPayWhitening',
  'insightSelfPayOther',
]);

function scalePopoverRowsToAmount(templates, type, targetAmount, detail) {
  if (!templates.length || !targetAmount || targetAmount <= 0) {
    return templates.map((r) => ({ ...r }));
  }

  if (type === 'insightStaffDr' || type === 'insightStaffDh') {
    const total = detail.total || 1;
    const insRatio = ((detail.breakdown || {}).insurance || 0) / total;
    const baseTotals = templates.map((r) => parsePopoverYen(r.total));
    const scaledTotals = scalePopoverAmounts(baseTotals, targetAmount);
    return templates.map((r, i) => {
      const rowTotal = scaledTotals[i];
      const ins = Math.round(rowTotal * insRatio);
      return {
        ...r,
        insurance: formatPopoverYen(ins),
        selfPay: formatPopoverYen(rowTotal - ins),
        total: formatPopoverYen(rowTotal),
      };
    });
  }

  const amountKey = 'amount';
  const base = templates.map((r) => parsePopoverYen(r[amountKey]));
  const scaled = scalePopoverAmounts(base, targetAmount);
  return templates.map((r, i) => ({ ...r, [amountKey]: formatPopoverYen(scaled[i]) }));
}

function buildInsightPopoverRows(type, templates, detail, options = {}) {
  if (!detail) return templates.map((r) => ({ ...r }));

  let resolvedType = type;
  if (options.segmentLabel && options.pageId && typeof getInsightPopoverKey === 'function') {
    const key = getInsightPopoverKey(options.pageId, options.segmentLabel);
    if (key) resolvedType = key;
  }

  const entityKey = options.entityKey || 'clinic-sakura';
  const staffTypes = new Set(['insightStaffDr', 'insightStaffDh', 'insightStaffUnset']);
  if (staffTypes.has(resolvedType) && typeof buildStaffSalesPopoverRows === 'function') {
    const staffRows = buildStaffSalesPopoverRows(resolvedType, detail, entityKey, templates);
    if (staffRows?.length) return staffRows;
  }

  const amount = getPopoverSegmentAmount(resolvedType, detail, entityKey);
  if (amount != null && amount > 0 && POPOVER_AMOUNT_TYPES.has(resolvedType)) {
    return scalePopoverRowsToAmount(templates, resolvedType, amount, detail);
  }

  if (typeof getPopoverSegmentCount === 'function' && typeof expandPopoverRows === 'function') {
    const count = getPopoverSegmentCount(resolvedType, detail, options.pageId, options.segmentLabel);
    if (count != null) return expandPopoverRows(templates, count);
  }

  return templates.map((r) => ({ ...r }));
}

function reconcileShareAmounts(amounts, target) {
  const next = amounts.map((v) => Math.round(v));
  const diff = Math.round(target) - next.reduce((s, v) => s + v, 0);
  if (diff !== 0 && next.length) next[next.length - 1] += diff;
  return next;
}

/** 売上内訳をスタッフ行に按分（保険・自費の比率を維持） */
function buildStaffSalesChartFromBreakdown(detail, labels, fixedShares) {
  const b = detail?.breakdown || {};
  const total = detail?.total || 0;
  if (!total || !labels.length) {
    return { labels: [], insurance: [], selfPay: [] };
  }
  const sumFixed = fixedShares.reduce((s, v) => s + v, 0);
  const shares = [...fixedShares];
  if (labels.length > fixedShares.length) {
    shares.push(Math.max(0, 1 - sumFixed));
  }
  while (shares.length < labels.length) shares.push(0);
  shares.length = labels.length;
  const shareSum = shares.reduce((s, v) => s + v, 0) || 1;

  const insRatio = b.insurance / total;
  const selfRatio = b.selfPay / total;
  const prodRatio = (b.products || 0) / total;
  const otherRatio = (b.other || 0) / total;

  const rowTotals = reconcileShareAmounts(
    shares.map((share) => Math.round(total * share)),
    Math.round(total * shareSum),
  );
  const targetIns = Math.round((b.insurance || 0) * shareSum);

  const insurance = reconcileShareAmounts(
    rowTotals.map((rowTotal) => Math.round(rowTotal * insRatio)),
    targetIns,
  );
  const selfPay = rowTotals.map((rowTotal, i) => rowTotal - insurance[i]);

  return {
    labels: [...labels],
    insurance,
    selfPay,
  };
}

function buildStaffSalesChartFromDetail(detail, entityKey) {
  const meta = ENTITY_META[entityKey];
  const clinicId = meta?.clinicId || 'clinic-sakura';

  if (entityKey.startsWith('dr-') || entityKey.startsWith('dh-')) {
    const name = meta.shortName || meta.label;
    const base = buildStaffSalesChartFromBreakdown(
      detail,
      clinicId === 'clinic-harbor' ? HARBOR_STAFF_CHART_LABELS : SAKURA_STAFF_CHART_LABELS,
      clinicId === 'clinic-harbor' ? HARBOR_STAFF_ROW_SHARES : SAKURA_STAFF_ROW_SHARES,
    );
    const idx = base.labels.findIndex((l) => l.includes(name.split(' ')[0]));
    if (idx >= 0) {
      return {
        labels: [name],
        insurance: [base.insurance[idx]],
        selfPay: [base.selfPay[idx]],
      };
    }
    const share = ENTITY_WEIGHTS[entityKey] || 0.2;
    return buildStaffSalesChartFromBreakdown(
      { ...detail, total: Math.round(detail.total * share), breakdown: {
        insurance: Math.round((detail.breakdown?.insurance || 0) * share),
        selfPay: Math.round((detail.breakdown?.selfPay || 0) * share),
        products: Math.round((detail.breakdown?.products || 0) * share),
        other: Math.round((detail.breakdown?.other || 0) * share),
      } },
      [name],
      [1],
    );
  }

  if (entityKey.endsWith('-Dr')) {
    const labels = clinicId === 'clinic-harbor' ? ['中村 Dr'] : ['田中 Dr', '佐藤 Dr'];
    const shares = clinicId === 'clinic-harbor'
      ? [1]
      : [0.4 / SAKURA_DR_STAFF_SHARE_SUM, 0.24 / SAKURA_DR_STAFF_SHARE_SUM];
    return buildStaffSalesChartFromBreakdown(detail, labels, shares);
  }

  if (entityKey.endsWith('-DH')) {
    const labels = clinicId === 'clinic-harbor' ? ['高橋 DH', '森 DH'] : ['鈴木 DH', '山田 DH', '伊藤 DH'];
    const shares = clinicId === 'clinic-harbor'
      ? [0.28 / HARBOR_DH_STAFF_SHARE_SUM, 0.14 / HARBOR_DH_STAFF_SHARE_SUM]
      : [0.15 / SAKURA_DH_STAFF_SHARE_SUM, 0.14 / SAKURA_DH_STAFF_SHARE_SUM, 0.11 / SAKURA_DH_STAFF_SHARE_SUM];
    return buildStaffSalesChartFromBreakdown(detail, labels, shares);
  }

  if (entityKey.endsWith('-DA')) {
    return buildStaffSalesChartFromBreakdown(detail, ['未設定'], [1]);
  }

  if (entityKey === 'clinic-harbor') {
    return buildStaffSalesChartFromBreakdown(detail, HARBOR_STAFF_CHART_LABELS, HARBOR_STAFF_ROW_SHARES);
  }

  return buildStaffSalesChartFromBreakdown(detail, SAKURA_STAFF_CHART_LABELS, SAKURA_STAFF_ROW_SHARES);
}

const ENTITY_WEIGHTS = {
  all: 1.65,
  'clinic-sakura': 1,
  'clinic-harbor': 0.44,
  /** Dr担当シェア合計（0.4+0.24）— 医院の64%が田中+佐藤 */
  'clinic-sakura-Dr': SAKURA_DR_STAFF_SHARE_SUM,
  'clinic-sakura-DH': SAKURA_DH_STAFF_SHARE_SUM,
  'clinic-sakura-DA': SAKURA_DA_STAFF_SHARE_SUM,
  'clinic-harbor-Dr': HARBOR_CLINIC_WEIGHT * HARBOR_DR_STAFF_SHARE_SUM,
  'clinic-harbor-DH': HARBOR_CLINIC_WEIGHT * HARBOR_DH_STAFF_SHARE_SUM,
  'clinic-harbor-DA': 0.05,
  'dr-tanaka': 0.4,
  'dr-sato': 0.24,
  'dr-nakamura': 0.38,
  'dh-suzuki': 0.15,
  'dh-yamada': 0.14,
  'dh-ito': 0.11,
  'dh-takahashi': 0.14,
  'dh-mori': 0.1,
  'da-watanabe': 0.04,
  'da-kobayashi': 0.03,
  'da-kato': 0.05,
};

const ENTITY_META = {
  all: { label: '全院', role: null },
  'clinic-sakura': { label: 'さくら歯科クリニック', clinicId: 'clinic-sakura' },
  'clinic-harbor': { label: 'ハーバー歯科医院', clinicId: 'clinic-harbor' },
  'clinic-sakura-Dr': { label: 'さくら歯科 — Dr', role: 'Dr', clinicId: 'clinic-sakura' },
  'clinic-sakura-DH': { label: 'さくら歯科 — DH', role: 'DH', clinicId: 'clinic-sakura' },
  'clinic-sakura-DA': { label: 'さくら歯科 — DA', role: 'DA', clinicId: 'clinic-sakura' },
  'clinic-harbor-Dr': { label: 'ハーバー歯科 — Dr', role: 'Dr', clinicId: 'clinic-harbor' },
  'clinic-harbor-DH': { label: 'ハーバー歯科 — DH', role: 'DH', clinicId: 'clinic-harbor' },
  'clinic-harbor-DA': { label: 'ハーバー歯科 — DA', role: 'DA', clinicId: 'clinic-harbor' },
  'dr-tanaka': { label: '田中 健一', role: 'Dr', clinicId: 'clinic-sakura', shortName: '田中 Dr' },
  'dr-sato': { label: '佐藤 誠', role: 'Dr', clinicId: 'clinic-sakura', shortName: '佐藤 Dr' },
  'dr-nakamura': { label: '中村 翔', role: 'Dr', clinicId: 'clinic-harbor', shortName: '中村 Dr' },
  'dh-suzuki': { label: '鈴木 美咲', role: 'DH', clinicId: 'clinic-sakura', shortName: '鈴木 DH' },
  'dh-yamada': { label: '山田 恵', role: 'DH', clinicId: 'clinic-sakura', shortName: '山田 DH' },
  'dh-ito': { label: '伊藤 彩', role: 'DH', clinicId: 'clinic-sakura', shortName: '伊藤 DH' },
  'dh-takahashi': { label: '高橋 優', role: 'DH', clinicId: 'clinic-harbor', shortName: '高橋 DH' },
  'dh-mori': { label: '森 奈々', role: 'DH', clinicId: 'clinic-harbor', shortName: '森 DH' },
  'da-watanabe': { label: '渡辺 花子', role: 'DA', clinicId: 'clinic-sakura', shortName: '渡辺 DA' },
  'da-kobayashi': { label: '小林 太郎', role: 'DA', clinicId: 'clinic-sakura', shortName: '小林 DA' },
  'da-kato': { label: '加藤 真由', role: 'DA', clinicId: 'clinic-harbor', shortName: '加藤 DA' },
};

const STAFF_TRAITS = {
  'dr-tanaka': { selfPayBias: 1.12, trendText: '+4.2%', trend: 'up', utilization: 82 },
  'dr-sato': { selfPayBias: 0.92, trendText: '-1.8%', trend: 'down', utilization: 74 },
  'dr-nakamura': { selfPayBias: 0.88, trendText: '+2.4%', trend: 'up', utilization: 68 },
  'dh-suzuki': { selfPayBias: 0.95, trendText: '+3.1%', trend: 'up', utilization: 86 },
  'dh-yamada': { selfPayBias: 1.05, trendText: '-0.6%', trend: 'flat', utilization: 72 },
  'dh-ito': { selfPayBias: 1.08, trendText: '+5.8%', trend: 'up', utilization: 91 },
  'dh-takahashi': { selfPayBias: 0.9, trendText: '+1.2%', trend: 'up', utilization: 70 },
  'dh-mori': { selfPayBias: 0.85, trendText: '-2.4%', trend: 'down', utilization: 62 },
  'da-watanabe': { trendText: '+1.0%', trend: 'up', utilization: 88 },
  'da-kobayashi': { trendText: '±0', trend: 'flat', utilization: 76 },
  'da-kato': { trendText: '+2.2%', trend: 'up', utilization: 84 },
};

const periodDetailsCache = new Map();

function resolveEntityKey({ level, clinicId, role, staffId }) {
  if (level === 'staff' && staffId) return staffId;
  if (level === 'role' && clinicId && role) return `${clinicId}-${role}`;
  if (level === 'clinic' && clinicId) return clinicId;
  if (level === 'all') return 'all';
  return clinicId || 'clinic-sakura';
}

function getMetricsContext(state) {
  const entityKey = resolveEntityKey(state);
  return {
    entityKey,
    weight: ENTITY_WEIGHTS[entityKey] ?? 1,
    meta: ENTITY_META[entityKey] || { label: '' },
  };
}

function scaleNum(n, w) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return n;
  return Math.round(n * w);
}

function scaleArray(arr, w) {
  return (arr || []).map((v) => scaleNum(v, w));
}

function formatYenValue(n) {
  return '¥' + Math.round(n).toLocaleString('ja-JP');
}

function rebalanceBreakdown(breakdown, total, selfPayBias = 1) {
  const ins = scaleNum((breakdown.insurance || 0), 1);
  const self = scaleNum((breakdown.selfPay || 0) * selfPayBias, 1);
  const prod = scaleNum(breakdown.products || 0, 1);
  let other = scaleNum(breakdown.other || 0, 1);
  let sum = ins + self + prod + other;
  if (sum !== total) {
    const ratio = total / (sum || 1);
    const b = {
      insurance: Math.round(ins * ratio),
      selfPay: Math.round(self * ratio),
      products: Math.round(prod * ratio),
      other: 0,
    };
    b.other = Math.max(0, total - b.insurance - b.selfPay - b.products);
    return b;
  }
  return { insurance: ins, selfPay: self, products: prod, other };
}

function scalePeriodDetail(base, weight, meta) {
  const detail = JSON.parse(JSON.stringify(base));
  const traits = STAFF_TRAITS[meta?.entityKey] || {};
  const selfPayBias = traits.selfPayBias || 1;

  detail.total = scaleNum(base.total, weight);
  detail.visits = Math.max(weight >= 0.05 ? 1 : 0, scaleNum(base.visits, weight));
  detail.breakdown = rebalanceBreakdown({
    insurance: scaleNum(base.breakdown.insurance, weight),
    selfPay: scaleNum((base.breakdown.selfPay || 0) * selfPayBias, weight),
    products: scaleNum(base.breakdown.products, weight),
    other: scaleNum(base.breakdown.other, weight),
  }, detail.total);

  if (detail.charts) {
    detail.charts.insurance = scaleArray(base.charts.insurance, weight);
    detail.charts.selfPay = scaleArray(base.charts.selfPay, weight * selfPayBias);
    detail.charts.products = scaleArray(base.charts.products, weight);
    detail.charts.other = scaleArray(base.charts.other, weight);
    detail.charts.visits = scaleArray(base.charts.visits, weight);
    detail.charts.visitsFirst = scaleArray(base.charts.visitsFirst, weight);
    detail.charts.visitsReFirst = scaleArray(base.charts.visitsReFirst, weight);
    detail.charts.visitsReturn = scaleArray(base.charts.visitsReturn, weight);
    detail.charts.compareRevenue = scaleArray(base.charts.compareRevenue, weight);
    detail.charts.compareVisits = scaleArray(base.charts.compareVisits, weight);
  }

  if (meta?.label && detail.subtitle) {
    detail.subtitle = `${meta.label} · ${base.subtitle}`;
  }

  if (detail.insights) {
    detail.insights = detail.insights.map((item) => {
      const next = { ...item };
      if (item.label === '患者単価' && detail.visits > 0) {
        next.value = formatYenValue(Math.round(detail.total / detail.visits));
      }
      if (item.label === '自費率' && detail.total > 0) {
        next.value = String(calcSelfPayRatePct(detail.breakdown, detail.total));
      }
      if (item.unit === '名' || item.label?.includes('新患')) {
        next.value = String(Math.max(0, scaleNum(Number(item.value.replace(/,/g, '')) || 0, weight)));
      }
      if (item.unit === '件' || item.label?.includes('予約')) {
        const num = parseInt(String(item.value).replace(/,/g, ''), 10);
        if (Number.isFinite(num)) next.value = String(Math.max(0, scaleNum(num, weight)));
      }
      if (item.cancelCount != null) {
        next.cancelCount = Math.max(0, scaleNum(item.cancelCount, weight));
      }
      return next;
    });
  }

  if (detail.cashflow) {
    detail.cashflow = detail.cashflow.map((row) => {
      const next = { ...row };
      if (String(row.value).startsWith('¥')) {
        const amt = parseInt(String(row.value).replace(/[¥,]/g, ''), 10) || 0;
        next.value = formatYenValue(scaleNum(amt, weight));
      }
      return next;
    });
  }

  if (base.patients) {
    detail.patients = scalePatientsBlock(base.patients, weight, base.visits);
  }
  if (base.appointments) {
    detail.appointments = scaleAppointmentsBlock(base.appointments, weight, base.visits);
  }

  return detail;
}

function derivePeriodCard(periodKey, weight, entityKey = 'clinic-sakura') {
  const base = MOCK_DATA.periodDetails[periodKey];
  if (!base) return null;
  const detail = scalePeriodDetail(JSON.parse(JSON.stringify(base)), weight, { entityKey });
  const b = detail.breakdown;
  return {
    label: periodKey,
    value: formatYenValue(detail.total),
    visits: detail.visits,
    change: base.change?.text,
    changeUp: base.change?.up,
    active: periodKey === '本日',
    visitsCumulative: periodKey === '今月' || periodKey === '今年',
    revenue: {
      goal: scaleNum(PERIOD_REVENUE_GOALS[periodKey] || 0, weight),
      insurance: b.insurance,
      selfPay: b.selfPay,
      products: b.products,
      other: b.other || 0,
    },
  };
}

function buildEntityPeriodDetails(entityKey, weight) {
  const meta = { ...ENTITY_META[entityKey], entityKey };
  const result = {};
  PERIOD_KEYS.forEach((pk) => {
    const base = MOCK_DATA.periodDetails[pk];
    if (base) result[pk] = scalePeriodDetail(base, weight, meta);
  });
  return result;
}

function getEntityPeriodDetails(entityKey) {
  if (!periodDetailsCache.has(entityKey)) {
    const weight = ENTITY_WEIGHTS[entityKey] ?? 1;
    periodDetailsCache.set(entityKey, buildEntityPeriodDetails(entityKey, weight));
  }
  return periodDetailsCache.get(entityKey);
}

function resolvePeriodDetail(periodKey, metricsContext) {
  const ctx = metricsContext || { entityKey: 'clinic-sakura', weight: 1 };
  const details = getEntityPeriodDetails(ctx.entityKey);
  return details[periodKey] || details['本日'];
}

function scalePeriodCard(period, weight, selfPayBias = 1) {
  const rev = period.revenue || {};
  const insurance = scaleNum(rev.insurance || 0, weight);
  const selfPay = scaleNum((rev.selfPay || 0) * selfPayBias, weight);
  const products = scaleNum(rev.products || 0, weight);
  const total = insurance + selfPay + products + scaleNum(rev.other || 0, weight);
  return {
    ...period,
    value: formatYenValue(total),
    visits: scaleNum(period.visits || 0, weight),
    revenue: {
      ...rev,
      goal: scaleNum(rev.goal || 0, weight),
      insurance,
      selfPay,
      products,
      other: scaleNum(rev.other || 0, weight),
    },
  };
}

function resolveSharedMetrics(metricsContext) {
  const base = JSON.parse(JSON.stringify(MOCK_DATA.unified.shared));
  const ctx = metricsContext || { entityKey: 'clinic-sakura', weight: 1 };
  const weight = ctx.weight;
  const entityKey = ctx.entityKey || 'clinic-sakura';

  base.periods = PERIOD_KEYS.map((pk) => derivePeriodCard(pk, weight, entityKey)).filter(Boolean);

  const monthDetail = resolvePeriodDetail('今月', ctx);
  const monthGoal = scaleNum(PERIOD_REVENUE_GOALS['今月'], weight);
  base.primary.value = formatYenValue(monthDetail.total);
  base.primary.goal = formatYenValue(monthGoal);
  base.primary.progress = monthGoal > 0
    ? Math.min(100, Math.round((monthDetail.total / monthGoal) * 1000) / 10)
    : 0;

  base.secondary[0].value = String(monthDetail.visits);
  base.secondary[1].value = String(calcSelfPayRatePct(monthDetail.breakdown, monthDetail.total));

  return base;
}

function buildStaffSalesOverride(entityKey, detail) {
  const total = detail.total;
  const meta = ENTITY_META[entityKey];
  const traits = STAFF_TRAITS[entityKey] || {};

  if (meta?.role === 'Dr' && entityKey.startsWith('dr-')) {
    return { total, dr: total, dh: 0, unset: 0, trendText: traits.trendText, trend: traits.trend };
  }
  if (meta?.role === 'DH' && entityKey.startsWith('dh-')) {
    return { total, dr: 0, dh: total, unset: 0, trendText: traits.trendText, trend: traits.trend };
  }
  if (meta?.role === 'DA' && (entityKey.startsWith('da-') || entityKey.endsWith('-DA'))) {
    return { total, dr: 0, dh: 0, unset: total, trendText: traits.trendText, trend: traits.trend };
  }
  return null;
}

/** 職種別売上内訳 — チャート行の職種合計を正とする（KPI・ポップオーバー共通） */
function computeStaffBreakdownFromChart(detail, entityKey = 'clinic-sakura') {
  const raw = buildStaffSalesChartFromDetail(detail, entityKey);
  const rows = raw.labels.map((label, i) => ({
    role: staffChartRowRole(label),
    total: (raw.insurance[i] || 0) + (raw.selfPay[i] || 0),
  }));
  let dr = rows.filter((r) => r.role === 'dr').reduce((s, r) => s + r.total, 0);
  let dh = rows.filter((r) => r.role === 'dh').reduce((s, r) => s + r.total, 0);
  let unset = rows.filter((r) => r.role === 'unset').reduce((s, r) => s + r.total, 0);
  const target = Math.round(detail?.total || 0);
  const diff = target - dr - dh - unset;
  if (diff !== 0) {
    unset = Math.max(0, unset + diff);
  }
  return { dr, dh, unset };
}

function getStaffSalesBreakdown(detail, entityKey = 'clinic-sakura') {
  const override = buildStaffSalesOverride(entityKey, detail);
  if (override && (entityKey.startsWith('dr-') || entityKey.startsWith('dh-') || entityKey.startsWith('da-') || entityKey.endsWith('-DA'))) {
    return {
      dr: override.dr || 0,
      dh: override.dh || 0,
      unset: override.unset || 0,
    };
  }
  return computeStaffBreakdownFromChart(detail, entityKey);
}

function staffChartRowRole(label) {
  const text = String(label || '');
  if (text.includes('未設定')) return 'unset';
  if (text.includes('DH')) return 'dh';
  return 'dr';
}

function mapStaffChartLabelToName(chartLabel) {
  const short = String(chartLabel || '').trim();
  for (const meta of Object.values(ENTITY_META)) {
    if (meta.shortName === short) return meta.label;
  }
  return short;
}

function scaleStaffChartRoleRows(rows, target) {
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

/** チャート各行の合計が職種内訳（Dr+DH+未設定）と一致するよう調整 */
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

  const rows = chartCopy.labels.map((label, i) => ({
    label,
    insurance: chartCopy.insurance[i] || 0,
    selfPay: chartCopy.selfPay[i] || 0,
    total: (chartCopy.insurance[i] || 0) + (chartCopy.selfPay[i] || 0),
    role: staffChartRowRole(label),
  }));

  let drSum = rows.filter((r) => r.role === 'dr').reduce((s, r) => s + r.total, 0);
  let dhSum = rows.filter((r) => r.role === 'dh').reduce((s, r) => s + r.total, 0);
  const unsetRow = rows.find((r) => r.role === 'unset');

  if (unsetRow) {
    unsetRow.total = breakdown.unset;
    const rowIdx = chartCopy.labels.indexOf(unsetRow.label);
    const baseIns = chartCopy.insurance[rowIdx] || 0;
    const baseTotal = baseIns + (chartCopy.selfPay[rowIdx] || 0);
    const insRatio = baseTotal > 0 ? baseIns / baseTotal : 0.6;
    unsetRow.insurance = Math.round(breakdown.unset * insRatio);
    unsetRow.selfPay = breakdown.unset - unsetRow.insurance;
  }

  drSum = rows.filter((r) => r.role === 'dr').reduce((s, r) => s + r.total, 0);
  dhSum = rows.filter((r) => r.role === 'dh').reduce((s, r) => s + r.total, 0);

  if (drSum !== breakdown.dr || dhSum !== breakdown.dh) {
    scaleStaffChartRoleRows(rows.filter((r) => r.role === 'dr'), breakdown.dr);
    scaleStaffChartRoleRows(rows.filter((r) => r.role === 'dh'), breakdown.dh);
  }

  return {
    labels: rows.map((r) => r.label),
    insurance: rows.map((r) => r.insurance),
    selfPay: rows.map((r) => r.selfPay),
    breakdown,
  };
}

function getReconciledStaffSalesChart(detail, entityKey = 'clinic-sakura') {
  const breakdown = getStaffSalesBreakdown(detail, entityKey);
  const chart = buildStaffSalesChartFromDetail(detail, entityKey);
  return reconcileStaffSalesChart(chart, breakdown);
}

function buildStaffSalesPopoverRows(type, detail, entityKey = 'clinic-sakura', templates = []) {
  const breakdown = getStaffSalesBreakdown(detail, entityKey);
  const chart = getReconciledStaffSalesChart(detail, entityKey);
  const roleByType = {
    insightStaffDr: 'dr',
    insightStaffDh: 'dh',
    insightStaffUnset: 'unset',
  };
  const role = roleByType[type];
  if (!role) return null;

  const chartRows = chart.labels.map((label, i) => ({
    label,
    insurance: chart.insurance[i] || 0,
    selfPay: chart.selfPay[i] || 0,
    total: (chart.insurance[i] || 0) + (chart.selfPay[i] || 0),
    role: staffChartRowRole(label),
  })).filter((r) => r.role === role);

  if (type === 'insightStaffUnset') {
    const target = breakdown.unset;
    if (target <= 0) return [];
    if (templates.length) {
      return scalePopoverRowsToAmount(templates, type, target, detail);
    }
    return chartRows.map((r) => ({
      patient: r.label,
      item: '売上',
      amount: formatPopoverYen(r.total),
    }));
  }

  if (!chartRows.length) return null;

  return chartRows.map((r) => ({
    name: mapStaffChartLabelToName(r.label),
    insurance: formatPopoverYen(r.insurance),
    selfPay: formatPopoverYen(r.selfPay),
    total: formatPopoverYen(r.total),
  }));
}

function buildIntelOverridesForEntity(entityKey, periodKey, detail) {
  if (entityKey === 'clinic-sakura') return {};

  const meta = ENTITY_META[entityKey];
  const traits = STAFF_TRAITS[entityKey] || {};
  const total = detail.total;
  const visits = detail.visits;
  const overrides = {};

  const staffSales = buildStaffSalesOverride(entityKey, detail);
  if (staffSales) overrides.staffSales = staffSales;

  if (meta?.role === 'DA' || entityKey.endsWith('-DA')) {
    overrides.utilization = {
      value: String(traits.utilization || 78),
      progress: traits.utilization || 78,
      sub: '予約対応・受付稼働',
      trendText: traits.trendText || '±0',
    };
    overrides.appointments = {
      total: Math.max(1, scaleNum(getAppointments(detail).total, ENTITY_WEIGHTS[entityKey] || 1)),
      visited: Math.max(0, scaleNum(detail.visits, ENTITY_WEIGHTS[entityKey] || 1)),
      trendText: traits.trendText || '±0',
    };
  }

  if (meta?.role === 'Dr' && entityKey.startsWith('dr-')) {
    overrides.unitPrice = { trend: traits.trend, trendText: traits.trendText };
    overrides.visits = { total: visits, visitBreakdown: { pureFirst: Math.max(0, Math.round(visits * 0.08)), first: Math.max(0, Math.round(visits * 0.22)), return: Math.max(0, Math.round(visits * 0.62)), other: Math.max(0, Math.round(visits * 0.08)) } };
    overrides.newPatients = { total: Math.max(0, Math.round(visits * 0.12)), pureFirst: Math.max(0, Math.round(visits * 0.04)), first: Math.max(0, Math.round(visits * 0.04)), return: Math.max(0, Math.round(visits * 0.03)), other: Math.max(0, Math.round(visits * 0.01)) };
  }

  if (meta?.role === 'DH' && entityKey.startsWith('dh-')) {
    overrides.recall = { value: String(62 + Math.round((traits.utilization || 75) * 0.12)), progress: traits.utilization || 80, trendText: traits.trendText };
    overrides.visits = { total: visits };
  }

  const selfPayAmt = Math.max(1000, scaleNum((detail?.breakdown?.selfPay) || 42800, ENTITY_WEIGHTS[entityKey] || 1));
  overrides.selfPay = {
    value: typeof intelFormatYen === 'function' ? intelFormatYen(selfPayAmt) : `¥${selfPayAmt.toLocaleString('ja-JP')}`,
    trendText: traits.trendText,
  };
  overrides.questionnaire = {
    value: String(78 + Math.round((traits.utilization || 75) * 0.08)),
    trendText: traits.trendText,
  };

  if (periodKey === '今月' || periodKey === '今年') {
    const appt = getAppointments(detail);
    overrides.appointments = overrides.appointments || {
      total: Math.max(1, scaleNum(appt.total, ENTITY_WEIGHTS[entityKey] || 1)),
      trendText: traits.trendText || '+4.8%',
    };
  }

  return overrides;
}

function buildStaffSalesChartForEntity(entityKey, periodKey, breakdown, detail) {
  const chart = buildStaffSalesChartFromDetail(detail, entityKey);
  return { ...chart, breakdown };
}

function getDefaultStaffSalesChartBase(periodKey) {
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

function filterChartByLabels(chart, labels, breakdown) {
  const indices = labels.map((label) => chart.labels.indexOf(label)).filter((i) => i >= 0);
  return {
    labels,
    insurance: indices.map((i) => chart.insurance[i]),
    selfPay: indices.map((i) => chart.selfPay[i]),
    breakdown,
  };
}

function buildUtilizationChartForEntity(entityKey, periodKey) {
  const base = {
    '前日': { labels: ['U1', 'U2', 'U3', 'U4'], values: [84, 79, 82, 80], goal: 82 },
    '本日': { labels: ['U1', 'U2', 'U3', 'U4'], values: [76, 81, 74, 82], goal: 82 },
    '今月': { labels: ['第1週', '第2週', '第3週', '第4週'], values: [74, 76, 78, 77], goal: 82 },
    '今年': { labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [72, 74, 75, 74], goal: 80 },
  }[periodKey] || { labels: ['U1', 'U2', 'U3', 'U4'], values: [76, 81, 74, 82], goal: 82 };

  const traits = STAFF_TRAITS[entityKey];
  if (traits?.utilization) {
    const offset = traits.utilization - 78;
    return {
      ...base,
      values: base.values.map((v) => Math.min(98, Math.max(40, v + offset))),
    };
  }

  if (entityKey === 'clinic-harbor') {
    return { ...base, values: base.values.map((v) => Math.max(45, v - 8)) };
  }

  return base;
}
