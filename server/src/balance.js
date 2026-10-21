import { q, one } from './db.js';
import { cycleOf, maxDate, todayStr } from '../../shared/dates.js';
import { accrualByCycle, splitAccrual } from '../../shared/accrual.js';

const round2 = (n) => Math.round(n * 100) / 100;

export const today = () => todayStr(process.env.APP_TZ || 'Europe/Madrid');

/** Días de vacaciones de un ciclo completo. */
export const vacationDaysPerYear = () => Number(process.env.VACATION_DAYS_PER_YEAR) || 30;

/** Horas de una jornada completa: base para convertir horas en fracción de día. */
export const workdayHours = () => Number(process.env.WORKDAY_HOURS) || 8;

// La regla de generación (ciclos cerrados disponibles, el de curso generándose) vive en shared/ para que
// la ficha de usuario pueda mostrar una vista previa idéntica
export { accrualByCycle } from '../../shared/accrual.js';

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
    daysPerYear: vacationDaysPerYear(),
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
  // Solo lo generado en ciclos cerrados se puede pedir; el ciclo en curso se muestra aparte
  const { accrued, accruing } = splitAccrual(cycles);
  const used = sum('aprobada');
  const pending = sum('pendiente');
  const total = round2(user.initial_balance + accrued + adj.total);

  return {
    asOf,
    initial: user.initial_balance,
    accrued,
    accruing,
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
