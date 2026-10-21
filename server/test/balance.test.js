import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accrualByCycle } from '../src/balance.js';
import { splitAccrual, wholeDays } from '../../shared/accrual.js';
import { countDays, cycleOf, easterSunday, hoursBetween, hoursToDays, isValidTime, isWorkingDay, nextWorkingDay } from '../../shared/dates.js';

test('cycleOf: el ciclo va del 1 de septiembre al 31 de agosto', () => {
  assert.deepEqual(cycleOf('2026-08-31'), { start: '2025-09-01', end: '2026-08-31', label: '2025/2026' });
  assert.deepEqual(cycleOf('2026-09-01'), { start: '2026-09-01', end: '2027-08-31', label: '2026/2027' });
});

test('ciclo completo = 30 días, disponibles a partir del ciclo siguiente', () => {
  const [c, current] = accrualByCycle({ hireDate: '2025-09-01', asOf: '2026-09-10' });
  assert.equal(c.days, 30);
  assert.equal(c.open, false);
  assert.equal(current.open, true); // 2026/2027: generándose
  assert.equal(splitAccrual([c, current]).accrued, 30);
});

test('incorporación a mitad de ciclo: proporcional', () => {
  // 2026-03-01 → 2026-08-31 = 184 días de 365
  const [c] = accrualByCycle({ hireDate: '2026-03-01', asOf: '2026-10-01' });
  assert.equal(c.worked, 184);
  assert.equal(c.days, Math.round((30 * 184 / 365) * 100) / 100);
});

test('los ciclos se acumulan y los bisiestos tienen 366 días', () => {
  const cycles = accrualByCycle({ hireDate: '2023-09-01', asOf: '2026-10-20' });
  assert.equal(cycles.length, 4); // 23/24, 24/25, 25/26, 26/27
  assert.equal(cycles[0].length, 366); // incluye el 29-feb-2024
  // 23/24, 24/25 y 25/26 cerrados (90); 26/27 en curso: 50 días trabajados, aún no disponibles
  assert.deepEqual(splitAccrual(cycles), {
    accrued: 90,
    accruing: { label: '2026/2027', days: Math.round((30 * 50 / 365) * 100) / 100, available_from: '2027-09-01' },
  });
});

test('ciclo en curso: solo lo trabajado hasta hoy, y no se puede pedir', () => {
  const cycles = accrualByCycle({ hireDate: '2026-09-01', asOf: '2026-09-30' });
  assert.equal(cycles[0].worked, 30);
  assert.equal(splitAccrual(cycles).accrued, 0);
});

test('incorporado el 21/10/2026: 0 días hoy; 25,89 a partir del 1/9/2027', () => {
  const today = splitAccrual(accrualByCycle({ hireDate: '2026-10-21', asOf: '2026-10-21' }));
  assert.equal(today.accrued, 0);
  assert.equal(today.accruing.days, 0.08); // 1 día trabajado
  const next = splitAccrual(accrualByCycle({ hireDate: '2026-10-21', asOf: '2027-09-01' }));
  assert.equal(next.accrued, 25.89); // 315 de 365 días del ciclo 2026/2027
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

test('días laborables: ni fines de semana ni festivos', () => {
  const holidays = new Set(['2026-10-12']);
  assert.equal(isWorkingDay('2026-10-30'), true); // viernes
  assert.equal(isWorkingDay('2026-10-31'), false); // sábado
  assert.equal(isWorkingDay('2026-11-01'), false); // domingo
  assert.equal(isWorkingDay('2026-10-12', holidays), false); // festivo en lunes
  assert.equal(nextWorkingDay('2026-10-31'), '2026-11-02'); // del sábado al lunes
  assert.equal(nextWorkingDay('2026-10-10', holidays), '2026-10-13'); // sábado, domingo y festivo
  assert.equal(nextWorkingDay('2026-10-28'), '2026-10-28'); // ya es laborable
});

test('días enteros: se pide el entero; la fracción se acumula', () => {
  assert.equal(wholeDays(25.89), 25);
  assert.equal(wholeDays(25.89 + 30), 55); // el 0,89 se suma al ciclo siguiente
  assert.equal(wholeDays(0.89), 0);
  assert.equal(wholeDays(29.999999), 30); // redondeo a céntimos antes de truncar: sin errores de coma flotante
  assert.equal(wholeDays(-0.4), 0);      // saldo negativo (baja): no se muestran días
});
