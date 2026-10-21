<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import DecisionBox from '../components/DecisionBox.vue';
import CancelBox from '../components/CancelBox.vue';
import { api, download } from '../api.js';
import { cycleOf, todayStr } from '@shared/dates.js';
import { session } from '../store.js';
import { amount, dmy, num, range, short, STATUS_LABELS, wholeDays } from '../format.js';

const isAdmin = computed(() => session.user?.role === 'admin');

// Exportación (por defecto, el ciclo de vacaciones actual)
const cycle = cycleOf(todayStr());
const exportFrom = ref(cycle.start);
const exportTo = ref(cycle.end);
const exportSection = ref('');
// Si «Desde» pasa de «Hasta» (escrita a mano, el selector ya lo impide), «Hasta» se mueve a ese mismo día
watch(exportFrom, (from) => { if (from && exportTo.value && from > exportTo.value) exportTo.value = from; });
const exporting = ref(false);

async function runExport(path, filename) {
  error.value = '';
  exporting.value = true;
  try {
    await download(path, filename);
  } catch (e) {
    error.value = e.message;
  } finally {
    exporting.value = false;
  }
}
const sectionQs = () => (exportSection.value ? `section=${exportSection.value}` : '');
const exportBalances = () => runExport(`/export/saldos.csv?${sectionQs()}`, `saldos_${todayStr()}.csv`);
const exportRequests = () => runExport(
  `/export/solicitudes.csv?from=${exportFrom.value}&to=${exportTo.value}&${sectionQs()}`,
  `solicitudes_${exportFrom.value}_${exportTo.value}.csv`,
);
const tab = ref('pendientes');
const pending = ref([]);
const history = ref([]);
const team = ref([]);
const error = ref('');

async function load() {
  error.value = '';
  try {
    if (tab.value === 'pendientes') pending.value = await api('/requests/review');
    // La lista es la misma consulta que descarga el CSV: periodo y sección
    if (tab.value === 'historial' && exportFrom.value && exportTo.value && exportTo.value >= exportFrom.value) {
      history.value = await api(`/requests/review?status=historial&from=${exportFrom.value}&to=${exportTo.value}&${sectionQs()}`);
    }
    if (tab.value === 'equipo') team.value = await api(`/team?${sectionQs()}`);
  } catch (e) {
    error.value = e.message;
  }
}
watch([tab, exportFrom, exportTo, exportSection], load);
onMounted(load);

const calendarLink = (r) => ({
  path: '/calendario',
  query: { month: r.start_date.slice(0, 7), highlight: r.id, ...(r.group_id ? { section: r.group_id } : {}) },
});
</script>

<template>
  <div class="page stack">
    <h1>Revisar solicitudes</h1>
    <div class="tabs" role="tablist">
      <button role="tab" :aria-selected="tab === 'pendientes'" @click="tab = 'pendientes'">
        Pendientes<template v-if="pending.length"> ({{ pending.length }})</template>
      </button>
      <button role="tab" :aria-selected="tab === 'historial'" @click="tab = 'historial'">Historial</button>
      <button role="tab" :aria-selected="tab === 'equipo'" @click="tab = 'equipo'">Saldos del equipo</button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <template v-if="tab === 'pendientes'">
      <div v-if="!pending.length" class="card empty">
        <span class="empty-icon" aria-hidden="true">✓</span>
        <h2>Todo al día</h2>
        <p class="muted">No hay solicitudes pendientes de revisar.</p>
      </div>
      <article
        v-for="(r, i) in pending"
        :key="r.id"
        class="card review"
        :style="{ '--c': r.color, animationDelay: `${i * 60}ms` }"
      >
        <div class="stack info">
          <div class="row">
            <span class="dot" :style="{ '--c': r.color }" />
            <b>{{ r.user_name }}</b>
            <span class="muted">· {{ r.type_name }}</span>
            <span v-if="r.section_name" class="badge">{{ r.section_name }}</span>
            <span v-if="r.is_advance" class="badge pendiente" title="A cuenta de lo generado este ciclo, aún no consolidado">anticipo</span>
          </div>
          <div>{{ range(r) }} · <b>{{ amount(r) }}</b></div>
          <div v-if="r.vacation" class="small" :class="r.vacation.available < 0 ? 'error' : 'muted'">
            Saldo de vacaciones tras esta solicitud: {{ r.vacation.usable }} días
            (total {{ wholeDays(r.vacation.total) }}, disfrutados {{ num(r.vacation.used) }})
          </div>
          <div v-if="r.comment" class="notice small">{{ r.comment }}</div>

          <div class="small">
            <template v-if="r.overlaps.length">
              <b>{{ r.overlaps.length }}</b> {{ r.overlaps.length === 1 ? 'ausencia coincide' : 'ausencias coinciden' }} en {{ r.group_name ?? 'el grupo' }}:
              <ul class="overlaps">
                <li v-for="o in r.overlaps" :key="o.id">
                  <span class="dot" :style="{ '--c': o.color }" /> {{ o.user_name }} — {{ o.type_name }},
                  {{ short(o.start_date) }}–{{ short(o.end_date) }}
                  <span v-if="o.status === 'pendiente'" class="badge pendiente">pendiente</span>
                </li>
              </ul>
            </template>
            <span v-else class="muted">Nadie más de {{ r.group_name ?? 'su grupo' }} está fuera esos días.</span>
          </div>
          <RouterLink :to="calendarLink(r)" class="small">Ver en el calendario →</RouterLink>
        </div>
        <DecisionBox class="actions" :request-id="r.id" @decided="load" />
      </article>
    </template>

    <section v-if="tab === 'historial'" class="card export-row">
      <label class="field">Desde <input v-model="exportFrom" type="date" :max="exportTo" required /></label>
      <label class="field">Hasta <input v-model="exportTo" type="date" :min="exportFrom" required /></label>
      <label v-if="isAdmin" class="field">Sección
        <select v-model="exportSection">
          <option value="">Todas</option>
          <option v-for="s in session.sections" :key="s.id" :value="String(s.id)">{{ s.name }}</option>
        </select>
      </label>
      <button class="btn" :disabled="exporting || !exportFrom || !exportTo" @click="exportRequests">⬇ Exportar CSV</button>
    </section>
    <section v-if="tab === 'historial'" class="card table-wrap">
      <table class="cards history-table">
        <thead>
          <tr>
            <th>Persona</th><th>Motivo</th><th>Fechas</th><th class="num">Duración</th><th>Estado</th><th>Revisó</th>
            <th v-if="isAdmin" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in history" :key="r.id" class="h-row">
            <td class="c-person">{{ r.user_name }}</td>
            <td class="c-type"><span class="row"><span class="dot" :style="{ '--c': r.color }" />{{ r.type_name }}</span></td>
            <td class="c-dates">{{ range(r) }}</td>
            <td class="num c-amount">{{ amount(r) }}</td>
            <td class="c-status">
              <span class="badge" :class="r.status">{{ STATUS_LABELS[r.status] }}</span>
              <span v-if="r.is_advance" class="badge">anticipo</span>
            </td>
            <td class="small c-who">
              <span v-if="r.reviewer_name" class="rev">{{ r.reviewer_name }}</span><div v-if="r.review_comment" class="muted">{{ r.review_comment }}</div>
              <div v-if="r.interrupted_by_name" class="cancel-info">
                Interrumpida por {{ r.interrupted_by_name }} (estaba hasta el {{ dmy(r.original_end_date) }})<template
                  v-if="r.interrupt_reason">: «{{ r.interrupt_reason }}»</template>
              </div>
              <div v-if="r.cancelled_by_name" class="cancel-info">
                {{ r.cancelled_by === r.user_id ? 'Cancelada por la propia persona' : `Anulada por ${r.cancelled_by_name}` }}
                <template v-if="r.cancel_reason">: «{{ r.cancel_reason }}»</template>
              </div>
            </td>
            <td v-if="isAdmin" class="num cancel-cell c-actions">
              <CancelBox v-if="r.status === 'aprobada'" :request-id="r.id" @cancelled="load" />
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="tab === 'equipo'" class="card export-row">
      <label v-if="isAdmin" class="field">Sección
        <select v-model="exportSection">
          <option value="">Todas</option>
          <option v-for="s in session.sections" :key="s.id" :value="String(s.id)">{{ s.name }}</option>
        </select>
      </label>
      <button class="btn" :disabled="exporting" @click="exportBalances">⬇ Exportar CSV</button>
    </section>

    <section v-if="tab === 'equipo'" class="card table-wrap">
      <table class="cards team-table">
        <thead>
          <tr>
            <th>Persona</th><th>Sección</th><th>Alta</th>
            <th class="num">Generados</th><th class="num">Disfrutados</th><th class="num">Pendientes</th><th class="num">Disponibles</th>
            <th>Otros cupos</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in team" :key="u.id" class="t-row">
            <td class="c-person">{{ u.name }}</td>
            <td class="muted c-section">{{ u.section_name }}</td>
            <td class="muted small c-hire" data-label="Alta">{{ short(u.hire_date) }} {{ u.hire_date.slice(0, 4) }}</td>
            <td class="num c-gen" data-label="Acumulados">{{ wholeDays(u.balance.vacation.total) }}</td>
            <td class="num c-used" data-label="Disfrutados">{{ num(u.balance.vacation.used) }}</td>
            <td class="num c-pend" data-label="Pendientes">{{ num(u.balance.vacation.pending) }}</td>
            <td class="num c-avail" data-label="Disponibles"><b>{{ u.balance.vacation.usable }}</b></td>
            <td class="small c-quotas">
              <div v-for="qt in u.balance.quotas" :key="qt.type_id">{{ qt.name }}: {{ num(qt.available) }}/{{ num(qt.quota) }}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.review {
  display: grid; grid-template-columns: 1fr 280px; gap: 20px; position: relative; overflow: hidden;
  animation: card-in .45s var(--ease-out) both;
  transition: transform .2s var(--ease-out), box-shadow .2s;
}
.review:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); }
.review::before { /* franja con el color del motivo */
  content: ''; position: absolute; inset: 0 auto 0 0; width: 4px;
  background: linear-gradient(180deg, var(--c), color-mix(in srgb, var(--c) 40%, transparent));
}
@keyframes card-in { from { opacity: 0; transform: translateY(10px); } }
.info { gap: 8px; }
.overlaps { margin: 4px 0 0; padding-left: 4px; list-style: none; display: grid; gap: 2px; }
.overlaps li { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.export-row { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
.export-row .field { width: 180px; }
.cancel-cell { min-width: 120px; text-align: right; }
.cancel-cell :deep(.cancel-box) { text-align: left; min-width: 260px; }
.empty { display: grid; justify-items: center; text-align: center; padding: 40px 20px; gap: 4px; }
.empty h2 { margin: 8px 0 0; }
.empty p { margin: 0; }
.empty-icon {
  display: grid; place-items: center; width: 56px; height: 56px; border-radius: 18px; font-size: 1.6rem;
  color: #fff; background: linear-gradient(135deg, #22a37c, #4cc79f);
  box-shadow: 0 10px 24px -10px rgb(34 163 124 / 80%);
  animation: pop-in .6s var(--ease-out) both;
}
@keyframes pop-in { from { transform: scale(.4) rotate(-20deg); opacity: 0; } }
@media (max-width: 720px) { .review { grid-template-columns: 1fr; } }

/* ---- Móvil: cada fila del historial y de los saldos es una tarjeta (la misma tabla, otra disposición) ---- */
@media (max-width: 640px) {
  .export-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .export-row .field { width: auto; }
  .export-row .field:has(select), .export-row .btn { grid-column: 1 / -1; }

  table.cards, table.cards tbody { display: block; }
  table.cards thead { display: none; }
  table.cards td { display: block; padding: 0; border: 0; text-align: left; }
  table.cards tr {
    display: grid; gap: 4px 10px; padding: 14px; margin-bottom: 10px; border-radius: 14px;
    background: var(--surface-2); border: 1px solid var(--border);
  }
  table.cards tr:hover { background: var(--surface-2); }

  .history-table tr {
    grid-template-columns: 1fr auto;
    grid-template-areas: "type status" "person person" "dates amount" "who who" "actions actions";
  }
  .history-table .c-type { grid-area: type; font-weight: 600; }
  .history-table .c-status { grid-area: status; text-align: right; }
  .history-table .c-person { grid-area: person; font-weight: 700; font-size: 1.02rem; }
  .history-table .c-dates { grid-area: dates; color: var(--muted); }
  .history-table .c-amount { grid-area: amount; text-align: right; font-weight: 600; }
  .history-table .c-who { grid-area: who; }
  .history-table .rev::before { content: 'Revisó: '; color: var(--muted); } /* en escritorio lo dice la columna */
  .history-table .c-who:empty { display: none; }
  .history-table .c-actions { grid-area: actions; text-align: right; }

  .team-table tr {
    grid-template-columns: 1fr 1fr 1fr;
    grid-template-areas: "person person avail" "section hire avail" "gen used pend" "quotas quotas quotas";
  }
  .team-table .c-person { grid-area: person; font-weight: 700; font-size: 1.02rem; }
  .team-table .c-section { grid-area: section; }
  .team-table .c-hire { grid-area: hire; }
  .team-table .c-avail { grid-area: avail; text-align: right; font-size: 1.6rem; line-height: 1.1; }
  .team-table .c-gen { grid-area: gen; }
  .team-table .c-used { grid-area: used; }
  .team-table .c-pend { grid-area: pend; }
  .team-table .c-quotas { grid-area: quotas; color: var(--muted); }
  .team-table td[data-label]::before {
    content: attr(data-label); display: block; font-size: .66rem; font-weight: 700; letter-spacing: .05em;
    text-transform: uppercase; color: var(--muted);
  }
  .team-table .c-gen, .team-table .c-used, .team-table .c-pend { padding-top: 8px; border-top: 1px dashed var(--border); }
}
</style>
