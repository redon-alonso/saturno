<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { todayStr } from '@shared/dates.js';
import AppDialog from '../components/AppDialog.vue';
import BalanceSummary from '../components/BalanceSummary.vue';
import { api, refreshHolidays } from '../api.js';
import { session, ROLE_LABELS } from '../store.js';
import { num, dmy } from '../format.js';

const tab = ref('usuarios');
const error = ref('');
const notice = ref('');

const users = ref([]);
const editing = ref(null);       // usuario en edición (copia)
const balanceOf = ref(null);     // { user, data }
const adjustment = ref({ days: '', reason: '' });

async function loadUsers() { users.value = await api('/users'); }
async function loadSections() { session.sections = await api('/sections'); }
async function loadTypes() { session.types = await api('/types'); }

async function run(fn) {
  error.value = '';
  notice.value = '';
  try { await fn(); } catch (e) { error.value = e.message; }
}

const loaders = { usuarios: loadUsers, secciones: loadSections, tipos: loadTypes, festivos: refreshHolidays };
watch(tab, (t) => run(loaders[t]));
onMounted(() => run(loadUsers));

// ---------- Usuarios ----------
function newUser() {
  editing.value = {
    name: '', email: '', password: '', role: 'usuario', section_id: null,
    hire_date: todayStr(), termination_date: '', balance_from: '', initial_balance: 0, active: true,
  };
}
const editUser = (u) => {
  editing.value = { ...u, password: '', termination_date: u.termination_date ?? '', balance_from: u.balance_from ?? '' };
};

const saveUser = () => run(async () => {
  const u = editing.value;
  if (u.id) await api(`/users/${u.id}`, { method: 'PUT', body: u });
  else await api('/users', { method: 'POST', body: u });
  editing.value = null;
  await Promise.all([loadUsers(), loadSections()]);
});

const openBalance = (u) => run(async () => {
  adjustment.value = { days: '', reason: '' };
  balanceOf.value = { user: u, data: await api(`/users/${u.id}/balance`) };
});

const saveAdjustment = () => run(async () => {
  const u = balanceOf.value.user;
  await api(`/users/${u.id}/adjustments`, { method: 'POST', body: adjustment.value });
  await openBalance(u);
});

// ---------- Secciones ----------
const newSection = ref('');
const addSection = () => run(async () => {
  await api('/sections', { method: 'POST', body: { name: newSection.value } });
  newSection.value = '';
  await loadSections();
});
/** Guarda nombre y/o sección superior (el servidor impide ciclos). */
const updateSection = (s, changes) => run(async () => {
  const body = { name: s.name, parent_id: s.parent_id, ...changes };
  if (!body.name?.trim()) return loadSections();
  try {
    await api(`/sections/${s.id}`, { method: 'PUT', body });
  } finally {
    await loadSections(); // si falla, el desplegable vuelve a su valor real
  }
});

/** Secciones en orden de árbol, con su profundidad para sangrarlas. */
const sectionTree = computed(() => {
  const list = session.sections;
  const out = [];
  const visit = (parentId, depth) => {
    for (const s of list.filter((x) => (x.parent_id ?? null) === parentId)) {
      out.push({ ...s, depth });
      visit(s.id, depth + 1);
    }
  };
  visit(null, 0);
  return out;
});const deleteSection = (s) => run(async () => {
  await api(`/sections/${s.id}`, { method: 'DELETE' });
  await loadSections();
});

// ---------- Tipos ----------
const saveType = (t) => run(async () => {
  if (t.id) await api(`/types/${t.id}`, { method: 'PUT', body: t });
  else await api('/types', { method: 'POST', body: t });
  await loadTypes();
  notice.value = `«${t.name}» guardado`;
});
const addType = () => {
  session.types.push({
    name: '', color: '#64748b', count_mode: 'laborable', deducts_vacation: false, annual_quota: null,
    is_absence: true, allows_hours: false, active: true, is_private: true, sort: session.types.length + 1,
  });
};

// ---------- Festivos ----------
const SCOPE_LABELS = { nacional: 'Nacional', autonomico: 'Autonómico', local: 'Local', empresa: 'Convenio / empresa' };
const year = ref(Number(todayStr().slice(0, 4)));
const yearHolidays = computed(() => session.holidays.filter((h) => h.date.startsWith(`${year.value}-`)));
const newHoliday = ref({ date: '', name: '', scope: 'empresa' });
const suggestions = ref(null); // { items: [{ ...h, selected }], warning, region }

const addHoliday = () => run(async () => {
  await api('/holidays', { method: 'POST', body: newHoliday.value });
  newHoliday.value = { date: '', name: '', scope: 'empresa' };
  await refreshHolidays();
});
const deleteHoliday = (h) => run(async () => {
  await api(`/holidays/${h.date}`, { method: 'DELETE' });
  await refreshHolidays();
});
const suggest = () => run(async () => {
  const data = await api(`/holidays/suggest?year=${year.value}`);
  suggestions.value = data; // el servidor ya decide qué viene marcado (solo lo oficial o seguro)
});
const importSelected = () => run(async () => {
  const items = suggestions.value.items.filter((h) => h.selected);
  const { saved } = await api('/holidays', { method: 'POST', body: { items } });
  suggestions.value = null;
  await refreshHolidays();
  notice.value = `${saved} festivos guardados para ${year.value}`;
});
</script>

<template>
  <div class="page stack">
    <h1>Administración</h1>
    <div class="tabs" role="tablist">
      <button role="tab" :aria-selected="tab === 'usuarios'" @click="tab = 'usuarios'">Usuarios</button>
      <button role="tab" :aria-selected="tab === 'secciones'" @click="tab = 'secciones'">Secciones</button>
      <button role="tab" :aria-selected="tab === 'tipos'" @click="tab = 'tipos'">Tipos de ausencia</button>
      <button role="tab" :aria-selected="tab === 'festivos'" @click="tab = 'festivos'">Festivos</button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>

    <!-- Usuarios -->
    <section v-if="tab === 'usuarios'" class="card stack">
      <div class="row">
        <button class="btn primary" @click="newUser">+ Nuevo usuario</button>
        <span class="spacer" />
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Sección</th><th>Alta</th><th /></tr></thead>
          <tbody>
            <tr v-for="u in users" :key="u.id" :class="{ inactive: !u.active }">
              <td>{{ u.name }}<span v-if="!u.active" class="badge">inactivo</span></td>
              <td class="small">{{ u.email }}</td>
              <td>{{ ROLE_LABELS[u.role] }}</td>
              <td>{{ u.section_name ?? '—' }}</td>
              <td class="small">{{ dmy(u.hire_date) }}<div v-if="u.termination_date" class="muted">baja {{ dmy(u.termination_date) }}</div></td>
              <td class="num row-actions">
                <button class="btn small" @click="openBalance(u)">Saldo</button>
                <button class="btn small" @click="editUser(u)">Editar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Secciones -->
    <section v-if="tab === 'secciones'" class="card stack">
      <form class="row" @submit.prevent="addSection">
        <input v-model="newSection" placeholder="Nueva sección" required class="grow" />
        <button class="btn primary">Añadir</button>
      </form>
      <p class="muted small">
        Un jefe aprueba a los usuarios de su sección. Las solicitudes de un jefe las aprueba el jefe de la sección de
        la que depende (por ejemplo, Dirección), que además ve en su calendario a todos los jefes que dependen de él.
      </p>
      <div class="table-wrap">
      <table>
        <thead><tr><th>Nombre</th><th>Depende de</th><th class="num">Personas</th><th /></tr></thead>
        <tbody>
          <tr v-for="s in sectionTree" :key="s.id">
            <td>
              <div class="tree-name" :style="{ '--depth': s.depth }">
                <span v-if="s.depth" class="tree-branch" aria-hidden="true">└</span>
                <input :value="s.name" aria-label="Nombre de la sección" @change="updateSection(s, { name: $event.target.value })" />
              </div>
            </td>
            <td>
              <select
                :value="s.parent_id ?? ''"
                :aria-label="`Sección de la que depende ${s.name}`"
                @change="updateSection(s, { parent_id: $event.target.value ? Number($event.target.value) : null })"
              >
                <option value="">— Ninguna (nivel superior)</option>
                <option v-for="p in session.sections.filter((x) => x.id !== s.id)" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </td>
            <td class="num">{{ s.members }}</td>
            <td class="num"><button class="btn small danger" :disabled="s.members > 0" :title="s.members ? 'Tiene personas asignadas' : ''" @click="deleteSection(s)">Eliminar</button></td>
          </tr>
        </tbody>
      </table>
      </div>
    </section>

    <!-- Tipos -->
    <section v-if="tab === 'tipos'" class="stack">
      <p class="muted small">
        «Descuenta vacaciones» resta del saldo acumulable. «Cupo por ciclo» es un máximo por ciclo (sep–ago) que no se acumula.
        «Cuenta como ausencia» decide si suma en el contador del cuadrante.
      </p>
      <form v-for="(t, i) in session.types" :key="t.id ?? `new-${i}`" class="card type-card" @submit.prevent="saveType(t)">
        <div class="type-head">
          <input v-model="t.color" type="color" aria-label="Color" />
          <input v-model="t.name" placeholder="Nombre" required aria-label="Nombre" />
          <span class="preview" :style="{ '--c': t.color }">Ana · {{ t.name || 'Ejemplo' }}</span>
        </div>
        <div class="grid-2">
          <label class="field">Cómputo
            <select v-model="t.count_mode">
              <option value="natural">Días naturales</option>
              <option value="laborable">Días laborables (L–V)</option>
            </select>
          </label>
          <label class="field">Cupo por ciclo (vacío = sin límite)
            <input v-model="t.annual_quota" type="number" min="0" step="0.5" />
          </label>
        </div>
        <div class="row checks">
          <label class="check"><input v-model="t.deducts_vacation" type="checkbox" /> Descuenta vacaciones</label>
          <label class="check"><input v-model="t.is_absence" type="checkbox" /> Cuenta como ausencia</label>
          <label class="check"><input v-model="t.allows_hours" type="checkbox" /> Permite horas</label>
          <label class="check" title="Los compañeros ven «Ausencia» sin el motivo; lo ven la persona, quien aprueba y RRHH">
            <input v-model="t.is_private" type="checkbox" /> Motivo privado
          </label>
          <label class="check"><input v-model="t.active" type="checkbox" /> Activo</label>
          <span class="spacer" />
          <button class="btn primary small">Guardar</button>
        </div>
      </form>
      <div><button class="btn" @click="addType">+ Nuevo tipo</button></div>
    </section>

    <!-- Festivos -->
    <section v-if="tab === 'festivos'" class="card stack">
      <div class="row">
        <button class="btn icon" aria-label="Año anterior" @click="year--">‹</button>
        <h2 class="year">{{ year }}</h2>
        <button class="btn icon" aria-label="Año siguiente" @click="year++">›</button>
        <span class="spacer" />
        <button class="btn primary" @click="suggest">Importar festivos de {{ year }}…</button>
      </div>
      <p class="muted small">
        Los festivos no cuentan en los tipos de ausencia que se computan en días laborables (asuntos propios, médico…).
        Las vacaciones son días naturales y los incluyen. Revisa cada año el calendario oficial (DOGV) y los días de convenio.
      </p>

      <p v-if="!yearHolidays.length" class="notice warn">No hay festivos definidos para {{ year }}.</p>
      <div v-else class="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Festivo</th><th>Ámbito</th><th /></tr></thead>
          <tbody>
            <tr v-for="h in yearHolidays" :key="h.date">
              <td>{{ dmy(h.date) }}</td>
              <td>{{ h.name }}</td>
              <td class="muted">{{ SCOPE_LABELS[h.scope] }}</td>
              <td class="num"><button class="btn small danger" @click="deleteHoliday(h)">Quitar</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <form class="holiday-form" @submit.prevent="addHoliday">
        <input v-model="newHoliday.date" type="date" required aria-label="Fecha" />
        <input v-model="newHoliday.name" placeholder="Nombre (p. ej. 24 de diciembre por convenio)" required aria-label="Nombre" />
        <select v-model="newHoliday.scope" aria-label="Ámbito">
          <option v-for="(label, key) in SCOPE_LABELS" :key="key" :value="key">{{ label }}</option>
        </select>
        <button class="btn">Añadir</button>
      </form>
    </section>

    <!-- Diálogo importación de festivos -->
    <AppDialog :open="!!suggestions" :title="`Festivos propuestos para ${year}`" @close="suggestions = null">
      <form v-if="suggestions" class="stack" @submit.prevent="importSelected">
        <p v-if="suggestions.warning" class="notice warn">{{ suggestions.warning }}</p>
        <p class="muted small">
          Fuente: <b>{{ suggestions.source }}</b>. Marca los que apliquen y corrige el nombre si hace falta.
        </p>
        <div class="table-wrap">
          <table class="small">
            <tbody>
              <tr v-for="h in suggestions.items" :key="h.date">
                <td><input v-model="h.selected" type="checkbox" :aria-label="`Incluir ${h.name}`" /></td>
                <td>{{ dmy(h.date) }}</td>
                <td><input v-model="h.name" aria-label="Nombre" /></td>
                <td class="muted">
                  {{ SCOPE_LABELS[h.scope] }}
                  <span v-if="h.origin === 'oficial'" class="badge aprobada">oficial</span>
                  <span v-else-if="h.origin !== 'fijo'" class="badge pendiente" title="Fuente no oficial: compruébalo en el DOGV">verificar</span>
                  <div v-if="h.exists">ya guardado</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="row">
          <span class="spacer" />
          <button type="button" class="btn" @click="suggestions = null">Cancelar</button>
          <button class="btn primary" :disabled="!suggestions.items.some((h) => h.selected)">
            Guardar {{ suggestions.items.filter((h) => h.selected).length }} festivos
          </button>
        </div>
      </form>
    </AppDialog>

    <!-- Diálogo usuario -->
    <AppDialog :open="!!editing" :title="editing?.id ? 'Editar usuario' : 'Nuevo usuario'" @close="editing = null">
      <form v-if="editing" class="stack" @submit.prevent="saveUser">
        <div class="grid-2">
          <label class="field">Nombre <input v-model="editing.name" required /></label>
          <label class="field">Correo <input v-model="editing.email" type="email" required /></label>
          <label class="field">Rol
            <select v-model="editing.role">
              <option v-for="(label, key) in ROLE_LABELS" :key="key" :value="key">{{ label }}</option>
            </select>
          </label>
          <label class="field">Sección
            <select v-model="editing.section_id">
              <option :value="null">Sin sección</option>
              <option v-for="s in session.sections" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </label>
          <label class="field">Fecha de incorporación <input v-model="editing.hire_date" type="date" required /></label>
          <label class="field">Fecha de baja <input v-model="editing.termination_date" type="date" /></label>
          <label class="field">Computar saldo desde (vacío = desde la incorporación)
            <input v-model="editing.balance_from" type="date" />
          </label>
          <label class="field">Saldo inicial (días que traía a esa fecha)
            <input v-model="editing.initial_balance" type="number" step="0.5" />
          </label>
          <label class="field">{{ editing.id ? 'Nueva contraseña (opcional)' : 'Contraseña' }}
            <input v-model="editing.password" type="password" minlength="8" :required="!editing.id" autocomplete="new-password" />
          </label>
        </div>
        <label class="check"><input v-model="editing.active" type="checkbox" /> Activo</label>
        <p class="muted small">
          Los días se generan desde la incorporación (30 por ciclo sep–ago, proporcional al tiempo trabajado).
          Para plantilla que ya existía antes de usar esta aplicación: indica en «Computar saldo desde» el inicio del
          ciclo actual (p. ej. 01/09/2026) y en «Saldo inicial» los días que le quedaban de ciclos anteriores.
        </p>
        <div class="row"><span class="spacer" /><button class="btn primary">Guardar</button></div>
      </form>
    </AppDialog>

    <!-- Diálogo saldo -->
    <AppDialog :open="!!balanceOf" :title="`Saldo de ${balanceOf?.user.name ?? ''}`" @close="balanceOf = null">
      <div v-if="balanceOf" class="stack">
        <BalanceSummary :balance="balanceOf.data" />
        <form class="stack card" @submit.prevent="saveAdjustment">
          <h3>Ajuste manual</h3>
          <div class="grid-2">
            <label class="field">Días (+ suma, − resta)
              <input v-model="adjustment.days" type="number" step="0.5" required />
            </label>
            <label class="field">Motivo <input v-model="adjustment.reason" required /></label>
          </div>
          <div class="row"><span class="spacer" /><button class="btn primary small">Añadir ajuste</button></div>
        </form>
        <table v-if="balanceOf.data.adjustments.length" class="small">
          <thead><tr><th>Fecha</th><th class="num">Días</th><th>Motivo</th><th>Por</th></tr></thead>
          <tbody>
            <tr v-for="a in balanceOf.data.adjustments" :key="a.id">
              <td>{{ new Date(a.created_at).toLocaleDateString('es-ES') }}</td>
              <td class="num">{{ a.days > 0 ? '+' : '' }}{{ num(a.days) }}</td>
              <td>{{ a.reason }}</td>
              <td class="muted">{{ a.created_by_name }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppDialog>
  </div>
</template>

<style scoped>
.grow { flex: 1; width: auto; }
tr.inactive td { opacity: .55; }
.row-actions { white-space: nowrap; }
.row-actions .btn + .btn { margin-left: 4px; }
.type-card { display: grid; gap: 12px; }
.type-head { display: grid; grid-template-columns: 52px 1fr auto; gap: 10px; align-items: center; }
/* Misma apariencia que las barras del calendario */
.preview {
  padding: 5px 12px; border-radius: 8px; font-size: .8rem; font-weight: 700; white-space: nowrap;
  color: color-mix(in srgb, var(--c) 40%, var(--text));
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--c) var(--tint-a), var(--surface)), color-mix(in srgb, var(--c) var(--tint-b), var(--surface)));
  box-shadow: inset 3px 0 0 var(--c);
}
.checks { gap: 16px; }
.tree-name { display: flex; align-items: center; gap: 6px; padding-left: calc(var(--depth) * 22px); }
.tree-branch { color: var(--muted); }
.year { margin: 0 6px; font-variant-numeric: tabular-nums; }
.holiday-form { display: grid; grid-template-columns: 160px 1fr 190px auto; gap: 8px; }
@media (max-width: 720px) { .holiday-form { grid-template-columns: 1fr; } }
@media (max-width: 560px) { .type-head { grid-template-columns: 52px 1fr; } .preview { grid-column: 1 / -1; } }
</style>
