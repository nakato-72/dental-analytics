/**
 * クリック可能カード → ポップオーバー種別マッピング
 */
const CARD_POPOVER_TYPES = {
  '新患': 'newPatients',
  '新患累計': 'newPatients',
  '予約数': 'appointments',
  'キャンセル数 / キャンセル率': 'cancellations',
  '未収金': 'receivables',
  '入金実績': 'receivables',
  '自費未収': 'selfPayReceivables',
  '自費未収金': 'selfPayReceivables',
};

const POPOVER_CONFIG = {
  newPatients: {
    title: '新患',
    columns: [
      { key: 'chartNo', label: 'カルテNo' },
      { key: 'name', label: '氏名' },
      { key: 'age', label: '年齢' },
      { key: 'amount', label: '当日の金額' },
    ],
  },
  appointments: {
    title: '予約数',
    columns: [
      { key: 'chartNo', label: 'カルテNo' },
      { key: 'name', label: '氏名' },
      { key: 'age', label: '年齢' },
      { key: 'doctor', label: '担当医' },
      { key: 'dh', label: '担当DH' },
      { key: 'time', label: '予約時間' },
      { key: 'slotMinutes', label: '予約枠' },
      { key: 'treatment', label: '治療内容' },
    ],
  },
  cancellations: {
    title: 'キャンセル数',
    columns: [
      { key: 'cancelType', label: 'キャンセル種別' },
      { key: 'chartNo', label: 'カルテNo' },
      { key: 'name', label: '氏名' },
      { key: 'age', label: '年齢' },
      { key: 'time', label: '予約時間' },
    ],
  },
  receivables: {
    title: '未収金',
    columns: [
      { key: 'chartNo', label: 'カルテNo' },
      { key: 'name', label: '氏名' },
      { key: 'age', label: '年齢' },
      { key: 'amount', label: '金額' },
    ],
  },
  selfPayReceivables: {
    title: '自費未収金',
    columns: [
      { key: 'chartNo', label: 'カルテNo' },
      { key: 'name', label: '氏名' },
      { key: 'age', label: '年齢' },
      { key: 'amount', label: '金額' },
    ],
  },
};

const CANCEL_TYPE_CLASS = {
  '当日': 'cancel-same-day',
  '前日': 'cancel-day-before',
  '事前': 'cancel-advance',
  '無断': 'cancel-no-show',
};

/** 期間・種別ごとのモック行データ */
const POPOVER_MOCK_ROWS = {
  newPatients: [
    { chartNo: 'A-10482', name: '山本 翔太', age: 34, amount: '¥18,400' },
    { chartNo: 'A-10491', name: '田村 美優', age: 28, amount: '¥12,800' },
    { chartNo: 'A-10503', name: '小林 陽介', age: 41, amount: '¥24,600' },
  ],
  appointments: [
    { chartNo: 'B-8821', name: '佐藤 恵', age: 45, doctor: '田中 健一', dh: '鈴木 美咲', time: '09:30', slotMinutes: '30分', treatment: '定期検診' },
    { chartNo: 'B-9012', name: '高橋 大輔', age: 52, doctor: '田中 健一', dh: '山田 恵', time: '10:00', slotMinutes: '60分', treatment: 'SRP・PMTC' },
    { chartNo: 'B-9156', name: '伊藤 真由', age: 31, doctor: '佐藤 誠', dh: '伊藤 彩', time: '11:30', slotMinutes: '45分', treatment: '虫歯治療' },
    { chartNo: 'B-9203', name: '渡辺 健', age: 38, doctor: '佐藤 誠', dh: '鈴木 美咲', time: '14:00', slotMinutes: '30分', treatment: 'ホワイトニング相談' },
    { chartNo: 'B-9288', name: '中村 里奈', age: 27, doctor: '田中 健一', dh: '山田 恵', time: '15:30', slotMinutes: '30分', treatment: '矯正相談' },
  ],
  cancellations: [
    { cancelType: '当日', chartNo: 'C-3310', name: '松本 優', age: 36, time: '10:30' },
    { cancelType: '前日', chartNo: 'C-3388', name: '井上 拓也', age: 29, time: '13:00' },
    { cancelType: '無断', chartNo: 'C-3401', name: '木村 さくら', age: 42, time: '16:00' },
  ],
  receivables: [
    { chartNo: 'D-2201', name: '斎藤 浩二', age: 48, amount: '¥8,600' },
    { chartNo: 'D-2245', name: '吉田 麻衣', age: 33, amount: '¥5,200' },
    { chartNo: 'D-2290', name: '清水 勇人', age: 55, amount: '¥4,800' },
  ],
  selfPayReceivables: [
    { chartNo: 'E-1102', name: '森 奈々', age: 39, amount: '¥32,000' },
    { chartNo: 'E-1148', name: '池田 亮', age: 44, amount: '¥18,500' },
  ],
};

/** 期間が長い場合に追加表示する固有データ（重複なし） */
const POPOVER_PERIOD_EXTRA = {
  '今月': {
    newPatients: [
      { chartNo: 'A-10518', name: '岡田 真一', age: 29, amount: '¥15,200' },
      { chartNo: 'A-10524', name: '藤原 彩花', age: 33, amount: '¥19,800' },
    ],
    appointments: [
      { chartNo: 'B-9310', name: '石井 翔', age: 41, doctor: '佐藤 誠', dh: '伊藤 彩', time: '09:00', slotMinutes: '30分', treatment: '定期検診' },
      { chartNo: 'B-9322', name: '前田 由美', age: 36, doctor: '田中 健一', dh: '鈴木 美咲', time: '16:00', slotMinutes: '45分', treatment: 'インレー装着' },
    ],
    cancellations: [
      { cancelType: '事前', chartNo: 'C-3420', name: '西村 健', age: 47, time: '11:00' },
    ],
    receivables: [
      { chartNo: 'D-2310', name: '福田 恵子', age: 42, amount: '¥12,400' },
      { chartNo: 'D-2335', name: '青木 大樹', age: 37, amount: '¥9,800' },
    ],
    selfPayReceivables: [
      { chartNo: 'E-1180', name: '岡田 真一', age: 51, amount: '¥24,000' },
      { chartNo: 'E-1205', name: '藤原 彩花', age: 36, amount: '¥15,800' },
    ],
  },
  '今年': {
    newPatients: [
      { chartNo: 'A-10540', name: '長谷川 翼', age: 26, amount: '¥21,000' },
      { chartNo: 'A-10555', name: '坂本 理沙', age: 35, amount: '¥17,600' },
      { chartNo: 'A-10568', name: '遠藤 剛', age: 48, amount: '¥22,400' },
    ],
    appointments: [
      { chartNo: 'B-9340', name: '原田 美穂', age: 33, doctor: '田中 健一', dh: '山田 恵', time: '08:30', slotMinutes: '30分', treatment: 'クリーニング' },
      { chartNo: 'B-9355', name: '三浦 拓海', age: 29, doctor: '佐藤 誠', dh: '鈴木 美咲', time: '17:00', slotMinutes: '60分', treatment: 'インプラント相談' },
    ],
    cancellations: [
      { cancelType: '前日', chartNo: 'C-3450', name: '村上 あゆみ', age: 31, time: '14:30' },
      { cancelType: '無断', chartNo: 'C-3462', name: '橋本 誠', age: 44, time: '10:00' },
    ],
    receivables: [
      { chartNo: 'D-2380', name: '大野 香織', age: 39, amount: '¥18,200' },
      { chartNo: 'D-2401', name: '菊地 浩', age: 56, amount: '¥11,500' },
    ],
    selfPayReceivables: [
      { chartNo: 'E-1220', name: '長谷川 翼', age: 42, amount: '¥28,000' },
      { chartNo: 'E-1245', name: '坂本 理沙', age: 38, amount: '¥42,000' },
    ],
  },
};

function getPopoverTypeForLabel(label) {
  return CARD_POPOVER_TYPES[label] || null;
}

function getPopoverRows(type, period) {
  const base = (POPOVER_MOCK_ROWS[type] || []).map(r => ({ ...r }));
  const extra = POPOVER_PERIOD_EXTRA[period]?.[type] || [];
  if (period === '今年') {
    const monthExtra = POPOVER_PERIOD_EXTRA['今月']?.[type] || [];
    return [...base, ...monthExtra, ...extra];
  }
  return [...base, ...extra];
}

function getPopoverConfig(type) {
  return POPOVER_CONFIG[type];
}

/** 全ポップオーバー共通の標準サイズ（予約数8列・5行がスクロールなしで収まる想定） */
const POPOVER_DEFAULT_SIZE = {
  width: 980,
  height: 460,
};
