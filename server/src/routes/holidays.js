import { Router } from 'express';
import { q, pool } from '../db.js';
import { requireRole } from '../auth.js';
import { fail } from '../http.js';
import { addDays, easterSunday, isValidDate } from '../../../shared/dates.js';
import { OFFICIAL } from '../holidays-official.js';

const router = Router();
const admin = requireRole('admin');
const SCOPES = ['nacional', 'autonomico', 'local', 'empresa'];

// Comunidad (código ISO 3166-2) y localidad cuyos festivos se proponen al importar
const REGION = process.env.HOLIDAYS_REGION || 'ES-VC';
const LOCALITY = (process.env.HOLIDAYS_LOCALITY || 'valencia').toLowerCase();

/** Set de fechas festivas entre dos fechas (para contar días laborables). */
export async function holidaySet(from, to) {
  const { rows } = await q('SELECT date FROM holidays WHERE date BETWEEN $1 AND $2', [from, to]);
  return new Set(rows.map((r) => r.date));
}

/**
 * Festivos locales habituales de Valencia capital. Los fija el Ayuntamiento cada año (y a veces los
 * traslada), así que solo se usan como propuesta sin marcar cuando no hay calendario oficial.
 */
function valenciaLocal(year) {
  const easter = easterSunday(year);
  return [
    { date: `${year}-01-22`, name: 'San Vicente Mártir', scope: 'local' },
    // Lunes siguiente al Lunes de Pascua
    { date: addDays(easter, 8), name: 'San Vicente Ferrer', scope: 'local' },
  ];
}

/** Autonómicos que se repiten todos los años y que la API pública no siempre incluye. */
function regionalFixed(year) {
  if (REGION !== 'ES-VC') return [];
  return [
    { date: `${year}-03-19`, name: 'San José', scope: 'autonomico' },
    { date: `${year}-10-09`, name: 'Día de la Comunitat Valenciana', scope: 'autonomico' },
  ];
}

/** Festivos nacionales y autonómicos desde la API pública de Nager.Date. */
async function fetchPublic(year) {
  const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/ES`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data
    .filter((h) => h.global || h.counties?.includes(REGION))
    .map((h) => ({ date: h.date, name: h.localName, scope: h.global ? 'nacional' : 'autonomico' }));
}

router.get('/holidays', async (req, res) => {
  const { from, to } = req.query;
  const { rows } = isValidDate(from) && isValidDate(to)
    ? await q('SELECT * FROM holidays WHERE date BETWEEN $1 AND $2 ORDER BY date', [from, to])
    : await q('SELECT * FROM holidays ORDER BY date');
  res.json(rows);
});

/** Propuesta a partir del calendario oficial incluido en la aplicación (si existe para ese año). */
function officialSuggestion(year) {
  const cal = OFFICIAL[REGION]?.[year];
  if (!cal) return null;
  const locals = cal.local?.[LOCALITY];
  const toItem = ([date, name, scope]) => ({ date, name, scope, origin: 'oficial', selected: true });
  return {
    items: [...cal.days, ...(locals ?? [])].map(toItem),
    source: cal.source,
    warning: locals ? null : 'El calendario oficial incluido no tiene los festivos locales de tu localidad: añádelos a mano.',
  };
}

/**
 * Sin calendario oficial: API no oficial + calculados. Solo se preseleccionan los nacionales y San José;
 * el resto de autonómicos y los locales cambian cada año y quedan sin marcar para que se verifiquen.
 */
async function fallbackSuggestion(year) {
  let warning = `No hay calendario oficial de ${year} incluido en la aplicación. Revisa la propuesta con el decreto `
    + 'del DOGV: los festivos autonómicos cambian cada año.';
  const fixed = regionalFixed(year);
  const fixedDates = new Set(fixed.map((h) => h.date));
  let items = [];
  try {
    items = (await fetchPublic(year)).map((h) => (fixedDates.has(h.date)
      ? { ...h, origin: 'fijo', selected: true }
      : { ...h, origin: 'no oficial', selected: h.scope === 'nacional' }));
  } catch (err) {
    warning += ` No se pudo descargar la propuesta (${err.message}).`;
  }
  const fetched = new Set(items.map((h) => h.date));
  const extra = [
    ...fixed.map((h) => ({ ...h, origin: 'fijo', selected: true })),
    ...(LOCALITY === 'valencia' ? valenciaLocal(year) : []).map((h) => ({ ...h, origin: 'calculado', selected: false })),
  ];
  items.push(...extra.filter((h) => !fetched.has(h.date)));
  return { items, source: 'date.nager.at (no oficial) y fechas calculadas', warning };
}

// Propuesta de festivos para un año: no guarda nada, el administrador elige qué confirmar
router.get('/holidays/suggest', admin, async (req, res) => {
  const year = Number(req.query.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) fail(400, 'Año no válido');

  const suggestion = officialSuggestion(year) ?? await fallbackSuggestion(year);
  const existing = await holidaySet(`${year}-01-01`, `${year}-12-31`);
  suggestion.items.sort((a, b) => a.date.localeCompare(b.date));
  res.json({
    ...suggestion,
    region: REGION,
    items: suggestion.items.map((h) => ({ ...h, exists: existing.has(h.date), selected: h.selected && !existing.has(h.date) })),
  });
});

function holidayFields(h) {
  if (!isValidDate(h?.date)) fail(400, 'Fecha no válida');
  if (!h.name?.trim()) fail(400, 'El nombre es obligatorio');
  return [h.date, h.name.trim(), SCOPES.includes(h.scope) ? h.scope : 'empresa'];
}

const UPSERT = `INSERT INTO holidays (date, name, scope) VALUES ($1, $2, $3)
  ON CONFLICT (date) DO UPDATE SET name = EXCLUDED.name, scope = EXCLUDED.scope`;

router.post('/holidays', admin, async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [req.body];
  const rows = items.map(holidayFields); // valida todo antes de escribir nada
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of rows) await client.query(UPSERT, r);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.status(201).json({ saved: rows.length });
});

router.delete('/holidays/:date', admin, async (req, res) => {
  await q('DELETE FROM holidays WHERE date = $1', [req.params.date]);
  res.status(204).end();
});

export default router;
