<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { todayStr, maxDate } from '@shared/dates.js';
import { accrualByCycle, splitAccrual } from '@shared/accrual.js';
import AppDialog from '../components/AppDialog.vue';
import BalanceSummary from '../components/BalanceSummary.vue';
import { api, refreshHolidays } from '../api.js';
import { session, ROLE_LABELS } from '../store.js';
import { num, dmy, wholeDays } from '../format.js';

const tab = ref('usuarios');
const error = ref('');
const notice = ref('');

const users = ref([]);
const editing = ref(null);       // usuario en edición (copia)
const balanceOf = ref(null);     // { user, data }
// En el móvil las tablas solo muestran el nombre: al pulsarlo se abre una ficha con el resto
const viewingUser = ref(null);
const viewingSection = ref(null);
const viewingHoliday = ref(null);
const openType = ref(null);      // tipo desplegado en el móvil (índice)
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

/** Vista previa del saldo con los datos de la ficha (misma regla que el servidor; sin lo disfrutado ni ajustes) */
const preview = computed(() => {
  const u = editing.value;
  if (!u?.hire_date) return null;
  const from = u.balance_from ? maxDate(u.hire_date, u.balance_from) : u.hire_date;
  const { accrued, accruing } = splitAccrual(accrualByCycle({
    hireDate: from,
    terminationDate: u.termination_date || null,
    asOf: maxDate(todayStr(), from),
    daysPerYear: session.config?.vacationDaysPerYear ?? 30,
  }));
  const initial = Number(u.initial_balance) || 0;
  return { accrued, initial, total: Math.round((accrued + initial) * 100) / 100, accruing };
});

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

/** Desde la ficha del móvil: se cierra y se abre la acción */
function sheetEdit() { const u = viewingUser.value; viewingUser.value = null; editUser(u); }
function sheetBalance() { const u = viewingUser.value; viewingUser.value = null; openBalance(u); }

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
  viewingSection.value = null;
  await loadSections();
});
/** La ficha del móvil se rehace desde el árbol al recargar, para mostrar lo guardado */
watch(sectionTree, (tree) => {
  if (viewingSection.value) viewingSection.value = tree.find((x) => x.id === viewingSection.value.id) ?? null;
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
  viewingHoliday.value = null;
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
          <thead class="d-only"><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Sección</th><th>Alta</th><th /></tr></thead>
          <tbody>
            <tr v-for="u in users" :key="u.id" :class="{ inactive: !u.active }">
              <td class="m-only">
                <button class="m-row" @click="viewingUser = u">
                  {{ u.name }}<span v-if="!u.active" class="badge">inactivo</span><span class="chev" aria-hidden="true">›</span>
                </button>
              </td>
              <td class="d-only">{{ u.name }}<span v-if="!u.active" class="badge">inactivo</span></td>
              <td class="d-only small">{{ u.email }}</td>
              <td class="d-only">{{ ROLE_LABELS[u.role] }}</td>
              <td class="d-only">{{ u.section_name ?? '—' }}</td>
              <td class="d-only small">{{ dmy(u.hire_date) }}<div v-if="u.termination_date" class="muted">baja {{ dmy(u.termination_date) }}</div></td>
              <td class="d-only num row-actions">
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
        <thead class="d-only"><tr><th>Nombre</th><th>Depende de</th><th class="num">Personas</th><th /></tr></thead>
        <tbody>
          <tr v-for="s in sectionTree" :key="s.id">
            <td class="m-only">
              <button class="m-row" :style="{ '--depth': s.depth }" @click="viewingSection = s">
                <span class="m-tree"><span v-if="s.depth" class="tree-branch" aria-hidden="true">└ </span>{{ s.name }}</span>
                <span class="muted small">{{ s.members }}</span><span class="chev" aria-hidden="true">›</span>
              </button>
            </td>
            <td class="d-only">
              <div class="tree-name" :style="{ '--depth': s.depth }">
                <span v-if="s.depth" class="tree-branch" aria-hidden="true">└</span>
                <input :value="s.name" aria-label="Nombre de la sección" @change="updateSection(s, { name: $event.target.value })" />
              </div>
            </td>
            <td class="d-only">
              <select
                :value="s.parent_id ?? ''"
                :aria-label="`Sección de la que depende ${s.name}`"
                @change="updateSection(s, { parent_id: $event.target.value ? Number($event.target.value) : null })"
              >
                <option value="">— Ninguna (nivel superior)</option>
                <option v-for="p in session.sections.filter((x) => x.id !== s.id)" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </td>
            <td class="d-only num">{{ s.members }}</td>
            <td class="d-only num"><button class="btn small danger" :disabled="s.members > 0" :title="s.members ? 'Tiene personas asignadas' : ''" @click="deleteSection(s)">Eliminar</button></td>
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
      <form
        v-for="(t, i) in session.types" :key="t.id ?? `new-${i}`"
        class="card type-card" :class="{ open: openType === i || !t.id }" @submit.prevent="saveType(t)"
      >
        <button type="button" class="m-row m-only-block type-toggle" :aria-expanded="openType === i" @click="openType = openType === i ? null : i">
          <span class="dot" :style="{ '--c': t.color }" />{{ t.name || 'Nuevo tipo' }}
          <span v-if="!t.active" class="badge">inactivo</span><span class="chev" aria-hidden="true">›</span>
        </button>
        <div class="type-head">
          <input v-model="t.color" type="color" aria-label="Color" />
          <input v-model="t.name" placeholder="Nombre" required aria-label="Nombre" />
          <span class="preview" :style="{ '--c': t.color }">Ana · {{ t.name || 'Ejemplo' }}</span>
        </div>
        <div class="grid-2 type-body">
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
        <div class="row checks type-body">
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
          <thead class="d-only"><tr><th>Fecha</th><th>Festivo</th><th>Ámbito</th><th /></tr></thead>
          <tbody>
            <tr v-for="h in yearHolidays" :key="h.date">
              <td class="m-only">
                <button class="m-row" @click="viewingHoliday = h">
                  <span class="m-date">{{ dmy(h.date).slice(0, 5) }}</span>{{ h.name }}<span class="chev" aria-hidden="true">›</span>
                </button>
              </td>
              <td class="d-only">{{ dmy(h.date) }}</td>
              <td class="d-only">{{ h.name }}</td>
              <td class="d-only muted">{{ SCOPE_LABELS[h.scope] }}</td>
              <td class="d-only num"><button class="btn small danger" @click="deleteHoliday(h)">Quitar</button></td>
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
          <label class="field">Saldo inicial (días pendientes de disfrutar a esa fecha)
            <input v-model="editing.initial_balance" type="number" step="0.5" />
          </label>
          <label class="field">{{ editing.id ? 'Nueva contraseña (opcional)' : 'Contraseña' }}
            <input v-model="editing.password" type="password" minlength="8" :required="!editing.id" autocomplete="new-password" />
          </label>
        </div>
        <label class="check"><input v-model="editing.active" type="checkbox" /> Activo</label>
        <p v-if="preview" class="notice">
          Hoy tendrá <b>{{ wholeDays(preview.total) }} días</b> para pedir ({{ num(preview.accrued) }} generados en ciclos
          cerrados + {{ num(preview.initial) }} de saldo inicial; los decimales se acumulan).
          <template v-if="preview.accruing">
            Este ciclo ({{ preview.accruing.label }}) lleva generados {{ num(preview.accruing.days) }}, que podrá pedir desde
            el {{ dmy(preview.accruing.available_from) }}.
          </template>
          <span class="muted small">Sin contar lo ya disfrutado ni los ajustes.</span>
        </p>
        <p class="muted small">
          Los días se generan día a día desde la incorporación (30 por ciclo sep–ago) y se pueden disfrutar a partir
          del ciclo siguiente. Para plantilla que ya existía antes de usar esta aplicación: indica en «Computar saldo
          desde» el inicio del ciclo actual (p. ej. 01/09/2026) y en «Saldo inicial» los días que tiene para disfrutar
          ahora (lo generado en ciclos anteriores y aún no disfrutado).
        </p>
        <div class="row"><span class="spacer" /><button class="btn primary">Guardar</button></div>
      </form>
    </AppDialog>

    <!-- Fichas del móvil -->
    <AppDialog :open="!!viewingUser" :title="viewingUser?.name ?? ''" @close="viewingUser = null">
      <div v-if="viewingUser" class="stack">
        <dl class="sheet">
          <dt>Correo</dt><dd>{{ viewingUser.email }}</dd>
          <dt>Rol</dt><dd>{{ ROLE_LABELS[viewingUser.role] }}</dd>
          <dt>Sección</dt><dd>{{ viewingUser.section_name ?? '—' }}</dd>
          <dt>Alta</dt><dd>{{ dmy(viewingUser.hire_date) }}</dd>
          <template v-if="viewingUser.termination_date"><dt>Baja</dt><dd>{{ dmy(viewingUser.termination_date) }}</dd></template>
          <dt>Estado</dt><dd>{{ viewingUser.active ? 'Activo' : 'Inactivo' }}</dd>
        </dl>
        <div class="row">
          <span class="spacer" />
          <button class="btn" @click="sheetBalance">Saldo</button>
          <button class="btn primary" @click="sheetEdit">Editar</button>
        </div>
      </div>
    </AppDialog>

    <AppDialog :open="!!viewingSection" :title="viewingSection?.name ?? ''" @close="viewingSection = null">
      <div v-if="viewingSection" class="stack">
        <label class="field">Nombre
          <input :value="viewingSection.name" @change="updateSection(viewingSection, { name: $event.target.value })" />
        </label>
        <label class="field">Depende de
          <select
            :value="viewingSection.parent_id ?? ''"
            @change="updateSection(viewingSection, { parent_id: $event.target.value ? Number($event.target.value) : null })"
          >
            <option value="">— Ninguna (nivel superior)</option>
            <option v-for="p in session.sections.filter((x) => x.id !== viewingSection.id)" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <p class="muted small">{{ viewingSection.members }} {{ viewingSection.members === 1 ? 'persona' : 'personas' }} en esta sección.</p>
        <div class="row">
          <span class="spacer" />
          <button class="btn danger" :disabled="viewingSection.members > 0" @click="deleteSection(viewingSection)">Eliminar</button>
        </div>
      </div>
    </AppDialog>

    <AppDialog :open="!!viewingHoliday" :title="viewingHoliday?.name ?? ''" @close="viewingHoliday = null">
      <div v-if="viewingHoliday" class="stack">
        <dl class="sheet">
          <dt>Fecha</dt><dd>{{ dmy(viewingHoliday.date) }}</dd>
          <dt>Ámbito</dt><dd>{{ SCOPE_LABELS[viewingHoliday.scope] }}</dd>
        </dl>
        <div class="row"><span class="spacer" /><button class="btn danger" @click="deleteHoliday(viewingHoliday)">Quitar</button></div>
      </div>
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

/* ---- Móvil: listas con solo el nombre; el detalle va en una ficha o se despliega ---- */
.m-row {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 12px 4px; border: 0; background: none;
  font: inherit; font-weight: 600; color: var(--text); text-align: left; cursor: pointer;
}
/* Detrás de .m-row: con el mismo peso gana la última regla, y en escritorio tienen que ocultarse */
.m-only, .m-only-block { display: none; }
.m-row .chev { margin-left: auto; font-size: 1.3rem; line-height: 1; color: var(--muted); transition: transform .25s var(--ease-out); }
.m-row .muted { margin-left: auto; }
.m-row .muted + .chev { margin-left: 4px; }
.m-tree { padding-left: calc(var(--depth) * 16px); }
.m-date { min-width: 46px; color: var(--muted); font-variant-numeric: tabular-nums; font-weight: 500; }
.sheet { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; margin: 0; }
.sheet dt { color: var(--muted); font-size: .85rem; font-weight: 600; }
.sheet dd { margin: 0; overflow-wrap: anywhere; }
@media (max-width: 640px) {
  .d-only { display: none; }
  td.m-only { display: table-cell; padding: 0 8px; }
  .m-only-block { display: flex; }
  /* Tipos: plegados; al pulsar se despliegan con su formulario */
  .type-card { padding: 4px 16px; gap: 0; }
  .type-card:not(.open) .type-head, .type-card:not(.open) .type-body { display: none; }
  .type-card.open { padding-bottom: 16px; gap: 12px; }
  .type-card.open .chev { transform: rotate(90deg); }
  .type-toggle .dot { margin-right: 2px; }
}
</style>
