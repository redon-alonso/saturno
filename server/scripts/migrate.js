// Crea o actualiza las tablas (el esquema es idempotente) y el administrador inicial si no hay usuarios.
// En Vercel se ejecuta en cada despliegue, dentro del comando de build.

// Los cambios de esquema van por la conexión directa de Neon, no por su pooler
if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;

const { pool, migrate } = await import('../src/db.js');
await migrate();
console.log('[migrate] Base de datos al día');
await pool.end();
