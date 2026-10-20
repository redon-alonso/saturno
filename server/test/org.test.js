import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOrg, approverIds, canReview, groupOf, visibleGroups, wouldCycle } from '../src/org.js';

// Dirección (1) ← Almacén (2), Administración (3); Administración ← Archivo (4, sin jefe)
const org = buildOrg(
  [
    { id: 1, name: 'Dirección', parent_id: null },
    { id: 2, name: 'Almacén', parent_id: 1 },
    { id: 3, name: 'Administración', parent_id: 1 },
    { id: 4, name: 'Archivo', parent_id: 3 },
  ],
  [{ id: 10, section_id: 1 }, { id: 20, section_id: 2 }, { id: 30, section_id: 3 }],
);
const director = { id: 10, role: 'jefe', section_id: 1 };
const jefeAlmacen = { id: 20, role: 'jefe', section_id: 2 };
const jefaAdmin = { id: 30, role: 'jefe', section_id: 3 };
const mozo = { id: 21, role: 'usuario', section_id: 2 };
const archivera = { id: 41, role: 'usuario', section_id: 4 };

test('un usuario lo aprueba el jefe de su sección', () => {
  assert.deepEqual(approverIds(org, mozo), [20]);
  assert.ok(canReview(org, jefeAlmacen, mozo));
  assert.ok(!canReview(org, director, mozo)); // el director no se salta al jefe
});

test('un jefe lo aprueba el jefe de la sección superior', () => {
  assert.deepEqual(approverIds(org, jefeAlmacen), [10]);
  assert.ok(canReview(org, director, jefeAlmacen));
  assert.ok(!canReview(org, jefaAdmin, jefeAlmacen)); // entre jefes del mismo nivel, no
});

test('sin jefe en la sección se sube al siguiente nivel', () => {
  assert.deepEqual(approverIds(org, archivera), [30]);
});

test('el jefe de más arriba lo aprueban los administradores', () => {
  assert.deepEqual(approverIds(org, director), []);
  assert.ok(!canReview(org, director, director));
  assert.ok(canReview(org, { id: 1, role: 'admin' }, director));
});

test('grupos: un jefe compite con los otros jefes de su superior', () => {
  assert.equal(groupOf(org, mozo), 2);
  assert.equal(groupOf(org, jefeAlmacen), 1);
  assert.deepEqual(visibleGroups(org, jefeAlmacen), [2, 1]);
  assert.deepEqual(visibleGroups(org, mozo), [2]);
});

test('no se permiten ciclos en la jerarquía', () => {
  assert.ok(wouldCycle(org, 1, 4));   // Dirección no puede depender de Archivo
  assert.ok(wouldCycle(org, 3, 3));
  assert.ok(!wouldCycle(org, 4, 2));  // Archivo sí puede pasar a depender de Almacén
});
