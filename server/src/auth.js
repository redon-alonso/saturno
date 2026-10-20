import jwt from 'jsonwebtoken';
import { one, isProduction } from './db.js';
import { HttpError } from './http.js';

// Con la clave de desarrollo cualquiera podría firmarse un token de administrador: en producción es obligatoria
if (isProduction && (process.env.JWT_SECRET ?? '').length < 32) {
  throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción');
}
const SECRET = process.env.JWT_SECRET || 'dev-secret-cambiar';
if (!process.env.JWT_SECRET) console.warn('[auth] JWT_SECRET no definido: usando uno de desarrollo');

export const USER_FIELDS = `u.id, u.name, u.email, u.role, u.section_id, u.hire_date,
  u.termination_date, u.balance_from, u.initial_balance, u.active`;

export const signToken = (user) => jwt.sign({ id: user.id }, SECRET, { expiresIn: '12h' });

/** Verifica el token y recarga el usuario: un cambio de rol o una baja surten efecto al momento. */
export async function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (!token) return next(new HttpError(401, 'Sesión no iniciada'));
  try {
    const { id } = jwt.verify(token, SECRET);
    const user = await one(`SELECT ${USER_FIELDS} FROM users u WHERE u.id = $1 AND u.active`, [id]);
    if (!user) return next(new HttpError(401, 'Usuario no válido'));
    req.user = user;
    next();
  } catch {
    next(new HttpError(401, 'Sesión caducada'));
  }
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : next(new HttpError(403, 'No tienes permiso'));
