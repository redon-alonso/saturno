import { q, one } from './db.js';
import { addDays, cycleOf, diffDays, maxDate, minDate, todayStr } from '../../shared/dates.js';

const round2 = (n) => Math.round(n * 100) / 100;

export const today = () => todayStr(process.env.APP_TZ || 'Europe/Madrid');

/** Horas de una jornada completa: base para convertir horas en fracción de día. */
export const workdayHours = () => Number(process.env.WORKDAY_HOURS) || 8;

/**
 * Días de vacaciones generados en cada ciclo (1 sep – 31 ago) desde el alta hasta el ciclo de `asOf`.
 * Parte pura, sin base de datos.
 *  - mode 'cycle': el proporcional del ciclo se concede entero al empezar el ciclo.
 *  - mode 'progressive': solo cuenta lo trabajado hasta `asOf`.
 */
export function accrualByCycle({ hireDate, terminationDate, asOf, daysPerYear = 30, mode = 'cycle' }) {
  const cycles = [];
  const lastStart = cycleOf(asOf).start;
  for (let c = cycleOf(hireDate); c.start <= lastStart; c = cycleOf(addDays(c.end, 1))) {
    const from = maxDate(hireDate, c.start);
    let to = terminationDate ? minDate(terminationDate, c.end) : c.end;
    if (mode === 'progressive') to = minDate(to, asOf);
    const length = diffDays(c.start, c.end) + 1; // 365 o 366
    const worked = to >= from ? diffDays(from, to) + 1 : 0;
    cycles.push({ ...c, worked, length, days: round2((daysPerYear * worked) / length) });
  }
  return cycles;
}

/** Saldo de vacaciones (acumulable entre ciclos) de un usuario. */
export async function vacationBalance(userId, asOf = today()) {
  const user = await one(
    'SELECT hire_date, balance_from, termination_date, initial_balance FROM users WHERE id = $1',
    [userId],
  );
  if (!user) return null;

  const from = user.balance_from ? maxDate(user.hire_date, user.balance_from) : user.hire_date;
  const cycles = accrualByCycle({
    hireDate: from,
    terminationDate: user.termination_date,
    asOf: maxDate(asOf, from),
    daysPerYear: Number(process.env.VACATION_DAYS_PER_YEAR) || 30,
    mode: process.env.ACCRUAL_MODE === 'progressive' ? 'progressive' : 'cycle',
  });

  const { rows: reqs } = await q(
    `SELECT r.start_date, r.days, r.status FROM requests r
       JOIN absence_types t ON t.id = r.type_id
      WHERE r.user_id = $1 AND t.deducts_vacation AND r.status IN ('aprobada', 'pendiente')`,
    [userId],
  );
  const adj = await one(
    'SELECT COALESCE(sum(days), 0)::float AS total FROM balance_adjustments WHERE user_id = $1',
    [userId],
  );

  // Disfrutado por ciclo (informativo: el saldo es una bolsa común que no caduca)
  for (const c of cycles) {
    c.used = round2(reqs
      .filter((r) => r.status === 'aprobada' && r.start_date >= c.start && r.start_date <= c.end)
      .reduce((s, r) => s + r.days, 0));
  }

  const sum = (status) => round2(reqs.filter((r) => r.status === status).reduce((s, r) => s + r.days, 0));
  const accrued = round2(cycles.reduce((s, c) => s + c.days, 0));
  const used = sum('aprobada');
  const pending = sum('pendiente');
  const total = round2(user.initial_balance + accrued + adj.total);

  return {
    asOf,
    initial: user.initial_balance,
    accrued,
    adjustments: adj.total,
    total,
    used,
    pending,
    remaining: round2(total - used),            // sin contar lo pendiente
    available: round2(total - used - pending),  // lo que aún se puede pedir
    cycles: cycles.reverse(),
  };
}

/** Cupos no acumulables por ciclo (p. ej. asuntos propios) para el ciclo de `date`. */
export async function quotaBalances(userId, date = today()) {
  const c = cycleOf(date);
  const { rows } = await q(
    `SELECT t.id AS type_id, t.name, t.color, t.annual_quota AS quota,
            COALESCE(sum(r.days) FILTER (WHERE r.status = 'aprobada'), 0)::float AS used,
            COALESCE(sum(r.days) FILTER (WHERE r.status = 'pendiente'), 0)::float AS pending
       FROM absence_types t
       LEFT JOIN requests r ON r.type_id = t.id AND r.user_id = $1
            AND r.start_date BETWEEN $2 AND $3
      WHERE t.annual_quota IS NOT NULL AND t.active
      GROUP BY t.id ORDER BY t.sort`,
    [userId, c.start, c.end],
  );
  return rows.map((r) => ({ ...r, cycle: c.label, available: round2(r.quota - r.used - r.pending) }));
}

export async function fullBalance(userId) {
  return { vacation: await vacationBalance(userId), quotas: await quotaBalances(userId) };
}
