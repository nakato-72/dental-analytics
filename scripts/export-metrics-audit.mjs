/**
 * 表示数値・計算式を Excel に出力（検証用・日本語版）
 * 実行: node scripts/export-metrics-audit.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const JS_DIR = path.join(ROOT, 'prototype', 'js');
const OUT = path.join(ROOT, 'docs', '数値計算式一覧_さくら歯科.xlsx');

const JS_FILES = [
  'data.js', 'sample-metrics.js', 'intelligence-data.js', 'insight-data.js',
  'popover-data.js', 'insight-popover-data.js',
];

const DATA_KIND = {
  MASTER: 'マスタ直値（入力データ）',
  CALC: '計算で求める',
  ALLOC: '按分（推定）',
  MOCK: '静的モック（仮データ）',
  STATIC: '固定文言',
};

function loadPrototypeJs() {
  const sandbox = { console, globalThis: {} };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const file of JS_FILES) {
    let code = fs.readFileSync(path.join(JS_DIR, file), 'utf8');
    code = code.replace(/^const /gm, 'var ').replace(/^let /gm, 'var ');
    vm.runInContext(code, ctx);
  }
  return ctx;
}

function yen(n) {
  if (n == null || Number.isNaN(n)) return '';
  return `¥${Math.round(n).toLocaleString('ja-JP')}`;
}

function pct(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return '';
  return `${Number(n).toFixed(digits)}%`;
}

/** 画面上の行 */
function uiRow(opts) {
  return {
    画面: opts.screen,
    表示場所: opts.where,
    画面上のラベル: opts.label,
    期間タブ: opts.period,
    医院: opts.clinic || 'さくら歯科',
    表示値: opts.value,
    計算式_日本語: opts.formulaJa,
    元になる数値: opts.inputs || '',
    データの種類: opts.kind || DATA_KIND.CALC,
    補足: opts.note || '',
  };
}

function buildReadmeSheet() {
  return [
    { 項目: 'このファイルの目的', 説明: '画面上に出ている数値が、どこから来て、どう計算されているかを確認するための一覧です。' },
    { 項目: '最初に見るシート', 説明: '「①計算式一覧」→ 計算のルール。「②表示値チェック」→ 実際の数字。' },
    { 項目: '「計算式_日本語」列', 説明: 'Excelで読める日本語の式です。画面上の言葉だけで書いています。' },
    { 項目: '「元になる数値」列', 説明: '計算に使う元データを、画面上の名前で記載しています。' },
    { 項目: '「データの種類」', 説明: 'マスタ直値＝data.jsに書いてある数値。計算＝ルールで算出。按分＝今月から割り振った推定値。静的モック＝仮の固定値。' },
    { 項目: 'コード用語について', 説明: '「③用語対応表」に、プログラム内の英語名と画面表示名の対応があります。' },
    { 項目: '再生成コマンド', 説明: 'scripts フォルダで node export-metrics-audit.mjs' },
  ];
}

function buildGlossarySheet() {
  return [
    { コード上の名前: 'periodDetails[期].total', 画面での呼び方: '売上合計', データファイル上の場所: 'data.js → 期間詳細 → 各期間の total', 例_本日: '¥142,800' },
    { コード上の名前: 'breakdown.insurance', 画面での呼び方: '保険（売上内訳）', データファイル上の場所: 'data.js → breakdown.insurance', 例_本日: '¥82,000' },
    { コード上の名前: 'breakdown.selfPay', 画面での呼び方: '自費（売上内訳）', データファイル上の場所: 'data.js → breakdown.selfPay', 例_本日: '¥48,600' },
    { コード上の名前: 'breakdown.products', 画面での呼び方: '販売品（売上内訳）', データファイル上の場所: 'data.js → breakdown.products', 例_本日: '¥12,200' },
    { コード上の名前: 'detail.visits', 画面での呼び方: '来院数（外来）', データファイル上の場所: 'data.js → visits', 例_本日: '29人' },
    { コード上の名前: 'patients.outpatient.breakdown', 画面での呼び方: '外来の純初診/初診/再診/その他', データファイル上の場所: 'data.js → patients.outpatient', 例_本日: '2/6/17/4' },
    { コード上の名前: 'patients.visiting', 画面での呼び方: '訪問診療', データファイル上の場所: 'data.js → patients.visiting', 例_本日: '4人' },
    { コード上の名前: 'appointments', 画面での呼び方: '予約（来院済/未来院/CX/無断）', データファイル上の場所: 'data.js → appointments', 例_本日: '29/2/2/1' },
    { コード上の名前: 'utilization.slots / used', 画面での呼び方: '予約枠 / 実績枠', データファイル上の場所: 'data.js → utilization', 例_本日: '40 / 31' },
    { コード上の名前: 'recall', 画面での呼び方: '予防対象（予約済/連絡中/未着手）', データファイル上の場所: 'data.js → recall', 例_本日: '105/22/15' },
    { コード上の名前: 'questionnaire', 画面での呼び方: '問診（完了/未回答/途中）', データファイル上の場所: 'data.js → questionnaire', 例_本日: '24/3/2' },
    { コード上の名前: 'cashflow', 画面での呼び方: '未収金・入金率', データファイル上の場所: 'data.js → cashflow', 例_本日: '未収¥12,400' },
    { コード上の名前: 'salesShare', 画面での呼び方: '担当者の売上配分率', データファイル上の場所: 'data.js → clinics → roles → 各担当', 例_本日: '田中Dr 37%' },
    { コード上の名前: 'PERIOD_REVENUE_GOALS', 画面での呼び方: '期間ごとの売上目標', データファイル上の場所: 'sample-metrics.js 内の目標表', 例_本日: '¥210,000' },
    { コード上の名前: 'splitStaffSalesTotal', 画面での呼び方: '職種別売上（Dr/DH/未設定）', データファイル上の場所: '担当配分率から計算', 例_本日: 'Dr¥84,252等' },
    { コード上の名前: 'buildMonthlyDailyRevenue', 画面での呼び方: '日別売上推移の各日', データファイル上の場所: '今月累計から按分＋本日/前日確定', 例_本日: '6/23=¥142,800' },
  ];
}

function buildFormulaMasterJa() {
  return [
    uiRow({
      screen: '共通', where: '売上系すべて', label: '売上合計', period: '全期間',
      value: '—', kind: DATA_KIND.CALC,
      formulaJa: '売上合計 ＝ 保険 ＋ 自費 ＋ 販売品 ＋ その他',
      inputs: '各内訳は期間データ（前日/本日/今月/今年）に登録',
      note: '内訳合計と total は一致するよう設計',
    }),
    uiRow({
      screen: '共通', where: '売上内訳', label: 'その他', period: '全期間',
      value: '—', kind: DATA_KIND.CALC,
      formulaJa: 'その他 ＝ 売上合計 − 保険 − 自費 − 販売品（0未満にはしない）',
      inputs: '売上合計、保険、自費、販売品',
    }),
    uiRow({
      screen: '共通', where: '職種別売上パネル', label: 'Dr（ドクター）', period: '全期間',
      value: '—', kind: DATA_KIND.CALC,
      formulaJa: 'Dr売上 ＝ 各ドクターの「売上合計 × 配分率」を足す（端数は四捨五入）',
      inputs: '売上合計、田中Dr37%、佐藤Dr22% など',
      note: '配分率の合計が100%超のときは全体を縮小',
    }),
    uiRow({
      screen: '共通', where: '職種別売上パネル', label: 'DH（歯科衛生士）', period: '全期間',
      value: '—', kind: DATA_KIND.CALC,
      formulaJa: 'DH売上 ＝ 各DHの「売上合計 × 配分率」を足す',
      inputs: '売上合計、鈴木DH14%、山田DH13%、伊藤DH10%',
    }),
    uiRow({
      screen: '共通', where: '職種別売上パネル', label: '未設定', period: '全期間',
      value: '—', kind: DATA_KIND.CALC,
      formulaJa: '未設定 ＝ 売上合計 − Dr売上 − DH売上',
      inputs: '売上合計、Dr、DH',
      note: 'どの担当にも紐づかない売上',
    }),
    uiRow({
      screen: '共通', where: '患者数パネル', label: '患者合計', period: '全期間',
      value: '—', kind: DATA_KIND.CALC,
      formulaJa: '患者合計 ＝ 外来人数 ＋ 訪問人数',
      inputs: '外来、訪問',
    }),
    uiRow({
      screen: '共通', where: '稼働率パネル', label: '稼働率（%）', period: '全期間',
      value: '—', kind: DATA_KIND.CALC,
      formulaJa: '稼働率 ＝ 実績枠 ÷ 予約枠 × 100（小数第1位）',
      inputs: '実績枠、予約枠',
    }),
    uiRow({
      screen: '共通', where: '予防パネル', label: '予約率（%）', period: '全期間',
      value: '—', kind: DATA_KIND.CALC,
      formulaJa: '予約率 ＝ 予約済人数 ÷ 予防対象人数 × 100',
      inputs: '予約済、予防対象合計',
    }),
    uiRow({
      screen: '共通', where: '問診パネル', label: '回答率（%）', period: '全期間',
      value: '—', kind: DATA_KIND.CALC,
      formulaJa: '回答率 ＝ 完了件数 ÷ 問診対象件数 × 100',
      inputs: '完了、問診合計',
    }),
    uiRow({
      screen: '共通', where: '自費パネル・インサイト', label: '自費率（%）', period: '全期間',
      value: '—', kind: DATA_KIND.CALC,
      formulaJa: '自費率 ＝ 自費売上 ÷ 売上合計 × 100',
      inputs: '自費、売上合計',
    }),
    uiRow({
      screen: 'インサイト', where: '自費タブ', label: 'インプラ/矯正/ホワイト/その他', period: '全期間',
      value: '—', kind: DATA_KIND.CALC,
      formulaJa: 'インプラ＝自費×28%、矯正＝自費×24%、ホワイト＝自費×18%、その他＝残り',
      inputs: '自費売上',
    }),
    uiRow({
      screen: 'TOP', where: '上部の期間カード', label: '目標達成率', period: '全期間',
      value: '—', kind: DATA_KIND.CALC,
      formulaJa: '目標達成率 ＝ 売上合計 ÷ 期間目標 × 100',
      inputs: '売上合計、期間目標（本日¥210,000等）',
    }),
    uiRow({
      screen: 'インサイト', where: '売上タブ・日別売上推移', label: '各日の売上', period: '前日/本日',
      value: '—', kind: DATA_KIND.ALLOC,
      formulaJa: '本日・前日の日 ＝ その日の確定売上。それ以外 ＝（今月累計−本日−前日）を日ごとに按分',
      inputs: '今月売上、本日売上、前日売上',
      note: '中間日は推定。本日/前日タブで同じ数字になる',
    }),
    uiRow({
      screen: 'インサイト', where: '売上タブ・月別', label: '各月の売上', period: '今月',
      value: '—', kind: DATA_KIND.MASTER,
      formulaJa: '1〜6月はデータ登録値、7月以降は0（未来月）',
      inputs: '今月タブの月別チャートデータ',
    }),
    uiRow({
      screen: 'インサイト', where: '一部チャート', label: '曜日別来院など', period: '各種',
      value: '—', kind: DATA_KIND.MOCK,
      formulaJa: '合計人数を固定の割合配列で曜日などに割り振る',
      inputs: '予約合計や来院合計',
      note: '実データ未接続の仮表示',
    }),
  ];
}

function auditPeriod(ctx, period) {
  const rows = [];
  const metricsContext = { entityKey: 'clinic-sakura', weight: 1 };
  const detail = ctx.resolvePeriodDetail(period, metricsContext);
  const b = detail.breakdown || {};
  const total = detail.total || 0;
  const p = period;

  rows.push(uiRow({
    screen: 'TOPダッシュボード', where: '画面上部の期間カード', label: '売上', period: p,
    value: yen(total), kind: DATA_KIND.MASTER,
    formulaJa: 'データに登録された売上合計をそのまま表示',
    inputs: `「${p}」の売上合計`,
  }));
  rows.push(uiRow({
    screen: 'TOPダッシュボード', where: '期間カード', label: '来院数', period: p,
    value: `${detail.visits}人`, kind: DATA_KIND.MASTER,
    formulaJa: 'データに登録された外来来院数をそのまま表示',
    inputs: `「${p}」の来院数`,
  }));
  rows.push(uiRow({
    screen: 'TOPダッシュボード', where: '期間カード下部', label: '前日比・前々日比など', period: p,
    value: detail.change?.text || '', kind: DATA_KIND.STATIC,
    formulaJa: 'データに登録された前比文言をそのまま表示',
    inputs: `「${p}」の change.text`,
  }));

  const goal = ctx.PERIOD_REVENUE_GOALS?.[period];
  if (goal) {
    rows.push(uiRow({
      screen: 'TOPダッシュボード', where: '期間カード内ゲージ', label: '売上目標', period: p,
      value: yen(goal), kind: DATA_KIND.MASTER,
      formulaJa: '期間ごとの目標額（マスタ）',
      inputs: '目標マスタ表',
    }));
    rows.push(uiRow({
      screen: 'TOPダッシュボード', where: '期間カード内ゲージ', label: '目標達成率', period: p,
      value: pct(total / goal * 100), kind: DATA_KIND.CALC,
      formulaJa: '売上合計 ÷ 売上目標 × 100',
      inputs: `${yen(total)} ÷ ${yen(goal)}`,
    }));
  }

  for (const [lbl, val, key] of [
    ['保険', b.insurance, '保険'],
    ['自費', b.selfPay, '自費'],
    ['販売品', b.products, '販売品'],
  ]) {
    rows.push(uiRow({
      screen: 'TOPダッシュボード', where: '期間カード・売上構成バー', label: lbl, period: p,
      value: yen(val), kind: DATA_KIND.MASTER,
      formulaJa: `「${p}」の売上内訳「${lbl}」をそのまま表示`,
      inputs: `「${p}」→ 内訳 → ${lbl}`,
    }));
  }

  rows.push(uiRow({
    screen: '経営指標', where: '売上内訳パネル（クリックでインサイト）', label: '売上合計', period: p,
    value: yen(total), kind: DATA_KIND.MASTER,
    formulaJa: '期間の売上合計',
    inputs: `「${p}」売上合計`,
  }));
  for (const [lbl, val] of [['保険', b.insurance], ['自費', b.selfPay], ['販売品', b.products]]) {
    rows.push(uiRow({
      screen: '経営指標', where: '売上内訳パネル', label: lbl, period: p,
      value: yen(val), kind: DATA_KIND.MASTER,
      formulaJa: `売上内訳の「${lbl}」`,
      inputs: `「${p}」→ ${lbl}`,
    }));
  }
  const other = Math.max(0, total - (b.insurance || 0) - (b.selfPay || 0) - (b.products || 0));
  rows.push(uiRow({
    screen: '経営指標', where: '売上内訳パネル', label: 'その他', period: p,
    value: yen(other), kind: DATA_KIND.CALC,
    formulaJa: '売上合計 − 保険 − 自費 − 販売品',
    inputs: `${yen(total)} − ${yen(b.insurance)} − ${yen(b.selfPay)} − ${yen(b.products)}`,
  }));

  const staff = ctx.getStaffSalesBreakdown(detail, 'clinic-sakura');
  rows.push(uiRow({
    screen: '経営指標', where: '職種別売上パネル', label: '売上合計', period: p,
    value: yen(total), kind: DATA_KIND.MASTER,
    formulaJa: '期間の売上合計（職種別の合計もこれに一致）',
    inputs: `「${p}」売上合計`,
  }));
  rows.push(uiRow({
    screen: '経営指標', where: '職種別売上パネル', label: 'Dr', period: p,
    value: yen(staff.dr), kind: DATA_KIND.CALC,
    formulaJa: '各ドクターの「売上合計×配分率」の合計',
    inputs: `売上合計 ${yen(total)}、Dr配分率合計59%`,
  }));
  rows.push(uiRow({
    screen: '経営指標', where: '職種別売上パネル', label: 'DH', period: p,
    value: yen(staff.dh), kind: DATA_KIND.CALC,
    formulaJa: '各DHの「売上合計×配分率」の合計',
    inputs: `売上合計 ${yen(total)}、DH配分率合計37%`,
  }));
  rows.push(uiRow({
    screen: '経営指標', where: '職種別売上パネル', label: '未設定', period: p,
    value: yen(staff.unset), kind: DATA_KIND.CALC,
    formulaJa: '売上合計 − Dr − DH',
    inputs: `${yen(total)} − ${yen(staff.dr)} − ${yen(staff.dh)}`,
  }));

  const patients = ctx.getPatientTotals(detail);
  const out = ctx.getOutpatientBreakdown(detail);
  rows.push(uiRow({
    screen: '経営指標', where: '患者数パネル', label: '患者合計', period: p,
    value: `${patients.total}人`, kind: DATA_KIND.CALC,
    formulaJa: '外来 ＋ 訪問',
    inputs: `外来${patients.outpatient}人 + 訪問${patients.visiting}人`,
  }));
  rows.push(uiRow({
    screen: '経営指標', where: '患者数パネル', label: '外来', period: p,
    value: `${patients.outpatient}人`, kind: DATA_KIND.MASTER,
    formulaJa: '外来来院数（内訳の合計と一致）',
    inputs: `「${p}」来院数 or 外来内訳`,
  }));
  rows.push(uiRow({
    screen: '経営指標', where: '患者数パネル', label: '訪問', period: p,
    value: `${patients.visiting}人`, kind: DATA_KIND.MASTER,
    formulaJa: '訪問診療人数',
    inputs: `「${p}」→ 訪問 → 合計`,
  }));
  for (const [lbl, val] of [['純初診', out.pureFirst], ['初診', out.first], ['再診', out.return], ['その他', out.other]]) {
    rows.push(uiRow({
      screen: '経営指標', where: '患者数パネル・外来内訳', label: lbl, period: p,
      value: `${val}人`, kind: DATA_KIND.MASTER,
      formulaJa: `外来内訳の「${lbl}」`,
      inputs: `「${p}」→ 外来内訳 → ${lbl}`,
    }));
  }

  const appt = ctx.getAppointments(detail);
  rows.push(uiRow({
    screen: '経営指標', where: '予約数パネル', label: '予約合計', period: p,
    value: `${appt.total}件`, kind: DATA_KIND.CALC,
    formulaJa: '来院済 ＋ 未来院 ＋ キャンセル ＋ 無断',
    inputs: '各予約ステータスの合計',
  }));
  for (const [lbl, key] of [['来院済', 'visited'], ['未来院', 'notVisited'], ['キャンセル', 'cancelled'], ['無断', 'noShow']]) {
    rows.push(uiRow({
      screen: '経営指標', where: '予約数パネル', label: lbl, period: p,
      value: `${appt.breakdown[key]}件`, kind: DATA_KIND.MASTER,
      formulaJa: `予約内訳の「${lbl}」`,
      inputs: `「${p}」→ 予約 → ${lbl}`,
    }));
  }

  const util = ctx.getUtilization(detail);
  const utilRate = ctx.getUtilizationRatePct(util);
  rows.push(uiRow({
    screen: '経営指標', where: '稼働率パネル', label: '稼働率', period: p,
    value: pct(utilRate), kind: DATA_KIND.CALC,
    formulaJa: '実績枠 ÷ 予約枠 × 100',
    inputs: `${util.used}枠 ÷ ${util.slots}枠`,
  }));
  rows.push(uiRow({
    screen: '経営指標', where: '稼働率パネル', label: '予約枠', period: p,
    value: `${util.slots}枠`, kind: DATA_KIND.MASTER,
    formulaJa: 'データ登録の予約枠数',
    inputs: `「${p}」→ 稼働 → 枠数`,
  }));
  rows.push(uiRow({
    screen: '経営指標', where: '稼働率パネル', label: '実績', period: p,
    value: `${util.used}枠`, kind: DATA_KIND.MASTER,
    formulaJa: 'データ登録の使用枠数',
    inputs: `「${p}」→ 稼働 → 実績`,
  }));
  rows.push(uiRow({
    screen: '経営指標', where: '稼働率パネル', label: '空き', period: p,
    value: `${util.empty}枠`, kind: DATA_KIND.CALC,
    formulaJa: '予約枠 − 実績枠',
    inputs: `${util.slots} − ${util.used}`,
  }));

  const recall = ctx.getRecall(detail);
  rows.push(uiRow({
    screen: '経営指標', where: '予防パネル', label: '予約率', period: p,
    value: pct(ctx.getRecallBookedRatePct(recall)), kind: DATA_KIND.CALC,
    formulaJa: '予約済 ÷ 予防対象 × 100',
    inputs: `${recall.breakdown.booked} ÷ ${recall.total}`,
  }));
  rows.push(uiRow({
    screen: '経営指標', where: '予防パネル', label: '予防対象', period: p,
    value: `${recall.total}名`, kind: DATA_KIND.MASTER,
    formulaJa: 'データ登録値',
    inputs: `「${p}」→ 予防 → 合計`,
  }));

  rows.push(uiRow({
    screen: '経営指標', where: '自費パネル', label: '自費売上', period: p,
    value: yen(b.selfPay), kind: DATA_KIND.MASTER,
    formulaJa: '売上内訳の自費',
    inputs: `「${p}」→ 自費`,
  }));
  rows.push(uiRow({
    screen: '経営指標', where: '自費パネル', label: '自費率', period: p,
    value: pct(ctx.calcSelfPayRatePct(b, total)), kind: DATA_KIND.CALC,
    formulaJa: '自費 ÷ 売上合計 × 100',
    inputs: `${yen(b.selfPay)} ÷ ${yen(total)}`,
  }));

  const q = ctx.getQuestionnaire(detail);
  rows.push(uiRow({
    screen: '経営指標', where: '問診パネル', label: '回答率', period: p,
    value: pct(ctx.getQuestionnaireDoneRatePct(q)), kind: DATA_KIND.CALC,
    formulaJa: '完了 ÷ 問診対象 × 100',
    inputs: `${q.breakdown.done} ÷ ${q.total}`,
  }));

  const selfMenu = ctx.buildSelfPayMenuAmounts(detail);
  for (const [lbl, val, desc] of [
    ['インプラ', selfMenu.implant, '自費×28%'],
    ['矯正', selfMenu.ortho, '自費×24%'],
    ['ホワイトニング', selfMenu.whitening, '自費×18%'],
    ['その他', selfMenu.other, '自費−上記3つ'],
  ]) {
    rows.push(uiRow({
      screen: 'インサイト', where: '自費タブ KPI', label: lbl, period: p,
      value: yen(val), kind: DATA_KIND.CALC,
      formulaJa: desc,
      inputs: `自費 ${yen(b.selfPay)}`,
    }));
  }

  if (period === '本日' || period === '前日') {
    const daily = ctx.buildMonthlyDailyRevenue(detail, period, metricsContext, 1);
    const throughDay = ctx.resolveInsightDailyThroughDay(metricsContext);
    for (let d = 1; d <= throughDay; d++) {
      const i = d - 1;
      const dayTotal = (daily.insurance[i] || 0) + (daily.selfPay[i] || 0) + (daily.products[i] || 0);
      if (dayTotal <= 0) continue;
      const isToday = d === throughDay;
      const isYesterday = d === throughDay - 1;
      rows.push(uiRow({
        screen: 'インサイト', where: '売上タブ → 日別売上推移チャート', label: `${d}日（6/${d}）`, period: p,
        value: yen(dayTotal), kind: isToday || isYesterday ? DATA_KIND.MASTER : DATA_KIND.ALLOC,
        formulaJa: isToday
          ? '「本日」の確定売上（保険+自費+販売品）'
          : isYesterday
            ? '「前日」の確定売上（保険+自費+販売品）'
            : '（今月売上 − 本日 − 前日）を、その日のウェイトで按分',
        inputs: isToday || isYesterday
          ? `「${isToday ? '本日' : '前日'}」の内訳合計`
          : '今月累計、本日、前日、按分ルール',
        note: isToday || isYesterday ? '確定値' : '推定値',
      }));
    }
    const staffChart = ctx.getReconciledStaffSalesChart(detail, 'clinic-sakura');
    staffChart.labels.forEach((label, i) => {
      const amt = (staffChart.insurance[i] || 0) + (staffChart.selfPay[i] || 0);
      rows.push(uiRow({
        screen: '経営指標', where: '下部・職種別売上横棒チャート', label, period: p,
        value: yen(amt), kind: label.includes('未設定') ? DATA_KIND.CALC : DATA_KIND.CALC,
        formulaJa: label.includes('未設定')
          ? '売上合計 − 担当者別合計'
          : `売上合計 × 担当者の配分率（${label}）`,
        inputs: `売上合計 ${yen(total)}`,
      }));
    });
  }

  if (period === '今月') {
    const ym = ctx.buildYearMonthRevenue(detail, 1);
    ym.labels.forEach((label, i) => {
      const mTotal = (ym.insurance[i] || 0) + (ym.selfPay[i] || 0) + (ym.products[i] || 0);
      const isFuture = i + 1 > (ym.asOfMonth || 6);
      rows.push(uiRow({
        screen: 'インサイト', where: '売上タブ → 月別売上推移', label, period: p,
        value: yen(mTotal), kind: isFuture ? DATA_KIND.CALC : DATA_KIND.MASTER,
        formulaJa: isFuture ? '未来月は0' : 'データ登録の月別売上',
        inputs: `「今月」チャートの${label}`,
      }));
    });
  }

  if (period === '今年') {
    (detail.charts?.labels || []).forEach((label, i) => {
      const yTotal = (detail.charts.insurance[i] || 0) + (detail.charts.selfPay[i] || 0) + (detail.charts.products[i] || 0);
      rows.push(uiRow({
        screen: 'インサイト', where: '売上タブ → 年別売上推移', label: `${label}年`, period: p,
        value: yen(yTotal), kind: DATA_KIND.MASTER,
        formulaJa: 'データ登録の年別売上',
        inputs: `「今年」チャートの${label}年`,
      }));
    });
  }

  return rows;
}

function buildStaffShareSheetJa(ctx) {
  const clinic = ctx.getClinicById('clinic-sakura');
  const total = ctx.MOCK_DATA.periodDetails['本日'].total;
  const rows = [];
  for (const roleKey of ['Dr', 'DH']) {
    for (const m of clinic.roles[roleKey] || []) {
      const share = m.salesShare || 0;
      rows.push({
        医院: clinic.name,
        職種: roleKey === 'Dr' ? 'ドクター' : '歯科衛生士',
        担当者名: m.name,
        配分率: `${(share * 100).toFixed(0)}%`,
        本日の按分売上: yen(Math.round(total * share)),
        計算式: `本日売上合計 ${yen(total)} × ${(share * 100).toFixed(0)}%`,
        データの種類: DATA_KIND.CALC,
      });
    }
  }
  const staff = ctx.splitStaffSalesTotal(total, 'clinic-sakura');
  rows.push({ 医院: clinic.name, 職種: '—', 担当者名: 'Dr合計', 配分率: '—', 本日の按分売上: yen(staff.dr), 計算式: 'ドクター各人の按分を合計', データの種類: DATA_KIND.CALC });
  rows.push({ 医院: clinic.name, 職種: '—', 担当者名: 'DH合計', 配分率: '—', 本日の按分売上: yen(staff.dh), 計算式: 'DH各人の按分を合計', データの種類: DATA_KIND.CALC });
  rows.push({ 医院: clinic.name, 職種: '—', 担当者名: '未設定', 配分率: '—', 本日の按分売上: yen(staff.unset), 計算式: `本日売上 ${yen(total)} − Dr − DH`, データの種類: DATA_KIND.CALC });
  return rows;
}

function main() {
  const ctx = loadPrototypeJs();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildReadmeSheet()), '⓪はじめに');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildGlossarySheet()), '③用語対応表');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildFormulaMasterJa()), '①計算式一覧');

  const allValues = [];
  for (const p of ['前日', '本日', '今月', '今年']) {
    allValues.push(...auditPeriod(ctx, p));
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allValues), '②表示値チェック');

  const dailyCompare = [];
  for (const p of ['本日', '前日']) {
    const metricsContext = { entityKey: 'clinic-sakura', weight: 1 };
    const detail = ctx.resolvePeriodDetail(p, metricsContext);
    const daily = ctx.buildMonthlyDailyRevenue(detail, p, metricsContext, 1);
    const throughDay = ctx.resolveInsightDailyThroughDay(metricsContext);
    for (let d = 1; d <= throughDay; d++) {
      const i = d - 1;
      const t = (daily.insurance[i] || 0) + (daily.selfPay[i] || 0) + (daily.products[i] || 0);
      dailyCompare.push({ 日付: `6月${d}日`, 見ているタブ: p, 保険: yen(daily.insurance[i]), 自費: yen(daily.selfPay[i]), 販売品: yen(daily.products[i]), 合計: yen(t) });
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailyCompare), '④日別売上');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildStaffShareSheetJa(ctx)), '⑤担当者別按分');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { 区分: '静的モック', 画面上の項目: 'WEB予約メニュー構成（ドーナツ）', 説明: '固定の%で表示。実データ未接続' },
    { 区分: '静的モック', 画面上の項目: '曜日別来院・獲得チャネル等', 説明: '合計を固定割合で割る仮表示' },
    { 区分: '按分（推定）', 画面上の項目: '日別売上の中間日（本日・前日以外）', 説明: '今月累計から割り振った推定値' },
    { 区分: '未表示', 画面上の項目: '患者単価・新患数（insights）', 説明: 'data.jsにあるが画面に未配置' },
  ]), '⑥注意事項');

  XLSX.writeFile(wb, OUT);
  console.log('Updated:', OUT);
}

main();
