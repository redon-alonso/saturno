import { Router } from 'express';
import { q, one, pool } from '../db.js';
import { USER_FIELDS } from '../auth.js';
import { loadOrg, canReview, groupOf, groupWhere, visibleGroups } from '../org.js';
import { fail } from '../http.js';
import { vacationBalance, quotaBalances, today, workdayHours } from '../balance.js';
import { holidaySet } from './holidays.js';
import { cycleOf, countDays, hoursBetween, hoursToDays, isValidDate, isValidTime, isWorkingDay, maxDate } from '../../../shared/dates.js';

const router = Router();

const REQUEST_SELECT = `
  SELECT r.*, u.name AS user_name, u.role AS user_role, u.section_id, s.name AS section_name,
         t.code, t.name AS type_name, t.color, t.is_absence, t.deducts_vacation, t.is_private,
         rv.name AS reviewer_name, cb.name AS cancelled_by_name, ib.name AS interrupted_by_name
    FROM requests r
    JOIN users u ON u.id = r.user_id
    JOIN absence_types t ON t.id = r.type_id
    LEFT JOIN sections s ON s.id = u.section_id
    LEFT JOIN users rv ON rv.id = r.reviewer_id
    LEFT JOIN users cb ON cb.id = r.cancelled_by
    LEFT JOIN users ib ON ib.id = r.interrupted_by`;

const getRequest = (id) => one(`${REQUEST_SELECT} WHERE r.id = $1`, [id]);
const getOwner = (id) => one(`SELECT ${USER_FIELDS} FROM users u WHERE u.id = $1`, [id]);

/**
 * Lo que puede ver de una solicitud ajena quien no la aprueba: ni comentarios ni, si el motivo es
 * privado (p. ej. médico), el motivo real.
 */
function forColleague(r) {
  const masked = r.is_private
    ? { type_id: null, code: null, type_name: 'Ausencia', color: '#8a879e', is_private: true }
    : {};
  return { ...r, ...masked, comment: null, review_comment: null, cancel_reason: null, interrupt_reason: null };
}

// Calendario: ausencias del grupo elegido que se solapan con [from, to]
router.get('/calendar', async (req, res) => {
  const { from, to } = req.query;
  if (!isValidDate(from) || !isValidDate(to)) fail(400, 'Rango de fechas no válido');
  const me = req.user;
  const org = await loadOrg();

  // Grupos visibles: usuario → su sección; jefe → la suya y la de su superior; admin → cualquiera o todas
  const allowed = visibleGroups(org, me);
  let group = req.query.section ? Number(req.query.section) : (me.role === 'admin' ? null : allowed[0] ?? null);
  if (group != null && !allowed.includes(group)) fail(403, 'No puedes ver el calendario de esa sección');

  const params = [from, to];
  let where = `r.start_date <= $2 AND r.end_date >= $1 AND r.status IN ('aprobada', 'pendiente')`;
  if (group != null) {
    params.push(group);
    where += ` AND ${groupWhere(`$${params.length}`)}`;
  } else if (me.role !== 'admin') {
    params.push(me.id);
    where += ` AND u.id = $${params.length}`; // sin sección: solo lo propio
  }

  const { rows } = await q(`${REQUEST_SELECT} WHERE ${where} ORDER BY r.start_date, u.name`, params);
  const events = rows.map((r) => {
    const owner = { id: r.user_id, role: r.user_role, section_id: r.section_id };
    const reviewer = canReview(org, me, owner) && r.user_id !== me.id;
    const visible = r.user_id === me.id || me.role === 'admin' || reviewer ? r : forColleague(r);
    return { ...visible, can_review: reviewer };
  });

  const head = await one(
    `SELECT count(*)::int AS n FROM users u WHERE u.active AND ($1::int IS NULL OR ${groupWhere('$1')})`,
    [group],
  );
  const groups = allowed.map((id) => ({ id, name: org.nameOf(id), own: id === me.section_id }));
  res.json({ events, headcount: head.n, section: group, groups });
});

/**
 * Historial visible: solo lo del ciclo en curso (o futuro) y las pendientes; lo de ciclos cerrados deja de verse el
 * 1 de septiembre. Tampoco se muestra lo que anuló la propia persona: solo las interacciones con sus superiores.
 * Los datos no se borran: el saldo los usa todos.
 */
function visibleHistory() {
  const start = cycleOf(today()).start; // 'AAAA-MM-DD' generado aquí, no viene del usuario
  return `NOT (r.status = 'cancelada' AND r.cancelled_by = r.user_id)
    AND (r.status = 'pendiente' OR r.end_date >= '${start}')`;
}

/**
 * Historial de quien revisa: lo que ya se resolvió (no lo pendiente ni lo que anuló la propia persona) de las
 * personas que aprueba, que toca el periodo [from, to] y, para el administrador, de una sección. Es lo que se ve en
 * «Revisar → Historial» y lo que se descarga en su CSV: misma consulta, mismo orden.
 */
export async function historyRows(me, { from, to, section }) {
  const org = await loadOrg();
  const params = [from, to];
  let where = `r.status <> 'pendiente' AND NOT (r.status = 'cancelada' AND r.cancelled_by = r.user_id)
    AND r.start_date <= $2 AND r.end_date >= $1`;
  if (me.role === 'admin' && section) {
    params.push(Number(section));
    where += ` AND u.section_id = $${params.length}`;
  }
  const { rows } = await q(`${REQUEST_SELECT} WHERE ${where} ORDER BY r.start_date DESC, u.name`, params);
  return rows.filter((r) => r.user_id !== me.id
    && canReview(org, me, { id: r.user_id, role: r.user_role, section_id: r.section_id }));
}

/** Periodo de la consulta del historial: por defecto, el ciclo en curso */
export function historyPeriod(query) {
  const cycle = cycleOf(today());
  const from = query.from || cycle.start;
  const to = query.to || cycle.end;
  if (!isValidDate(from) || !isValidDate(to) || to < from) fail(400, 'Periodo no válido');
  return { from, to, section: query.section || null };
}

router.get('/requests/mine', async (req, res) => {
  const { rows } = await q(
    `${REQUEST_SELECT} WHERE r.user_id = $1 AND ${visibleHistory()} ORDER BY r.start_date DESC`,
    [req.user.id],
  );
  res.json(rows);
});

// Solicitudes que el usuario actual puede revisar
router.get('/requests/review', async (req, res) => {
  const me = req.user;
  if (me.role === 'usuario') fail(403, 'No tienes permiso');
  if (req.query.status === 'historial') return res.json(await historyRows(me, historyPeriod(req.query)));
  const org = await loadOrg();

  // Misma regla que para aprobar: solo lo de las personas a las que este jefe aprueba
  const { rows: all } = await q(`${REQUEST_SELECT} WHERE r.status = 'pendiente' ORDER BY r.start_date`);
  const rows = all.filter((r) => r.user_id !== me.id
    && canReview(org, me, { id: r.user_id, role: r.user_role, section_id: r.section_id }));

  for (const r of rows) {
    // Quién más del grupo está fuera esos días: ayuda a decidir si se puede conceder
    const group = groupOf(org, { role: r.user_role, section_id: r.section_id });
    r.group_id = group;
    r.group_name = org.nameOf(group);
    const { rows: overlaps } = await q(
      `SELECT r.id, u.name AS user_name, t.name AS type_name, t.color, r.start_date, r.end_date, r.status,
              r.start_time, r.end_time
         FROM requests r JOIN users u ON u.id = r.user_id JOIN absence_types t ON t.id = r.type_id
        WHERE ${group == null ? 'u.section_id IS NULL' : groupWhere('$1')}
          AND r.id <> $2 AND t.is_absence
          AND r.status IN ('aprobada', 'pendiente') AND r.start_date <= $4 AND r.end_date >= $3
        ORDER BY r.start_date`,
      [group, r.id, r.start_date, r.end_date],
    );
    r.overlaps = overlaps;
    if (r.deducts_vacation) r.vacation = await vacationBalance(r.user_id);
  }
  res.json(rows);
});

router.post('/requests', async (req, res) => {
  const me = req.user;
  const { type_id, start_date, end_date = start_date, comment } = req.body ?? {};
  let { start_time = null, end_time = null } = req.body ?? {};

  let isAdvance = false;
  if (me.termination_date && start_date > me.termination_date) {
    fail(400, `Es posterior a la fecha de baja (${me.termination_date.split('-').reverse().join('/')})`);
  }

  const type = await one('SELECT * FROM absence_types WHERE id = $1 AND active', [type_id]);
  if (!type) fail(400, 'Tipo de ausencia no válido');
  if (!isValidDate(start_date) || !isValidDate(end_date)) fail(400, 'Fechas no válidas');
  if (end_date < start_date) fail(400, 'La fecha de fin es anterior a la de inicio');
  if (start_date < today()) fail(400, 'No se pueden pedir ausencias en días que ya han pasado');

  const holidays = await holidaySet(start_date, end_date);
  // Fines de semana y festivos no son laborables: no se piden. Unas vacaciones sí pueden abarcarlos
  // (se cuentan en días naturales), pero tienen que empezar en un día laborable.
  if (!isWorkingDay(start_date, holidays)) {
    fail(400, 'Ese día no es laborable (fin de semana o festivo): la ausencia tiene que empezar en un día laborable');
  }
  let days;
  let hours = null;
  if (start_time || end_time) {
    // Solicitud por horas: un único día laborable, descuenta la fracción de jornada
    if (!type.allows_hours) fail(400, `${type.name} no se puede pedir por horas`);
    if (!isValidTime(start_time) || !isValidTime(end_time)) fail(400, 'Indica hora de inicio y de fin');
    if (start_date !== end_date) fail(400, 'Las solicitudes por horas son de un solo día');
    if (end_time <= start_time) fail(400, 'La hora de fin debe ser posterior a la de inicio');
    if (countDays(start_date, start_date, 'laborable', holidays) === 0) {
      fail(400, 'Las horas solo se pueden pedir en un día laborable');
    }
    hours = hoursBetween(start_time, end_time);
    const workday = workdayHours();
    if (hours > workday) fail(400, `Son más de ${workday} h, la jornada completa: pide el día entero`);
    days = hoursToDays(hours, workday);
  } else {
    start_time = end_time = null;
    days = countDays(start_date, end_date, type.count_mode, holidays);
    if (days === 0) fail(400, 'El rango elegido solo contiene fines de semana o festivos');
  }

  // Solapes: un día completo choca con todo; dos peticiones por horas solo si sus franjas se pisan
  const overlap = await one(
    `SELECT r.start_date, r.end_date, r.start_time, r.end_time FROM requests r WHERE r.user_id = $1
       AND r.status IN ('aprobada', 'pendiente') AND r.start_date <= $3 AND r.end_date >= $2
       AND NOT ($4::time IS NOT NULL AND r.start_time IS NOT NULL
                AND (r.end_time <= $4::time OR r.start_time >= $5::time))
     LIMIT 1`,
    [me.id, start_date, end_date, start_time, end_time],
  );
  if (overlap) {
    const when = overlap.start_time
      ? `el ${overlap.start_date} de ${overlap.start_time.slice(0, 5)} a ${overlap.end_time.slice(0, 5)}`
      : `entre el ${overlap.start_date} y el ${overlap.end_date}`;
    fail(409, `Ya tienes una solicitud ${when}`);
  }

  if (type.deducts_vacation) {
    // Se permite pedir contra lo que se genere en el ciclo de la fecha pedida (p. ej. pedir en agosto para octubre)
    const bal = await vacationBalance(me.id, maxDate(today(), start_date));
    // Solo se disfrutan días enteros: la fracción se acumula para el ciclo siguiente.
    // Si no llega lo consolidado, se puede pedir como anticipo (días completos) hasta lo generado en el
    // ciclo hasta el inicio de la ausencia; el jefe lo ve marcado como anticipo al aprobar.
    if (days > bal.usable) {
      if (hours != null) {
        fail(400, `Son ${days} días pero solo puedes pedir ${Math.max(bal.usable, 0)}: los anticipos solo se piden por días completos`);
      }
      if (days > bal.advanceable) {
        const withAdvance = bal.advanceable > Math.max(bal.usable, 0);
        fail(400, `Son ${days} días pero solo puedes pedir ${Math.max(bal.advanceable, 0)}`
          + (withAdvance ? ', contando el anticipo de lo generado este ciclo hasta esa fecha' : ''));
      }
      isAdvance = true;
    }
  }
  if (type.annual_quota != null) {
    const quota = (await quotaBalances(me.id, start_date)).find((x) => x.type_id === type.id);
    if (quota && days > quota.available) {
      fail(400, `Te quedan ${quota.available} días de ${type.name.toLowerCase()} en el ciclo ${quota.cycle}`);
    }
  }

  const { rows: [created] } = await q(
    `INSERT INTO requests (user_id, type_id, start_date, end_date, start_time, end_time, hours, days, comment, is_advance)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [me.id, type.id, start_date, end_date, start_time, end_time, hours, days, comment?.trim() || null, isAdvance],
  );
  res.status(201).json(await getRequest(created.id));
});

router.post('/requests/:id/decision', async (req, res) => {
  const { decision, review_comment } = req.body ?? {};
  if (!['aprobada', 'rechazada'].includes(decision)) fail(400, 'Decisión no válida');

  const r = await getRequest(req.params.id);
  if (!r) fail(404, 'Solicitud no encontrada');
  const owner = await getOwner(r.user_id);
  if (owner.id === req.user.id || !canReview(await loadOrg(), req.user, owner)) {
    fail(403, 'No puedes revisar esta solicitud');
  }

  // UPDATE condicionado al estado: si dos jefes deciden a la vez, solo gana uno
  const { rowCount } = await pool.query(
    `UPDATE requests SET status = $1, review_comment = $2, reviewer_id = $3, reviewed_at = now()
      WHERE id = $4 AND status = 'pendiente'`,
    [decision, review_comment?.trim() || null, req.user.id, r.id],
  );
  if (!rowCount) fail(409, 'La solicitud ya no está pendiente');

  res.json(await getRequest(r.id));
});

router.post('/requests/:id/cancel', async (req, res) => {
  const r = await getRequest(req.params.id);
  if (!r) fail(404, 'Solicitud no encontrada');
  const isOwner = r.user_id === req.user.id;
  // Solo el propio interesado o un administrador (los jefes de sección no anulan)
  if (!isOwner && req.user.role !== 'admin') fail(403, 'Solo un administrador puede anular solicitudes de otras personas');
  if (r.status === 'aprobada' && req.user.role !== 'admin' && r.start_date <= today()) {
    fail(409, 'Una ausencia aprobada que ya ha empezado solo la puede anular un administrador');
  }
  const reason = String(req.body?.reason ?? '').trim().slice(0, 500) || null;
  if (!isOwner && !reason) fail(400, 'Indica el motivo de la anulación: la verá la persona afectada');

  // Condicionado al estado, como las decisiones: evita anular algo que ya cambió
  const { rowCount } = await pool.query(
    `UPDATE requests SET status = 'cancelada', cancelled_by = $1, cancelled_at = now(), cancel_reason = $2
      WHERE id = $3 AND status IN ('pendiente', 'aprobada')`,
    [req.user.id, reason, r.id],
  );
  if (!rowCount) fail(409, 'La solicitud ya está cerrada');

  res.json(await getRequest(r.id));
});

/**
 * Recorta una ausencia hasta `lastDay` (último día disfrutado): los días siguientes vuelven al saldo.
 * La usan «Interrumpir» y la fecha de baja. Devuelve la solicitud actualizada o null si ya no se podía.
 */
export async function interruptRequest(r, lastDay, byId, reason) {
  const holidays = await holidaySet(r.start_date, lastDay);
  const type = await one('SELECT count_mode FROM absence_types WHERE id = $1', [r.type_id]);
  const days = countDays(r.start_date, lastDay, type.count_mode, holidays);
  const { rowCount } = await pool.query(
    `UPDATE requests SET original_end_date = COALESCE(original_end_date, end_date), end_date = $1, days = $2,
            interrupted_by = $3, interrupted_at = now(), interrupt_reason = $4
      WHERE id = $5 AND status IN ('aprobada', 'pendiente') AND start_date <= $1 AND end_date > $1`,
    [lastDay, days, byId, reason, r.id],
  );
  return rowCount ? getRequest(r.id) : null;
}

router.post('/requests/:id/interrupt', async (req, res) => {
  const lastDay = req.body?.last_day;
  const reason = String(req.body?.reason ?? '').trim().slice(0, 500);
  const r = await getRequest(req.params.id);
  if (!r) fail(404, 'Solicitud no encontrada');
  const owner = await getOwner(r.user_id);
  // Quien la aprueba (su jefe) o un administrador: es quien pide a la persona que vuelva
  if (req.user.role !== 'admin' && (owner.id === req.user.id || !canReview(await loadOrg(), req.user, owner))) {
    fail(403, 'No puedes interrumpir esta ausencia');
  }
  if (r.status !== 'aprobada') fail(409, 'Solo se interrumpen ausencias aprobadas');
  if (r.start_time) fail(400, 'Una ausencia por horas no se interrumpe: anúlala');
  if (!isValidDate(lastDay) || lastDay < r.start_date || lastDay >= r.end_date) {
    fail(400, 'El último día tiene que estar dentro de la ausencia y antes de su fin');
  }
  if (!reason) fail(400, 'Indica el motivo: lo verá la persona afectada');

  const updated = await interruptRequest(r, lastDay, req.user.id, reason);
  if (!updated) fail(409, 'La ausencia ya cambió; recarga');
  res.json(updated);
});

export default router;
