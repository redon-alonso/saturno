import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q, one } from '../db.js';
import { requireRole, USER_FIELDS } from '../auth.js';
import { loadOrg, canReview, wouldCycle } from '../org.js';
import { fail } from '../http.js';
import { fullBalance, vacationBalance } from '../balance.js';
import { isValidDate } from '../../../shared/dates.js';

const router = Router();
const admin = requireRole('admin');

// ---------- Tipos de ausencia ----------
router.get('/types', async (req, res) => {
  const { rows } = await q('SELECT * FROM absence_types ORDER BY sort, id');
  res.json(rows);
});

function typeFields(b) {
  if (!b.name?.trim()) fail(400, 'El nombre es obligatorio');
  if (!/^#[0-9a-f]{6}$/i.test(b.color ?? '')) fail(400, 'Color no válido');
  return [
    b.name.trim(), b.color, b.count_mode === 'laborable' ? 'laborable' : 'natural',
    !!b.deducts_vacation, b.annual_quota === '' || b.annual_quota == null ? null : Number(b.annual_quota),
    b.is_absence !== false, !!b.allows_hours, b.active !== false, Number(b.sort) || 0, !!b.is_private,
  ];
}

router.post('/types', admin, async (req, res) => {
  const code = req.body.name?.trim().toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_');
  const row = await one(
    `INSERT INTO absence_types (name, color, count_mode, deducts_vacation, annual_quota, is_absence, allows_hours,
                                active, sort, is_private, code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [...typeFields(req.body), `${code}_${Date.now().toString(36)}`],
  );
  res.status(201).json(row);
});

router.put('/types/:id', admin, async (req, res) => {
  const row = await one(
    `UPDATE absence_types SET name = $1, color = $2, count_mode = $3, deducts_vacation = $4, annual_quota = $5,
            is_absence = $6, allows_hours = $7, active = $8, sort = $9, is_private = $10 WHERE id = $11 RETURNING *`,
    [...typeFields(req.body), req.params.id],
  );
  if (!row) fail(404, 'Tipo no encontrado');
  res.json(row);
});

// ---------- Secciones ----------
router.get('/sections', async (req, res) => {
  const { rows } = await q(
    `SELECT s.*, count(u.id)::int AS members FROM sections s
       LEFT JOIN users u ON u.section_id = s.id AND u.active GROUP BY s.id ORDER BY s.name`,
  );
  res.json(rows);
});

async function parentField(id, parentId) {
  if (parentId == null || parentId === '') return null;
  const parent = Number(parentId);
  const org = await loadOrg();
  if (!org.nameOf(parent)) fail(400, 'La sección superior no existe');
  if (id != null && wouldCycle(org, id, parent)) fail(400, 'Una sección no puede depender de sí misma ni de una que depende de ella');
  return parent;
}

router.post('/sections', admin, async (req, res) => {
  if (!req.body.name?.trim()) fail(400, 'El nombre es obligatorio');
  const parent = await parentField(null, req.body.parent_id);
  res.status(201).json(await one(
    'INSERT INTO sections (name, parent_id) VALUES ($1, $2) RETURNING *', [req.body.name.trim(), parent],
  ));
});

router.put('/sections/:id', admin, async (req, res) => {
  if (!req.body.name?.trim()) fail(400, 'El nombre es obligatorio');
  const id = Number(req.params.id);
  const parent = await parentField(id, req.body.parent_id);
  const row = await one(
    'UPDATE sections SET name = $1, parent_id = $2 WHERE id = $3 RETURNING *', [req.body.name.trim(), parent, id],
  );
  if (!row) fail(404, 'Sección no encontrada');
  res.json(row);
});

router.delete('/sections/:id', admin, async (req, res) => {
  await q('DELETE FROM sections WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

// ---------- Usuarios ----------
router.get('/users', admin, async (req, res) => {
  const { rows } = await q(
    `SELECT ${USER_FIELDS}, s.name AS section_name FROM users u
       LEFT JOIN sections s ON s.id = u.section_id ORDER BY u.active DESC, u.name`,
  );
  res.json(rows);
});

/** Personas cuyo saldo puede consultar `me`: admin, todas (o una sección); jefe, a quienes aprueba. */
export async function teamOf(me, sectionParam) {
  const { rows } = await q(
    `SELECT ${USER_FIELDS}, s.name AS section_name FROM users u LEFT JOIN sections s ON s.id = u.section_id
      WHERE u.active ORDER BY s.name NULLS LAST, u.name`,
  );
  if (me.role === 'admin') {
    const section = sectionParam ? Number(sectionParam) : null;
    return section == null ? rows : rows.filter((u) => u.section_id === section);
  }
  const org = await loadOrg();
  return rows.filter((u) => u.id !== me.id && canReview(org, me, u));
}

// Saldos del equipo
router.get('/team', requireRole('admin', 'jefe'), async (req, res) => {
  const rows = await teamOf(req.user, req.query.section);
  for (const u of rows) u.balance = await fullBalance(u.id);
  res.json(rows);
});

function userFields(b) {
  if (!b.name?.trim() || !b.email?.trim()) fail(400, 'Nombre y correo son obligatorios');
  if (!['admin', 'jefe', 'usuario'].includes(b.role)) fail(400, 'Rol no válido');
  if (!isValidDate(b.hire_date)) fail(400, 'Fecha de incorporación no válida');
  if (b.termination_date && !isValidDate(b.termination_date)) fail(400, 'Fecha de baja no válida');
  if (b.balance_from && !isValidDate(b.balance_from)) fail(400, 'Fecha de inicio del cómputo no válida');
  return [
    b.name.trim(), b.email.trim().toLowerCase(), b.role, b.section_id || null,
    b.hire_date, b.termination_date || null, Number(b.initial_balance) || 0, b.active !== false,
    b.balance_from || null,
  ];
}

router.post('/users', admin, async (req, res) => {
  if (!req.body.password || req.body.password.length < 8) fail(400, 'La contraseña debe tener al menos 8 caracteres');
  const exists = await one('SELECT 1 FROM users WHERE email = $1', [req.body.email?.trim().toLowerCase()]);
  if (exists) fail(409, 'Ya existe un usuario con ese correo');
  const row = await one(
    `INSERT INTO users (name, email, role, section_id, hire_date, termination_date, initial_balance, active,
                        balance_from, password_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [...userFields(req.body), await bcrypt.hash(req.body.password, 10)],
  );
  res.status(201).json(row);
});

router.put('/users/:id', admin, async (req, res) => {
  const fields = userFields(req.body);
  if (Number(req.params.id) === req.user.id && (fields[2] !== 'admin' || !fields[7])) {
    fail(400, 'No puedes quitarte tu propio rol de administrador ni desactivarte');
  }
  const row = await one(
    `UPDATE users SET name = $1, email = $2, role = $3, section_id = $4, hire_date = $5,
            termination_date = $6, initial_balance = $7, active = $8, balance_from = $9
      WHERE id = $10 RETURNING id`,
    [...fields, req.params.id],
  );
  if (!row) fail(404, 'Usuario no encontrado');
  if (req.body.password) {
    if (req.body.password.length < 8) fail(400, 'La contraseña debe tener al menos 8 caracteres');
    await q('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(req.body.password, 10), row.id]);
  }
  res.json(row);
});

router.get('/users/:id/balance', async (req, res) => {
  const owner = await one(`SELECT ${USER_FIELDS} FROM users u WHERE u.id = $1`, [req.params.id]);
  if (!owner) fail(404, 'Usuario no encontrado');
  if (owner.id !== req.user.id && !canReview(await loadOrg(), req.user, owner)) fail(403, 'No tienes permiso');
  const { rows: adjustments } = await q(
    `SELECT a.*, u.name AS created_by_name FROM balance_adjustments a
       LEFT JOIN users u ON u.id = a.created_by WHERE a.user_id = $1 ORDER BY a.created_at DESC`,
    [owner.id],
  );
  res.json({ ...(await fullBalance(owner.id)), adjustments });
});

router.post('/users/:id/adjustments', admin, async (req, res) => {
  const days = Number(req.body.days);
  if (!days || !req.body.reason?.trim()) fail(400, 'Indica los días (±) y el motivo');
  await q(
    'INSERT INTO balance_adjustments (user_id, days, reason, created_by) VALUES ($1, $2, $3, $4)',
    [req.params.id, days, req.body.reason.trim(), req.user.id],
  );
  res.status(201).json(await vacationBalance(Number(req.params.id)));
});

export default router;
