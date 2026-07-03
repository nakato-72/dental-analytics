/**
 * モックデータ — 実API接続前のUIプロトタイプ用
 * viewType: 全階層で同一レイアウト（モックデータは共通、後から level 別に差し替え可能）
 */

const MOCK_DATA = {
  meta: {
    loadedCount: 12847,
    fileName: 'clinic_data_202606.csv',
    missingCount: 3,
    skippedCount: 12,
    periodLabel: '今月 (2026/06/01 - 2026/06/30)',
    isRealData: true,
  },

  clinics: [
    {
      id: 'clinic-sakura',
      name: 'さくら歯科クリニック',
      attainment: 68,
      roles: {
        Dr: [
          { id: 'dr-tanaka', name: '田中 健一', attainment: 85 },
          { id: 'dr-sato', name: '佐藤 誠', attainment: 72 },
        ],
        DH: [
          { id: 'dh-suzuki', name: '鈴木 美咲', attainment: 78 },
          { id: 'dh-yamada', name: '山田 恵', attainment: 65 },
          { id: 'dh-ito', name: '伊藤 彩', attainment: 91 },
        ],
        DA: [
          { id: 'da-watanabe', name: '渡辺 花子', attainment: 88 },
          { id: 'da-kobayashi', name: '小林 太郎', attainment: 76 },
        ],
      },
    },
    {
      id: 'clinic-harbor',
      name: 'ハーバー歯科医院',
      attainment: 54,
      roles: {
        Dr: [
          { id: 'dr-nakamura', name: '中村 翔', attainment: 61 },
        ],
        DH: [
          { id: 'dh-takahashi', name: '高橋 優', attainment: 58 },
          { id: 'dh-mori', name: '森 奈々', attainment: 49 },
        ],
        DA: [
          { id: 'da-kato', name: '加藤 真由', attainment: 82 },
        ],
      },
    },
  ],

  // 共通メトリクス（医院・職種・担当で同一表示）
  unified: {
    shared: {
      primary: {
        label: '月間売上',
        value: '¥4,280,000',
        unit: '',
        goal: '¥6,300,000',
        progress: 67.9,
        alert: {
          type: 'warning',
          title: 'このペースでは目標未達',
          forecast: '¥5,580,000',
          requiredDaily: '¥84,000/日',
        },
      },
      secondary: [
        { label: '患者来院数', value: '847', unit: '名', yoy: '+12.3%', yoyUp: true },
        { label: '自費率', value: '38.2', unit: '%', yoy: '+2.1pt', yoyUp: true },
      ],
      periods: [
        {
          label: '前日', value: '¥186,400', visits: 38, change: '+8.2%', changeUp: true,
          revenue: { goal: 202000, insurance: 108200, selfPay: 62400, products: 15800 },
        },
        {
          label: '本日', value: '¥142,800', visits: 29, change: '-5.1%', changeUp: false, active: true,
          revenue: { goal: 210000, insurance: 82000, selfPay: 48600, products: 12200 },
        },
        {
          label: '今月', value: '¥4,280,000', visits: 847, visitsCumulative: true, change: '+4.8%', changeUp: true,
          revenue: { goal: 6300000, insurance: 2640000, selfPay: 1280000, products: 360000 },
        },
        {
          label: '今年', value: '¥24,150,000', visits: 4892, visitsCumulative: true, change: '+9.6%', changeUp: true,
          revenue: { goal: 33900000, insurance: 15100000, selfPay: 7200000, products: 1850000 },
        },
      ],
    },
  },

  // 月次推移チャート（全階層共通）
  clinicOnly: {
    chart: {
      title: '月次売上推移（1年間）',
      labels: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
      insurance: [3200000, 3450000, 3380000, 3620000, 3890000, 2640000, 3780000, 3920000, 3850000, 4010000, 4180000, 4350000],
      selfPay: [1420000, 1580000, 1650000, 1720000, 1840000, 1280000, 1780000, 1850000, 1920000, 1980000, 2050000, 2120000],
      products: [280000, 300000, 310000, 330000, 350000, 360000, 370000, 385000, 390000, 400000, 415000, 428000],
      other: [60000, 55000, 48000, 42000, 38000, 0, 35000, 30000, 28000, 25000, 22000, 20000],
      highlightIndex: 5,
    },
  },

  roleLabels: { Dr: 'ドクター', DH: '歯科衛生士', DA: '歯科助手' },
  roleColors: { Dr: '#2563eb', DH: '#0891b2', DA: '#7c3aed' },

  revenueCategories: [
    { key: 'insurance', label: '保険', color: '#22c55e' },
    { key: 'selfPay', label: '自費', color: '#0ea5e9' },
    { key: 'products', label: '販売品', color: '#eab308' },
    { key: 'other', label: 'その他', color: '#94a3b8' },
  ],

  visitCategories: [
    { key: 'visitsFirst', label: '初診', color: '#6366f1' },
    { key: 'visitsReFirst', label: '再初診', color: '#a855f7' },
    { key: 'visitsReturn', label: '再診', color: '#06b6d4' },
  ],

  // 期間詳細セクション用モックデータ（全階層共通、後から level 別に差し替え可能）
  periodDetails: {
    '前日': {
      salesLabel: '前日売上',
      subtitle: '2026年6月22日（日）',
      revenueChartTitle: '日別売上',
      visitsChartTitle: '日別患者数',
      breakdown: { insurance: 108200, selfPay: 62400, products: 15800, other: 0 },
      total: 186400,
      visits: 38,
      change: { text: '+8.2%', up: true, label: '前々日比' },
      charts: {
        labels: ['6/16', '6/17', '6/18', '6/19', '6/20', '6/21', '6/22'],
        insurance: [92000, 98000, 105000, 101000, 112000, 99800, 108200],
        selfPay: [48000, 52000, 58000, 55000, 61000, 54200, 62400],
        products: [12000, 14000, 15000, 13200, 16800, 14100, 15800],
        other: [0, 800, 0, 1200, 0, 600, 0],
        visits: [32, 34, 36, 35, 40, 35, 38],
        visitsFirst: [8, 9, 10, 9, 11, 9, 10],
        visitsReFirst: [4, 4, 5, 4, 5, 5, 4],
        visitsReturn: [20, 21, 21, 22, 24, 21, 24],
        compareLabel: '前年同曜日',
        compareRevenue: [168000, 175000, 182000, 178000, 195000, 172000, 178500],
        compareVisits: [28, 30, 31, 30, 34, 31, 33],
        highlightIndex: 6,
      },
      insights: [
        { label: '患者単価', value: '¥4,905', sub: '前々日比 +2.1%' },
        { label: '新患', value: '3', unit: '名', sub: '前日予約 2名' },
        { label: '予約数', value: '42', unit: '件', sub: '実績 38件 / 残枠 4' },
        { label: 'キャンセル数 / キャンセル率', cancelCount: 2, cancelRate: 3.8, sub: '当月平均 4.2%' },
      ],
      cashflow: [
        { label: '未収金', value: '¥18,600', unit: '', sub: '前々日比 -5%' },
        { label: '自費未収', value: '¥6,200', unit: '', sub: '要フォロー 2名' },
        { label: '入金率', value: '95.8', unit: '%', sub: '目標 95%', progress: 99 },
      ],
      patients: {
        outpatient: {
          breakdown: { pureFirst: 3, first: 7, return: 24, other: 4 },
        },
        visiting: {
          total: 3,
          breakdown: { pureFirst: 1, first: 1, return: 0, other: 1 },
        },
      },
      appointments: {
        total: 42,
        breakdown: { visited: 38, notVisited: 2, cancelled: 1, noShow: 1 },
      },
    },
    '本日': {
      salesLabel: '本日売上',
      subtitle: '2026年6月23日（月）',
      revenueChartTitle: '日別売上',
      visitsChartTitle: '日別患者数',
      breakdown: { insurance: 82000, selfPay: 48600, products: 12200, other: 0 },
      total: 142800,
      visits: 29,
      change: { text: '-5.1%', up: false, label: '前日比' },
      charts: {
        labels: ['6/17', '6/18', '6/19', '6/20', '6/21', '6/22', '6/23'],
        insurance: [98000, 105000, 101000, 112000, 99800, 108200, 82000],
        selfPay: [52000, 58000, 55000, 61000, 54200, 62400, 48600],
        products: [14000, 15000, 13200, 16800, 14100, 15800, 12200],
        other: [800, 0, 1200, 0, 600, 0, 0],
        visits: [34, 36, 35, 40, 35, 38, 29],
        visitsFirst: [9, 10, 9, 11, 9, 10, 8],
        visitsReFirst: [5, 5, 4, 6, 5, 6, 4],
        visitsReturn: [20, 21, 22, 23, 21, 22, 17],
        compareLabel: '前年同曜日',
        compareRevenue: [175000, 182000, 178000, 195000, 172000, 178500, 158000],
        compareVisits: [30, 31, 30, 34, 31, 33, 26],
        highlightIndex: 6,
      },
      insights: [
        { label: '患者単価', value: '¥4,924', sub: '前日比 -1.8%' },
        { label: '新患', value: '2', unit: '名', sub: '残り予約 4枠' },
        { label: '予約数', value: '34', unit: '件', sub: '実績 29件 / 残枠 5' },
        { label: 'キャンセル数 / キャンセル率', cancelCount: 3, cancelRate: 5.2, sub: '要注意' },
      ],
      cashflow: [
        { label: '未収金', value: '¥12,400', unit: '', sub: '前日比 -8%' },
        { label: '自費未収', value: '¥4,200', unit: '', sub: '要フォロー 1名' },
        { label: '入金率', value: '96.1', unit: '%', sub: '目標 95%', progress: 99 },
      ],
      patients: {
        outpatient: {
          breakdown: { pureFirst: 2, first: 6, return: 17, other: 4 },
        },
        visiting: {
          total: 4,
          breakdown: { pureFirst: 1, first: 1, return: 1, other: 1 },
        },
      },
      appointments: {
        total: 34,
        breakdown: { visited: 29, notVisited: 2, cancelled: 2, noShow: 1 },
      },
    },
    '今月': {
      salesLabel: '今月売上',
      subtitle: '2026年6月（6/1 - 6/23 時点）',
      revenueChartTitle: '月別売上',
      visitsChartTitle: '月別患者数',
      breakdown: { insurance: 2640000, selfPay: 1280000, products: 360000, other: 0 },
      total: 4280000,
      visits: 847,
      change: { text: '+4.8%', up: true, label: '先月同日比' },
      charts: {
        labels: ['1月', '2月', '3月', '4月', '5月', '6月'],
        insurance: [1920000, 2080000, 2040000, 2180000, 2340000, 2640000],
        selfPay: [880000, 960000, 1000000, 1040000, 1120000, 1280000],
        products: [240000, 260000, 280000, 300000, 320000, 360000],
        other: [80000, 70000, 60000, 50000, 40000, 0],
        visits: [720, 768, 752, 798, 824, 847],
        visitsFirst: [142, 158, 148, 162, 168, 178],
        visitsReFirst: [68, 72, 70, 76, 80, 84],
        visitsReturn: [510, 538, 534, 560, 576, 585],
        compareLabel: '前年同月',
        compareRevenue: [2680000, 2920000, 2850000, 3050000, 3180000, 3520000],
        compareVisits: [648, 692, 678, 712, 738, 762],
        highlightIndex: 5,
      },
      insights: [
        { label: '患者単価', value: '¥5,052', sub: '前月比 +3.8%' },
        { label: '新患', value: '38', unit: '名', sub: '目標 50名', progress: 76 },
        { label: '自費率', value: '29.9', unit: '%', sub: '前月比 +2.1pt' },
        { label: '予約数', value: '912', unit: '件', sub: '実績 847件 / 残枠 65' },
        { label: 'キャンセル数 / キャンセル率', cancelCount: 35, cancelRate: 3.8, sub: '前月比 -0.4pt' },
      ],
      cashflow: [
        { label: '未収金', value: '¥284,000', unit: '', sub: '前月比 -12%' },
        { label: '自費未収', value: '¥96,000', unit: '', sub: '要フォロー 8名' },
        { label: '当月入金率', value: '94.2', unit: '%', sub: '目標 95%', progress: 99 },
      ],
      patients: {
        outpatient: {
          breakdown: { pureFirst: 38, first: 140, return: 585, other: 84 },
        },
        visiting: {
          total: 52,
          breakdown: { pureFirst: 12, first: 14, return: 18, other: 8 },
        },
      },
      appointments: {
        total: 912,
        breakdown: { visited: 847, notVisited: 55, cancelled: 7, noShow: 3 },
      },
    },
    '今年': {
      salesLabel: '今年売上',
      subtitle: '2026年（1/1 - 6/23 時点）',
      revenueChartTitle: '年別売上',
      visitsChartTitle: '年別患者数',
      breakdown: { insurance: 15100000, selfPay: 7200000, products: 1850000, other: 0 },
      total: 24150000,
      visits: 4892,
      change: { text: '+9.6%', up: true, label: '前年同日比' },
      charts: {
        labels: ['2022', '2023', '2024', '2025', '2026'],
        insurance: [18200000, 19800000, 21200000, 22800000, 15100000],
        selfPay: [7200000, 7800000, 8400000, 9100000, 7200000],
        products: [1400000, 1580000, 1720000, 1840000, 1850000],
        other: [600000, 520000, 480000, 420000, 0],
        visits: [4200, 4580, 4820, 5120, 4892],
        visitsFirst: [820, 892, 940, 998, 952],
        visitsReFirst: [380, 412, 430, 458, 438],
        visitsReturn: [3000, 3276, 3450, 3664, 3502],
        compareLabel: '前年',
        compareRevenue: [24800000, 26800000, 28800000, 30800000, 22800000],
        compareVisits: [3840, 4180, 4420, 4680, 4480],
        highlightIndex: 4,
      },
      insights: [
        { label: '患者単価', value: '¥4,936', sub: '前年比 +5.2%' },
        { label: '新患累計', value: '218', unit: '名', sub: '前年比 +12%' },
        { label: '自費率', value: '29.8', unit: '%', sub: '前年比 +1.8pt' },
        { label: '予約数', value: '5,240', unit: '件', sub: '実績 4,892件' },
        { label: 'キャンセル数 / キャンセル率', cancelCount: 186, cancelRate: 3.5, sub: '前年比 -0.3pt' },
      ],
      cashflow: [
        { label: '未収金', value: '¥412,000', unit: '', sub: '前年比 -8%' },
        { label: '自費未収', value: '¥148,000', unit: '', sub: '要フォロー 12名' },
        { label: '入金率', value: '93.6', unit: '%', sub: '目標 95%', progress: 96 },
      ],
      patients: {
        outpatient: {
          breakdown: { pureFirst: 218, first: 734, return: 3502, other: 438 },
        },
        visiting: {
          total: 286,
          breakdown: { pureFirst: 62, first: 78, return: 102, other: 44 },
        },
      },
      appointments: {
        total: 5240,
        breakdown: { visited: 4892, notVisited: 280, cancelled: 48, noShow: 20 },
      },
    },
  },
};
