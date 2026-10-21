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
    if (tab.value === 'historial') history.value = await api('/requests/review?status=historial');
    if (tab.value === 'equipo') team.value = await api('/team');
  } catch (e) {
    error.value = e.message;
  }
}
watch(tab, load);
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
      <label class="field">Desde <input v-model="exportFrom" type="date" required /></label>
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
      <table>
        <thead>
          <tr>
            <th>Persona</th><th>Motivo</th><th>Fechas</th><th class="num">Duración</th><th>Estado</th><th>Revisó</th>
            <th v-if="isAdmin" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in history" :key="r.id">
            <td>{{ r.user_name }}</td>
            <td><span class="row"><span class="dot" :style="{ '--c': r.color }" />{{ r.type_name }}</span></td>
            <td>{{ range(r) }}</td>
            <td class="num">{{ amount(r) }}</td>
            <td>
              <span class="badge" :class="r.status">{{ STATUS_LABELS[r.status] }}</span>
              <span v-if="r.is_advance" class="badge">anticipo</span>
            </td>
            <td class="small">
              {{ r.reviewer_name }}<div v-if="r.review_comment" class="muted">{{ r.review_comment }}</div>
              <div v-if="r.interrupted_by_name" class="cancel-info">
                Interrumpida por {{ r.interrupted_by_name }} (estaba hasta el {{ dmy(r.original_end_date) }})<template
                  v-if="r.interrupt_reason">: «{{ r.interrupt_reason }}»</template>
              </div>
              <div v-if="r.cancelled_by_name" class="cancel-info">
                {{ r.cancelled_by === r.user_id ? 'Cancelada por la propia persona' : `Anulada por ${r.cancelled_by_name}` }}
                <template v-if="r.cancel_reason">: «{{ r.cancel_reason }}»</template>
              </div>
            </td>
            <td v-if="isAdmin" class="num cancel-cell">
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
      <table>
        <thead>
          <tr>
            <th>Persona</th><th>Sección</th><th>Alta</th>
            <th class="num">Generados</th><th class="num">Disfrutados</th><th class="num">Pendientes</th><th class="num">Disponibles</th>
            <th>Otros cupos</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in team" :key="u.id">
            <td>{{ u.name }}</td>
            <td class="muted">{{ u.section_name }}</td>
            <td class="muted small">{{ short(u.hire_date) }} {{ u.hire_date.slice(0, 4) }}</td>
            <td class="num">{{ wholeDays(u.balance.vacation.total) }}</td>
            <td class="num">{{ num(u.balance.vacation.used) }}</td>
            <td class="num">{{ num(u.balance.vacation.pending) }}</td>
            <td class="num"><b>{{ u.balance.vacation.usable }}</b></td>
            <td class="small">
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
</style>
