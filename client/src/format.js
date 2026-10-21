const nfmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
export const num = (n) => nfmt.format(n ?? 0);
export { wholeDays } from '@shared/accrual.js';

/** 'YYYY-MM-DD' → '20/10/2026' */
export const dmy = (s) => (s ? s.split('-').reverse().join('/') : '');

const shortFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const short = (s) => shortFmt.format(new Date(`${s}T00:00:00Z`));

export function range(r) {
  const hours = r.start_time ? ` · ${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)}` : '';
  return (r.start_date === r.end_date ? short(r.start_date) : `${short(r.start_date)} – ${short(r.end_date)}`) + hours;
}

/** Duración legible: '2 h (0,25 días)' para las de horas, '5 días' para las de días completos. */
export const amount = (r) => (r.hours ? `${num(r.hours)} h (${num(r.days)} d)` : `${num(r.days)} ${r.days === 1 ? 'día' : 'días'}`);

export const STATUS_LABELS = {
  pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada', cancelada: 'Cancelada',
};
