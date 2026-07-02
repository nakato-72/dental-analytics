/**
 * 階層別サンプルデータ — 医院 / 職種 / 担当ごとに数値を切り替え
 * ベースは MOCK_DATA.periodDetails（さくら歯科）を weight でスケール
 */

const PERIOD_KEYS = ['前日', '本日', '今月', '今年'];

const ENTITY_WEIGHTS = {
  all: 1.65,
  'clinic-sakura': 1,
  'clinic-harbor': 0.44,
  'clinic-sakura-Dr': 0.7,
  'clinic-sakura-DH': 0.28,
  'clinic-sakura-DA': 0.06,
  'clinic-harbor-Dr': 0.38,
  'clinic-harbor-DH': 0.24,
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

const SAKURA_STAFF_CHART_SHARES = {
  'dr-tanaka': 0.396,
  'dr-sato': 0.237,
  'dh-suzuki': 0.15,
  'dh-yamada': 0.157,
  'dh-ito': 0.06,
};

const HARBOR_STAFF_CHART_SHARES = {
  'dr-nakamura': 0.86,
  'dh-takahashi': 0.58,
  'dh-mori': 0.42,
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
  detail.breakdown = {
    insurance: scaleNum(base.breakdown.insurance, weight),
    selfPay: scaleNum((base.breakdown.selfPay || 0) * selfPayBias, weight),
    products: scaleNum(base.breakdown.products, weight),
    other: scaleNum(base.breakdown.other, weight),
  };
  const bSum = detail.breakdown.insurance + detail.breakdown.selfPay
    + detail.breakdown.products + detail.breakdown.other;
  if (bSum !== detail.total) {
    detail.breakdown.other = Math.max(
      0,
      detail.total - detail.breakdown.insurance - detail.breakdown.selfPay - detail.breakdown.products,
    );
  }

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

  return detail;
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
  const traits = STAFF_TRAITS[ctx.entityKey] || {};
  const selfPayBias = traits.selfPayBias || 1;

  base.periods = base.periods.map((p) => scalePeriodCard(p, weight, selfPayBias));

  const monthDetail = resolvePeriodDetail('今月', ctx);
  base.primary.value = formatYenValue(monthDetail.total);
  base.primary.goal = formatYenValue(scaleNum(6300000, weight));
  base.primary.progress = Math.min(100, Math.round((monthDetail.total / scaleNum(6300000, weight)) * 1000) / 10);

  base.secondary[0].value = String(monthDetail.visits);
  const selfPayPct = monthDetail.total > 0
    ? Math.round((monthDetail.breakdown.selfPay / monthDetail.total) * 1000) / 10
    : 0;
  base.secondary[1].value = String(selfPayPct);

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
  if (meta?.role === 'DA') {
    return { total: scaleNum(total, 0.3), dr: 0, dh: 0, unset: scaleNum(total, 0.3), trendText: traits.trendText, trend: traits.trend };
  }
  if (entityKey.endsWith('-Dr')) {
    const dr = Math.round(total * 0.88);
    const unset = total - dr;
    return { total, dr, dh: 0, unset, trendText: traits.trendText || '+3.2%', trend: traits.trend || 'up' };
  }
  if (entityKey.endsWith('-DH')) {
    return { total, dr: 0, dh: Math.round(total * 0.92), unset: total - Math.round(total * 0.92), trendText: traits.trendText || '+2.1%', trend: traits.trend || 'up' };
  }
  if (entityKey === 'clinic-harbor') {
    return { total, dr: Math.round(total * 0.72), dh: Math.round(total * 0.22), unset: total - Math.round(total * 0.72) - Math.round(total * 0.22) };
  }
  return null;
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
      total: Math.max(1, scaleNum(34, ENTITY_WEIGHTS[entityKey] || 1)),
      visited: Math.max(0, scaleNum(29, ENTITY_WEIGHTS[entityKey] || 1)),
      notVisited: 1,
      cancelled: 1,
      noShow: 0,
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
    overrides.appointments = overrides.appointments || {
      total: Math.max(1, scaleNum(periodKey === '今月' ? 912 : 5240, ENTITY_WEIGHTS[entityKey] || 1)),
      trendText: traits.trendText || '+4.8%',
    };
  }

  return overrides;
}

function buildStaffSalesChartForEntity(entityKey, periodKey, breakdown, detail) {
  const base = getDefaultStaffSalesChartBase(periodKey);
  const meta = ENTITY_META[entityKey];
  const clinicId = meta?.clinicId || 'clinic-sakura';
  const shares = clinicId === 'clinic-harbor' ? HARBOR_STAFF_CHART_SHARES : SAKURA_STAFF_CHART_SHARES;

  if (entityKey.startsWith('dr-') || entityKey.startsWith('dh-')) {
    const name = meta.shortName || meta.label;
    const idx = base.labels.findIndex((l) => l.includes(name.split(' ')[0]));
    if (idx >= 0) {
      return {
        labels: [name],
        insurance: [base.insurance[idx]],
        selfPay: [base.selfPay[idx]],
        breakdown,
      };
    }
    const w = ENTITY_WEIGHTS[entityKey] || 0.2;
    const ins = Math.round((detail.breakdown.insurance || 0) * 0.6);
    const self = Math.round((detail.breakdown.selfPay || 0) * 0.6);
    return { labels: [name], insurance: [ins], selfPay: [self], breakdown };
  }

  if (entityKey.endsWith('-Dr')) {
    const labels = clinicId === 'clinic-harbor' ? ['中村 Dr'] : ['田中 Dr', '佐藤 Dr'];
    return filterChartByLabels(base, labels, breakdown);
  }

  if (entityKey.endsWith('-DH')) {
    const labels = clinicId === 'clinic-harbor' ? ['高橋 DH', '森 DH'] : ['鈴木 DH', '山田 DH', '伊藤 DH'];
    return filterChartByLabels(base, labels, breakdown);
  }

  if (entityKey === 'clinic-harbor') {
    return {
      labels: ['中村 Dr', '高橋 DH', '森 DH', '未設定'],
      insurance: scaleArray([28000, 8200, 5800, 2200], 1),
      selfPay: scaleArray([15200, 4200, 2800, 1200], 1),
      breakdown,
    };
  }

  return { ...base, breakdown };
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
