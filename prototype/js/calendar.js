/**
 * 日付ラベル用カレンダー（日曜・国民の祝日・医院カレンダー設定）
 * プロトタイプ対象年: 2026（モックデータの基準）
 *
 * 稼働日・稼働時間の共有 API（設定 UI / 稼働率など他タブから利用）:
 * - getOperatingDayInfo / isOperatingDate / getOperatingMinutesForDate
 * - getClosedDaySetForMonth / getOperatingDaySetForMonth
 * - calcMonthlyOperatingStats / calcOperatingStatsInRange
 * - getOperatingCapacitySnapshot（枠数ヒント suggestedSlots 付き）
 *
 * 永続データ形（localStorage dentalClinicHolidays）:
 * { specialClosed[], specialOpen[], specialOpenHours{ dateKey: hours }, versions[...] }
 */

const CALENDAR_YEAR_DEFAULT = 2026;
const CLINIC_HOLIDAYS_STORAGE_KEY = 'dentalClinicHolidays';
const WEEKDAY_LABELS_JP = ['日', '月', '火', '水', '木', '金', '土'];

/** 国民の祝日（固定・振替含む）。キーは YYYY-MM-DD */
const JP_PUBLIC_HOLIDAYS = {
  '2025-01-01': '元日',
  '2025-01-13': '成人の日',
  '2025-02-11': '建国記念の日',
  '2025-02-23': '天皇誕生日',
  '2025-02-24': '振替休日',
  '2025-03-20': '春分の日',
  '2025-04-29': '昭和の日',
  '2025-05-03': '憲法記念日',
  '2025-05-04': 'みどりの日',
  '2025-05-05': 'こどもの日',
  '2025-05-06': '振替休日',
  '2025-07-21': '海の日',
  '2025-08-11': '山の日',
  '2025-09-15': '敬老の日',
  '2025-09-23': '秋分の日',
  '2025-10-13': 'スポーツの日',
  '2025-11-03': '文化の日',
  '2025-11-23': '勤労感謝の日',
  '2025-11-24': '振替休日',
  '2026-01-01': '元日',
  '2026-01-12': '成人の日',
  '2026-02-11': '建国記念の日',
  '2026-02-23': '天皇誕生日',
  '2026-03-20': '春分の日',
  '2026-04-29': '昭和の日',
  '2026-05-03': '憲法記念日',
  '2026-05-04': 'みどりの日',
  '2026-05-05': 'こどもの日',
  '2026-05-06': '振替休日',
  '2026-07-20': '海の日',
  '2026-08-11': '山の日',
  '2026-09-21': '敬老の日',
  '2026-09-22': '国民の休日',
  '2026-09-23': '秋分の日',
  '2026-10-12': 'スポーツの日',
  '2026-11-03': '文化の日',
  '2026-11-23': '勤労感謝の日',
  '2027-01-01': '元日',
  '2027-01-11': '成人の日',
  '2027-02-11': '建国記念の日',
  '2027-02-23': '天皇誕生日',
  '2027-03-21': '春分の日',
  '2027-03-22': '振替休日',
  '2027-04-29': '昭和の日',
  '2027-05-03': '憲法記念日',
  '2027-05-04': 'みどりの日',
  '2027-05-05': 'こどもの日',
  '2027-07-19': '海の日',
  '2027-08-11': '山の日',
  '2027-09-20': '敬老の日',
  '2027-09-23': '秋分の日',
  '2027-10-11': 'スポーツの日',
  '2027-11-03': '文化の日',
  '2027-11-23': '勤労感謝の日',
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toDateKey(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function parseDateKey(key) {
  const m = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function parseChartDateLabel(label, year = CALENDAR_YEAR_DEFAULT) {
  const text = String(label || '').trim();
  const md = text.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (md) {
    return { year, month: Number(md[1]), day: Number(md[2]) };
  }
  const ymd = text.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) {
    return { year: Number(ymd[1]), month: Number(ymd[2]), day: Number(ymd[3]) };
  }
  return null;
}

function getWeekday(year, month, day) {
  return new Date(year, month - 1, day).getDay();
}

function isSundayDate(year, month, day) {
  return getWeekday(year, month, day) === 0;
}

function getPublicHolidayName(year, month, day) {
  return JP_PUBLIC_HOLIDAYS[toDateKey(year, month, day)] || null;
}

function isPublicHolidayDate(year, month, day) {
  return !!getPublicHolidayName(year, month, day);
}

function readClinicHolidaysStore() {
  try {
    const raw = localStorage.getItem(CLINIC_HOLIDAYS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeClinicHolidaysStore(store) {
  localStorage.setItem(CLINIC_HOLIDAYS_STORAGE_KEY, JSON.stringify(store || {}));
}

function getDefaultClinicHolidayKeys(clinicId) {
  const clinic = typeof getClinicById === 'function'
    ? getClinicById(clinicId)
    : MOCK_DATA?.clinics?.find((c) => c.id === clinicId);
  const list = clinic?.closedDates || clinic?.holidays || [];
  return [...new Set((list || []).map(String).filter(Boolean))];
}

function buildDefaultWeekdaySchedule() {
  const schedule = {};
  for (let d = 0; d < 7; d++) {
    const closed = d === 0;
    schedule[d] = {
      closed,
      openStart: closed ? '' : '09:00',
      openEnd: closed ? '' : '18:30',
      breakStart: closed ? '' : '13:00',
      breakEnd: closed ? '' : '14:30',
    };
  }
  return schedule;
}

function createVersionId() {
  return `ver-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function cloneSchedule(schedule) {
  const next = {};
  for (let d = 0; d < 7; d++) {
    const src = schedule?.[d] || schedule?.[String(d)] || {};
    next[d] = {
      closed: !!src.closed,
      openStart: src.openStart || '',
      openEnd: src.openEnd || '',
      breakStart: src.breakStart || '',
      breakEnd: src.breakEnd || '',
    };
  }
  return next;
}

function normalizeScheduleBlock(weeklyClosedInput, scheduleSrc) {
  const weeklyClosed = [...new Set((weeklyClosedInput || [0]).map(Number).filter((d) => d >= 0 && d <= 6))]
    .sort((a, b) => a - b);
  const schedule = buildDefaultWeekdaySchedule();
  for (let d = 0; d < 7; d++) {
    const src = scheduleSrc?.[d] || scheduleSrc?.[String(d)] || {};
    const closed = weeklyClosed.includes(d);
    schedule[d] = {
      closed,
      openStart: closed ? '' : (src.openStart || schedule[d].openStart),
      openEnd: closed ? '' : (src.openEnd || schedule[d].openEnd),
      breakStart: closed ? '' : (src.breakStart || schedule[d].breakStart),
      breakEnd: closed ? '' : (src.breakEnd || schedule[d].breakEnd),
    };
  }
  return { weeklyClosed, schedule };
}

function normalizeScheduleVersion(raw, index = 0) {
  const block = normalizeScheduleBlock(
    raw?.weeklyClosed,
    raw?.schedule,
  );
  const effectiveFrom = String(raw?.effectiveFrom || '2026-04-01');
  return {
    id: String(raw?.id || `ver-${index + 1}`),
    effectiveFrom: /^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) ? effectiveFrom : '2026-04-01',
    note: String(raw?.note || ''),
    weeklyClosed: block.weeklyClosed,
    schedule: block.schedule,
  };
}

function createDefaultClinicCalendarSettings(clinicId) {
  return {
    specialClosed: getDefaultClinicHolidayKeys(clinicId),
    specialOpen: [],
    specialOpenHours: {},
    versions: [
      normalizeScheduleVersion({
        id: 'ver-default',
        effectiveFrom: '2026-04-01',
        note: '今年度〜',
        weeklyClosed: [0],
        schedule: buildDefaultWeekdaySchedule(),
      }),
    ],
  };
}

function normalizeSpecialOpenHoursRow(raw) {
  return {
    openStart: String(raw?.openStart || '09:00'),
    openEnd: String(raw?.openEnd || '18:30'),
    breakStart: String(raw?.breakStart || '13:00'),
    breakEnd: String(raw?.breakEnd || '14:30'),
    closed: false,
  };
}

function normalizeSpecialOpenHoursMap(raw, specialOpenKeys = []) {
  const next = {};
  const src = raw && typeof raw === 'object' ? raw : {};
  const keys = new Set([
    ...specialOpenKeys.map(String),
    ...Object.keys(src),
  ]);
  keys.forEach((key) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
    if (src[key]) next[key] = normalizeSpecialOpenHoursRow(src[key]);
  });
  return next;
}

function getDefaultOpenHoursFromSchedule(snap) {
  const row = resolveFallbackOpenScheduleRow(snap);
  return normalizeSpecialOpenHoursRow(row);
}

function getSpecialOpenHoursForDate(clinicId, year, month, day) {
  const key = toDateKey(year, month, day);
  const settings = getClinicCalendarSettings(clinicId);
  if (!settings.specialOpen.includes(key)) return null;
  if (settings.specialOpenHours?.[key]) {
    return normalizeSpecialOpenHoursRow(settings.specialOpenHours[key]);
  }
  return getDefaultOpenHoursFromSchedule(getScheduleForDate(clinicId, year, month, day));
}

function normalizeClinicCalendarSettings(raw, clinicId) {
  if (Array.isArray(raw)) {
    const next = createDefaultClinicCalendarSettings(clinicId);
    next.specialClosed = [...new Set(raw.map(String))];
    return next;
  }
  const base = createDefaultClinicCalendarSettings(clinicId);
  if (!raw || typeof raw !== 'object') return base;

  let versions = Array.isArray(raw.versions) ? raw.versions.map((v, i) => normalizeScheduleVersion(v, i)) : null;
  if (!versions || !versions.length) {
    // 旧形式（versions なし）から移行
    versions = [
      normalizeScheduleVersion({
        id: 'ver-migrated',
        effectiveFrom: '2026-04-01',
        note: '今年度〜',
        weeklyClosed: raw.weeklyClosed,
        schedule: raw.schedule,
      }),
    ];
  }

  versions.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  const specialOpen = [...new Set((raw.specialOpen || []).map(String))].sort();
  return {
    specialClosed: [...new Set((raw.specialClosed || []).map(String))].sort(),
    specialOpen,
    specialOpenHours: normalizeSpecialOpenHoursMap(raw.specialOpenHours, specialOpen),
    versions,
  };
}

function getClinicCalendarSettings(clinicId, options = {}) {
  const id = (!clinicId || clinicId === 'all')
    ? (MOCK_DATA?.clinics?.[0]?.id || 'clinic-sakura')
    : clinicId;
  if (!options.persisted && typeof getActiveHolidaySettingsDraft === 'function') {
    const draft = getActiveHolidaySettingsDraft(id);
    if (draft) return normalizeClinicCalendarSettings(draft, id);
  }
  const store = readClinicHolidaysStore();
  if (Object.prototype.hasOwnProperty.call(store, id)) {
    return normalizeClinicCalendarSettings(store[id], id);
  }
  return createDefaultClinicCalendarSettings(id);
}

function setClinicCalendarSettings(clinicId, settings) {
  if (!clinicId) return;
  const store = readClinicHolidaysStore();
  store[clinicId] = normalizeClinicCalendarSettings(settings, clinicId);
  writeClinicHolidaysStore(store);
  if (typeof invalidateClinicDailyFactsCache === 'function') {
    invalidateClinicDailyFactsCache();
  }
}

function getClinicHolidayKeys(clinicId) {
  return getClinicCalendarSettings(clinicId).specialClosed;
}

function setClinicHolidayKeys(clinicId, keys) {
  const settings = getClinicCalendarSettings(clinicId);
  settings.specialClosed = [...new Set((keys || []).map(String))].sort();
  setClinicCalendarSettings(clinicId, settings);
}

function getDefaultClinicCalendarSettings(clinicId) {
  return createDefaultClinicCalendarSettings(clinicId);
}

function getSortedScheduleVersions(settings) {
  return [...(settings?.versions || [])].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

/** dateKey (YYYY-MM-DD) 時点で有効な定休・時間設定 */
function resolveScheduleVersion(settings, dateKey) {
  const versions = getSortedScheduleVersions(settings);
  if (!versions.length) return normalizeScheduleVersion({}, 0);
  let current = versions[0];
  for (const ver of versions) {
    if (ver.effectiveFrom <= dateKey) current = ver;
    else break;
  }
  return current;
}

function getScheduleVersionById(settings, versionId) {
  return getSortedScheduleVersions(settings).find((v) => v.id === versionId) || null;
}

function getScheduleForDate(clinicId, year, month, day) {
  const settings = getClinicCalendarSettings(clinicId);
  return resolveScheduleVersion(settings, toDateKey(year, month, day));
}

function findVersionIndex(settings, versionId) {
  return (settings.versions || []).findIndex((v) => v.id === versionId);
}

function isWeeklyClosedWeekday(clinicId, weekday, year, month, day) {
  if (year != null && month != null && day != null) {
    return getScheduleForDate(clinicId, year, month, day).weeklyClosed.includes(weekday);
  }
  const settings = getClinicCalendarSettings(clinicId);
  const versions = getSortedScheduleVersions(settings);
  const latest = versions[versions.length - 1];
  return (latest?.weeklyClosed || []).includes(weekday);
}

function isSpecialClosedDate(clinicId, year, month, day) {
  return getClinicCalendarSettings(clinicId).specialClosed.includes(toDateKey(year, month, day));
}

function isSpecialOpenDate(clinicId, year, month, day) {
  return getClinicCalendarSettings(clinicId).specialOpen.includes(toDateKey(year, month, day));
}

function isClinicHolidayDate(clinicId, year, month, day) {
  const key = toDateKey(year, month, day);
  const settings = getClinicCalendarSettings(clinicId);
  if (settings.specialOpen.includes(key)) return false;
  if (settings.specialClosed.includes(key)) return true;
  const weekday = getWeekday(year, month, day);
  return getScheduleForDate(clinicId, year, month, day).weeklyClosed.includes(weekday);
}

function toggleWeeklyClosedDay(clinicId, weekday, versionId) {
  const settings = getClinicCalendarSettings(clinicId);
  const idx = findVersionIndex(settings, versionId);
  if (idx < 0) return;
  const ver = settings.versions[idx];
  const day = Number(weekday);
  const set = new Set(ver.weeklyClosed);
  if (set.has(day)) set.delete(day);
  else set.add(day);
  const weeklyClosed = [...set].sort((a, b) => a - b);
  const schedule = cloneSchedule(ver.schedule);
  schedule[day] = {
    ...schedule[day],
    closed: set.has(day),
    openStart: set.has(day) ? '' : (schedule[day].openStart || '09:00'),
    openEnd: set.has(day) ? '' : (schedule[day].openEnd || '18:30'),
    breakStart: set.has(day) ? '' : (schedule[day].breakStart || '13:00'),
    breakEnd: set.has(day) ? '' : (schedule[day].breakEnd || '14:30'),
  };
  settings.versions[idx] = normalizeScheduleVersion({
    ...ver,
    weeklyClosed,
    schedule,
  }, idx);
  setClinicCalendarSettings(clinicId, settings);
}

function updateWeekdaySchedule(clinicId, weekday, patch, versionId) {
  const settings = getClinicCalendarSettings(clinicId);
  const idx = findVersionIndex(settings, versionId);
  if (idx < 0) return;
  const ver = settings.versions[idx];
  const day = Number(weekday);
  const closed = ver.weeklyClosed.includes(day);
  const schedule = cloneSchedule(ver.schedule);
  schedule[day] = {
    ...schedule[day],
    ...patch,
    closed,
  };
  if (closed) {
    schedule[day].openStart = '';
    schedule[day].openEnd = '';
    schedule[day].breakStart = '';
    schedule[day].breakEnd = '';
  }
  settings.versions[idx] = normalizeScheduleVersion({ ...ver, schedule }, idx);
  setClinicCalendarSettings(clinicId, settings);
}

function addScheduleVersion(clinicId, effectiveFrom, note = '', sourceVersionId = null) {
  const settings = getClinicCalendarSettings(clinicId);
  const from = String(effectiveFrom || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;
  if (settings.versions.some((v) => v.effectiveFrom === from)) return null;

  const source = getScheduleVersionById(settings, sourceVersionId)
    || resolveScheduleVersion(settings, from);
  const ver = normalizeScheduleVersion({
    id: createVersionId(),
    effectiveFrom: from,
    note: note || `${from.slice(0, 7).replace('-', '/')}〜`,
    weeklyClosed: source.weeklyClosed,
    schedule: cloneSchedule(source.schedule),
  });
  settings.versions.push(ver);
  setClinicCalendarSettings(clinicId, settings);
  return ver.id;
}

function updateScheduleVersionMeta(clinicId, versionId, { effectiveFrom, note } = {}) {
  const settings = getClinicCalendarSettings(clinicId);
  const idx = findVersionIndex(settings, versionId);
  if (idx < 0) return { ok: false, reason: 'missing' };
  const ver = settings.versions[idx];
  let nextFrom = ver.effectiveFrom;
  if (effectiveFrom && /^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    const conflict = settings.versions.some((v) => v.id !== versionId && v.effectiveFrom === effectiveFrom);
    if (conflict) return { ok: false, reason: 'conflict' };
    nextFrom = effectiveFrom;
  } else if (effectiveFrom) {
    return { ok: false, reason: 'invalid' };
  }
  settings.versions[idx] = normalizeScheduleVersion({
    ...ver,
    effectiveFrom: nextFrom,
    note: note != null ? String(note) : ver.note,
  }, idx);
  setClinicCalendarSettings(clinicId, settings);
  return { ok: true };
}

function deleteScheduleVersion(clinicId, versionId) {
  const settings = getClinicCalendarSettings(clinicId);
  if ((settings.versions || []).length <= 1) return false;
  settings.versions = settings.versions.filter((v) => v.id !== versionId);
  if (!settings.versions.length) return false;
  setClinicCalendarSettings(clinicId, settings);
  return true;
}

function cycleClinicSpecialDay(clinicId, year, month, day, hours = null) {
  const settings = getClinicCalendarSettings(clinicId, { persisted: true });
  const key = toDateKey(year, month, day);
  const weekday = getWeekday(year, month, day);
  const weeklyClosed = getScheduleForDate(clinicId, year, month, day).weeklyClosed.includes(weekday);
  const closedSet = new Set(settings.specialClosed);
  const openSet = new Set(settings.specialOpen);
  const openHours = { ...(settings.specialOpenHours || {}) };

  if (closedSet.has(key)) {
    closedSet.delete(key);
  } else if (openSet.has(key)) {
    openSet.delete(key);
    delete openHours[key];
  } else if (weeklyClosed) {
    if (!hours) return false;
    openSet.add(key);
    openHours[key] = normalizeSpecialOpenHoursRow(hours);
  } else {
    closedSet.add(key);
  }

  settings.specialClosed = [...closedSet].sort();
  settings.specialOpen = [...openSet].sort();
  settings.specialOpenHours = normalizeSpecialOpenHoursMap(openHours, settings.specialOpen);
  setClinicCalendarSettings(clinicId, settings);
  return true;
}

function resolveChartDateContext(options = {}) {
  const year = options.year || CALENDAR_YEAR_DEFAULT;
  let clinicId = options.clinicId;
  if (!clinicId && typeof insightState !== 'undefined' && insightState.clinicId) {
    clinicId = insightState.clinicId;
  }
  if (!clinicId && typeof state !== 'undefined' && state.clinicId) {
    clinicId = state.clinicId;
  }
  if (!clinicId) clinicId = MOCK_DATA?.clinics?.[0]?.id || 'clinic-sakura';
  return { year, clinicId };
}

function getDateLabelMeta(label, options = {}) {
  const { year, clinicId } = resolveChartDateContext(options);
  const parsed = parseChartDateLabel(label, year);
  if (!parsed) return null;
  const { month, day } = parsed;
  const weekday = getWeekday(year, month, day);
  const sunday = weekday === 0;
  const holidayName = getPublicHolidayName(year, month, day);
  const specialOpen = isSpecialOpenDate(clinicId, year, month, day);
  const specialClosed = isSpecialClosedDate(clinicId, year, month, day);
  const weeklyClosed = isWeeklyClosedWeekday(clinicId, weekday, year, month, day);
  const clinicHoliday = isClinicHolidayDate(clinicId, year, month, day);
  const isRed = !!holidayName || specialClosed || (!specialOpen && (sunday || weeklyClosed));
  return {
    year,
    month,
    day,
    weekday,
    isSunday: sunday,
    isPublicHoliday: !!holidayName,
    holidayName,
    isWeeklyClosed: weeklyClosed,
    isSpecialClosed: specialClosed,
    isSpecialOpen: specialOpen,
    isClinicHoliday: clinicHoliday,
    isRed,
  };
}

function chartDateLabelClass(label, options = {}) {
  const meta = getDateLabelMeta(label, options);
  return meta?.isRed ? 'chart-date-label--holiday' : '';
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function parseTimeToMinutes(value) {
  const m = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function calcOpenMinutesForWeekday(scheduleRow) {
  if (!scheduleRow || scheduleRow.closed) return 0;
  const openStart = parseTimeToMinutes(scheduleRow.openStart);
  const openEnd = parseTimeToMinutes(scheduleRow.openEnd);
  if (openStart == null || openEnd == null || openEnd <= openStart) return 0;
  let minutes = openEnd - openStart;
  const breakStart = parseTimeToMinutes(scheduleRow.breakStart);
  const breakEnd = parseTimeToMinutes(scheduleRow.breakEnd);
  if (breakStart != null && breakEnd != null && breakEnd > breakStart
    && breakStart >= openStart && breakEnd <= openEnd) {
    minutes -= (breakEnd - breakStart);
  }
  return Math.max(0, minutes);
}

function formatHoursFromMinutes(totalMinutes) {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

function resolveFallbackOpenScheduleRow(snap) {
  return Object.values(snap?.schedule || {}).find((s) => s && !s.closed)
    || { openStart: '09:00', openEnd: '18:30', breakStart: '13:00', breakEnd: '14:30', closed: false };
}

/**
 * 1日分の稼働判定・開院分（他タブ共有の単日 SSoT）
 * 臨時開院 > 突発休診 / 定休 / 祝日
 */
function getOperatingDayInfo(clinicId, year, month, day) {
  const settings = getClinicCalendarSettings(clinicId);
  const key = toDateKey(year, month, day);
  const weekday = getWeekday(year, month, day);
  const snap = resolveScheduleVersion(settings, key);
  const isSpecialOpen = settings.specialOpen.includes(key);
  const isSpecialClosed = settings.specialClosed.includes(key);
  const isWeeklyClosed = snap.weeklyClosed.includes(weekday);
  const isPublicHoliday = isPublicHolidayDate(year, month, day);
  const isOperating = isSpecialOpen || (!isSpecialClosed && !isWeeklyClosed && !isPublicHoliday);

  let operatingMinutes = 0;
  if (isOperating) {
    if (isSpecialOpen) {
      const hours = settings.specialOpenHours?.[key]
        ? normalizeSpecialOpenHoursRow(settings.specialOpenHours[key])
        : getDefaultOpenHoursFromSchedule(snap);
      operatingMinutes = calcOpenMinutesForWeekday(hours);
    } else {
      const row = snap.schedule?.[weekday];
      if (row && !row.closed) {
        operatingMinutes = calcOpenMinutesForWeekday(row);
      }
    }
  }

  return {
    key,
    year,
    month,
    day,
    weekday,
    scheduleVersionId: snap.id,
    isOperating,
    isSpecialOpen,
    isSpecialClosed,
    isWeeklyClosed,
    isPublicHoliday,
    operatingMinutes,
  };
}

function isOperatingDate(clinicId, year, month, day) {
  return getOperatingDayInfo(clinicId, year, month, day).isOperating;
}

function getOperatingMinutesForDate(clinicId, year, month, day) {
  return getOperatingDayInfo(clinicId, year, month, day).operatingMinutes;
}

/** 月内の休診日（日番号）— 日次 facts / チャートの closedDays 用 */
function getClosedDaySetForMonth(clinicId, year, month) {
  const days = daysInMonth(year, month);
  const closed = new Set();
  for (let d = 1; d <= days; d++) {
    if (!isOperatingDate(clinicId, year, month, d)) closed.add(d);
  }
  return closed;
}

/** 月内の稼働日（日番号） */
function getOperatingDaySetForMonth(clinicId, year, month) {
  const days = daysInMonth(year, month);
  const open = new Set();
  for (let d = 1; d <= days; d++) {
    if (isOperatingDate(clinicId, year, month, d)) open.add(d);
  }
  return open;
}

function summarizeOperatingDayInfos(dayInfos, { year = null, month = null } = {}) {
  let operatingDays = 0;
  let operatingMinutes = 0;
  const operatingDayKeys = [];
  const closedDayKeys = [];

  dayInfos.forEach((info) => {
    if (info.isOperating) {
      operatingDays += 1;
      operatingMinutes += info.operatingMinutes || 0;
      operatingDayKeys.push(info.key);
    } else {
      closedDayKeys.push(info.key);
    }
  });

  const calendarDays = dayInfos.length;
  return {
    year,
    month,
    daysInMonth: calendarDays,
    calendarDays,
    operatingDays,
    closedDays: calendarDays - operatingDays,
    operatingMinutes,
    operatingHoursLabel: formatHoursFromMinutes(operatingMinutes),
    avgOperatingMinutes: operatingDays ? Math.round(operatingMinutes / operatingDays) : 0,
    operatingDayKeys,
    closedDayKeys,
  };
}

function iterDateKeysInclusive(fromKey, toKey) {
  const from = parseDateKey(fromKey);
  const to = parseDateKey(toKey);
  if (!from || !to) return [];
  const keys = [];
  const cursor = new Date(from.year, from.month - 1, from.day);
  const end = new Date(to.year, to.month - 1, to.day);
  while (cursor <= end) {
    keys.push(toDateKey(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate()));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/** 任意期間の稼働集計（稼働率タブ・期間比較向け） */
function calcOperatingStatsInRange(clinicId, fromKey, toKey) {
  const keys = iterDateKeysInclusive(fromKey, toKey);
  const dayInfos = keys.map((key) => {
    const parsed = parseDateKey(key);
    return getOperatingDayInfo(clinicId, parsed.year, parsed.month, parsed.day);
  });
  return {
    fromKey,
    toKey,
    ...summarizeOperatingDayInfos(dayInfos),
    days: dayInfos,
  };
}

/**
 * 月次稼働（設定画面「当月の稼働」・他タブ KPI 向け）
 * @returns {{ year, month, daysInMonth, operatingDays, closedDays, operatingMinutes, operatingHoursLabel, avgOperatingMinutes, operatingDayKeys, closedDayKeys }}
 */
function calcMonthlyOperatingStats(clinicId, year, month) {
  const days = daysInMonth(year, month);
  const dayInfos = [];
  for (let d = 1; d <= days; d++) {
    dayInfos.push(getOperatingDayInfo(clinicId, year, month, d));
  }
  return summarizeOperatingDayInfos(dayInfos, { year, month });
}

/**
 * 稼働率など容量系メトリクス向けのスナップショット
 * slots はまだモックのまま。開院分を分母候補として渡せるようにする。
 */
function getOperatingCapacitySnapshot(clinicId, year, month, options = {}) {
  const stats = calcMonthlyOperatingStats(clinicId, year, month);
  const minutesPerSlot = Number(options.minutesPerSlot) > 0 ? Number(options.minutesPerSlot) : 30;
  const units = Number(options.units) > 0 ? Number(options.units) : 1;
  const suggestedSlots = Math.floor((stats.operatingMinutes * units) / minutesPerSlot);
  return {
    ...stats,
    minutesPerSlot,
    units,
    suggestedSlots,
  };
}

function shiftCalendarMonth(year, month, delta) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function buildMonthHolidayGrid(year, month, clinicId) {
  const days = daysInMonth(year, month);
  const firstWeekday = getWeekday(year, month, 1);
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= days; d++) {
    const meta = getDateLabelMeta(`${month}/${d}`, { year, clinicId });
    cells.push({
      day: d,
      key: toDateKey(year, month, d),
      ...meta,
    });
  }
  return cells;
}

function formatEffectiveFromLabel(dateKey) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return dateKey;
  return `${parsed.year}/${parsed.month}/${parsed.day}〜`;
}

function formatDateKeySlash(dateKey) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return dateKey;
  return `${parsed.year}/${parsed.month}/${parsed.day}`;
}

/** YYYY-MM-DD の前日 */
function dayBeforeDateKey(dateKey) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;
  const dt = new Date(parsed.year, parsed.month - 1, parsed.day);
  dt.setDate(dt.getDate() - 1);
  return toDateKey(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

/**
 * 適用期間ラベル
 * - 最新: 2026/6/1〜
 * - 過去: 2026/4/1〜2026/5/31（次の適用開始の前日まで）
 */
function formatScheduleVersionRangeLabel(ver, nextVer = null) {
  const from = formatDateKeySlash(ver?.effectiveFrom);
  if (!nextVer?.effectiveFrom) return `${from}〜`;
  const endKey = dayBeforeDateKey(nextVer.effectiveFrom);
  if (!endKey) return `${from}〜`;
  return `${from}〜${formatDateKeySlash(endKey)}`;
}
