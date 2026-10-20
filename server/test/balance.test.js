import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accrualByCycle } from '../src/balance.js';
import { countDays, cycleOf, easterSunday, hoursBetween, hoursToDays, isValidTime } from '../../shared/dates.js';

test('cycleOf: el ciclo va del 1 de septiembre al 31 de agosto', () => {
  assert.deepEqual(cycleOf('2026-08-31'), { start: '2025-09-01', end: '2026-08-31', label: '2025/2026' });
  assert.deepEqual(cycleOf('2026-09-01'), { start: '2026-09-01', end: '2027-08-31', label: '2026/2027' });
});

test('ciclo completo = 30 días', () => {
  const [c] = accrualByCycle({ hireDate: '2025-09-01', asOf: '2026-01-10' });
  assert.equal(c.days, 30);
});

test('incorporación a mitad de ciclo: proporcional', () => {
  // 2026-03-01 → 2026-08-31 = 184 días de 365
  const [c] = accrualByCycle({ hireDate: '2026-03-01', asOf: '2026-04-01' });
  assert.equal(c.worked, 184);
  assert.equal(c.days, Math.round((30 * 184 / 365) * 100) / 100);
});

test('los ciclos se acumulan y los bisiestos tienen 366 días', () => {
  const cycles = accrualByCycle({ hireDate: '2023-09-01', asOf: '2026-10-20' });
  assert.equal(cycles.length, 4); // 23/24, 24/25, 25/26, 26/27
  assert.equal(cycles[0].length, 366); // incluye el 29-feb-2024
  assert.equal(cycles.reduce((s, c) => s + c.days, 0), 120);
});

test('modo progresivo: solo lo trabajado hasta hoy', () => {
  const [c] = accrualByCycle({ hireDate: '2026-09-01', asOf: '2026-09-30', mode: 'progressive' });
  assert.equal(c.worked, 30);
});

test('baja: se deja de generar', () => {
  const cycles = accrualByCycle({ hireDate: '2025-09-01', terminationDate: '2025-12-31', asOf: '2026-10-20' });
  assert.equal(cycles[0].worked, 122);
  assert.equal(cycles[1].days, 0);
});

test('countDays natural vs laborable', () => {
  assert.equal(countDays('2026-10-19', '2026-10-25', 'natural'), 7);
  assert.equal(countDays('2026-10-19', '2026-10-25', 'laborable'), 5);
});

test('los festivos no computan en laborables pero sí en naturales', () => {
  const fest = new Set(['2026-10-12']); // lunes
  assert.equal(countDays('2026-10-12', '2026-10-16', 'laborable', fest), 4);
  assert.equal(countDays('2026-10-12', '2026-10-16', 'natural', fest), 5);
});

test('horas: duración y fracción de jornada', () => {
  assert.equal(hoursBetween('09:00', '11:30'), 2.5);
  assert.equal(hoursBetween('15:00', '18:00'), 3);
  assert.equal(hoursToDays(2, 8), 0.25);       // salir 2 h antes = 0,25 días de vacaciones
  assert.equal(hoursToDays(2.5, 7.5), 0.33);   // jornada de 7,5 h
  assert.ok(isValidTime('08:30') && isValidTime('08:30:00') && !isValidTime('25:00') && !isValidTime('8:30'));
});

test('domingo de Pascua', () => {
  assert.equal(easterSunday(2025), '2025-04-20');
  assert.equal(easterSunday(2026), '2026-04-05');
  assert.equal(easterSunday(2027), '2027-03-28');
});
