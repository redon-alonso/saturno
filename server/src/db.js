import { readFile } from 'node:fs/promises';
import pg from 'pg';
import bcrypt from 'bcryptjs';

// DATE como texto 'YYYY-MM-DD' (evita desfases de zona horaria) y NUMERIC como número
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1700, (v) => parseFloat(v));

/** En producción (Vercel) no se admiten valores de desarrollo inseguros. */
export const isProduction = !!process.env.VERCEL || process.env.NODE_ENV === 'production';

// En Vercel cada función abre su propio pool: pocas conexiones (Neon las agrupa con su pooler)
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: process.env.VERCEL ? 3 : 10,
  idleTimeoutMillis: 10_000,
});

export const q = (text, params) => pool.query(text, params);

export async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] ?? null;
}

export async function migrate() {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM users');
  if (rows[0].n === 0) {
    if (isProduction && (!process.env.ADMIN_EMAIL || (process.env.ADMIN_PASSWORD ?? '').length < 12)) {
      throw new Error('Define ADMIN_EMAIL y ADMIN_PASSWORD (mínimo 12 caracteres) para crear el primer administrador');
    }
    const email = process.env.ADMIN_EMAIL || 'admin@empresa.com';
    const password = process.env.ADMIN_PASSWORD || 'admin1234';
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')`,
      [process.env.ADMIN_NAME || 'Administrador', email.toLowerCase(), await bcrypt.hash(password, 10)],
    );
    console.log(`[db] Administrador inicial creado: ${email}`);
  }
}
