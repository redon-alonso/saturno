// Utilidades de fechas compartidas entre servidor y cliente.
// Todas las fechas viajan como texto 'YYYY-MM-DD' y se operan en UTC
// para que los cambios de horario (CET/CEST) no desplacen ningún día.

const DAY_MS = 86400000;

export const toDate = (s) => new Date(`${s}T00:00:00Z`);
export const fmt = (d) => d.toISOString().slice(0, 10);

export function addDays(s, n) {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

/** Días de a hasta b (b - a). */
export const diffDays = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY_MS);

/** 1 = lunes … 7 = domingo */
export const isoWeekday = (s) => toDate(s).getUTCDay() || 7;

export const maxDate = (a, b) => (a > b ? a : b);
export const minDate = (a, b) => (a < b ? a : b);

export function monthEnd(s) {
  const [y, m] = s.split('-').map(Number);
  return fmt(new Date(Date.UTC(y, m, 0)));
}

export function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fmt(toDate(s)) === s;
}

/** Fecha de hoy en la zona horaria indicada (o la local). */
export function todayStr(timeZone) {
  return new Date().toLocaleDateString('sv-SE', timeZone ? { timeZone } : undefined);
}

/**
 * Cuenta días entre dos fechas (incluidas): 'natural' o 'laborable'
 * (lunes a viernes que no estén en `holidays`, un Set de 'YYYY-MM-DD').
 */
/** Laborable: de lunes a viernes y no festivo (`holidays`, un Set de 'YYYY-MM-DD'). */
export const isWorkingDay = (s, holidays = new Set()) => isoWeekday(s) <= 5 && !holidays.has(s);

/** El propio día si es laborable; si no, el siguiente que lo sea. */
export function nextWorkingDay(s, holidays = new Set()) {
  let d = s;
  for (let i = 0; i < 31 && !isWorkingDay(d, holidays); i++) d = addDays(d, 1);
  return d;
}

export function countDays(start, end, mode = 'natural', holidays = new Set()) {
  if (end < start) return 0;
  const total = diffDays(start, end) + 1;
  if (mode === 'natural') return total;
  let n = 0;
  for (let i = 0, d = start; i < total; i++, d = addDays(d, 1)) {
    if (isWorkingDay(d, holidays)) n++;
  }
  return n;
}

export const isValidTime = (t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(t);

/** Horas entre dos horas 'HH:MM' del mismo día (p. ej. '09:00'–'11:30' → 2.5). */
export function hoursBetween(start, end) {
  const min = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return Math.round(((min(end) - min(start)) / 60) * 100) / 100;
}

/** Fracción de jornada que suponen unas horas (2 h de 8 h → 0.25 días). */
export const hoursToDays = (hours, workdayHours = 8) => Math.round((hours / workdayHours) * 100) / 100;

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher, calendario gregoriano). */
export function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return fmt(new Date(Date.UTC(year, month - 1, day)));
}

/** Ciclo de vacaciones (1 de septiembre – 31 de agosto) al que pertenece una fecha. */
export function cycleOf(s) {
  const [y, m] = s.split('-').map(Number);
  const startYear = m >= 9 ? y : y - 1;
  return {
    start: `${startYear}-09-01`,
    end: `${startYear + 1}-08-31`,
    label: `${startYear}/${startYear + 1}`,
  };
}
