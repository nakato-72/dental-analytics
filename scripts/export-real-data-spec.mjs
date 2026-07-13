/**
 * 実データ接続前提の計算式・必要データ一覧を Excel 出力
 * 実行: node scripts/export-real-data-spec.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', '実データ前提_計算式と必要データ.xlsx');

function formulaRow(screen, where, label, period, formula, inputs, dataNeeded, note = '') {
  return {
    画面: screen,
    表示場所: where,
    画面上のラベル: label,
    期間: period,
    計算式_実データ前提: formula,
    使うデータ: inputs,
    必要なデータ項目: dataNeeded,
    補足: note,
  };
}

function dataRow(category, tableName, fieldJa, fieldKey, type, required, example, usedFor) {
  return {
    カテゴリ: category,
    データ名: tableName,
    項目名_日本語: fieldJa,
    項目名_システム: fieldKey,
    型: type,
    必須: required ? '必須' : '任意',
    例: example,
    使う画面_指標: usedFor,
  };
}

function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { 項目: '目的', 説明: '実データ接続後に画面数値をどう計算するか、およびそのために何のデータが必要かを定義する' },
    { 項目: '現状との違い', 説明: '現プロトタイプは data.js の直値＋按分推定。本書は API/DB から日次・件次データを集計する前提' },
    { 項目: '見方', 説明: '「①計算式」で画面ごとの式、「②マスタ」「③トランザクション」で必要データ一覧' },
    { 項目: '期間の定義', 説明: '前日=集計基準日の1日前、本日=基準日、今月=基準日の月初〜基準日、今年=基準日の年初〜基準日' },
    { 項目: '関連', 説明: '稼働率の詳細設計は別途（診療時間×チェア×予約枠）' },
  ]), '⓪はじめに');

  const formulas = [
    // 売上
    formulaRow('TOP', '期間カード', '売上', '前日/本日/今月/今年',
      'SUM(会計.売上金額) WHERE 会計日 IN 期間 AND 医院ID = 選択医院',
      '会計テーブル（日付・金額・医院）',
      '会計: 会計日, 売上合計, 医院ID',
      '返金・取消は除外ルール要定義'),
    formulaRow('TOP', '期間カード', '保険/自費/販売品', '全期間',
      'SUM(会計.保険診療点数換算) / SUM(会計.自費金額) / SUM(会計.物販金額) WHERE 期間',
      '会計テーブル（内訳科目）',
      '会計: 保険点数or金額, 自費金額, 物販金額, 会計日',
      '点数→円換算ルール要定義'),
    formulaRow('TOP', '期間カード', '目標達成率', '全期間',
      '売上合計 ÷ 医院目標.期間売上目標 × 100',
      '売上合計, 目標マスタ',
      '会計集計 + 目標マスタ: 期間, 売上目標額'),
    formulaRow('TOP', '期間カード', '来院数', '前日/本日',
      'COUNT(DISTINCT 来院.患者ID) WHERE 来院日 = 対象日 AND 種別=外来',
      '来院テーブル',
      '来院: 来院日, 患者ID, 種別(外来/訪問)'),
    formulaRow('TOP', '期間カード', '来院数（今月/今年）', '今月/今年',
      'COUNT(DISTINCT 来院.患者ID) WHERE 来院日 IN 期間（延べ）',
      '来院テーブル',
      '同上'),

    formulaRow('経営指標', '売上内訳パネル', '売上合計・内訳', '全期間',
      '期間内の会計を科目別 SUM（TOPと同じ正本）',
      '会計テーブル',
      '会計: 会計日, 内訳科目, 金額'),

    formulaRow('経営指標', '職種別売上', 'Dr / DH / 未設定', '全期間',
      'Dr = SUM(会計.売上) WHERE 主担当.職種=Dr\nDH = SUM(会計.売上) WHERE 主担当.職種=DH\n未設定 = 売上合計 − Dr − DH − DA（DAは売上なし）',
      '会計×担当紐付け, スタッフマスタ',
      '会計: 主担当ID(or 配分)\nスタッフ: 職種(Dr/DH/DA)\n※1会計に複数担当の場合は配分テーブル',
      '現状の salesShare 按分は使わない'),

    formulaRow('経営指標', '職種別チャート', '担当者別売上', '全期間',
      'SUM(会計.売上) GROUP BY 担当者ID',
      '会計×担当',
      '会計担当配分: 会計ID, 担当ID, 配分率or金額'),

    formulaRow('経営指標', '患者数', '患者合計', '全期間',
      '外来人数 + 訪問人数',
      '来院テーブル',
      '来院: 種別, 来院区分(純初診/初診/再診/その他)'),
    formulaRow('経営指標', '患者数', '外来内訳', '全期間',
      'COUNT(来院) GROUP BY 来院区分 WHERE 種別=外来',
      '来院テーブル',
      '来院: 来院区分, 来院日, 患者ID'),

    formulaRow('経営指標', '予約数', '予約合計・ステータス別', '全期間',
      'COUNT(予約) GROUP BY ステータス WHERE 予約日 IN 期間\n（来院済/未来院/CX/無断）',
      '予約テーブル',
      '予約: 予約日時, ステータス, 医院ID, キャンセル日時'),

    formulaRow('経営指標', '稼働率', '稼働率(%)', '前日/本日',
      'チェア別: 使用時間 ÷ 稼働可能時間 × 100\n全体: SUM(使用時間) ÷ SUM(稼働可能時間) × 100',
      '予約, 診療時間マスタ, チェア, 医院設定',
      '予約: 開始, 終了, チェアID, ステータス(キャンセル除外)\n診療時間: 曜日別営業時間(期間付き)\n例外: 休診・短縮診療\nチェアマスタ\n枠時間(分)',
      '時間外診療は別枠。未割当予約も別枠'),

    formulaRow('経営指標', '稼働率', '予約枠/実績/空き', '前日/本日',
      '枠 = 稼働可能時間 ÷ 枠時間\n実績 = SUM(有効予約の枠数)\n空き = 枠 − 実績',
      '予約, 診療時間, チェア',
      '同上'),

    formulaRow('経営指標', '予防', '予約率', '全期間',
      '予約済人数 ÷ 予防対象人数 × 100',
      '予防対象リスト, 予約',
      '予防対象: 患者ID, 対象期, ステータス(予約済/連絡中/未着手)'),

    formulaRow('経営指標', '自費', '自費売上・自費率', '全期間',
      '自費売上 = SUM(会計.自費金額)\n自費率 = 自費売上 ÷ 売上合計 × 100',
      '会計テーブル',
      '会計: 自費金額, 会計日'),

    formulaRow('経営指標', '問診', '回答率', '全期間',
      '完了件数 ÷ 問診対象件数 × 100',
      '問診テーブル',
      '問診: 患者ID, 来院日, ステータス(完了/未回答/途中)'),

    formulaRow('インサイト', '売上タブ', '日別売上推移', '前日/本日/今月',
      '各日: SUM(会計.売上) GROUP BY 会計日\n（按分不要。日次確定値をそのまま表示）',
      '会計テーブル',
      '会計: 会計日, 保険/自費/物販, 医院ID',
      '本日・前日タブも同じ日次データ。フォーカスのみ変える'),

    formulaRow('インサイト', '売上タブ', '月別売上推移', '今月',
      'SUM(会計.売上) GROUP BY YEAR(会計日), MONTH(会計日)\n未来月は0または非表示',
      '会計テーブル',
      '会計: 会計日'),

    formulaRow('インサイト', '売上タブ', '年別売上推移', '今年',
      'SUM(会計.売上) GROUP BY YEAR(会計日)',
      '会計テーブル',
      '会計: 会計日'),

    formulaRow('インサイト', '売上タブ', '前年同日比', '前日/本日',
      '当年: SUM(会計) BY 日\n前年: SUM(会計) BY 前年同日（曜日 or 暦日）',
      '会計（複数年）',
      '会計: 会計日（2年分以上）'),

    formulaRow('インサイト', '職種別タブ', '日別 Dr/DH/未設定', '前日/本日',
      '各日: 会計を担当・職種で GROUP BY 会計日',
      '会計×担当配分',
      '会計担当配分, スタッフ職種'),

    formulaRow('インサイト', '職種別タブ', 'Dr/DH別ランキング', '全期間',
      'SUM(会計.売上) GROUP BY 担当者 ORDER BY 合計 DESC',
      '会計×担当',
      '会計担当配分, スタッフ名'),

    formulaRow('インサイト', '患者タブ', '日別来院内訳', '前日/本日',
      'COUNT(来院) GROUP BY 来院日, 来院区分',
      '来院テーブル',
      '来院: 来院日, 来院区分'),

    formulaRow('インサイト', '患者タブ', '曜日別来院', '全期間',
      'COUNT(来院) GROUP BY DAYOFWEEK(来院日)',
      '来院テーブル',
      '来院: 来院日（按分不要）'),

    formulaRow('インサイト', '予約タブ', '日別予約ステータス', '全期間',
      'COUNT(予約) GROUP BY 予約日, ステータス',
      '予約テーブル',
      '予約: 予約日, ステータス'),

    formulaRow('インサイト', '予約タブ', 'キャンセルランキング', '全期間',
      'COUNT(予約) WHERE ステータス=CX GROUP BY 患者(or 予約メニュー) ORDER BY DESC',
      '予約テーブル',
      '予約: ステータス, 患者ID, 予約メニュー'),

    formulaRow('インサイト', '稼働タブ', 'チェア別稼働率', '本日',
      'チェアごとに 使用時間/稼働可能時間',
      '予約, チェア, 診療時間',
      '予約: チェアID, 開始, 終了\nチェアマスタ'),

    formulaRow('インサイト', '稼働タブ', 'ヒートマップ', '今月/期間',
      'セル(曜日×時間帯) = その枠の使用数 ÷ 稼働可能枠数 × 100',
      '予約, 診療時間, チェア, 枠時間',
      '予約(キャンセル除外), 診療時間マスタ, 例外カレンダー'),

    formulaRow('インサイト', '稼働タブ', 'あとN予約で目標', '本日/残営業日',
      '不足時間 = 目標使用時間 − 現在使用時間\nあと予約 = CEIL(不足時間 ÷ 枠時間)',
      '稼働集計, 目標マスタ, 残営業日診療時間',
      '稼働率目標, 予約実績, 診療時間(残日), 枠時間'),

    formulaRow('インサイト', '自費タブ', 'メニュー別自費', '全期間',
      'SUM(会計.自費) GROUP BY 自費メニュー区分',
      '会計明細',
      '会計明細: 自費メニュー区分(インプラ/矯正/ホワイト/その他), 金額',
      '28%/24%/18%按分は不要'),

    formulaRow('インサイト', '問診タブ', 'タイプ別問診', '全期間',
      'COUNT(問診) GROUP BY 問診タイプ',
      '問診テーブル',
      '問診: タイプ, ステータス'),

    formulaRow('Detail', 'ポップオーバー', '明細行', 'クリック時',
      '該当セグメントの会計/予約/来院レコード一覧（ページング）',
      '各トランザクション',
      '会計明細, 予約, 来院 等の行データ'),
  ];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formulas), '①計算式_実データ前提');

  const masterData = [
    dataRow('マスタ', '医院', '医院ID', 'clinic_id', 'string', true, 'clinic-sakura', '全画面'),
    dataRow('マスタ', '医院', '医院名', 'name', 'string', true, 'さくら歯科', 'サイドバー'),
    dataRow('マスタ', '医院', '売上配分用の表示設定', 'settings', 'json', false, '—', '将来のカスタマイズ'),
    dataRow('マスタ', 'スタッフ', '担当者ID', 'staff_id', 'string', true, 'dr-tanaka', '職種別・ランキング'),
    dataRow('マスタ', 'スタッフ', '氏名', 'name', 'string', true, '田中 健一', '表示'),
    dataRow('マスタ', 'スタッフ', '所属医院ID', 'clinic_id', 'string', true, 'clinic-sakura', 'フィルタ'),
    dataRow('マスタ', 'スタッフ', '職種', 'role', 'enum', true, 'Dr/DH/DA', '職種別集計（DAは売上なし）'),
    dataRow('マスタ', 'スタッフ', '在籍期間', 'valid_from/to', 'date', false, '—', '異動対応'),
    dataRow('マスタ', 'チェア', 'チェアID', 'chair_id', 'string', true, 'chair-1', '稼働率'),
    dataRow('マスタ', 'チェア', 'チェア名', 'name', 'string', true, 'チェア1', '表示'),
    dataRow('マスタ', 'チェア', '所属医院ID', 'clinic_id', 'string', true, '—', '—'),
    dataRow('マスタ', 'チェア', '有効期間', 'valid_from/to', 'date', false, '—', '台数変更対応'),
    dataRow('マスタ', '診療時間', 'テンプレートID', 'schedule_id', 'string', true, '—', '稼働率分母'),
    dataRow('マスタ', '診療時間', '有効開始日', 'valid_from', 'date', true, '2026-01-01', '期間付き'),
    dataRow('マスタ', '診療時間', '有効終了日', 'valid_to', 'date', false, 'null=現行', '来月から木曜診療等'),
    dataRow('マスタ', '診療時間', '曜日', 'day_of_week', 'enum', true, 'mon', '—'),
    dataRow('マスタ', '診療時間', '開始時刻', 'start_time', 'time', true, '09:00', '—'),
    dataRow('マスタ', '診療時間', '終了時刻', 'end_time', 'time', true, '18:00', '—'),
    dataRow('マスタ', '診療例外', '日付', 'date', 'date', true, '2026-06-23', '休診・短縮'),
    dataRow('マスタ', '診療例外', '種別', 'type', 'enum', true, 'closed/custom/holiday', '—'),
    dataRow('マスタ', '診療例外', '上書き診療時間', 'hours', 'json', false, '短縮時のみ', '—'),
    dataRow('マスタ', '目標', '医院ID', 'clinic_id', 'string', true, '—', '目標達成率'),
    dataRow('マスタ', '目標', '期間種別', 'period_type', 'enum', true, 'day/month/year', '—'),
    dataRow('マスタ', '目標', '売上目標', 'revenue_goal', 'number', true, '210000', '期間カード'),
    dataRow('マスタ', '目標', '稼働率目標(%)', 'utilization_target', 'number', false, '80', 'あとN予約'),
    dataRow('マスタ', '予約設定', '枠時間(分)', 'slot_minutes', 'number', true, '30', '医院ごと'),
    dataRow('マスタ', '予約設定', '有効期間', 'valid_from/to', 'date', false, '—', '変更対応'),
    dataRow('マスタ', '自費メニュー', '区分コード', 'menu_code', 'string', true, 'implant', '自費内訳'),
    dataRow('マスタ', '自費メニュー', '区分名', 'menu_name', 'string', true, 'インプラ', '—'),
  ];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(masterData), '②必要データ_マスタ');

  const txData = [
    dataRow('トランザクション', '会計', '会計ID', 'accounting_id', 'string', true, '—', '売上全般'),
    dataRow('トランザクション', '会計', '会計日', 'accounting_date', 'date', true, '2026-06-23', '日別・期間集計'),
    dataRow('トランザクション', '会計', '医院ID', 'clinic_id', 'string', true, '—', '—'),
    dataRow('トランザクション', '会計', '患者ID', 'patient_id', 'string', true, '—', 'ポップオーバー'),
    dataRow('トランザクション', '会計', '売上合計', 'total_amount', 'number', true, '142800', '—'),
    dataRow('トランザクション', '会計', '保険金額', 'insurance_amount', 'number', true, '82000', '内訳'),
    dataRow('トランザクション', '会計', '自費金額', 'self_pay_amount', 'number', true, '48600', '内訳'),
    dataRow('トランザクション', '会計', '物販金額', 'product_amount', 'number', true, '12200', '内訳'),
    dataRow('トランザクション', '会計', 'ステータス', 'status', 'enum', true, 'confirmed', '取消・返金除外'),
    dataRow('トランザクション', '会計明細', '明細ID', 'line_id', 'string', true, '—', '自費メニュー別'),
    dataRow('トランザクション', '会計明細', '会計ID', 'accounting_id', 'string', true, '—', '—'),
    dataRow('トランザクション', '会計明細', '自費メニュー区分', 'self_pay_menu', 'string', false, 'implant', '自費タブ'),
    dataRow('トランザクション', '会計明細', '金額', 'amount', 'number', true, '—', '—'),
    dataRow('トランザクション', '会計担当配分', '会計ID', 'accounting_id', 'string', true, '—', '職種別・担当別'),
    dataRow('トランザクション', '会計担当配分', '担当者ID', 'staff_id', 'string', true, '—', '—'),
    dataRow('トランザクション', '会計担当配分', '配分金額 or 配分率', 'share', 'number', true, '—', '複数担当時'),
    dataRow('トランザクション', '来院', '来院ID', 'visit_id', 'string', true, '—', '患者数'),
    dataRow('トランザクション', '来院', '来院日', 'visit_date', 'date', true, '2026-06-23', '—'),
    dataRow('トランザクション', '来院', '患者ID', 'patient_id', 'string', true, '—', '—'),
    dataRow('トランザクション', '来院', '種別', 'visit_type', 'enum', true, 'outpatient/visiting', '外来/訪問'),
    dataRow('トランザクション', '来院', '来院区分', 'visit_category', 'enum', true, 'pure_first/first/return/other', '内訳'),
    dataRow('トランザクション', '来院', '医院ID', 'clinic_id', 'string', true, '—', '—'),
    dataRow('トランザクション', '予約', '予約ID', 'appointment_id', 'string', true, '—', '予約・稼働'),
    dataRow('トランザクション', '予約', '予約開始日時', 'start_at', 'datetime', true, '—', '稼働率分子'),
    dataRow('トランザクション', '予約', '予約終了日時', 'end_at', 'datetime', true, '—', '—'),
    dataRow('トランザクション', '予約', 'チェアID', 'chair_id', 'string', false, 'null=未割当', '未割当は別枠'),
    dataRow('トランザクション', '予約', '担当者ID', 'staff_id', 'string', false, '—', '—'),
    dataRow('トランザクション', '予約', 'ステータス', 'status', 'enum', true, 'visited/cancelled/no_show/not_visited', 'CXは稼働・予約集計除外'),
    dataRow('トランザクション', '予約', '医院ID', 'clinic_id', 'string', true, '—', '—'),
    dataRow('トランザクション', '予約', '予約メニュー', 'menu', 'string', false, '定期検診', 'ランキング・構成'),
    dataRow('トランザクション', '予防対象', '患者ID', 'patient_id', 'string', true, '—', '予防タブ'),
    dataRow('トランザクション', '予防対象', '対象期', 'target_period', 'string', true, '2026-06', '—'),
    dataRow('トランザクション', '予防対象', 'ステータス', 'status', 'enum', true, 'booked/contact/pending', '—'),
    dataRow('トランザクション', '問診', '問診ID', 'questionnaire_id', 'string', true, '—', '問診タブ'),
    dataRow('トランザクション', '問診', '患者ID', 'patient_id', 'string', true, '—', '—'),
    dataRow('トランザクション', '問診', '来院日', 'visit_date', 'date', true, '—', '—'),
    dataRow('トランザクション', '問診', 'タイプ', 'type', 'string', false, '初診/再診', '—'),
    dataRow('トランザクション', '問診', 'ステータス', 'status', 'enum', true, 'done/pending/partial', '—'),
    dataRow('トランザクション', '入金', '会計ID', 'accounting_id', 'string', true, '—', '入金率'),
    dataRow('トランザクション', '入金', '入金日', 'payment_date', 'date', false, '—', '—'),
    dataRow('トランザクション', '入金', '入金額', 'paid_amount', 'number', true, '—', '—'),
    dataRow('トランザクション', '入金', '未収残', 'receivable', 'number', false, '12400', '—'),
  ];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txData), '③必要データ_トランザクション');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { 現状プロトタイプ: '今月累計から日別を按分', 実データ接続後: '会計.会計日 で GROUP BY（按分不要）' },
    { 現状プロトタイプ: 'salesShare で職種別を按分', 実データ接続後: '会計担当配分 × スタッフ.職種 で SUM' },
    { 現状プロトタイプ: '自費を 28/24/18% で按分', 実データ接続後: '会計明細.自費メニュー区分 で GROUP BY' },
    { 現状プロトタイプ: '曜日別来院を固定配列で按分', 実データ接続後: '来院.来院日 の曜日で GROUP BY' },
    { 現状プロトタイプ: 'slots/used を直値', 実データ接続後: '予約×診療時間×チェアから稼働率計算' },
    { 現状プロトタイプ: 'data.js 固定値', 実データ接続後: 'API から期間集計' },
    { 現状プロトタイプ: '前比トレンド文言が静的', 実データ接続後: '前期間集計との差分を計算' },
  ]), '④現状との差分');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { 優先度: 'P0', データ: '会計（日付・内訳・合計）', 理由: '売上系すべての正本' },
    { 優先度: 'P0', データ: '会計担当配分 + スタッフ職種', 理由: '職種別・担当別売上' },
    { 優先度: 'P0', データ: '来院（日付・区分・外来/訪問）', 理由: '患者数系' },
    { 優先度: 'P0', データ: '予約（日時・ステータス・チェア）', 理由: '予約数・稼働率' },
    { 優先度: 'P1', データ: '診療時間マスタ + 例外', 理由: '稼働率の分母' },
    { 優先度: 'P1', データ: 'チェアマスタ', 理由: 'チェア別稼働' },
    { 優先度: 'P1', データ: '会計明細（自費メニュー）', 理由: '自費内訳' },
    { 優先度: 'P1', データ: '目標マスタ', 理由: '目標達成率・あとN予約' },
    { 優先度: 'P2', データ: '予防対象リスト', 理由: '予防タブ' },
    { 優先度: 'P2', データ: '問診', 理由: '問診タブ' },
    { 優先度: 'P2', データ: '入金/未収', 理由: '入金率' },
    { 優先度: 'P2', データ: '予約メニュー', 理由: 'WEB予約構成' },
  ]), '⑤データ優先度');

  XLSX.writeFile(wb, OUT);
  console.log('Written:', OUT);
}

main();
