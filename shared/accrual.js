// Generación de vacaciones por ciclo. Compartido: el servidor calcula el saldo y la ficha de usuario
// muestra una vista previa con la misma regla.
import { addDays, cycleOf, diffDays, maxDate, minDate } from './dates.js';

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Días de vacaciones de cada ciclo (1 sep – 31 ago) desde `hireDate` hasta el ciclo de `asOf`.
 * Regla de la empresa: se generan día a día y se disfrutan en el ciclo SIGUIENTE.
 *  - Ciclos cerrados (anteriores al de `asOf`): todo lo trabajado en ellos; ya se puede pedir.
 *  - Ciclo en curso (`open`): solo lo trabajado hasta `asOf`; no se puede pedir hasta `available_from`.
 */
export function accrualByCycle({ hireDate, terminationDate, asOf, daysPerYear = 30 }) {
  const cycles = [];
  const current = cycleOf(asOf).start;
  for (let c = cycleOf(hireDate); c.start <= current; c = cycleOf(addDays(c.end, 1))) {
    const open = c.start === current;
    const from = maxDate(hireDate, c.start);
    let to = terminationDate ? minDate(terminationDate, c.end) : c.end;
    if (open) to = minDate(to, asOf);
    const length = diffDays(c.start, c.end) + 1; // 365 o 366
    const worked = to >= from ? diffDays(from, to) + 1 : 0;
    cycles.push({
      ...c, worked, length, open, available_from: addDays(c.end, 1),
      days: round2((daysPerYear * worked) / length),
    });
  }
  return cycles;
}

/**
 * Días que se pueden disfrutar: el saldo exacto truncado. La fracción (p. ej. 0,89) no se pierde: se suma a lo
 * del ciclo siguiente y, si hay baja, va al finiquito.
 */
export const wholeDays = (n) => Math.trunc(Math.round((n ?? 0) * 100) / 100) || 0; // || 0: sin «-0»

/**
 * Máximo pedible con anticipo: lo consolidado y lo generado en el ciclo se redondean hacia abajo POR SEPARADO
 * (6,5 + 20,96 → 6 + 20 = 26). Hacia abajo y no truncando: un consolidado de −13,5 cuenta como −14, no −13.
 */
export const advanceableDays = (available, accruingDays = 0) =>
  Math.floor(round2(available)) + Math.floor(round2(accruingDays)) || 0;

/** Lo que ya se puede pedir (ciclos cerrados) y lo que se está generando (ciclo en curso). */
export function splitAccrual(cycles) {
  const closed = cycles.filter((c) => !c.open);
  const open = cycles.find((c) => c.open) ?? null;
  return {
    accrued: round2(closed.reduce((s, c) => s + c.days, 0)),
    accruing: open ? { label: open.label, days: open.days, available_from: open.available_from } : null,
  };
}
