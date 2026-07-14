/**
 * 階層別サンプルデータ — 医院 / 職種 / 担当ごとに数値を切り替え
 * 日次ファクト（daily facts）を正本とし、期間合計は集計で算出（ボトムアップ）
 * MOCK_DATA.periodDetails はテンプレート（チャートメタ・前年比など）兼シード値
 */

const PERIOD_KEYS = ['前日', '本日', '今月', '今年'];

/** 売上を担当に帰属できる職種（歯科助手は売上なし） */
const SALES_ATTRIBUTION_ROLES = ['Dr', 'DH'];
const UNSET_CHART_LABEL = '未設定';

function getClinics() {
  return MOCK_DATA?.clinics || [];
}

function getClinicById(clinicId) {
  return getClinics().find((c) => c.id === clinicId) || null;
}

function getClinicRevenueWeight(clinicId) {
  const w = getClinicById(clinicId)?.revenueWeight;
  return Number.isFinite(w) ? w : 1;
}

function getAllClinicsRevenueWeight() {
  return getClinics().reduce((sum, c) => sum + getClinicRevenueWeight(c.id), 0);
}

function staffMemberChartLabel(member, roleKey) {
  const roleShort = roleKey === 'Dr' ? 'Dr' : (roleKey === 'DH' ? 'DH' : roleKey);
  const firstName = String(member?.name || '').split(/\s+/)[0];
  return `${firstName} ${roleShort}`;
}

function buildStaffRevenueRegistry() {
  const registry = {};
  getClinics().forEach((clinic) => {
    const rows = [];
    SALES_ATTRIBUTION_ROLES.forEach((roleKey) => {
      (clinic.roles?.[roleKey] || []).forEach((member) => {
        const share = Number(member.salesShare);
        if (!Number.isFinite(share) || share <= 0) return;
        rows.push({
          id: member.id,
          chartLabel: staffMemberChartLabel(member, roleKey),
          role: roleKey,
          share,
          name: member.name,
        });
      });
    });
    registry[clinic.id] = rows;
  });
  return registry;
}

let staffRevenueRegistryCache = null;

function getStaffRevenueRegistry() {
  if (!staffRevenueRegistryCache) staffRevenueRegistryCache = buildStaffRevenueRegistry();
  return staffRevenueRegistryCache;
}

function getStaffRegistry(clinicId) {
  return getStaffRevenueRegistry()[clinicId] || [];
}

function sumStaffShares(staff, role = null) {
  const rows = role ? staff.filter((s) => s.role === role) : staff;
  return rows.reduce((sum, s) => sum + s.share, 0);
}

function getStaffRoleShares(clinicId) {
  const staff = getStaffRegistry(clinicId);
  return {
    dr: sumStaffShares(staff, 'Dr'),
    dh: sumStaffShares(staff, 'DH'),
  };
}

function splitStaffSalesTotal(total, clinicId = 'clinic-sakura') {
  const t = Math.max(0, Math.round(total));
  const staff = getStaffRegistry(clinicId);
  if (!staff.length) {
    return { dr: 0, dh: 0, unset: t };
  }
  const dr = staff
    .filter((s) => s.role === 'Dr')
    .reduce((sum, s) => sum + Math.round(t * s.share), 0);
  const dh = staff
    .filter((s) => s.role === 'DH')
    .reduce((sum, s) => sum + Math.round(t * s.share), 0);
  const attributed = dr + dh;
  if (attributed <= t) {
    return { dr, dh, unset: t - attributed };
  }
  const scale = t / attributed;
  const scaledDr = Math.round(dr * scale);
  const scaledDh = Math.round(dh * scale);
  const unset = Math.max(0, t - scaledDr - scaledDh);
  return { dr: scaledDr, dh: scaledDh, unset };
}

const PERIOD_REVENUE_GOALS = {
  前日: 202000,
  本日: 210000,
  今月: 6300000,
  今年: 33900000,
};

const CLINIC_GOALS_STORAGE_KEY = 'clinicMonthlyGoals';
const DEFAULT_CLINIC_MONTHLY_GOALS = {
  // 患者（実人数）
  monthlyNewPatients: 50,
  monthlyRevisitPatients: 950,
  monthlyPatients: 1000,
  monthlyVisitCount: 1200,
  monthlySelfPayPatients: 400,
  // 売上（月間）
  monthlyRevenue: PERIOD_REVENUE_GOALS['今月'],
  monthlySelfPayRevenue: 2394000,
  // 予約
  monthlyCancelCount: 30,
  monthlyCancelRatePct: 3.5,
  monthlyNoShowCount: 5,
  monthlyBookingFillRatePct: 82,
  // 定着
  monthlyRecallRatePct: 75,
  monthlyNextApptRatePct: 70,
  monthlyTreatmentDropoutRatePct: 8,
};

function toGoalNonNegInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(n));
}

function toGoalNonNegNumber(value, fallback = 0, decimals = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const factor = 10 ** decimals;
  return Math.max(0, Math.round(n * factor) / factor);
}

function deriveClinicGoalTotals(partial = {}) {
  const monthlyPatients = toGoalNonNegInt(
    partial.monthlyPatients,
    DEFAULT_CLINIC_MONTHLY_GOALS.monthlyPatients
  );
  let monthlyNewPatients = toGoalNonNegInt(
    partial.monthlyNewPatients,
    DEFAULT_CLINIC_MONTHLY_GOALS.monthlyNewPatients
  );
  monthlyNewPatients = Math.min(monthlyNewPatients, monthlyPatients);
  const monthlyRevisitPatients = Math.max(0, monthlyPatients - monthlyNewPatients);
  const monthlyVisitCount = toGoalNonNegInt(
    partial.monthlyVisitCount,
    DEFAULT_CLINIC_MONTHLY_GOALS.monthlyVisitCount
  );
  let monthlySelfPayPatients = toGoalNonNegInt(
    partial.monthlySelfPayPatients,
    DEFAULT_CLINIC_MONTHLY_GOALS.monthlySelfPayPatients
  );
  monthlySelfPayPatients = Math.min(monthlySelfPayPatients, monthlyPatients);

  /**
   * 売上の計算式（月間）
   * 入力: 月間売上目標 / 自費売上（月間）
   * 1. 保険売上             = 月間売上目標 − 自費売上
   * 2. 保険単価１人あたり   = 保険売上 ÷ 目標患者数
   * 3. 自費単価１人あたり   = 自費売上 ÷ 自費患者数
   * 4. 必要保険点数         = 保険単価１人あたり ÷ 10（1点=10円）
   */
  const monthlyRevenue = toGoalNonNegInt(
    partial.monthlyRevenue,
    DEFAULT_CLINIC_MONTHLY_GOALS.monthlyRevenue
  );
  let monthlySelfPayRevenue = toGoalNonNegInt(
    partial.monthlySelfPayRevenue,
    DEFAULT_CLINIC_MONTHLY_GOALS.monthlySelfPayRevenue
  );
  monthlySelfPayRevenue = Math.min(monthlySelfPayRevenue, monthlyRevenue);

  const monthlyInsuranceRevenue = Math.max(0, monthlyRevenue - monthlySelfPayRevenue);
  const insuranceRevenuePerPatient = monthlyPatients > 0
    ? Math.round(monthlyInsuranceRevenue / monthlyPatients)
    : 0;
  const selfPayPerPatient = monthlySelfPayPatients > 0
    ? Math.round(monthlySelfPayRevenue / monthlySelfPayPatients)
    : 0;
  const insurancePointsPerPatient = Math.round((insuranceRevenuePerPatient / 10) * 10) / 10;
  const unitPrice = monthlyPatients > 0
    ? Math.round(monthlyRevenue / monthlyPatients)
    : 0;

  return {
    monthlyNewPatients,
    monthlyRevisitPatients,
    monthlyPatients,
    monthlyVisitCount,
    monthlySelfPayPatients,
    monthlyRevenue,
    monthlySelfPayRevenue,
    monthlyInsuranceRevenue,
    insuranceRevenuePerPatient,
    selfPayPerPatient,
    insurancePointsPerPatient,
    unitPrice,
    monthlyCancelCount: toGoalNonNegInt(
      partial.monthlyCancelCount,
      DEFAULT_CLINIC_MONTHLY_GOALS.monthlyCancelCount
    ),
    monthlyCancelRatePct: toGoalNonNegNumber(
      partial.monthlyCancelRatePct,
      DEFAULT_CLINIC_MONTHLY_GOALS.monthlyCancelRatePct,
      1
    ),
    monthlyNoShowCount: toGoalNonNegInt(
      partial.monthlyNoShowCount,
      DEFAULT_CLINIC_MONTHLY_GOALS.monthlyNoShowCount
    ),
    monthlyBookingFillRatePct: toGoalNonNegNumber(
      partial.monthlyBookingFillRatePct,
      DEFAULT_CLINIC_MONTHLY_GOALS.monthlyBookingFillRatePct,
      1
    ),
    monthlyRecallRatePct: toGoalNonNegNumber(
      partial.monthlyRecallRatePct,
      DEFAULT_CLINIC_MONTHLY_GOALS.monthlyRecallRatePct,
      1
    ),
    monthlyNextApptRatePct: toGoalNonNegNumber(
      partial.monthlyNextApptRatePct,
      DEFAULT_CLINIC_MONTHLY_GOALS.monthlyNextApptRatePct,
      1
    ),
    monthlyTreatmentDropoutRatePct: toGoalNonNegNumber(
      partial.monthlyTreatmentDropoutRatePct,
      DEFAULT_CLINIC_MONTHLY_GOALS.monthlyTreatmentDropoutRatePct,
      1
    ),
  };
}

function normalizeClinicGoals(raw = {}) {
  const hasLegacyPatients = Number.isFinite(Number(raw.monthlyPatients)) && Number(raw.monthlyPatients) > 0
    && !Number.isFinite(Number(raw.monthlyNewPatients))
    && !Number.isFinite(Number(raw.monthlyRevisitPatients));

  let seed = { ...raw };

  if (hasLegacyPatients) {
    const patients = toGoalNonNegInt(raw.monthlyPatients, DEFAULT_CLINIC_MONTHLY_GOALS.monthlyPatients);
    const newPatients = Math.min(
      patients,
      toGoalNonNegInt(raw.monthlyNewPatients, DEFAULT_CLINIC_MONTHLY_GOALS.monthlyNewPatients)
    );
    seed.monthlyNewPatients = newPatients;
    seed.monthlyRevisitPatients = Math.max(0, patients - newPatients);
  }

  // 旧「自費1人あたり」→ 月間自費へ換算
  const hasMonthlySelfPay = Number.isFinite(Number(raw.monthlySelfPayRevenue));
  const hasLegacySelfPayPerPatient = Number.isFinite(Number(raw.selfPayPerPatient)) && !hasMonthlySelfPay;
  if (hasLegacySelfPayPerPatient) {
    const patients = toGoalNonNegInt(
      seed.monthlyPatients ?? raw.monthlyPatients,
      DEFAULT_CLINIC_MONTHLY_GOALS.monthlyPatients
    );
    const per = toGoalNonNegInt(raw.selfPayPerPatient, 0);
    seed.monthlySelfPayRevenue = per * Math.max(patients, 1);
    if (!Number.isFinite(Number(raw.monthlySelfPayPatients))) {
      seed.monthlySelfPayPatients = patients;
    }
  }

  if (!Number.isFinite(Number(seed.monthlySelfPayPatients)) && !Number.isFinite(Number(raw.monthlySelfPayPatients))) {
    const patients = toGoalNonNegInt(
      seed.monthlyPatients ?? raw.monthlyPatients,
      DEFAULT_CLINIC_MONTHLY_GOALS.monthlyPatients
    );
    seed.monthlySelfPayPatients = patients;
  }

  return deriveClinicGoalTotals({ ...DEFAULT_CLINIC_MONTHLY_GOALS, ...seed });
}

function getClinicGoals(clinicId = 'clinic-sakura') {
  try {
    const all = JSON.parse(localStorage.getItem(CLINIC_GOALS_STORAGE_KEY) || '{}');
    return normalizeClinicGoals(all[clinicId] || {});
  } catch {
    return normalizeClinicGoals({});
  }
}

function saveClinicGoals(clinicId, goals) {
  const id = clinicId || 'clinic-sakura';
  const next = normalizeClinicGoals(goals || {});
  const persisted = {
    monthlyNewPatients: next.monthlyNewPatients,
    monthlyRevisitPatients: next.monthlyRevisitPatients,
    monthlyVisitCount: next.monthlyVisitCount,
    monthlySelfPayPatients: next.monthlySelfPayPatients,
    monthlySelfPayRevenue: next.monthlySelfPayRevenue,
    monthlyCancelCount: next.monthlyCancelCount,
    monthlyCancelRatePct: next.monthlyCancelRatePct,
    monthlyNoShowCount: next.monthlyNoShowCount,
    monthlyBookingFillRatePct: next.monthlyBookingFillRatePct,
    monthlyRecallRatePct: next.monthlyRecallRatePct,
    monthlyNextApptRatePct: next.monthlyNextApptRatePct,
    monthlyTreatmentDropoutRatePct: next.monthlyTreatmentDropoutRatePct,
    monthlyPatients: next.monthlyPatients,
    monthlyRevenue: next.monthlyRevenue,
  };
  try {
    const all = JSON.parse(localStorage.getItem(CLINIC_GOALS_STORAGE_KEY) || '{}');
    all[id] = persisted;
    localStorage.setItem(CLINIC_GOALS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
  return next;
}

function getPeriodRevenueGoal(periodKey, entityKey = 'clinic-sakura') {
  if (periodKey === '今月') {
    return getClinicGoals(entityKey).monthlyRevenue;
  }
  return PERIOD_REVENUE_GOALS[periodKey] || 0;
}

function getMonthlyPatientGoal(entityKey = 'clinic-sakura') {
  return getClinicGoals(entityKey).monthlyPatients;
}

function getClinicIds() {
  return getClinics().map((c) => c.id);
}

function isClinicEntityKey(entityKey) {
  return getClinicIds().includes(entityKey);
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

const MONTHLY_CLOSED_DAYS_FALLBACK = new Set([1, 8, 15, 29]);
const MONTH_DAYS_IN_MONTH = 30;
const MONTH_DAY_LABEL_PREFIX = '6/';
const METRICS_CALENDAR_YEAR = typeof CALENDAR_YEAR_DEFAULT !== 'undefined' ? CALENDAR_YEAR_DEFAULT : 2026;
const METRICS_CALENDAR_MONTH = 6;

function resolveMonthlyClosedDays(clinicId = 'clinic-sakura', year = METRICS_CALENDAR_YEAR, month = METRICS_CALENDAR_MONTH) {
  if (typeof getClosedDaySetForMonth === 'function') {
    return getClosedDaySetForMonth(clinicId, year, month);
  }
  return new Set(MONTHLY_CLOSED_DAYS_FALLBACK);
}

/** 稼働率など向け: 休日設定から月次稼働日・時間を取得 */
function getMonthlyOperatingCapacity(clinicId = 'clinic-sakura', year = METRICS_CALENDAR_YEAR, month = METRICS_CALENDAR_MONTH, options = {}) {
  if (typeof getOperatingCapacitySnapshot === 'function') {
    return getOperatingCapacitySnapshot(clinicId, year, month, options);
  }
  if (typeof calcMonthlyOperatingStats === 'function') {
    return calcMonthlyOperatingStats(clinicId, year, month);
  }
  return null;
}

function parseAnchorDayFromSubtitle(subtitle) {
  const m = String(subtitle || '').match(/(\d{1,2})月(\d{1,2})日/);
  if (m) return Number(m[2]);
  return 23;
}

const FACT_AGGREGATE_PERIODS = new Set(['本日', '前日', '今月']);
let sakuraDailyFactsCache = null;

function invalidateClinicDailyFactsCache() {
  sakuraDailyFactsCache = null;
}

function allocateDayScalars(monthTotal, fixedMap, throughDay, closedDays, weightFn) {
  const fixedDays = new Set(fixedMap.keys());
  let remaining = monthTotal;
  fixedMap.forEach((v) => { remaining -= v; });
  const dayMap = new Map(fixedMap);
  const otherDays = [];
  for (let d = 1; d <= throughDay; d++) {
    if (closedDays.has(d) && !fixedDays.has(d)) continue;
    if (fixedDays.has(d)) continue;
    otherDays.push(d);
  }
  if (otherDays.length && remaining !== 0) {
    const weights = otherDays.map(weightFn);
    const wSum = weights.reduce((a, b) => a + b, 0) || 1;
    const allocated = [];
    otherDays.forEach((d, i) => {
      const v = Math.round(remaining * (weights[i] / wSum));
      allocated.push(v);
      dayMap.set(d, v);
    });
    const diff = remaining - allocated.reduce((a, b) => a + b, 0);
    if (diff !== 0) {
      const last = otherDays[otherDays.length - 1];
      dayMap.set(last, (dayMap.get(last) || 0) + diff);
    }
  }
  return dayMap;
}

function allocateDayBreakdown(monthB, todayB, yesterdayB, throughDay, yesterdayDay, closedDays, weightFn) {
  const fixedDays = new Set([throughDay]);
  if (yesterdayDay != null && yesterdayDay >= 1 && yesterdayDay < throughDay) {
    fixedDays.add(yesterdayDay);
  }
  const keys = ['insurance', 'selfPay', 'products', 'other'];
  const dayMap = new Map();
  dayMap.set(throughDay, {
    insurance: todayB.insurance || 0,
    selfPay: todayB.selfPay || 0,
    products: todayB.products || 0,
    other: todayB.other || 0,
  });
  if (fixedDays.has(yesterdayDay)) {
    dayMap.set(yesterdayDay, {
      insurance: yesterdayB.insurance || 0,
      selfPay: yesterdayB.selfPay || 0,
      products: yesterdayB.products || 0,
      other: yesterdayB.other || 0,
    });
  }
  const remaining = {};
  keys.forEach((k) => {
    remaining[k] = (monthB[k] || 0) - (todayB[k] || 0);
    if (fixedDays.has(yesterdayDay)) remaining[k] -= yesterdayB[k] || 0;
  });
  const otherDays = [];
  for (let d = 1; d <= throughDay; d++) {
    if (closedDays.has(d) && !fixedDays.has(d)) continue;
    if (fixedDays.has(d)) continue;
    otherDays.push(d);
  }
  if (otherDays.length) {
    const weights = otherDays.map(weightFn);
    const wSum = weights.reduce((a, b) => a + b, 0) || 1;
    const allocated = keys.reduce((acc, k) => ({ ...acc, [k]: [] }), {});
    otherDays.forEach((d, i) => {
      const entry = {};
      keys.forEach((k) => {
        const v = Math.round(remaining[k] * (weights[i] / wSum));
        allocated[k].push(v);
        entry[k] = v;
      });
      dayMap.set(d, entry);
    });
    const last = otherDays[otherDays.length - 1];
    const lastEntry = dayMap.get(last);
    keys.forEach((k) => {
      const sum = allocated[k].reduce((a, b) => a + b, 0);
      lastEntry[k] += remaining[k] - sum;
    });
  }
  return dayMap;
}

function buildVisitingBreakdownAtTotal(monthDetail, total) {
  const monthB = monthDetail?.patients?.visiting?.breakdown || {};
  const monthT = monthDetail?.patients?.visiting?.total || sumVisitBreakdown(monthB);
  if (monthT <= 0 || total <= 0) {
    return { pureFirst: 0, first: 0, return: 0, other: 0 };
  }
  const ratio = total / monthT;
  return reconcileVisitBreakdown({
    pureFirst: Math.round(monthB.pureFirst * ratio),
    first: Math.round(monthB.first * ratio),
    return: Math.round(monthB.return * ratio),
    other: Math.round(monthB.other * ratio),
  }, total);
}

function allocateBlockScalars(monthBlock, todayBlock, yesterdayBlock, throughDay, yesterdayDay, closedDays, weightFn) {
  const fixed = new Map();
  fixed.set(throughDay, todayBlock);
  if (yesterdayDay != null && yesterdayDay >= 1 && yesterdayDay < throughDay) {
    fixed.set(yesterdayDay, yesterdayBlock);
  }
  return allocateDayScalars(monthBlock, fixed, throughDay, closedDays, weightFn);
}

function materializeClinicDailyFacts(clinicId = 'clinic-sakura') {
  if (typeof MOCK_DATA === 'undefined') return [];
  const month = MOCK_DATA.periodDetails['今月'];
  const today = MOCK_DATA.periodDetails['本日'];
  const yesterday = MOCK_DATA.periodDetails['前日'];
  if (!month || !today || !yesterday) return [];

  const closedDays = resolveMonthlyClosedDays(clinicId, METRICS_CALENDAR_YEAR, METRICS_CALENDAR_MONTH);
  const throughDay = parseAnchorDayFromSubtitle(today.subtitle);
  const yesterdayDay = parseAnchorDayFromSubtitle(yesterday.subtitle);

  const revMap = allocateDayBreakdown(
    month.breakdown,
    today.breakdown,
    yesterday.breakdown,
    throughDay,
    yesterdayDay,
    closedDays,
    (d) => 0.85 + ((d * 37) % 28) / 28,
  );
  const visitMap = allocateDayScalars(
    month.visits || 0,
    new Map([[throughDay, today.visits || 0], [yesterdayDay, yesterday.visits || 0]]),
    throughDay,
    closedDays,
    (d) => 0.85 + ((d * 11) % 9) / 9,
  );
  const visitingMap = allocateDayScalars(
    month.patients?.visiting?.total || 0,
    new Map([[throughDay, today.patients?.visiting?.total || 0], [yesterdayDay, yesterday.patients?.visiting?.total || 0]]),
    throughDay,
    closedDays,
    (d) => 0.85 + ((d * 13) % 9) / 9,
  );

  const monthAppt = getAppointments(month);
  const apptTotalMap = allocateDayScalars(
    monthAppt.total,
    new Map([[throughDay, getAppointments(today).total], [yesterdayDay, getAppointments(yesterday).total]]),
    throughDay,
    closedDays,
    (d) => 0.85 + ((d * 11) % 9) / 9,
  );
  const utilSlotsMap = allocateBlockScalars(
    month.utilization?.slots || 0,
    today.utilization?.slots || 0,
    yesterday.utilization?.slots || 0,
    throughDay,
    yesterdayDay,
    closedDays,
    (d) => 0.9 + ((d * 5) % 7) / 7,
  );
  const utilUsedMap = allocateBlockScalars(
    month.utilization?.used || 0,
    today.utilization?.used || 0,
    yesterday.utilization?.used || 0,
    throughDay,
    yesterdayDay,
    closedDays,
    (d) => 0.9 + ((d * 5) % 7) / 7,
  );
  const recallTotalMap = allocateBlockScalars(
    month.recall?.total || 0,
    today.recall?.total || 0,
    yesterday.recall?.total || 0,
    throughDay,
    yesterdayDay,
    closedDays,
    (d) => 0.88 + ((d * 7) % 9) / 9,
  );
  const qTotalMap = allocateBlockScalars(
    month.questionnaire?.total || 0,
    today.questionnaire?.total || 0,
    yesterday.questionnaire?.total || 0,
    throughDay,
    yesterdayDay,
    closedDays,
    (d) => 0.88 + ((d * 7) % 9) / 9,
  );

  const facts = [];
  for (let d = 1; d <= throughDay; d++) {
    if (closedDays.has(d) && d !== throughDay && d !== yesterdayDay) continue;
    const rev = revMap.get(d) || { insurance: 0, selfPay: 0, products: 0, other: 0 };
    const total = (rev.insurance || 0) + (rev.selfPay || 0) + (rev.products || 0) + (rev.other || 0);
    const outpatientVisits = visitMap.get(d) || 0;
    let outpatientBreakdown;
    if (d === throughDay) outpatientBreakdown = { ...getOutpatientBreakdown(today) };
    else if (d === yesterdayDay) outpatientBreakdown = { ...getOutpatientBreakdown(yesterday) };
    else outpatientBreakdown = buildVisitBreakdownAtTotal(month, outpatientVisits, 1);

    const visitingTotal = visitingMap.get(d) || 0;
    let visitingBreakdown;
    if (d === throughDay) visitingBreakdown = { ...(today.patients?.visiting?.breakdown || {}) };
    else if (d === yesterdayDay) visitingBreakdown = { ...(yesterday.patients?.visiting?.breakdown || {}) };
    else visitingBreakdown = buildVisitingBreakdownAtTotal(month, visitingTotal);

    let appointments;
    if (d === throughDay) {
      appointments = JSON.parse(JSON.stringify(getAppointments(today)));
    } else if (d === yesterdayDay) {
      appointments = JSON.parse(JSON.stringify(getAppointments(yesterday)));
    } else {
      const apptTotal = apptTotalMap.get(d) || 0;
      appointments = {
        total: apptTotal,
        breakdown: splitAppointmentBreakdown(apptTotal, monthAppt.breakdown, 1),
      };
    }

    const recallTotal = recallTotalMap.get(d) || 0;
    const recallBreakdown = d === throughDay
      ? { ...(today.recall?.breakdown || {}) }
      : d === yesterdayDay
        ? { ...(yesterday.recall?.breakdown || {}) }
        : reconcileCountParts({
          booked: Math.round((month.recall?.breakdown?.booked || 0) * (recallTotal / (month.recall?.total || 1))),
          contact: Math.round((month.recall?.breakdown?.contact || 0) * (recallTotal / (month.recall?.total || 1))),
          pending: Math.round((month.recall?.breakdown?.pending || 0) * (recallTotal / (month.recall?.total || 1))),
        }, recallTotal);

    const qTotal = qTotalMap.get(d) || 0;
    const qBreakdown = d === throughDay
      ? { ...(today.questionnaire?.breakdown || {}) }
      : d === yesterdayDay
        ? { ...(yesterday.questionnaire?.breakdown || {}) }
        : reconcileCountParts({
          done: Math.round((month.questionnaire?.breakdown?.done || 0) * (qTotal / (month.questionnaire?.total || 1))),
          pending: Math.round((month.questionnaire?.breakdown?.pending || 0) * (qTotal / (month.questionnaire?.total || 1))),
          partial: Math.round((month.questionnaire?.breakdown?.partial || 0) * (qTotal / (month.questionnaire?.total || 1))),
        }, qTotal);

    const slots = utilSlotsMap.get(d) || 0;
    const used = Math.min(slots, utilUsedMap.get(d) || 0);

    facts.push({
      date: `2026-06-${String(d).padStart(2, '0')}`,
      day: d,
      clinicId,
      breakdown: rebalanceBreakdown({ ...rev }, total),
      total,
      visits: outpatientVisits,
      patients: {
        outpatient: { breakdown: outpatientBreakdown },
        visiting: { total: visitingTotal, breakdown: visitingBreakdown },
      },
      appointments,
      utilization: { slots, used, empty: Math.max(0, slots - used) },
      recall: { total: recallTotal, breakdown: recallBreakdown },
      questionnaire: { total: qTotal, breakdown: qBreakdown },
    });
  }
  return facts;
}

function getSakuraDailyFacts() {
  if (!sakuraDailyFactsCache) sakuraDailyFactsCache = materializeClinicDailyFacts('clinic-sakura');
  return sakuraDailyFactsCache;
}

function scaleDailyFact(fact, weight) {
  const w = Number.isFinite(weight) ? weight : 1;
  if (w === 1) return JSON.parse(JSON.stringify(fact));
  const breakdown = rebalanceBreakdown({
    insurance: scaleNum(fact.breakdown.insurance, w),
    selfPay: scaleNum(fact.breakdown.selfPay, w),
    products: scaleNum(fact.breakdown.products, w),
    other: scaleNum(fact.breakdown.other, w),
  }, scaleNum(fact.total, w));
  const visits = Math.max(w >= 0.05 ? 1 : 0, scaleNum(fact.visits, w));
  const outpatientBreakdown = buildVisitBreakdownAtTotal(
    { visits, patients: { outpatient: { breakdown: fact.patients.outpatient.breakdown } } },
    visits,
    1,
  );
  const visitingTotal = scaleNum(fact.patients.visiting.total, w);
  const visitingBreakdown = buildVisitingBreakdownAtTotal(
    { patients: { visiting: { breakdown: fact.patients.visiting.breakdown, total: fact.patients.visiting.total } } },
    visitingTotal,
  );
  const apptTotal = scaleNum(fact.appointments.total, w);
  return {
    ...fact,
    breakdown,
    total: breakdown.insurance + breakdown.selfPay + breakdown.products + breakdown.other,
    visits,
    patients: {
      outpatient: { breakdown: outpatientBreakdown },
      visiting: { total: visitingTotal, breakdown: visitingBreakdown },
    },
    appointments: {
      total: apptTotal,
      breakdown: splitAppointmentBreakdown(apptTotal, fact.appointments.breakdown, 1),
    },
    utilization: scaleUtilizationBlock(fact.utilization, w),
    recall: scaleRecallBlock(fact.recall, w),
    questionnaire: scaleQuestionnaireBlock(fact.questionnaire, w),
  };
}

function mergeTwoDailyFacts(a, b) {
  const breakdown = mergeBreakdownParts(a.breakdown, b.breakdown);
  const total = (a.total || 0) + (b.total || 0);
  const visits = (a.visits || 0) + (b.visits || 0);
  const outB = {
    pureFirst: (a.patients?.outpatient?.breakdown?.pureFirst || 0) + (b.patients?.outpatient?.breakdown?.pureFirst || 0),
    first: (a.patients?.outpatient?.breakdown?.first || 0) + (b.patients?.outpatient?.breakdown?.first || 0),
    return: (a.patients?.outpatient?.breakdown?.return || 0) + (b.patients?.outpatient?.breakdown?.return || 0),
    other: (a.patients?.outpatient?.breakdown?.other || 0) + (b.patients?.outpatient?.breakdown?.other || 0),
  };
  const visB = {
    pureFirst: (a.patients?.visiting?.breakdown?.pureFirst || 0) + (b.patients?.visiting?.breakdown?.pureFirst || 0),
    first: (a.patients?.visiting?.breakdown?.first || 0) + (b.patients?.visiting?.breakdown?.first || 0),
    return: (a.patients?.visiting?.breakdown?.return || 0) + (b.patients?.visiting?.breakdown?.return || 0),
    other: (a.patients?.visiting?.breakdown?.other || 0) + (b.patients?.visiting?.breakdown?.other || 0),
  };
  const visitingTotal = (a.patients?.visiting?.total || 0) + (b.patients?.visiting?.total || 0);
  const apptA = a.appointments || { total: 0, breakdown: {} };
  const apptB = b.appointments || { total: 0, breakdown: {} };
  const apptTotal = (apptA.total || 0) + (apptB.total || 0);
  return {
    date: a.date,
    day: a.day,
    clinicId: 'all',
    breakdown: rebalanceBreakdown(breakdown, total),
    total,
    visits,
    patients: {
      outpatient: { breakdown: reconcileVisitBreakdown(outB, visits) },
      visiting: { total: visitingTotal, breakdown: reconcileVisitBreakdown(visB, visitingTotal) },
    },
    appointments: {
      total: apptTotal,
      breakdown: reconcileCountParts({
        visited: (apptA.breakdown?.visited || 0) + (apptB.breakdown?.visited || 0),
        notVisited: (apptA.breakdown?.notVisited || 0) + (apptB.breakdown?.notVisited || 0),
        cancelled: (apptA.breakdown?.cancelled || 0) + (apptB.breakdown?.cancelled || 0),
        noShow: (apptA.breakdown?.noShow || 0) + (apptB.breakdown?.noShow || 0),
      }, apptTotal),
    },
    utilization: mergeUtilizationBlocks(a.utilization, b.utilization),
    recall: mergeRecallBlocks(a.recall, b.recall),
    questionnaire: mergeQuestionnaireBlocks(a.questionnaire, b.questionnaire),
  };
}

function getDailyFacts(entityKey = 'clinic-sakura', weight = 1) {
  const base = getSakuraDailyFacts();
  if (entityKey === 'all') {
    const clinics = getClinics();
    if (!clinics.length) return base.map((f) => scaleDailyFact(f, weight));
    const byDay = new Map();
    clinics.forEach((clinic) => {
      const w = getClinicRevenueWeight(clinic.id) * weight;
      base.forEach((fact) => {
        const scaled = scaleDailyFact(fact, w);
        const prev = byDay.get(fact.day);
        byDay.set(fact.day, prev ? mergeTwoDailyFacts(prev, scaled) : scaled);
      });
    });
    return Array.from(byDay.values()).sort((a, b) => a.day - b.day);
  }
  const clinicWeight = entityKey === 'clinic-sakura'
    ? weight
    : (ENTITY_WEIGHTS[entityKey] ?? getClinicRevenueWeight(entityKey)) * weight;
  return base.map((f) => scaleDailyFact(f, clinicWeight));
}

function filterFactsByPeriod(facts, periodKey) {
  if (typeof MOCK_DATA === 'undefined') return facts;
  const throughDay = parseAnchorDayFromSubtitle(MOCK_DATA.periodDetails['本日']?.subtitle);
  const yesterdayDay = parseAnchorDayFromSubtitle(MOCK_DATA.periodDetails['前日']?.subtitle);
  if (periodKey === '本日') return facts.filter((f) => f.day === throughDay);
  if (periodKey === '前日') return facts.filter((f) => f.day === yesterdayDay);
  if (periodKey === '今月') return facts.filter((f) => f.day >= 1 && f.day <= throughDay);
  return facts;
}

function aggregateDailyFacts(facts) {
  if (!facts?.length) {
    return {
      breakdown: { insurance: 0, selfPay: 0, products: 0, other: 0 },
      total: 0,
      visits: 0,
      patients: {
        outpatient: { breakdown: { pureFirst: 0, first: 0, return: 0, other: 0 } },
        visiting: { total: 0, breakdown: { pureFirst: 0, first: 0, return: 0, other: 0 } },
      },
      appointments: { total: 0, breakdown: { visited: 0, notVisited: 0, cancelled: 0, noShow: 0 } },
      utilization: { slots: 0, used: 0, empty: 0 },
      recall: { total: 0, breakdown: { booked: 0, contact: 0, pending: 0 } },
      questionnaire: { total: 0, breakdown: { done: 0, pending: 0, partial: 0 } },
    };
  }
  return facts.slice(1).reduce(
    (acc, fact) => mergeTwoDailyFacts(acc, fact),
    JSON.parse(JSON.stringify(facts[0])),
  );
}

function overlayAggregateOnPeriodDetail(detail, agg) {
  const next = JSON.parse(JSON.stringify(detail));
  next.total = agg.total;
  next.visits = agg.visits;
  next.breakdown = rebalanceBreakdown(agg.breakdown, agg.total);
  next.patients = JSON.parse(JSON.stringify(agg.patients));
  next.appointments = JSON.parse(JSON.stringify(agg.appointments));
  next.utilization = {
    slots: agg.utilization.slots,
    used: agg.utilization.used,
    empty: Math.max(0, agg.utilization.slots - agg.utilization.used),
  };
  next.recall = JSON.parse(JSON.stringify(agg.recall));
  next.questionnaire = JSON.parse(JSON.stringify(agg.questionnaire));
  if (next.insights) {
    next.insights = next.insights.map((item) => {
      const row = { ...item };
      if (item.label === '患者単価' && next.visits > 0) {
        row.value = formatYenValue(Math.round(next.total / next.visits));
      }
      if (item.label === '自費率' && next.total > 0) {
        row.value = String(calcSelfPayRatePct(next.breakdown, next.total));
      }
      return row;
    });
  }
  return next;
}

function resolveDailyFactsForChart(options = {}, entityKey = 'clinic-sakura', weight = 1) {
  if (options.dailyFacts) return options.dailyFacts;
  return getDailyFacts(options.entityKey || entityKey, weight);
}

function buildDailyRevenueSeriesFromFacts(facts, options = {}, weight = 1) {
  const daysInMonth = options.daysInMonth || MONTH_DAYS_IN_MONTH;
  const closedDays = options.closedDays || resolveMonthlyClosedDays();
  const monthPrefix = options.monthPrefix || MONTH_DAY_LABEL_PREFIX;
  const throughDay = options.throughDay ?? parseAnchorDayFromSubtitle(
    (options.todayDetail || MOCK_DATA?.periodDetails?.['本日'])?.subtitle,
  );
  const factByDay = new Map(facts.map((f) => [f.day, f]));
  const labels = [];
  const insurance = [];
  const selfPay = [];
  const products = [];
  for (let d = 1; d <= daysInMonth; d++) {
    labels.push(`${monthPrefix}${d}`);
    const fact = factByDay.get(d);
    const isFuture = d > throughDay;
    const isClosed = closedDays.has(d) && !fact;
    if (isFuture || isClosed || !fact) {
      insurance.push(0);
      selfPay.push(0);
      products.push(0);
      continue;
    }
    insurance.push(Math.round(fact.breakdown.insurance * weight));
    selfPay.push(Math.round(fact.breakdown.selfPay * weight));
    products.push(Math.round(fact.breakdown.products * weight));
  }
  return { labels, insurance, selfPay, products };
}

function buildDailyVisitSeriesFromFacts(facts, options = {}, weight = 1) {
  const daysInMonth = options.daysInMonth || MONTH_DAYS_IN_MONTH;
  const closedDays = options.closedDays || resolveMonthlyClosedDays();
  const monthPrefix = options.monthPrefix || MONTH_DAY_LABEL_PREFIX;
  const throughDay = options.throughDay ?? parseAnchorDayFromSubtitle(
    (options.todayDetail || MOCK_DATA?.periodDetails?.['本日'])?.subtitle,
  );
  const factByDay = new Map(facts.map((f) => [f.day, f]));
  const labels = [];
  const pureFirst = [];
  const first = [];
  const returnV = [];
  const other = [];
  for (let d = 1; d <= daysInMonth; d++) {
    labels.push(`${monthPrefix}${d}`);
    const fact = factByDay.get(d);
    const isFuture = d > throughDay;
    const isClosed = closedDays.has(d) && !fact;
    if (isFuture || isClosed || !fact) {
      pureFirst.push(0);
      first.push(0);
      returnV.push(0);
      other.push(0);
      continue;
    }
    const b = fact.patients.outpatient.breakdown;
    pureFirst.push(Math.round(b.pureFirst * weight));
    first.push(Math.round(b.first * weight));
    returnV.push(Math.round(b.return * weight));
    other.push(Math.round(b.other * weight));
  }
  return { labels, pureFirst, first, return: returnV, other };
}

function buildDailyAppointmentSeriesFromFacts(facts, options = {}, weight = 1) {
  const visitDaily = buildDailyVisitSeriesFromFacts(facts, options, weight);
  const factByDay = new Map(facts.map((f) => [f.day, f]));
  const visited = [];
  const notVisited = [];
  const cancelSameDay = [];
  const cancelAdvance = [];
  const noShow = [];
  const cancelled = [];
  visitDaily.labels.forEach((label, i) => {
    const day = i + 1;
    const fact = factByDay.get(day);
    if (!fact) {
      visited.push(0);
      notVisited.push(0);
      cancelSameDay.push(0);
      cancelAdvance.push(0);
      noShow.push(0);
      cancelled.push(0);
      return;
    }
    const b = normalizeAppointmentBreakdown(fact.appointments.breakdown);
    visited.push(Math.round(b.visited * weight));
    notVisited.push(Math.round(b.notVisited * weight));
    cancelSameDay.push(Math.round(b.cancelSameDay * weight));
    cancelAdvance.push(Math.round(b.cancelAdvance * weight));
    noShow.push(Math.round(b.noShow * weight));
    cancelled.push(Math.round(b.cancelled * weight));
  });
  return {
    labels: visitDaily.labels, visited, notVisited, cancelSameDay, cancelAdvance, noShow, cancelled,
  };
}

/**
 * 当月全日の日別売上（日次ファクトから読み取り。合計は期間集計の正本）
 */
function buildMonthlyDailyRevenueFromDetails(monthDetail, periodDetail, weight = 1, options = {}) {
  const facts = resolveDailyFactsForChart(options, options.entityKey || 'clinic-sakura', weight);
  return buildDailyRevenueSeriesFromFacts(facts, options, weight);
}

function maxDailyTotalFromRevenueDaily(daily, throughDay = null) {
  if (!daily?.labels?.length) return 1;
  const limit = throughDay != null
    ? Math.min(Math.max(1, throughDay), daily.labels.length)
    : daily.labels.length;
  let max = 1;
  for (let i = 0; i < limit; i++) {
    const total = (daily.insurance?.[i] || 0) + (daily.selfPay?.[i] || 0) + (daily.products?.[i] || 0);
    if (total > max) max = total;
  }
  return max;
}

function maxDailyTotalFromStackedSeries(labels, series, throughDay = null) {
  if (!labels?.length) return 1;
  const limit = throughDay != null
    ? Math.min(Math.max(1, throughDay), labels.length)
    : labels.length;
  let max = 1;
  for (let i = 0; i < limit; i++) {
    const total = (series || []).reduce((sum, s) => sum + (s.values?.[i] || 0), 0);
    if (total > max) max = total;
  }
  return max;
}

function resolveInsightDailyThroughDay(metricsContext) {
  const ctx = metricsContext || { entityKey: 'clinic-sakura' };
  const todayDetail = typeof resolvePeriodDetail === 'function'
    ? resolvePeriodDetail('本日', ctx)
    : MOCK_DATA.periodDetails['本日'];
  return typeof parseAnchorDayFromSubtitle === 'function'
    ? parseAnchorDayFromSubtitle(todayDetail?.subtitle)
    : 23;
}

/**
 * 日別チャートのY軸上限（1日〜本日までの表示データの最大値）
 */
function resolveMonthlyDailyYAxisMax(metricsContext, weight = 1) {
  const ctx = metricsContext || { entityKey: 'clinic-sakura', weight };
  const throughDay = resolveInsightDailyThroughDay(ctx);
  const facts = getDailyFacts(ctx.entityKey || 'clinic-sakura', weight);
  const daily = buildDailyRevenueSeriesFromFacts(facts, { throughDay }, weight);
  return maxDailyTotalFromRevenueDaily(daily, throughDay);
}

/** 日別来院チャートのY軸上限（1日〜本日までの表示データの最大値） */
function resolveMonthlyDailyVisitYAxisMax(metricsContext, weight = 1) {
  const ctx = metricsContext || { entityKey: 'clinic-sakura', weight };
  const throughDay = resolveInsightDailyThroughDay(ctx);
  const facts = getDailyFacts(ctx.entityKey || 'clinic-sakura', weight);
  const daily = buildDailyVisitSeriesFromFacts(facts, { throughDay }, weight);
  return maxDailyTotalFromStackedSeries(daily.labels, [
    { values: daily.pureFirst },
    { values: daily.first },
    { values: daily.return },
    { values: daily.other },
  ], throughDay);
}

/** 日別予約チャートのY軸上限 */
function resolveMonthlyDailyAppointmentYAxisMax(metricsContext, weight = 1) {
  const ctx = metricsContext || { entityKey: 'clinic-sakura', weight };
  const throughDay = resolveInsightDailyThroughDay(ctx);
  const facts = getDailyFacts(ctx.entityKey || 'clinic-sakura', weight);
  const daily = buildDailyAppointmentSeriesFromFacts(facts, { throughDay }, weight);
  return maxDailyTotalFromStackedSeries(daily.labels, [
    { values: daily.visited },
    { values: daily.notVisited },
    { values: daily.cancelled },
    { values: daily.noShow },
  ], throughDay);
}

function buildMonthlyDailyStaffSalesFromDetails(monthDetail, periodDetail, weight = 1, options = {}) {
  const daily = buildMonthlyDailyRevenueFromDetails(monthDetail, periodDetail, weight, options);
  const totals = daily.labels.map((_, i) =>
    (daily.insurance[i] || 0) + (daily.selfPay[i] || 0) + (daily.products[i] || 0),
  );
  const entityKey = options.entityKey || 'clinic-sakura';
  const splitDetail = options.splitDetail || options.todayDetail || periodDetail;
  const split = splitStaffTotalsFromDetail(splitDetail, entityKey, totals);
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

function normalizeAppointmentBreakdown(b) {
  if (!b) {
    return { visited: 0, notVisited: 0, cancelSameDay: 0, cancelAdvance: 0, noShow: 0, cancelled: 0 };
  }
  const cancelSameDay = b.cancelSameDay ?? Math.round((b.cancelled || 0) * 0.5);
  const cancelAdvance = b.cancelAdvance ?? Math.max(0, (b.cancelled || 0) - cancelSameDay);
  const noShow = b.noShow || 0;
  return {
    visited: b.visited || 0,
    notVisited: b.notVisited || 0,
    cancelSameDay,
    cancelAdvance,
    noShow,
    cancelled: cancelSameDay + cancelAdvance + noShow,
  };
}

function getAppointments(detail) {
  const stored = detail?.appointments;
  if (stored?.breakdown) {
    const b = normalizeAppointmentBreakdown(stored.breakdown);
    const total = stored.total ?? (b.visited + b.notVisited + b.cancelled);
    return { total, breakdown: b };
  }
  const outpatient = detail?.visits ?? 0;
  return {
    total: outpatient,
    breakdown: normalizeAppointmentBreakdown({ visited: outpatient, notVisited: 0, cancelled: 0, noShow: 0 }),
  };
}

function parseYenAmount(val) {
  if (typeof val === 'number') return Math.round(val);
  if (!val) return 0;
  return Math.round(Number(String(val).replace(/[¥,\s]/g, '')) || 0);
}

function scaleCountBreakdown(breakdown, weight, totalHint) {
  const scaled = {
    booked: Math.max(0, scaleNum(breakdown.booked ?? breakdown.done ?? 0, weight)),
    contact: Math.max(0, scaleNum(breakdown.contact ?? 0, weight)),
    pending: Math.max(0, scaleNum(breakdown.pending ?? 0, weight)),
    done: Math.max(0, scaleNum(breakdown.done ?? breakdown.booked ?? 0, weight)),
    partial: Math.max(0, scaleNum(breakdown.partial ?? 0, weight)),
    visited: Math.max(0, scaleNum(breakdown.visited ?? 0, weight)),
    notVisited: Math.max(0, scaleNum(breakdown.notVisited ?? 0, weight)),
    cancelled: Math.max(0, scaleNum(breakdown.cancelled ?? 0, weight)),
    noShow: Math.max(0, scaleNum(breakdown.noShow ?? 0, weight)),
  };
  const total = totalHint != null
    ? Math.max(0, scaleNum(totalHint, weight))
    : Math.max(0, scaleNum(breakdown.total, weight));
  return { scaled, total };
}

function reconcileCountParts(parts, total) {
  const t = Math.max(0, Math.round(total));
  const keys = Object.keys(parts);
  const next = {};
  keys.forEach((k) => { next[k] = Math.max(0, Math.round(parts[k] || 0)); });
  let sum = keys.reduce((s, k) => s + next[k], 0);
  if (sum !== t && keys.length) {
    const last = keys[keys.length - 1];
    next[last] = Math.max(0, next[last] + (t - sum));
  }
  return next;
}

function scaleUtilizationBlock(block, weight) {
  if (!block) {
    const slots = Math.max(1, scaleNum(40, weight));
    const used = Math.max(0, scaleNum(31, weight));
    return { slots, used, empty: Math.max(0, slots - used) };
  }
  const slots = Math.max(1, scaleNum(block.slots, weight));
  const used = Math.max(0, scaleNum(block.used, weight));
  let empty = Math.max(0, scaleNum(block.empty ?? (block.slots - block.used), weight));
  if (used + empty !== slots) empty = Math.max(0, slots - used);
  return { slots, used, empty };
}

function getUtilizationRatePct(util) {
  if (!util?.slots) return 0;
  return Math.round((util.used / util.slots) * 1000) / 10;
}

function scaleRecallBlock(block, weight) {
  if (!block?.breakdown) {
    return {
      total: Math.max(0, scaleNum(142, weight)),
      breakdown: { booked: 105, contact: 22, pending: 15 },
    };
  }
  const total = Math.max(0, scaleNum(block.total, weight));
  const b = reconcileCountParts({
    booked: scaleNum(block.breakdown.booked, weight),
    contact: scaleNum(block.breakdown.contact, weight),
    pending: scaleNum(block.breakdown.pending, weight),
  }, total);
  return { total, breakdown: b };
}

function scaleQuestionnaireBlock(block, weight) {
  if (!block?.breakdown) {
    return {
      total: Math.max(0, scaleNum(29, weight)),
      breakdown: { done: 24, pending: 3, partial: 2 },
    };
  }
  const total = Math.max(0, scaleNum(block.total, weight));
  const b = reconcileCountParts({
    done: scaleNum(block.breakdown.done, weight),
    pending: scaleNum(block.breakdown.pending, weight),
    partial: scaleNum(block.breakdown.partial, weight),
  }, total);
  return { total, breakdown: b };
}

function getUtilization(detail) {
  const util = scaleUtilizationBlock(detail?.utilization, 1);
  const capacity = getMonthlyOperatingCapacity();
  return {
    ...util,
    ratePct: getUtilizationRatePct(util),
    // 休日設定由来。枠数 slots は当面モック。稼働率タブで開院日・時間を参照可能
    operating: capacity
      ? {
        operatingDays: capacity.operatingDays,
        closedDays: capacity.closedDays,
        operatingMinutes: capacity.operatingMinutes,
        operatingHoursLabel: capacity.operatingHoursLabel,
        suggestedSlots: capacity.suggestedSlots ?? null,
      }
      : null,
  };
}

function getRecall(detail) {
  const stored = detail?.recall;
  if (!stored?.breakdown) {
    return scaleRecallBlock(null, 1);
  }
  const total = stored.total ?? sumVisitBreakdown({
    pureFirst: stored.breakdown.booked,
    first: stored.breakdown.contact,
    return: 0,
    other: stored.breakdown.pending,
  });
  const breakdown = reconcileCountParts(stored.breakdown, total);
  return { total, breakdown };
}

function getQuestionnaire(detail) {
  const stored = detail?.questionnaire;
  if (!stored?.breakdown) {
    return scaleQuestionnaireBlock(null, 1);
  }
  const b = { done: stored.breakdown.done || 0, pending: stored.breakdown.pending || 0 };
  const total = stored.total ?? (b.done + b.pending);
  const breakdown = reconcileCountParts(b, total);
  return { total, breakdown };
}

function getQuestionnaireDoneRatePct(q) {
  if (!q?.total) return 0;
  return Math.round(((q.breakdown?.done || 0) / q.total) * 1000) / 10;
}

function getRecallBookedRatePct(r) {
  if (!r?.total) return 0;
  return Math.round(((r.breakdown?.booked || 0) / r.total) * 1000) / 10;
}

function daysUntil(dateStr, anchorDate = '2026-06-23') {
  const a = new Date(anchorDate);
  const b = new Date(dateStr);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function computePatientRiskScore(patient, anchorDate = '2026-06-23') {
  let score = 0;
  const c6 = patient.past6mCancels || 0;
  if (c6 >= 3) score += 40;
  else if (c6 === 2) score += 30;
  else if (c6 === 1) score += 15;
  const rate6 = patient.past6mTotalAppts > 0
    ? (c6 / patient.past6mTotalAppts) * 100 : 0;
  if (rate6 >= 30) score += 30;
  else if (rate6 >= 20) score += 20;
  else if (rate6 >= 10) score += 10;
  score += Math.min(20, (patient.past6mNoShows || 0) * 20);
  if (patient.nextAppt) {
    const d = daysUntil(patient.nextAppt, anchorDate);
    if (d <= 7) score += 10;
    else if (d >= 8) score += 5;
  }
  let level = '低';
  if (score >= 80) level = '高';
  else if (score >= 50) level = '中';
  return { score, level };
}

function getAtRiskPatientList() {
  const raw = MOCK_DATA?.atRiskPatients || [];
  return raw
    .filter((p) => p.nextAppt && (p.past6mCancels || 0) >= 1)
    .map((p) => {
      const risk = computePatientRiskScore(p);
      const cancelRate = p.totalAppts > 0
        ? Math.round((p.cancelPastYear / p.totalAppts) * 1000) / 10 : 0;
      return { ...p, riskScore: risk.score, riskLevel: risk.level, cancelRate };
    })
    .sort((a, b) => b.riskScore - a.riskScore);
}

function getQuestionnaireSurveys(clinicId = 'clinic-sakura') {
  const byClinic = MOCK_DATA?.questionnaireSurveys?.[clinicId];
  if (byClinic?.length) return byClinic;
  const legacy = MOCK_DATA?.questionnaireSurvey;
  return legacy ? [legacy] : [];
}

function getSelfPayItemColorMap() {
  const treatments = MOCK_DATA?.selfPayTreatments || [];
  const colors = ['#ec4899', '#f472b6', '#db2777', '#a855f7', '#06b6d4', '#14b8a6', '#0891b2', '#94a3b8'];
  const map = { その他: '#94a3b8' };
  treatments.forEach((t, i) => { map[t.label] = colors[i % colors.length]; });
  return map;
}

function colorForSelfPayStaff(label) {
  const itemMap = MOCK_DATA?.selfPayStaffItems || {};
  const colorMap = getSelfPayItemColorMap();
  const item = itemMap[label] || 'その他';
  return colorMap[item] || '#94a3b8';
}

function buildTopSelfPaySegments(detail) {
  const treatments = MOCK_DATA?.selfPayTreatments || [];
  const selfTotal = Math.max(0, Math.round(detail?.breakdown?.selfPay || 0));
  const baseSum = treatments.reduce((s, t) => s + t.amount, 0) || 1;
  const scale = selfTotal / baseSum;
  const sorted = [...treatments].sort((a, b) => b.amount - a.amount);
  const top4 = sorted.slice(0, 4);
  const colors = ['#ec4899', '#f472b6', '#db2777', '#a855f7', '#94a3b8'];
  const segments = top4.map((t, i) => ({
    label: t.label,
    value: Math.round(t.amount * scale),
    color: colors[i],
    rateMuted: true,
  }));
  const topSum = segments.reduce((s, x) => s + x.value, 0);
  segments.push({ label: 'その他', value: Math.max(0, selfTotal - topSum), color: colors[4] });
  return { segments, total: selfTotal };
}

function buildSelfPayStaffRanking(detail, total) {
  const entityKey = 'clinic-sakura';
  const breakdown = typeof getStaffSalesBreakdown === 'function'
    ? getStaffSalesBreakdown(detail, entityKey)
    : splitStaffSalesTotal(total, entityKey);
  const chart = typeof getReconciledStaffSalesChart === 'function'
    ? getReconciledStaffSalesChart(detail, entityKey)
    : null;
  const colors = ['#ec4899', '#f472b6', '#db2777', '#06b6d4', '#14b8a6', '#0891b2', '#94a3b8'];
  const items = [];
  if (chart?.labels?.length) {
    chart.labels.forEach((label, i) => {
      const val = Math.round(((chart.selfPay?.[i] || 0) + (chart.insurance?.[i] || 0)) * 0.35);
      if (val <= 0) return;
      const role = typeof staffChartRowRole === 'function' ? staffChartRowRole(label) : 'dh';
      if (role === 'dr' || role === 'dh') {
        items.push({
          label: typeof mapStaffChartLabelToName === 'function' ? mapStaffChartLabelToName(label) : label,
          value: val,
          color: colors[items.length % colors.length],
        });
      }
    });
  }
  if (breakdown.unset > 0) {
    items.push({ label: '未設定', value: Math.round(breakdown.unset * 0.35), color: colorForSelfPayStaff('未設定') });
  }
  if (!items.length) {
    return [
      { label: '田中 健一', value: Math.round(total * 0.28), color: colorForSelfPayStaff('田中 健一') },
      { label: '鈴木 美咲', value: Math.round(total * 0.22), color: colorForSelfPayStaff('鈴木 美咲') },
      { label: '山田 恵', value: Math.round(total * 0.18), color: colorForSelfPayStaff('山田 恵') },
      { label: '未設定', value: Math.round(total * 0.12), color: colorForSelfPayStaff('未設定') },
    ];
  }
  return items.map((it) => ({
    ...it,
    color: colorForSelfPayStaff(it.label),
  }));
}

function buildDailyUtilizationSeries(metricsContext, weight = 1) {
  const facts = getDailyFacts(metricsContext?.entityKey || 'clinic-sakura', weight);
  const throughDay = resolveInsightDailyThroughDay(metricsContext);
  const labels = [];
  const values = [];
  facts.filter((f) => f.day <= throughDay).forEach((f) => {
    const slots = f.utilization?.slots || 0;
    const used = f.utilization?.used || 0;
    labels.push(`${MONTH_DAY_LABEL_PREFIX}${f.day}`);
    values.push(slots > 0 ? Math.round((used / slots) * 1000) / 10 : 0);
  });
  return { labels, values };
}

function calcRemainingBookingsForGoal(util, goalPct = 82) {
  const slots = util?.slots || 0;
  const used = util?.used || 0;
  const targetUsed = Math.ceil(slots * (goalPct / 100));
  return Math.max(0, targetUsed - used);
}

function getPaymentRecord(detail) {
  const total = detail?.total || 0;
  const cashflow = detail?.cashflow || [];
  const receivablesRow = cashflow.find((r) => r.label === '未収金');
  const selfPayRow = cashflow.find((r) => r.label === '自費未収');
  const rateRow = cashflow.find((r) => String(r.label || '').includes('入金率'));
  const receivables = parseYenAmount(receivablesRow?.value);
  const selfPayReceivables = parseYenAmount(selfPayRow?.value);
  const collected = Math.max(0, total - receivables);
  const collectionRate = rateRow
    ? parseFloat(String(rateRow.value)) || 0
    : (total > 0 ? Math.round((collected / total) * 1000) / 10 : 0);
  return { total, receivables, collected, selfPayReceivables, collectionRate };
}

/** 既にスケール済み detail 向け — weight を掛けない */
function buildInsightCountFromParts(totalValue, parts) {
  const total = Math.max(0, Math.round(totalValue));
  const segments = parts.map((p) => ({ ...p, value: Math.max(0, Math.round(p.value)) }));
  const sum = segments.reduce((s, p) => s + p.value, 0);
  if (sum !== total && segments.length > 0) {
    segments[segments.length - 1].value = Math.max(0, segments[segments.length - 1].value + (total - sum));
  }
  return { total, segments };
}

function scaleCountsToTotal(baseCounts, targetTotal) {
  const baseSum = baseCounts.reduce((s, v) => s + v, 0) || 1;
  const target = Math.max(0, Math.round(targetTotal));
  const scaled = baseCounts.map((v) => Math.max(0, Math.round((v / baseSum) * target)));
  const diff = target - scaled.reduce((a, b) => a + b, 0);
  if (diff !== 0 && scaled.length) scaled[scaled.length - 1] += diff;
  return scaled;
}

function distributeByPattern(total, pattern) {
  return scaleCountsToTotal(pattern, total);
}

function buildSelfPayMenuAmounts(detail) {
  const selfTotal = Math.max(0, Math.round((detail?.breakdown?.selfPay) || 0));
  const implant = Math.max(0, Math.round(selfTotal * 0.28));
  const ortho = Math.max(0, Math.round(selfTotal * 0.24));
  const whitening = Math.max(0, Math.round(selfTotal * 0.18));
  const other = Math.max(0, selfTotal - implant - ortho - whitening);
  return { implant, ortho, whitening, other, total: selfTotal };
}

function mergeUtilizationBlocks(a, b) {
  const slots = (a?.slots || 0) + (b?.slots || 0);
  const used = (a?.used || 0) + (b?.used || 0);
  const empty = Math.max(0, slots - used);
  return { slots, used, empty };
}

function mergeRecallBlocks(a, b) {
  const total = (a?.total || 0) + (b?.total || 0);
  const breakdown = reconcileCountParts({
    booked: (a?.breakdown?.booked || 0) + (b?.breakdown?.booked || 0),
    contact: (a?.breakdown?.contact || 0) + (b?.breakdown?.contact || 0),
    pending: (a?.breakdown?.pending || 0) + (b?.breakdown?.pending || 0),
  }, total);
  return { total, breakdown };
}

function mergeQuestionnaireBlocks(a, b) {
  const total = (a?.total || 0) + (b?.total || 0);
  const breakdown = reconcileCountParts({
    done: (a?.breakdown?.done || 0) + (b?.breakdown?.done || 0),
    pending: (a?.breakdown?.pending || 0) + (b?.breakdown?.pending || 0),
    partial: (a?.breakdown?.partial || 0) + (b?.breakdown?.partial || 0),
  }, total);
  return { total, breakdown };
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

function buildMonthlyDailyVisitBreakdownFromDetails(monthDetail, periodDetail, weight = 1, options = {}) {
  const facts = resolveDailyFactsForChart(options, options.entityKey || 'clinic-sakura', weight);
  return buildDailyVisitSeriesFromFacts(facts, options, weight);
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

function buildMonthlyDailyAppointmentsFromDetails(monthDetail, periodDetail, weight = 1, options = {}) {
  const facts = resolveDailyFactsForChart(options, options.entityKey || 'clinic-sakura', weight);
  return buildDailyAppointmentSeriesFromFacts(facts, options, weight);
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
  const asOfMonth = typeof parseAnchorDayFromSubtitle === 'function'
    ? (() => {
      const m = String(detail?.subtitle || '').match(/(\d{1,2})月/);
      return m ? Number(m[1]) : 12;
    })()
    : 12;

  const totals = labels.map((m, mi) => {
    if (mi + 1 > asOfMonth) return 0;
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
    insightApptCancelSameDay: appt.breakdown.cancelSameDay,
    insightApptCancelAdvance: appt.breakdown.cancelAdvance,
    insightApptNoShow: appt.breakdown.noShow,
    insightApptPending: appt.breakdown.notVisited,
    insightVisitPureFirst: out.pureFirst + vis.breakdown.pureFirst,
    insightVisitFirst: out.first + vis.breakdown.first,
    insightVisitReturn: out.return + vis.breakdown.return,
    insightVisitOther: out.other + vis.breakdown.other,
  };

  if (typeof getUtilization === 'function') {
    const util = getUtilization(detail);
    counts.insightUtilUsed = util.used;
    counts.insightUtilEmpty = util.empty;
  }
  if (typeof getRecall === 'function') {
    const recall = getRecall(detail);
    counts.insightRecallBooked = recall.breakdown.booked;
    counts.insightRecallContact = recall.breakdown.contact;
    counts.insightRecallPending = recall.breakdown.pending;
  }
  if (typeof getQuestionnaire === 'function') {
    const q = getQuestionnaire(detail);
    counts.insightQuestionnaireDone = q.breakdown.done;
    counts.insightQuestionnairePending = q.breakdown.pending;
    counts.insightQuestionnairePartial = q.breakdown.partial;
  }

  if (type && counts[type] != null) return counts[type];

  return null;
}

function expandPopoverRows(templates, count) {
  if (!templates.length || !count || count <= 0) return [];
  const n = Math.max(0, Math.round(count));
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

function formatPopoverMockDate(y, m, d) {
  return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
}

function resolvePopoverAnchorDate(detail) {
  const sub = String(detail?.subtitle || MOCK_DATA?.periodDetails?.['本日']?.subtitle || '');
  const m = sub.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (m) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  const m2 = sub.match(/(\d{4})年(\d{1,2})月/);
  if (m2) return { y: Number(m2[1]), m: Number(m2[2]), d: 23 };
  return { y: 2026, m: 6, d: 23 };
}

function buildAppointmentCancelPopoverRows(detail, cancelTemplates, noShowTemplates, filter = null) {
  const appt = typeof getAppointments === 'function' ? getAppointments(detail) : null;
  if (!appt?.breakdown) return [];
  const b = appt.breakdown;
  const sameDayTpl = cancelTemplates.find((t) => /当日/.test(t.cancelType || '')) || cancelTemplates[0];
  const advanceTpl = cancelTemplates.find((t) => /前日/.test(t.cancelType || '')) || cancelTemplates[1] || cancelTemplates[0];
  const noShowTpl = noShowTemplates[0] || {};
  const anchor = resolvePopoverAnchorDate(detail);
  const apptDate = formatPopoverMockDate(anchor.y, anchor.m, anchor.d);
  const rows = [];

  if (!filter || filter === '当日' || filter === '当日キャンセル') {
    for (let i = 0; i < (b.cancelSameDay || 0); i++) {
      rows.push({
        ...sameDayTpl,
        cancelType: '当日キャンセル',
        cancelDate: apptDate,
        apptDate,
      });
    }
  }
  if (!filter || filter === '前日以降' || filter === '前日以降キャンセル') {
    for (let i = 0; i < (b.cancelAdvance || 0); i++) {
      const day = Math.max(1, anchor.d - 2 - (i % 3));
      rows.push({
        ...advanceTpl,
        cancelType: '前日以降キャンセル',
        cancelDate: formatPopoverMockDate(anchor.y, anchor.m, day),
        apptDate,
      });
    }
  }
  if (!filter || filter === '無断' || filter === '無断キャンセル') {
    for (let i = 0; i < (b.noShow || 0); i++) {
      const tpl = noShowTemplates[i % Math.max(noShowTemplates.length, 1)] || noShowTpl;
      rows.push({
        cancelType: '無断キャンセル',
        cancelDate: apptDate,
        chartNo: tpl.chartNo || '—',
        name: tpl.name || '—',
        time: tpl.time || '—',
        apptDate,
      });
    }
  }
  return rows;
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

  if (
    (resolvedType === 'insightApptCancel'
      || resolvedType === 'insightApptCancelSameDay'
      || resolvedType === 'insightApptCancelAdvance'
      || resolvedType === 'insightApptNoShow')
    && detail
  ) {
    const cancelTemplates = (typeof INSIGHT_POPOVER_ROWS !== 'undefined' && INSIGHT_POPOVER_ROWS.insightApptCancel)
      ? INSIGHT_POPOVER_ROWS.insightApptCancel
      : templates;
    const noShowTemplates = (typeof INSIGHT_POPOVER_ROWS !== 'undefined' && INSIGHT_POPOVER_ROWS.insightApptNoShow)
      ? INSIGHT_POPOVER_ROWS.insightApptNoShow
      : [];
    const cancelRows = buildAppointmentCancelPopoverRows(detail, cancelTemplates, noShowTemplates);
    if (cancelRows.length) return cancelRows;
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
  while (shares.length < labels.length) shares.push(0);
  shares.length = labels.length;

  const insRatio = b.insurance / total;
  const selfRatio = b.selfPay / total;

  const rowTotals = reconcileShareAmounts(
    shares.map((share) => Math.round(total * share)),
    shares.map((share) => Math.round(total * share)).reduce((sum, v) => sum + v, 0),
  );
  const targetIns = Math.round((b.insurance || 0) * (sumFixed || 1));

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

/**
 * Dr/DH担当行 + 未設定（医院売上 − 担当帰属合計）をチャート化
 */
function buildStaffSalesChartWithResidual(detail, clinicId) {
  const staff = getStaffRegistry(clinicId);
  const total = Math.round(detail?.total || 0);
  const b = detail?.breakdown || {};
  if (!total) {
    return { labels: [], insurance: [], selfPay: [] };
  }
  const insRatio = total > 0 ? (b.insurance || 0) / total : 0.6;

  if (!staff.length) {
    const ins = Math.round(total * insRatio);
    return {
      labels: [UNSET_CHART_LABEL],
      insurance: [ins],
      selfPay: [total - ins],
    };
  }

  let staffAmounts = staff.map((row) => Math.round(total * row.share));
  let attributed = staffAmounts.reduce((sum, v) => sum + v, 0);
  if (attributed > total) {
    const scale = total / attributed;
    staffAmounts = reconcileShareAmounts(
      staffAmounts.map((amt) => Math.round(amt * scale)),
      total,
    );
    attributed = staffAmounts.reduce((sum, v) => sum + v, 0);
  }

  const labels = staff.map((row) => row.chartLabel);
  const insurance = staffAmounts.map((amt) => Math.round(amt * insRatio));
  const selfPay = staffAmounts.map((amt, i) => amt - insurance[i]);

  let unsetAmt = splitStaffSalesTotal(total, clinicId).unset;
  if (unsetAmt > 0) {
    labels.push(UNSET_CHART_LABEL);
    const unsetIns = Math.round(unsetAmt * insRatio);
    insurance.push(unsetIns);
    selfPay.push(unsetAmt - unsetIns);
  } else if (attributed > total && insurance.length) {
    insurance[insurance.length - 1] += unsetAmt;
    selfPay[selfPay.length - 1] -= unsetAmt;
  }

  return { labels, insurance, selfPay };
}

function buildEntityMetaFromClinics() {
  const meta = { all: { label: '全院', role: null } };
  getClinics().forEach((clinic) => {
    meta[clinic.id] = { label: clinic.name, clinicId: clinic.id };
    Object.keys(clinic.roles || {}).forEach((roleKey) => {
      const members = clinic.roles[roleKey] || [];
      if (!members.length) return;
      const roleEntityKey = `${clinic.id}-${roleKey}`;
      meta[roleEntityKey] = {
        label: `${clinic.name} — ${MOCK_DATA.roleLabels?.[roleKey] || roleKey}`,
        role: roleKey,
        clinicId: clinic.id,
      };
      members.forEach((member) => {
        meta[member.id] = {
          label: member.name,
          role: roleKey,
          clinicId: clinic.id,
          shortName: staffMemberChartLabel(member, roleKey),
        };
      });
    });
  });
  return meta;
}

function buildEntityWeightsFromClinics() {
  const weights = { all: getAllClinicsRevenueWeight() };
  getClinics().forEach((clinic) => {
    const clinicWeight = getClinicRevenueWeight(clinic.id);
    const staff = getStaffRegistry(clinic.id);
    const roleShares = getStaffRoleShares(clinic.id);
    weights[clinic.id] = clinicWeight;
    if (clinic.roles?.Dr?.length) weights[`${clinic.id}-Dr`] = clinicWeight * roleShares.dr;
    if (clinic.roles?.DH?.length) weights[`${clinic.id}-DH`] = clinicWeight * roleShares.dh;
    weights[`${clinic.id}-DA`] = 0;
    staff.forEach((row) => {
      weights[row.id] = clinicWeight * row.share;
    });
    (clinic.roles?.DA || []).forEach((member) => {
      weights[member.id] = 0;
    });
  });
  return weights;
}

const ENTITY_META = buildEntityMetaFromClinics();
const ENTITY_WEIGHTS = buildEntityWeightsFromClinics();

function resolveClinicIdFromEntity(entityKey) {
  if (ENTITY_META[entityKey]?.clinicId) return ENTITY_META[entityKey].clinicId;
  if (isClinicEntityKey(entityKey)) return entityKey;
  return getClinicIds()[0] || 'clinic-sakura';
}

function mergeStaffSalesCharts(chartA, chartB) {
  return {
    labels: [...(chartA?.labels || []), ...(chartB?.labels || [])],
    insurance: [...(chartA?.insurance || []), ...(chartB?.insurance || [])],
    selfPay: [...(chartA?.selfPay || []), ...(chartB?.selfPay || [])],
  };
}

function buildAllClinicsStaffSalesChart(base) {
  return getClinics().reduce((merged, clinic) => {
    const meta = { ...ENTITY_META[clinic.id], entityKey: clinic.id };
    const clinicDetail = scalePeriodDetail(base, getClinicRevenueWeight(clinic.id), meta);
    const chart = buildStaffSalesChartFromDetail(clinicDetail, clinic.id);
    return merged.labels?.length
      ? mergeStaffSalesCharts(merged, chart)
      : chart;
  }, { labels: [], insurance: [], selfPay: [] });
}

function buildStaffSalesChartFromDetail(detail, entityKey) {
  if (entityKey === 'all') {
    const base = detail._periodKey ? MOCK_DATA.periodDetails[detail._periodKey] : null;
    if (base) return buildAllClinicsStaffSalesChart(base);
  }

  const meta = ENTITY_META[entityKey] || {};
  const clinicId = resolveClinicIdFromEntity(entityKey);

  if (entityKey === 'staff-unset' || entityKey.endsWith('-unset')) {
    const unsetTotal = splitStaffSalesTotal(detail?.total || 0, clinicId).unset;
    if (!unsetTotal) return { labels: [], insurance: [], selfPay: [] };
    return buildStaffSalesChartFromBreakdown(detail, ['未設定'], [1]);
  }

  if (entityKey.startsWith('dr-') || entityKey.startsWith('dh-')) {
    const name = meta.shortName || meta.label;
    if (!detail?.total) return { labels: [], insurance: [], selfPay: [] };
    return buildStaffSalesChartFromBreakdown(detail, [name], [1]);
  }

  if (entityKey.endsWith('-Dr') || entityKey.endsWith('-DH')) {
    const roleKey = entityKey.endsWith('-Dr') ? 'Dr' : 'DH';
    const staff = getStaffRegistry(clinicId).filter((s) => s.role === roleKey);
    if (!staff.length) return { labels: [], insurance: [], selfPay: [] };
    const roleSum = sumStaffShares(staff, roleKey) || 1;
    return buildStaffSalesChartFromBreakdown(
      detail,
      staff.map((s) => s.chartLabel),
      staff.map((s) => s.share / roleSum),
    );
  }

  if (isClinicEntityKey(entityKey)) {
    return buildStaffSalesChartWithResidual(detail, entityKey);
  }

  return buildStaffSalesChartWithResidual(detail, clinicId);
}

function buildEntityWeightsFromRegistry() {
  return buildEntityWeightsFromClinics();
}

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
  if (base.utilization) {
    detail.utilization = scaleUtilizationBlock(base.utilization, weight);
  }
  if (base.recall) {
    detail.recall = scaleRecallBlock(base.recall, weight);
  }
  if (base.questionnaire) {
    detail.questionnaire = scaleQuestionnaireBlock(base.questionnaire, weight);
  }

  return detail;
}

function sumNumericArrays(a, b) {
  const len = Math.max(a?.length || 0, b?.length || 0);
  const result = [];
  for (let i = 0; i < len; i++) {
    result.push((a?.[i] || 0) + (b?.[i] || 0));
  }
  return result;
}

function mergeBreakdownParts(a, b) {
  return {
    insurance: (a?.insurance || 0) + (b?.insurance || 0),
    selfPay: (a?.selfPay || 0) + (b?.selfPay || 0),
    products: (a?.products || 0) + (b?.products || 0),
    other: (a?.other || 0) + (b?.other || 0),
  };
}

function mergePatientsBlocks(a, b) {
  if (!a) return b ? JSON.parse(JSON.stringify(b)) : undefined;
  if (!b) return JSON.parse(JSON.stringify(a));
  const outB = {
    pureFirst: (a.outpatient?.breakdown?.pureFirst || 0) + (b.outpatient?.breakdown?.pureFirst || 0),
    first: (a.outpatient?.breakdown?.first || 0) + (b.outpatient?.breakdown?.first || 0),
    return: (a.outpatient?.breakdown?.return || 0) + (b.outpatient?.breakdown?.return || 0),
    other: (a.outpatient?.breakdown?.other || 0) + (b.outpatient?.breakdown?.other || 0),
  };
  const outTotal = sumVisitBreakdown(outB);
  const visB = {
    pureFirst: (a.visiting?.breakdown?.pureFirst || 0) + (b.visiting?.breakdown?.pureFirst || 0),
    first: (a.visiting?.breakdown?.first || 0) + (b.visiting?.breakdown?.first || 0),
    return: (a.visiting?.breakdown?.return || 0) + (b.visiting?.breakdown?.return || 0),
    other: (a.visiting?.breakdown?.other || 0) + (b.visiting?.breakdown?.other || 0),
  };
  const visTotal = (a.visiting?.total || 0) + (b.visiting?.total || 0);
  return {
    outpatient: { breakdown: reconcileVisitBreakdown(outB, outTotal) },
    visiting: {
      total: visTotal,
      breakdown: reconcileVisitBreakdown(visB, visTotal),
    },
  };
}

function mergeAppointmentsBlocks(a, b) {
  if (!a?.breakdown) return b ? JSON.parse(JSON.stringify(b)) : a;
  if (!b?.breakdown) return JSON.parse(JSON.stringify(a));
  const visited = a.breakdown.visited + b.breakdown.visited;
  const notVisited = a.breakdown.notVisited + b.breakdown.notVisited;
  const cancelled = a.breakdown.cancelled + b.breakdown.cancelled;
  const noShow = a.breakdown.noShow + b.breakdown.noShow;
  const total = a.total + b.total;
  const breakdown = { visited, notVisited, cancelled, noShow };
  const sum = visited + notVisited + cancelled + noShow;
  if (sum !== total) {
    breakdown.noShow = Math.max(0, total - visited - notVisited - cancelled);
  }
  return { total, breakdown };
}

function mergeCashflowRows(rowsA, rowsB) {
  if (!rowsA) return rowsB;
  if (!rowsB) return rowsA;
  return rowsA.map((row, i) => {
    const other = rowsB[i];
    if (!other || row.label !== other.label) return { ...row };
    const next = { ...row };
    if (String(row.value).startsWith('¥') && String(other.value).startsWith('¥')) {
      const aAmt = parseInt(String(row.value).replace(/[¥,]/g, ''), 10) || 0;
      const bAmt = parseInt(String(other.value).replace(/[¥,]/g, ''), 10) || 0;
      next.value = formatYenValue(aAmt + bAmt);
    } else if (row.unit === '%' && other.unit === '%') {
      const aPct = parseFloat(String(row.value)) || 0;
      const bPct = parseFloat(String(other.value)) || 0;
      next.value = String(Math.round(((aPct + bPct) / 2) * 10) / 10);
      if (row.progress != null && other.progress != null) {
        next.progress = Math.round((row.progress + other.progress) / 2);
      }
    }
    return next;
  });
}

function mergeInsightsRows(rowsA, rowsB, mergedDetail) {
  if (!rowsA) return rowsB;
  if (!rowsB) return rowsA;
  return rowsA.map((item, i) => {
    const other = rowsB[i];
    if (!other || item.label !== other.label) return { ...item };
    const next = { ...item };
    if (item.label === '患者単価' && mergedDetail.visits > 0) {
      next.value = formatYenValue(Math.round(mergedDetail.total / mergedDetail.visits));
    } else if (item.label === '自費率' && mergedDetail.total > 0) {
      next.value = String(calcSelfPayRatePct(mergedDetail.breakdown, mergedDetail.total));
    } else if (item.unit === '名' || item.unit === '件' || item.label?.includes('新患') || item.label?.includes('予約')) {
      const aNum = parseInt(String(item.value).replace(/,/g, ''), 10) || 0;
      const bNum = parseInt(String(other.value).replace(/,/g, ''), 10) || 0;
      next.value = String(aNum + bNum);
    } else if (item.cancelCount != null) {
      next.cancelCount = (item.cancelCount || 0) + (other.cancelCount || 0);
      const apptTotal = mergedDetail.appointments?.total || 0;
      next.cancelRate = apptTotal > 0
        ? Math.round(((next.cancelCount / apptTotal) * 1000)) / 10
        : item.cancelRate;
    } else if (String(item.value).startsWith('¥')) {
      const aAmt = parseInt(String(item.value).replace(/[¥,]/g, ''), 10) || 0;
      const bAmt = parseInt(String(other.value).replace(/[¥,]/g, ''), 10) || 0;
      next.value = formatYenValue(aAmt + bAmt);
    }
    return next;
  });
}

function mergeTwoPeriodDetails(detailA, detailB, mergedMeta = {}) {
  const total = (detailA.total || 0) + (detailB.total || 0);
  const visits = (detailA.visits || 0) + (detailB.visits || 0);
  const breakdown = rebalanceBreakdown(
    mergeBreakdownParts(detailA.breakdown, detailB.breakdown),
    total,
  );
  const baseSubtitle = String(detailA.subtitle || '').split(' · ').pop() || detailA.subtitle;
  const merged = {
    ...JSON.parse(JSON.stringify(detailA)),
    total,
    visits,
    breakdown,
    subtitle: mergedMeta.label ? `${mergedMeta.label} · ${baseSubtitle}` : detailA.subtitle,
  };

  if (detailA.charts && detailB.charts) {
    merged.charts = { ...detailA.charts };
    ['insurance', 'selfPay', 'products', 'other', 'visits', 'visitsFirst', 'visitsReFirst', 'visitsReturn', 'compareRevenue', 'compareVisits'].forEach((key) => {
      if (detailA.charts[key] || detailB.charts[key]) {
        merged.charts[key] = sumNumericArrays(detailA.charts[key], detailB.charts[key]);
      }
    });
  }

  merged.patients = mergePatientsBlocks(detailA.patients, detailB.patients);
  merged.appointments = mergeAppointmentsBlocks(detailA.appointments, detailB.appointments);
  merged.utilization = mergeUtilizationBlocks(detailA.utilization, detailB.utilization);
  merged.recall = mergeRecallBlocks(detailA.recall, detailB.recall);
  merged.questionnaire = mergeQuestionnaireBlocks(detailA.questionnaire, detailB.questionnaire);
  merged.cashflow = mergeCashflowRows(detailA.cashflow, detailB.cashflow);
  merged.insights = mergeInsightsRows(detailA.insights, detailB.insights, merged);

  return merged;
}

function mergeAllClinicsPeriodDetail(base, periodKey) {
  const allMeta = { ...ENTITY_META.all, entityKey: 'all' };
  const clinics = getClinics();
  if (!clinics.length) {
    const fallback = scalePeriodDetail(base, 1, allMeta);
    fallback._periodKey = periodKey;
    return fallback;
  }
  const clinicDetails = clinics.map((clinic) => {
    const meta = { ...ENTITY_META[clinic.id], entityKey: clinic.id };
    return scalePeriodDetail(base, getClinicRevenueWeight(clinic.id), meta);
  });
  const merged = clinicDetails.length === 1
    ? clinicDetails[0]
    : clinicDetails.slice(1).reduce(
      (acc, detail) => mergeTwoPeriodDetails(acc, detail, allMeta),
      clinicDetails[0],
    );
  if (merged) merged._periodKey = periodKey;
  return merged;
}

function derivePeriodCard(periodKey, weight, entityKey = 'clinic-sakura') {
  const detail = resolvePeriodDetail(periodKey, { entityKey, weight });
  if (!detail) return null;
  const b = detail.breakdown;
  return {
    label: periodKey,
    value: formatYenValue(detail.total),
    visits: detail.visits,
    change: detail.change?.text,
    changeUp: detail.change?.up,
    active: periodKey === '本日',
    visitsCumulative: periodKey === '今月' || periodKey === '今年',
    revenue: {
      goal: scaleNum(getPeriodRevenueGoal(periodKey, entityKey) || 0, weight),
      insurance: b.insurance,
      selfPay: b.selfPay,
      products: b.products,
      other: b.other || 0,
    },
  };
}

function buildEntityPeriodDetails(entityKey, weight) {
  const meta = { ...ENTITY_META[entityKey], entityKey };
  const facts = getDailyFacts(entityKey, weight);
  const result = {};
  PERIOD_KEYS.forEach((pk) => {
    const base = MOCK_DATA.periodDetails[pk];
    if (!base) return;
    let detail;
    if (entityKey === 'all') {
      detail = mergeAllClinicsPeriodDetail(base, pk);
    } else {
      detail = scalePeriodDetail(base, weight, meta);
    }
    if (FACT_AGGREGATE_PERIODS.has(pk)) {
      const agg = aggregateDailyFacts(filterFactsByPeriod(facts, pk));
      detail = overlayAggregateOnPeriodDetail(detail, agg);
    }
    detail._periodKey = pk;
    result[pk] = detail;
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

function clearPeriodDetailsCache() {
  periodDetailsCache.clear();
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
  const monthGoal = scaleNum(getPeriodRevenueGoal('今月', entityKey), weight);
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
  if (meta?.role === 'unset' && (entityKey === 'staff-unset' || entityKey.endsWith('-unset'))) {
    const clinicId = resolveClinicIdFromEntity(entityKey);
    const unset = splitStaffSalesTotal(total, clinicId).unset;
    return { total: unset, dr: 0, dh: 0, unset, trendText: traits.trendText, trend: traits.trend };
  }
  return null;
}

function computeStaffBreakdownFromChart(detail, entityKey = 'clinic-sakura') {
  if (entityKey === 'all') {
    const periodKey = detail?._periodKey || '本日';
    const base = (typeof MOCK_DATA !== 'undefined' && MOCK_DATA.periodDetails?.[periodKey])
      ? MOCK_DATA.periodDetails[periodKey]
      : detail;
    return getClinics().reduce((acc, clinic) => {
      const w = getClinicRevenueWeight(clinic.id);
      const meta = { ...ENTITY_META[clinic.id], entityKey: clinic.id };
      const clinicDetail = typeof scalePeriodDetail === 'function'
        ? scalePeriodDetail(base, w, meta)
        : detail;
      const part = splitStaffSalesTotal(clinicDetail?.total || 0, clinic.id);
      return {
        dr: acc.dr + part.dr,
        dh: acc.dh + part.dh,
        unset: acc.unset + part.unset,
      };
    }, { dr: 0, dh: 0, unset: 0 });
  }
  const clinicId = resolveClinicIdFromEntity(entityKey);
  if (entityKey.endsWith('-Dr')) {
    const part = splitStaffSalesTotal(detail?.total || 0, clinicId);
    return { dr: part.dr, dh: 0, unset: 0 };
  }
  if (entityKey.endsWith('-DH')) {
    const part = splitStaffSalesTotal(detail?.total || 0, clinicId);
    return { dr: 0, dh: part.dh, unset: 0 };
  }
  return splitStaffSalesTotal(detail?.total || 0, clinicId);
}

function getStaffSalesBreakdown(detail, entityKey = 'clinic-sakura') {
  const override = buildStaffSalesOverride(entityKey, detail);
  if (override && (entityKey.startsWith('dr-') || entityKey.startsWith('dh-') || entityKey === 'staff-unset' || entityKey.endsWith('-unset'))) {
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
  if (text.includes(UNSET_CHART_LABEL) || text.includes('未設定')) return 'unset';
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
  } else {
    const hasUnset = chartCopy.labels.some((l) => l.includes('未設定'));
    if (!hasUnset) {
      chartCopy.labels.push(UNSET_CHART_LABEL);
      chartCopy.insurance.push(0);
      chartCopy.selfPay.push(0);
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
  if (entityKey === 'clinic-sakura' || entityKey === 'all') return {};

  const meta = ENTITY_META[entityKey];
  const traits = STAFF_TRAITS[entityKey] || {};
  const total = detail.total;
  const visits = detail.visits;
  const overrides = {};

  const staffSales = buildStaffSalesOverride(entityKey, detail);
  if (staffSales) overrides.staffSales = staffSales;

  if (meta?.role === 'unset' || entityKey === 'staff-unset' || entityKey.endsWith('-unset')) {
    overrides.utilization = {
      value: String(traits.utilization || 78),
      progress: traits.utilization || 78,
      sub: '担当未割当の稼働',
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
  const detail = MOCK_DATA?.periodDetails?.[periodKey] || MOCK_DATA?.periodDetails?.['本日'];
  if (detail && typeof buildStaffSalesChartWithResidual === 'function') {
    return buildStaffSalesChartWithResidual(detail, getClinicIds()[0] || 'clinic-sakura');
  }
  return { labels: [UNSET_CHART_LABEL], insurance: [0], selfPay: [0] };
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

  if (entityKey === 'all') {
    return buildUtilizationChartForEntity('clinic-sakura', periodKey);
  }

  return base;
}
