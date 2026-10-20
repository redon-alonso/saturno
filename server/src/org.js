// Organigrama: secciones jerárquicas, quién aprueba a quién y qué grupo ve cada persona.
// Es la única fuente de verdad: la usan la bandeja «Revisar», las decisiones y el calendario.
import { q } from './db.js';

/** Construye el organigrama a partir de las filas (parte pura, sin base de datos). */
export function buildOrg(sections, heads) {
  const byId = new Map(sections.map((s) => [s.id, s]));
  return {
    sections,
    nameOf: (id) => byId.get(id)?.name ?? null,
    parentOf: (id) => byId.get(id)?.parent_id ?? null,
    childrenOf: (id) => sections.filter((s) => s.parent_id === id).map((s) => s.id),
    headsOf: (id) => heads.filter((h) => h.section_id === id).map((h) => h.id),
  };
}

/** Se carga en cada petición que lo necesita: son pocas filas y así nunca está desactualizado. */
export async function loadOrg() {
  const [{ rows: sections }, { rows: heads }] = await Promise.all([
    q('SELECT id, name, parent_id FROM sections'),
    q(`SELECT id, section_id FROM users WHERE role = 'jefe' AND active AND section_id IS NOT NULL`),
  ]);
  return buildOrg(sections, heads);
}

/**
 * Grupo en el que «compite» `owner` por los días y cuyo jefe le aprueba:
 * un usuario, en su sección; un jefe, en la sección superior (con los demás jefes que dependen de ella).
 */
export function groupOf(org, owner) {
  if (owner.role === 'jefe' && owner.section_id != null) return org.parentOf(owner.section_id) ?? owner.section_id;
  return owner.section_id ?? null;
}

/**
 * Jefes que aprueban a `owner`: los de su grupo y, si allí no hay ninguno, los del nivel superior, y así
 * sucesivamente. Vacío = lo aprueban los administradores.
 */
export function approverIds(org, owner) {
  if (owner.role === 'admin') return [];
  let start = owner.section_id;
  if (owner.role === 'jefe') start = start != null ? org.parentOf(start) : null;
  const seen = new Set();
  for (let s = start; s != null && !seen.has(s); s = org.parentOf(s)) {
    seen.add(s); // protege de ciclos aunque la API los impida
    const ids = org.headsOf(s).filter((id) => id !== owner.id);
    if (ids.length) return ids;
  }
  return [];
}

export function canReview(org, reviewer, owner) {
  if (reviewer.role === 'admin') return true;
  return reviewer.role === 'jefe' && approverIds(org, owner).includes(reviewer.id);
}

/** Grupos que puede consultar `user` en el calendario: el suyo y, si es jefe, el de su superior. */
export function visibleGroups(org, user) {
  if (user.role === 'admin') return org.sections.map((s) => s.id);
  if (user.section_id == null) return [];
  const groups = [user.section_id];
  const parent = org.parentOf(user.section_id);
  if (user.role === 'jefe' && parent != null) groups.push(parent);
  return groups;
}

/** Condición SQL (sobre el alias `u`) para los miembros del grupo de una sección: los suyos + jefes de sus hijas. */
export const groupWhere = (param) =>
  `(u.section_id = ${param} OR (u.role = 'jefe' AND u.section_id IN (SELECT id FROM sections WHERE parent_id = ${param})))`;

/** ¿Hacer de `parentId` el padre de `id` crearía un ciclo? */
export function wouldCycle(org, id, parentId) {
  for (let s = parentId; s != null; s = org.parentOf(s)) if (s === id) return true;
  return false;
}
