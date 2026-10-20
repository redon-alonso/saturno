// La aplicación Express sin arrancar: la usan el servidor local (index.js) y la función de Vercel (api/index.js).
import express from 'express';
import bcrypt from 'bcryptjs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { one, q } from './db.js';
import { authenticate, signToken, USER_FIELDS } from './auth.js';
import { HttpError, fail } from './http.js';
import { fullBalance, workdayHours } from './balance.js';
import requests from './routes/requests.js';
import admin from './routes/admin.js';
import holidays from './routes/holidays.js';
import exportRoutes from './routes/export.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// ---------- Autenticación ----------
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  const user = await one(
    `SELECT ${USER_FIELDS}, u.password_hash FROM users u WHERE u.email = $1 AND u.active`,
    [String(email ?? '').trim().toLowerCase()],
  );
  if (!user || !(await bcrypt.compare(String(password ?? ''), user.password_hash))) {
    fail(401, 'Correo o contraseña incorrectos');
  }
  delete user.password_hash;
  res.json({ token: signToken(user), user });
});

app.use('/api', authenticate);

app.get('/api/auth/me', (req, res) => res.json(req.user));

app.put('/api/auth/password', async (req, res) => {
  const { current, next } = req.body ?? {};
  const row = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(String(current ?? ''), row.password_hash))) fail(400, 'La contraseña actual no es correcta');
  if (!next || next.length < 8) fail(400, 'La nueva contraseña debe tener al menos 8 caracteres');
  await q('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(next, 10), req.user.id]);
  res.status(204).end();
});

app.get('/api/balance', async (req, res) => res.json(await fullBalance(req.user.id)));

// Ajustes que el cliente necesita para calcular igual que el servidor
app.get('/api/config', (req, res) => res.json({ workdayHours: workdayHours() }));

app.use('/api', requests);
app.use('/api', admin);
app.use('/api', holidays);
app.use('/api', exportRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// ---------- Cliente compilado (solo en servidor propio; en Vercel lo sirve su CDN) ----------
const dist = fileURLToPath(new URL('../../client/dist', import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*path}', (req, res) => res.sendFile('index.html', { root: dist }));
}

// ---------- Errores ----------
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON no válido' });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

export default app;
