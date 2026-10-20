// Datos de ejemplo para probar el calendario. Contraseña de todos: demo1234
import bcrypt from 'bcryptjs';
import { pool, migrate, one, q, isProduction } from '../src/db.js';

if (isProduction || /neon\.tech/.test(process.env.DATABASE_URL ?? '')) {
  console.error('Los datos de demostración no se cargan en producción.');
  process.exit(1);
}
import { addDays, countDays, todayStr } from '../../shared/dates.js';

await migrate();
const hash = await bcrypt.hash('demo1234', 10);
const today = todayStr(process.env.APP_TZ || 'Europe/Madrid');

async function section(name) {
  return (await one(
    'INSERT INTO sections (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
    [name],
  )).id;
}
async function user(name, email, role, sectionId, hire) {
  return (await one(
    `INSERT INTO users (name, email, password_hash, role, section_id, hire_date) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [name, email, hash, role, sectionId, hire],
  )).id;
}

const types = Object.fromEntries((await q('SELECT id, code, count_mode FROM absence_types')).rows.map((t) => [t.code, t]));
async function request(userId, code, from, len, status = 'aprobada') {
  const t = types[code];
  const start = addDays(today, from);
  const end = addDays(start, len - 1);
  const days = countDays(start, end, t.count_mode);
  if (!days) return;
  await q(
    `INSERT INTO requests (user_id, type_id, start_date, end_date, days, status, reviewed_at)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 = 'aprobada' THEN now() END)`,
    [userId, t.id, start, end, days, status],
  );
}

const direccion = await section('Dirección');
const admin = await section('Administración');
const almacen = await section('Almacén');
// Jerarquía: los jefes de Administración y Almacén los aprueba la dirección
await q('UPDATE sections SET parent_id = $1 WHERE id = ANY($2::int[])', [direccion, [admin, almacen]]);
await user('Carmen Directora', 'direccion@demo.com', 'jefe', direccion, '2015-03-01');

await user('Laura Jefa', 'jefa.admin@demo.com', 'jefe', admin, '2019-02-01');
const ana = await user('Ana Pérez', 'ana@demo.com', 'usuario', admin, '2021-05-10');
const luis = await user('Luis García', 'luis@demo.com', 'usuario', admin, '2023-09-01');
const marta = await user('Marta Ruiz', 'marta@demo.com', 'usuario', admin, addDays(today, -60));
await user('Pedro Jefe', 'jefe.almacen@demo.com', 'jefe', almacen, '2018-01-15');
const sara = await user('Sara López', 'sara@demo.com', 'usuario', almacen, '2022-03-01');

// Plantilla veterana: el saldo se computa desde este ciclo y se arrastra lo que les quedaba
await q(
  `UPDATE users SET balance_from = '2026-09-01', initial_balance = 6.5
    WHERE email IN ('jefa.admin@demo.com', 'ana@demo.com', 'jefe.almacen@demo.com', 'sara@demo.com', 'direccion@demo.com')`,
);

await q('DELETE FROM requests WHERE user_id = ANY($1)', [[ana, luis, marta, sara]]);
await request(ana, 'vacaciones', 3, 7);
await request(luis, 'teletrabajo', 1, 1);
await request(luis, 'teletrabajo', 8, 1);
await request(luis, 'vacaciones', 5, 4, 'pendiente');
await request(marta, 'medico', 2, 1);
await request(marta, 'asuntos_propios', 12, 1, 'pendiente');
await request(ana, 'asuntos_propios', -6, 1);
await request(sara, 'vacaciones', 0, 14);

console.log('Datos de ejemplo creados. Usuarios (contraseña demo1234):');
console.log('  jefa.admin@demo.com (jefa), ana@demo.com, luis@demo.com, marta@demo.com');
console.log('  jefe.almacen@demo.com (jefe), sara@demo.com');
console.log('  direccion@demo.com (directora: aprueba a los dos jefes)');
await pool.end();
