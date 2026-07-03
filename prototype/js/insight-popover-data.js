/**
 * インサイト複合KPI — クリック内訳ポップオーバー用データ（医院分析）
 */

const INSIGHT_SEGMENT_POPOVER_MAP = {
  unitPrice: {
    保険: 'insightRevenueInsurance',
    自費: 'insightRevenueSelfPay',
    販売品: 'insightRevenueProducts',
    その他: 'insightRevenueOther',
  },
  staffSales: {
    Dr: 'insightStaffDr',
    DH: 'insightStaffDh',
    未設定: 'insightStaffUnset',
  },
  visits: {
    純初診: 'insightVisitPureFirst',
    初診: 'insightVisitFirst',
    再診: 'insightVisitReturn',
    その他: 'insightVisitOther',
  },
  newPatients: {
    純初診: 'insightVisitPureFirst',
    初診: 'insightVisitFirst',
    再診: 'insightVisitReturn',
    その他: 'insightVisitOther',
  },
  appointments: {
    来院済: 'insightApptVisited',
    キャンセル: 'insightApptCancel',
    無断CX: 'insightApptNoShow',
    未来院: 'insightApptPending',
  },
  utilization: {
    実績: 'insightUtilUsed',
    空き枠: 'insightUtilEmpty',
  },
  recall: {
    予約済: 'insightRecallBooked',
    連絡中: 'insightRecallContact',
    未着手: 'insightRecallPending',
  },
  selfPay: {
    インプラ: 'insightSelfPayImplant',
    矯正: 'insightSelfPayOrtho',
    ホワイト: 'insightSelfPayWhitening',
    その他: 'insightSelfPayOther',
  },
  questionnaire: {
    完了: 'insightQuestionnaireDone',
    未回答: 'insightQuestionnairePending',
    途中: 'insightQuestionnairePartial',
  },
};

const INSIGHT_POPOVER_CONFIG = {
  insightRevenueInsurance: {
    title: '保険診療内訳',
    columns: [
      { key: 'category', label: '区分' },
      { key: 'item', label: '診療内容' },
      { key: 'count', label: '件数' },
      { key: 'amount', label: '金額' },
    ],
  },
  insightRevenueSelfPay: {
    title: '自費診療内訳',
    columns: [
      { key: 'menu', label: 'メニュー' },
      { key: 'patient', label: '患者' },
      { key: 'staff', label: '担当' },
      { key: 'amount', label: '金額' },
    ],
  },
  insightRevenueProducts: {
    title: '販売品内訳',
    columns: [
      { key: 'product', label: '商品' },
      { key: 'qty', label: '数量' },
      { key: 'amount', label: '金額' },
    ],
  },
  insightRevenueOther: {
    title: 'その他売上内訳',
    columns: [
      { key: 'item', label: '項目' },
      { key: 'note', label: '備考' },
      { key: 'amount', label: '金額' },
    ],
  },
  insightStaffDr: {
    title: 'Dr別売上',
    columns: [
      { key: 'name', label: '担当Dr' },
      { key: 'insurance', label: '保険' },
      { key: 'selfPay', label: '自費' },
      { key: 'total', label: '合計' },
    ],
  },
  insightStaffDh: {
    title: 'DH別売上',
    columns: [
      { key: 'name', label: '担当DH' },
      { key: 'insurance', label: '保険' },
      { key: 'selfPay', label: '自費' },
      { key: 'total', label: '合計' },
    ],
  },
  insightStaffUnset: {
    title: '未設定担当の売上',
    columns: [
      { key: 'patient', label: '患者' },
      { key: 'item', label: '内容' },
      { key: 'amount', label: '金額' },
    ],
  },
  insightCollected: {
    title: '入金済一覧',
    columns: [
      { key: 'chartNo', label: 'カルテNo' },
      { key: 'name', label: '氏名' },
      { key: 'amount', label: '金額' },
      { key: 'paidAt', label: '入金日' },
    ],
  },
  insightReceivable: {
    title: '未収金一覧',
    columns: [
      { key: 'chartNo', label: 'カルテNo' },
      { key: 'name', label: '氏名' },
      { key: 'amount', label: '金額' },
      { key: 'days', label: '経過' },
    ],
  },
  insightVisitPureFirst: {
    title: '純初診患者',
    columns: [
      { key: 'chartNo', label: 'カルテNo' },
      { key: 'name', label: '氏名' },
      { key: 'channel', label: '獲得経路' },
      { key: 'doctor', label: '担当医' },
    ],
  },
  insightVisitFirst: {
    title: '初診患者',
    columns: [
      { key: 'chartNo', label: 'カルテNo' },
      { key: 'name', label: '氏名' },
      { key: 'menu', label: '初診内容' },
      { key: 'amount', label: '当日売上' },
    ],
  },
  insightVisitReturn: {
    title: '再診患者',
    columns: [
      { key: 'chartNo', label: 'カルテNo' },
      { key: 'name', label: '氏名' },
      { key: 'treatment', label: '治療内容' },
      { key: 'doctor', label: '担当医' },
    ],
  },
  insightVisitOther: {
    title: 'その他来院',
    columns: [
      { key: 'chartNo', label: 'カルテNo' },
      { key: 'name', label: '氏名' },
      { key: 'note', label: '区分' },
      { key: 'doctor', label: '担当' },
    ],
  },
  insightApptVisited: {
    title: '来院済予約',
    columns: [
      { key: 'chartNo', label: 'カルテNo' },
      { key: 'name', label: '氏名' },
      { key: 'time', label: '予約時間' },
      { key: 'treatment', label: '治療内容' },
      { key: 'doctor', label: '担当医' },
    ],
  },
  insightApptCancel: {
    title: 'キャンセル予約',
    columns: [
      { key: 'cancelType', label: '種別' },
      { key: 'chartNo', label: 'カルテNo' },
      { key: 'name', label: '氏名' },
      { key: 'time', label: '予約時間' },
    ],
  },
  insightApptNoShow: {
    title: '無断キャンセル',
    columns: [
      { key: 'chartNo', label: 'カルテNo' },
      { key: 'name', label: '氏名' },
      { key: 'time', label: '予約時間' },
      { key: 'doctor', label: '担当医' },
    ],
  },
  insightApptPending: {
    title: '未来院予約',
    columns: [
      { key: 'chartNo', label: 'カルテNo' },
      { key: 'name', label: '氏名' },
      { key: 'time', label: '予約時間' },
      { key: 'treatment', label: '治療内容' },
    ],
  },
  insightUtilUsed: {
    title: '稼働実績',
    columns: [
      { key: 'unit', label: 'ユニット' },
      { key: 'time', label: '時間帯' },
      { key: 'patient', label: '患者' },
      { key: 'minutes', label: '稼働分' },
    ],
  },
  insightUtilEmpty: {
    title: '空き枠',
    columns: [
      { key: 'unit', label: 'ユニット' },
      { key: 'time', label: '時間帯' },
      { key: 'slot', label: '枠' },
      { key: 'note', label: '備考' },
    ],
  },
  insightRecallBooked: {
    title: '予約済（予防）',
    columns: [
      { key: 'name', label: '患者' },
      { key: 'lastVisit', label: '前回来院' },
      { key: 'apptDate', label: '予約日' },
      { key: 'dh', label: '担当DH' },
    ],
  },
  insightRecallContact: {
    title: '連絡中（予防）',
    columns: [
      { key: 'name', label: '患者' },
      { key: 'lastVisit', label: '前回来院' },
      { key: 'contact', label: '連絡方法' },
      { key: 'dh', label: '担当DH' },
    ],
  },
  insightRecallPending: {
    title: '未着手（予防）',
    columns: [
      { key: 'name', label: '患者' },
      { key: 'lastVisit', label: '前回来院' },
      { key: 'overdue', label: '超過' },
      { key: 'dh', label: '担当DH' },
    ],
  },
  insightSelfPayImplant: {
    title: 'インプラ自費',
    columns: [
      { key: 'menu', label: 'メニュー' },
      { key: 'patient', label: '患者' },
      { key: 'staff', label: '担当' },
      { key: 'amount', label: '金額' },
    ],
  },
  insightSelfPayOrtho: {
    title: '矯正自費',
    columns: [
      { key: 'menu', label: 'メニュー' },
      { key: 'patient', label: '患者' },
      { key: 'staff', label: '担当' },
      { key: 'amount', label: '金額' },
    ],
  },
  insightSelfPayWhitening: {
    title: 'ホワイトニング自費',
    columns: [
      { key: 'menu', label: 'メニュー' },
      { key: 'patient', label: '患者' },
      { key: 'staff', label: '担当' },
      { key: 'amount', label: '金額' },
    ],
  },
  insightSelfPayOther: {
    title: 'その他自費',
    columns: [
      { key: 'menu', label: 'メニュー' },
      { key: 'patient', label: '患者' },
      { key: 'staff', label: '担当' },
      { key: 'amount', label: '金額' },
    ],
  },
  insightQuestionnaireDone: {
    title: '回答完了',
    columns: [
      { key: 'name', label: '患者' },
      { key: 'type', label: '問診種別' },
      { key: 'time', label: '回答時刻' },
      { key: 'staff', label: '確認者' },
    ],
  },
  insightQuestionnairePending: {
    title: '未回答',
    columns: [
      { key: 'name', label: '患者' },
      { key: 'appt', label: '予約' },
      { key: 'type', label: '問診種別' },
      { key: 'staff', label: '担当' },
    ],
  },
  insightQuestionnairePartial: {
    title: '回答途中',
    columns: [
      { key: 'name', label: '患者' },
      { key: 'progress', label: '進捗' },
      { key: 'appt', label: '予約' },
      { key: 'staff', label: '担当' },
    ],
  },
  insightDropoutActive: {
    title: '中断患者',
    columns: [
      { key: 'name', label: '患者' },
      { key: 'reason', label: '中断理由' },
      { key: 'lastVisit', label: '最終来院' },
      { key: 'ltv', label: 'LTV' },
    ],
  },
  insightDropoutRisk: {
    title: '離脱予備軍',
    columns: [
      { key: 'name', label: '患者' },
      { key: 'days', label: '未来院' },
      { key: 'lastVisit', label: '最終来院' },
      { key: 'doctor', label: '担当' },
    ],
  },
  insightWebBooking: {
    title: 'WEB予約',
    columns: [
      { key: 'source', label: '経路' },
      { key: 'name', label: '患者' },
      { key: 'menu', label: 'メニュー' },
      { key: 'time', label: '予約時間' },
    ],
  },
  insightPhoneBooking: {
    title: '電話予約',
    columns: [
      { key: 'name', label: '患者' },
      { key: 'menu', label: 'メニュー' },
      { key: 'time', label: '予約時間' },
      { key: 'staff', label: '受付' },
    ],
  },
};

const INSIGHT_POPOVER_ROWS = {
  insightRevenueInsurance: [
    { category: '一般', item: '虫歯治療（CR）', count: '8件', amount: '¥42,400' },
    { category: '一般', item: '歯周治療（SRP）', count: '5件', amount: '¥28,600' },
    { category: '一般', item: '定期検診', count: '12件', amount: '¥18,200' },
    { category: '補綴', item: 'インレー', count: '2件', amount: '¥24,800' },
  ],
  insightRevenueSelfPay: [
    { menu: 'ホワイトニング', patient: '佐藤 恵', staff: '田中 Dr', amount: '¥32,000' },
    { menu: 'セラミック', patient: '高橋 大輔', staff: '佐藤 Dr', amount: '¥86,000' },
    { menu: 'PMTC（自費）', patient: '伊藤 真由', staff: '鈴木 DH', amount: '¥8,800' },
  ],
  insightRevenueProducts: [
    { product: '電動歯ブラシ', qty: '3本', amount: '¥24,600' },
    { product: 'フロスセット', qty: '8袋', amount: '¥6,400' },
    { product: 'マウスウォッシュ', qty: '5本', amount: '¥4,500' },
  ],
  insightRevenueOther: [
    { item: 'レントゲン料', note: '保険外', amount: '¥3,200' },
    { item: '文書料', note: '紹介状', amount: '¥1,500' },
  ],
  insightStaffDr: [
    { name: '田中 健一', insurance: '¥52,400', selfPay: '¥38,000', total: '¥90,400' },
    { name: '佐藤 誠', insurance: '¥31,200', selfPay: '¥21,200', total: '¥52,400' },
  ],
  insightStaffDh: [
    { name: '鈴木 美咲', insurance: '¥18,400', selfPay: '¥12,600', total: '¥31,000' },
    { name: '山田 恵', insurance: '¥14,200', selfPay: '¥9,800', total: '¥24,000' },
    { name: '伊藤 彩', insurance: '¥12,800', selfPay: '¥7,400', total: '¥20,200' },
  ],
  insightStaffUnset: [
    { patient: '渡辺 健', item: '処方のみ', amount: '¥1,200' },
    { patient: '中村 里奈', item: '書類発行', amount: '¥800' },
  ],
  insightCollected: [
    { chartNo: 'B-8821', name: '佐藤 恵', amount: '¥18,400', paidAt: '本日' },
    { chartNo: 'B-9012', name: '高橋 大輔', amount: '¥24,600', paidAt: '本日' },
    { chartNo: 'B-9156', name: '伊藤 真由', amount: '¥12,800', paidAt: '本日' },
  ],
  insightReceivable: [
    { chartNo: 'D-2201', name: '斎藤 浩二', amount: '¥8,600', days: '12日' },
    { chartNo: 'D-2245', name: '吉田 麻衣', amount: '¥5,200', days: '8日' },
    { chartNo: 'D-2290', name: '清水 勇人', amount: '¥4,800', days: '45日' },
  ],
  insightVisitPureFirst: [
    { chartNo: 'A-10482', name: '山本 翔太', channel: '紹介', doctor: '田中 Dr' },
    { chartNo: 'A-10491', name: '田村 美優', channel: 'WEB', doctor: '佐藤 Dr' },
  ],
  insightVisitFirst: [
    { chartNo: 'A-10503', name: '小林 陽介', menu: '初診相談', amount: '¥24,600' },
    { chartNo: 'A-10518', name: '岡田 真一', menu: '矯正相談', amount: '¥15,200' },
  ],
  insightVisitReturn: [
    { chartNo: 'B-8821', name: '佐藤 恵', treatment: '定期検診', doctor: '田中 Dr' },
    { chartNo: 'B-9012', name: '高橋 大輔', treatment: 'SRP', doctor: '田中 Dr' },
    { chartNo: 'B-9156', name: '伊藤 真由', treatment: '虫歯治療', doctor: '佐藤 Dr' },
  ],
  insightVisitOther: [
    { chartNo: 'B-9288', name: '中村 里奈', note: '急患', doctor: '佐藤 Dr' },
  ],
  insightApptVisited: [
    { chartNo: 'B-8821', name: '佐藤 恵', time: '09:30', treatment: '定期検診', doctor: '田中 Dr' },
    { chartNo: 'B-9012', name: '高橋 大輔', time: '10:00', treatment: 'SRP', doctor: '田中 Dr' },
    { chartNo: 'B-9156', name: '伊藤 真由', time: '11:30', treatment: '虫歯治療', doctor: '佐藤 Dr' },
  ],
  insightApptCancel: [
    { cancelType: '当日', chartNo: 'C-3310', name: '松本 優', time: '10:30' },
    { cancelType: '前日', chartNo: 'C-3388', name: '井上 拓也', time: '13:00' },
  ],
  insightApptNoShow: [
    { chartNo: 'C-3401', name: '木村 さくら', time: '16:00', doctor: '田中 Dr' },
  ],
  insightApptPending: [
    { chartNo: 'B-9203', name: '渡辺 健', time: '14:00', treatment: 'ホワイトニング相談' },
    { chartNo: 'B-9288', name: '中村 里奈', time: '15:30', treatment: '矯正相談' },
  ],
  insightUtilUsed: [
    { unit: 'ユニット1', time: '09:00–10:00', patient: '佐藤 恵', minutes: '60分' },
    { unit: 'ユニット2', time: '10:00–11:00', patient: '高橋 大輔', minutes: '60分' },
    { unit: 'ユニット1', time: '11:00–11:30', patient: '伊藤 真由', minutes: '30分' },
  ],
  insightUtilEmpty: [
    { unit: 'ユニット3', time: '09:00–10:00', slot: '60分枠', note: '—' },
    { unit: 'ユニット2', time: '14:00–15:00', slot: '60分枠', note: '—' },
  ],
  insightRecallBooked: [
    { name: '山田 太郎', lastVisit: '6ヶ月前', apptDate: '6/15', dh: '鈴木 DH' },
    { name: '鈴木 花子', lastVisit: '5ヶ月前', apptDate: '6/18', dh: '山田 DH' },
  ],
  insightRecallContact: [
    { name: '高橋 一郎', lastVisit: '7ヶ月前', contact: 'SMS', dh: '鈴木 DH' },
    { name: '渡辺 美咲', lastVisit: '8ヶ月前', contact: '電話', dh: '伊藤 DH' },
  ],
  insightRecallPending: [
    { name: '中村 健', lastVisit: '9ヶ月前', overdue: '+30日', dh: '鈴木 DH' },
    { name: '松本 優', lastVisit: '10ヶ月前', overdue: '+45日', dh: '山田 DH' },
  ],
  insightSelfPayImplant: [
    { menu: 'インプラント', patient: '佐藤 恵', staff: '田中 Dr', amount: '¥198,000' },
    { menu: 'インプラント', patient: '高橋 大輔', staff: '佐藤 Dr', amount: '¥220,000' },
  ],
  insightSelfPayOrtho: [
    { menu: 'マウスピース矯正', patient: '伊藤 真由', staff: '田中 Dr', amount: '¥88,000' },
    { menu: '部分矯正', patient: '山本 翔', staff: '佐藤 Dr', amount: '¥126,000' },
  ],
  insightSelfPayWhitening: [
    { menu: 'オフィスホワイト', patient: '鈴木 花子', staff: 'DH', amount: '¥32,000' },
    { menu: 'ホームホワイト', patient: '渡辺 美咲', staff: 'DH', amount: '¥18,000' },
  ],
  insightSelfPayOther: [
    { menu: 'PMTC（自費）', patient: '松本 優', staff: '鈴木 DH', amount: '¥8,800' },
    { menu: 'セラミック', patient: '中村 健', staff: '田中 Dr', amount: '¥86,000' },
  ],
  insightQuestionnaireDone: [
    { name: '山田 太郎', type: '初診問診', time: '09:12', staff: '受付A' },
    { name: '鈴木 花子', type: '再診問診', time: '10:05', staff: '受付B' },
  ],
  insightQuestionnairePending: [
    { name: '山本 翔', appt: '10:30', type: '初診問診', staff: '受付A' },
    { name: '加藤 美穂', appt: '14:00', type: '予防問診', staff: '受付B' },
  ],
  insightQuestionnairePartial: [
    { name: '小林 拓也', progress: '60%', appt: '11:00', staff: '受付A' },
    { name: '藤原 彩花', progress: '40%', appt: '15:30', staff: '受付B' },
  ],
  insightDropoutActive: [
    { name: '藤田 様', reason: '転居', lastVisit: '3ヶ月前', ltv: '¥142,000' },
    { name: '松本 様', reason: '他院', lastVisit: '4ヶ月前', ltv: '¥98,000' },
  ],
  insightDropoutRisk: [
    { name: '中村 様', days: '92日', lastVisit: '3/1', doctor: '田中 Dr' },
    { name: '西村 様', days: '105日', lastVisit: '2/18', doctor: '佐藤 Dr' },
  ],
  insightWebBooking: [
    { source: 'Google', name: '岡田 真一', menu: '初診', time: '10:30' },
    { source: '公式サイト', name: '藤原 彩花', menu: '定期検診', time: '14:00' },
    { source: 'LINE', name: '石井 翔', menu: 'クリーニング', time: '16:30' },
  ],
  insightPhoneBooking: [
    { name: '前田 由美', menu: 'インレー', time: '11:00', staff: '受付A' },
    { name: '原田 美穂', menu: '定期検診', time: '15:00', staff: '受付B' },
  ],
};

function getInsightPopoverKey(pageId, segmentLabel) {
  return INSIGHT_SEGMENT_POPOVER_MAP[pageId]?.[segmentLabel] || null;
}

function getInsightPopoverConfig(type) {
  return INSIGHT_POPOVER_CONFIG[type] || null;
}

function getInsightPopoverRows(type, options = {}) {
  const templates = (INSIGHT_POPOVER_ROWS[type] || []).map((r) => ({ ...r }));
  let metricsContext = options.metricsContext;
  const detail = options.detail ?? (() => {
    const period = options.period
      || (typeof insightState !== 'undefined' ? insightState.period : '本日');
    if (typeof resolvePeriodDetail === 'function') {
      metricsContext = metricsContext ?? (typeof getMetricsContext === 'function'
        ? getMetricsContext(typeof insightState !== 'undefined' ? insightState : {
          level: 'clinic',
          clinicId: 'clinic-sakura',
          selectedPeriod: period,
        })
        : { entityKey: 'clinic-sakura', weight: 1 });
      return resolvePeriodDetail(period, metricsContext);
    }
    return MOCK_DATA?.periodDetails?.[period] ?? null;
  })();
  const entityKey = options.entityKey
    || metricsContext?.entityKey
    || 'clinic-sakura';
  if (typeof buildInsightPopoverRows === 'function') {
    return buildInsightPopoverRows(type, templates, detail, { ...options, entityKey });
  }
  return templates;
}

/** チャート要素ラベル → ポップオーバー種別（ページ横断） */
const CHART_LABEL_POPOVER_MAP = {
  保険: 'insightRevenueInsurance',
  自費: 'insightRevenueSelfPay',
  販売品: 'insightRevenueProducts',
  その他: 'insightRevenueOther',
  Dr: 'insightStaffDr',
  DH: 'insightStaffDh',
  未設定: 'insightStaffUnset',
  入金: 'insightCollected',
  入金済: 'insightCollected',
  未収: 'insightReceivable',
  未収金: 'insightReceivable',
  純初診: 'insightVisitPureFirst',
  初診: 'insightVisitFirst',
  再診: 'insightVisitReturn',
  来院済: 'insightApptVisited',
  キャンセル: 'insightApptCancel',
  CX: 'insightApptCancel',
  無断: 'insightApptNoShow',
  無断CX: 'insightApptNoShow',
  未来院: 'insightApptPending',
  松本優: 'insightApptCancel',
  井上拓也: 'insightApptCancel',
  佐藤恵: 'insightApptCancel',
  高橋大輔: 'insightApptCancel',
  渡辺健: 'insightApptCancel',
  実績: 'insightUtilUsed',
  枠: 'insightUtilUsed',
  空き枠: 'insightUtilEmpty',
  予約済: 'insightRecallBooked',
  連絡中: 'insightRecallContact',
  未着手: 'insightRecallPending',
  中断: 'insightDropoutActive',
  予備軍: 'insightDropoutRisk',
  WEB: 'insightWebBooking',
  電話: 'insightPhoneBooking',
  紹介: 'insightVisitPureFirst',
  看板: 'insightVisitFirst',
  Google: 'insightWebBooking',
  公式サイト: 'insightWebBooking',
  LINE: 'insightWebBooking',
  問合せ: 'insightVisitFirst',
  予約: 'insightApptPending',
  来院: 'insightApptVisited',
  成約: 'insightRevenueSelfPay',
  対象: 'insightRecallPending',
  連絡: 'insightRecallContact',
  アプローチ: 'insightDropoutActive',
  反応: 'insightDropoutRisk',
  復帰: 'insightVisitReturn',
  '30日以内': 'insightCollected',
  '31〜60日': 'insightReceivable',
  '61日以上': 'insightReceivable',
  定期検診: 'insightApptVisited',
  クリーニング: 'insightApptVisited',
  ユニット1: 'insightUtilUsed',
  ユニット2: 'insightUtilUsed',
  ユニット3: 'insightUtilEmpty',
  平均: 'insightUtilUsed',
  田中健一: 'insightStaffDr',
  佐藤誠: 'insightStaffDr',
  鈴木美咲: 'insightStaffDh',
  山田恵: 'insightStaffDh',
  伊藤彩: 'insightStaffDh',
  転居: 'insightDropoutActive',
  他院: 'insightDropoutActive',
  経済: 'insightDropoutActive',
  不明: 'insightDropoutRisk',
  当期: 'insightRevenueInsurance',
  午前: 'insightUtilUsed',
  午後: 'insightUtilUsed',
};

function normalizeChartLabel(label) {
  return String(label || '').replace(/\s+/g, '').trim();
}

function resolveChartPopoverType(pageId, label) {
  const raw = String(label || '').trim();
  if (!raw) return getInsightPopoverKey(pageId, Object.keys(INSIGHT_SEGMENT_POPOVER_MAP[pageId] || {})[0]);

  const fromPage = getInsightPopoverKey(pageId, raw);
  if (fromPage) return fromPage;

  if (CHART_LABEL_POPOVER_MAP[raw]) return CHART_LABEL_POPOVER_MAP[raw];

  const normalized = normalizeChartLabel(raw);
  if (CHART_LABEL_POPOVER_MAP[normalized]) return CHART_LABEL_POPOVER_MAP[normalized];

  if (raw.includes('Dr') || raw.includes('ドクター')) return 'insightStaffDr';
  if (raw.includes('DH') || raw.includes('歯科衛生士')) return 'insightStaffDh';
  if (raw.includes('様') || raw.includes('患者')) return 'insightDropoutRisk';

  const pageMap = INSIGHT_SEGMENT_POPOVER_MAP[pageId];
  if (pageMap) return Object.values(pageMap)[0];

  return 'insightApptVisited';
}

function buildChartPopoverOptions(pageId, label, context = {}) {
  const itemLabel = String(label || '').trim();
  const type = resolveChartPopoverType(pageId, itemLabel);
  const parts = [context.chartTitle, context.series, itemLabel].filter(Boolean);
  if (context.value != null && context.value !== '') {
    const displayVal = ['unitPrice', 'staffSales', 'selfPay'].includes(pageId)
      && typeof formatYenDisplay === 'function'
      ? formatYenDisplay(context.value)
      : (typeof context.value === 'number' ? context.value.toLocaleString('ja-JP') : String(context.value));
    parts.push(displayVal);
  }
  const titleSuffix = parts.join(' · ');
  const metricsContext = typeof getMetricsContext === 'function'
    && typeof insightState !== 'undefined'
    ? getMetricsContext(insightState)
    : null;
  const detail = typeof resolvePeriodDetail === 'function'
    ? resolvePeriodDetail(context.period || insightState?.period || '本日', metricsContext || { entityKey: 'clinic-sakura', weight: 1 })
    : null;
  const rows = getInsightPopoverRows(type, {
    detail,
    period: context.period,
    pageId,
    segmentLabel: itemLabel,
    entityKey: metricsContext?.entityKey,
    metricsContext,
  });
  return { titleSuffix, rows };
}
