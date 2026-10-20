// Arranque como servidor propio (desarrollo local, Docker, Render…). En Vercel se usa api/index.js.
import app from './app.js';
import { migrate } from './db.js';

await migrate();
const port = Number(process.env.PORT) || 3000;
// Express 5 llama a este callback también si falla (p. ej. puerto ocupado)
app.listen(port, (err) => {
  if (err) {
    console.error(`[api] No se pudo escuchar en el puerto ${port}: ${err.message}`);
    process.exit(1);
  }
  console.log(`[api] Escuchando en http://localhost:${port}`);
});
