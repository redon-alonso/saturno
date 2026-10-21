import { Router } from 'express';
import { q } from '../db.js';
import { requireRole } from '../auth.js';
import { teamOf } from './admin.js';
import { fail } from '../http.js';
import { fullBalance, today } from '../balance.js';
import { cycleOf, isValidDate } from '../../../shared/dates.js';

const router = Router();
const reviewers = requireRole('admin', 'jefe');

// ---------- CSV para Excel en castellano ----------
// `;` como separador y coma decimal (configuración regional española) y BOM para que Excel lea bien los acentos.
const dmy = (s) => (s ? s.split('-').reverse().join('/') : '');
const dec = (n) => (n == null ? '' : String(Math.round(n * 100) / 100).replace('.', ','));
const hhmm = (t) => (t ? t.slice(0, 5) : '');

function cell(v) {
  const s = String(v ?? '');
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function sendCsv(res, filename, header, rows) {
  const body = [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(`﻿${body}\r\n`);
}


const STATUS = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada', cancelada: 'Cancelada' };

// ---------- Saldos por persona ----------
router.get('/export/saldos.csv', reviewers, async (req, res) => {
  const cycle = cycleOf(today());
  const users = await teamOf(req.user, req.query.section); // jefe: las personas a las que aprueba
  const { rows: hourTypes } = await q('SELECT id, name FROM absence_types WHERE allows_hours ORDER BY sort, id');
  // Horas aprobadas en el ciclo actual, por persona y motivo
  const { rows: hours } = await q(
    `SELECT user_id, type_id, sum(hours)::float AS h FROM requests
      WHERE status = 'aprobada' AND hours IS NOT NULL AND start_date BETWEEN $1 AND $2 GROUP BY 1, 2`,
    [cycle.start, cycle.end],
  );
  const hoursOf = (u, t) => hours.find((x) => x.user_id === u && x.type_id === t)?.h ?? 0;

  const balances = await Promise.all(users.map((u) => fullBalance(u.id)));
  const quotaNames = [...new Set(balances.flatMap((b) => b.quotas.map((x) => x.name)))];

  const header = [
    'Persona', 'Correo', 'Sección', 'Incorporación',
    'Vacaciones generadas (días)', 'Vacaciones disfrutadas (días)', 'Pendientes de aprobar (días)', 'Disponibles exactos (días)', 'Disfrutables (días enteros)',
    ...quotaNames.map((n) => `${n} disponibles ${cycle.label}`),
    ...hourTypes.map((t) => `Horas de ${t.name.toLowerCase()} ${cycle.label}`),
  ];
  const rows = users.map((u, i) => {
    const b = balances[i];
    return [
      u.name, u.email, u.section_name ?? '', dmy(u.hire_date),
      dec(b.vacation.total), dec(b.vacation.used), dec(b.vacation.pending), dec(b.vacation.available), dec(b.vacation.usable),
      ...quotaNames.map((n) => dec(b.quotas.find((x) => x.name === n)?.available)),
      ...hourTypes.map((t) => dec(hoursOf(u.id, t.id))),
    ];
  });
  sendCsv(res, `saldos_${today()}.csv`, header, rows);
});

// ---------- Detalle de solicitudes de un periodo ----------
router.get('/export/solicitudes.csv', reviewers, async (req, res) => {
  const cycle = cycleOf(today());
  const userIds = (await teamOf(req.user, req.query.section)).map((u) => u.id);
  const from = req.query.from || cycle.start;
  const to = req.query.to || cycle.end;
  if (!isValidDate(from) || !isValidDate(to) || to < from) fail(400, 'Periodo no válido');

  const { rows } = await q(
    `SELECT r.*, u.name AS user_name, s.name AS section_name, t.name AS type_name,
            rv.name AS reviewer_name, cb.name AS cancelled_by_name
       FROM requests r
       JOIN users u ON u.id = r.user_id
       JOIN absence_types t ON t.id = r.type_id
       LEFT JOIN sections s ON s.id = u.section_id
       LEFT JOIN users rv ON rv.id = r.reviewer_id
       LEFT JOIN users cb ON cb.id = r.cancelled_by
      WHERE r.start_date <= $2 AND r.end_date >= $1 AND r.user_id = ANY($3::int[])
      ORDER BY r.start_date, u.name`,
    [from, to, userIds],
  );

  const header = [
    'Persona', 'Sección', 'Motivo', 'Desde', 'Hasta', 'Hora inicio', 'Hora fin', 'Horas', 'Días',
    'Estado', 'Comentario', 'Revisada por', 'Respuesta', 'Anulada por', 'Motivo anulación', 'Solicitada el',
  ];
  const data = rows.map((r) => [
    r.user_name, r.section_name ?? '', r.type_name, dmy(r.start_date), dmy(r.end_date),
    hhmm(r.start_time), hhmm(r.end_time), dec(r.hours), dec(r.days), STATUS[r.status], r.comment ?? '',
    r.reviewer_name ?? '', r.review_comment ?? '',
    r.cancelled_by && r.cancelled_by !== r.user_id ? r.cancelled_by_name : '', r.cancel_reason ?? '',
    new Date(r.created_at).toLocaleDateString('es-ES', { timeZone: process.env.APP_TZ || 'Europe/Madrid' }),
  ]);
  sendCsv(res, `solicitudes_${from}_${to}.csv`, header, data);
});

export default router;
