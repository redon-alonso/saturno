import { Router } from 'express';
import { q } from '../db.js';
import { requireRole } from '../auth.js';
import { teamOf } from './admin.js';
import { historyPeriod, historyRows } from './requests.js';
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
  // Exactamente lo que se ve en «Revisar → Historial» con el mismo periodo y sección
  const period = historyPeriod(req.query);
  const rows = await historyRows(req.user, period);

  const header = [
    'Persona', 'Sección', 'Motivo', 'Desde', 'Hasta', 'Hora inicio', 'Hora fin', 'Horas', 'Días', 'Estado', 'Anticipo',
    'Comentario', 'Revisada por', 'Registrada por', 'Respuesta', 'Interrumpida por', 'Fin original',
    'Motivo interrupción', 'Anulada por', 'Motivo anulación', 'Solicitada el',
  ];
  const data = rows.map((r) => [
    r.user_name, r.section_name ?? '', r.type_name, dmy(r.start_date), dmy(r.end_date),
    hhmm(r.start_time), hhmm(r.end_time), dec(r.hours), dec(r.days), STATUS[r.status], r.is_advance ? 'Sí' : '',
    r.comment ?? '', r.reviewer_name ?? '', r.created_by_name ?? '', r.review_comment ?? '',
    r.interrupted_by_name ?? '', dmy(r.original_end_date), r.interrupt_reason ?? '',
    r.cancelled_by_name ?? '', r.cancel_reason ?? '',
    new Date(r.created_at).toLocaleDateString('es-ES', { timeZone: process.env.APP_TZ || 'Europe/Madrid' }),
  ]);
  sendCsv(res, `solicitudes_${period.from}_${period.to}.csv`, header, data);
});

export default router;
