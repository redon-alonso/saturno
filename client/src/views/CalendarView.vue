<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { addDays, monthEnd, isoWeekday, todayStr } from '@shared/dates.js';
import MonthCalendar from '../components/MonthCalendar.vue';
import AppDialog from '../components/AppDialog.vue';
import RequestForm from '../components/RequestForm.vue';
import DecisionBox from '../components/DecisionBox.vue';
import CancelBox from '../components/CancelBox.vue';
import { api, refreshBalance } from '../api.js';
import { session } from '../store.js';
import { amount, range, STATUS_LABELS } from '../format.js';

const route = useRoute();
const router = useRouter();

const month = computed(() =>
  /^\d{4}-\d{2}$/.test(route.query.month ?? '') ? route.query.month : todayStr().slice(0, 7));
const section = computed(() => route.query.section ?? '');
const highlightId = computed(() => (route.query.highlight ? Number(route.query.highlight) : null));

const isAdmin = computed(() => session.user?.role === 'admin');
/** Grupos que el servidor deja ver: el propio y, para un jefe, el de su superior (con los otros jefes). */
const groups = ref([]);
const hasPrivate = computed(() => events.value.some((e) => e.is_private && e.type_id == null));

const events = ref([]);
const headcount = ref(0);
const error = ref('');
const loading = ref(false);
const showPending = ref(true);
const hiddenTypes = ref(new Set());
const slide = ref('slide-next');

const monthParts = computed(() => {
  const d = new Date(`${month.value}-01T00:00:00Z`);
  const name = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' }).format(d);
  return { name: name[0].toUpperCase() + name.slice(1), year: month.value.slice(0, 4) };
});

async function load({ clear = false } = {}) {
  loading.value = true;
  error.value = '';
  if (clear) events.value = [];
  try {
    // Cargar la rejilla completa (incluye días de los meses vecinos)
    const first = `${month.value}-01`;
    const from = addDays(first, 1 - isoWeekday(first));
    const last = monthEnd(first);
    const to = addDays(last, 7 - isoWeekday(last));
    const qs = new URLSearchParams({ from, to, ...(section.value ? { section: section.value } : {}) });
    const data = await api(`/calendar?${qs}`);
    events.value = data.events;
    headcount.value = data.headcount;
    groups.value = data.groups ?? [];
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
watch([month, section], () => load({ clear: true }), { immediate: true });

const visible = computed(() => events.value.filter((e) =>
  !hiddenTypes.value.has(e.type_id) && (showPending.value || e.status !== 'pendiente')));

/** Resumen del mes visible para la cabecera. */
const stats = computed(() => {
  const inMonth = visible.value.filter((e) => e.start_date.slice(0, 7) <= month.value && e.end_date.slice(0, 7) >= month.value);
  return {
    people: new Set(inMonth.filter((e) => e.is_absence && e.status === 'aprobada').map((e) => e.user_id)).size,
    pending: inMonth.filter((e) => e.status === 'pendiente').length,
  };
});

function go(delta) {
  slide.value = delta > 0 ? 'slide-next' : 'slide-prev';
  const [y, m] = month.value.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  router.replace({ query: { ...route.query, month: d.toISOString().slice(0, 7), highlight: undefined } });
}
function goToday() {
  slide.value = todayStr().slice(0, 7) > month.value ? 'slide-next' : 'slide-prev';
  router.replace({ query: { ...route.query, month: undefined, highlight: undefined } });
}
const setSection = (e) => router.replace({ query: { ...route.query, section: e.target.value || undefined } });

function toggleType(id) {
  const s = new Set(hiddenTypes.value);
  s.has(id) ? s.delete(id) : s.add(id);
  hiddenTypes.value = s;
}

// Diálogos
const newDate = ref(null);
const selected = ref(null);
// El servidor decide con la jerarquía quién puede aprobar cada ausencia
const canDecide = computed(() => selected.value?.status === 'pendiente' && selected.value.can_review);

async function onSaved() {
  newDate.value = null;
  await load();
}
async function onDecided() {
  selected.value = null;
  await Promise.all([load(), refreshBalance()]);
}
</script>

<template>
  <div class="page stack">
    <header class="cal-header">
      <div class="title-block">
        <div class="month-nav">
          <button class="btn icon" aria-label="Mes anterior" @click="go(-1)">‹</button>
          <h1 class="month" aria-live="polite">
            <Transition :name="slide" mode="out-in">
              <span :key="month">{{ monthParts.name }} <span class="year">{{ monthParts.year }}</span></span>
            </Transition>
          </h1>
          <button class="btn icon" aria-label="Mes siguiente" @click="go(1)">›</button>
          <button class="btn small" @click="goToday">Hoy</button>
        </div>
        <p class="summary">
          <span><b>{{ stats.people }}</b> {{ stats.people === 1 ? 'persona' : 'personas' }} con ausencias este mes</span>
          <span v-if="stats.pending" class="pending-pill">
            <span class="badge pendiente">{{ stats.pending }} pendientes de aprobar</span>
          </span>
        </p>
      </div>
      <div class="actions">
        <select v-if="isAdmin" :value="section" aria-label="Sección" class="section-select" @change="setSection">
          <option value="">Todas las secciones</option>
          <option v-for="s in session.sections" :key="s.id" :value="String(s.id)">{{ s.name }}</option>
        </select>
        <select
          v-else-if="groups.length > 1"
          :value="section || String(groups[0].id)"
          aria-label="Qué equipo ver"
          class="section-select"
          @change="setSection"
        >
          <option v-for="g in groups" :key="g.id" :value="String(g.id)">
            {{ g.own ? `Mi sección: ${g.name}` : `Equipo de ${g.name} (con los demás jefes)` }}
          </option>
        </select>
        <label class="switch">
          <input v-model="showPending" type="checkbox" />
          <span class="track" aria-hidden="true"><span class="thumb" /></span>
          Pendientes
        </label>
        <button class="btn primary" @click="newDate = todayStr()">+ Solicitar ausencia</button>
      </div>
    </header>

    <div class="legend" aria-label="Leyenda: pulsa para ocultar o mostrar">
      <button
        v-for="t in session.types.filter((x) => x.active)"
        :key="t.id"
        class="chip"
        :class="{ off: hiddenTypes.has(t.id) }"
        :style="{ '--c': t.color }"
        :aria-pressed="!hiddenTypes.has(t.id)"
        @click="toggleType(t.id)"
      >
        <span class="dot" /> {{ t.name }}
      </button>
      <span v-if="hasPrivate" class="chip static" style="--c: #8a879e" title="El motivo solo lo ven la persona, quien aprueba y RRHH">
        <span class="dot" /> Ausencia de un compañero
      </span>
      <span class="chip static pending-chip"><span class="stripes" /> Pendiente</span>
      <span class="chip static holiday-chip">✦ Festivo</span>
      <span class="hint muted small">Pasa el ratón por una persona para ver todas sus ausencias</span>
    </div>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <div class="cal-stage" :class="{ loading }">
      <Transition :name="slide" mode="out-in">
        <MonthCalendar
          :key="month"
          :month="month"
          :events="visible"
          :headcount="headcount"
          :highlight-id="highlightId"
          :holidays="session.holidays"
          @day-click="newDate = $event"
          @event-click="selected = $event"
        />
      </Transition>
    </div>
    <p class="muted small">
      Pulsa un día laborable, de hoy en adelante, para solicitar una ausencia. La barrita inferior de cada día muestra la ocupación
      <template v-if="headcount">sobre {{ headcount }} personas</template>: verde, ámbar o coral según cuánta gente falta
      (lo rayado es lo que faltaría si se aprueba lo pendiente). El teletrabajo no cuenta.
    </p>

    <AppDialog :open="!!newDate" title="Nueva solicitud" @close="newDate = null">
      <RequestForm v-if="newDate" :date="newDate" @saved="onSaved" @cancel="newDate = null" />
    </AppDialog>

    <AppDialog :open="!!selected" :title="selected?.user_name ?? ''" @close="selected = null">
      <div v-if="selected" class="stack detail" :style="{ '--c': selected.color }">
        <div class="detail-head">
          <span class="detail-type">{{ selected.type_name }}</span>
          <span class="badge" :class="selected.status">{{ STATUS_LABELS[selected.status] }}</span>
          <span v-if="selected.is_advance" class="badge">anticipo</span>
        </div>
        <div class="detail-range">{{ range(selected) }} <span class="muted">· {{ amount(selected) }}</span></div>
        <div v-if="selected.section_name" class="muted small">Sección {{ selected.section_name }}</div>
        <div v-if="selected.comment" class="notice">“{{ selected.comment }}”</div>
        <div v-if="selected.reviewer_name" class="muted small">Revisada por {{ selected.reviewer_name }}</div>
        <DecisionBox v-if="canDecide" :request-id="selected.id" @decided="onDecided" />
        <CancelBox v-if="isAdmin && selected.status === 'aprobada'" :request-id="selected.id" @cancelled="onDecided" />
      </div>
    </AppDialog>
  </div>
</template>

<style scoped>
.cal-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.title-block { display: grid; gap: 6px; }
.month-nav { display: flex; align-items: center; gap: 8px; }
.month {
  margin: 0 6px; min-width: 310px; font-size: 2rem; font-weight: 600; overflow: hidden;
}
.month > span {
  display: inline-block; padding-bottom: .08em;
  background: linear-gradient(120deg, var(--text) 35%, var(--primary-2));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.year { font-weight: 400; opacity: .55; }
.summary { margin: 0; display: flex; gap: 10px; align-items: center; color: var(--muted); font-size: .9rem; flex-wrap: wrap; }
.summary b { color: var(--text); }

.actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.section-select { width: auto; }

/* Interruptor */
.switch { display: inline-flex; align-items: center; gap: 8px; font-size: .9rem; font-weight: 600; cursor: pointer; }
.switch input { position: absolute; opacity: 0; pointer-events: none; }
.track {
  width: 36px; height: 20px; border-radius: 999px; background: var(--surface-3); border: 1px solid var(--border-strong);
  position: relative; transition: background .25s;
}
.thumb {
  position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%;
  background: var(--surface); box-shadow: 0 1px 3px rgb(0 0 0 / 30%); transition: transform .25s var(--ease-out);
}
.switch input:checked + .track { background: linear-gradient(135deg, var(--primary), var(--primary-2)); border-color: transparent; }
.switch input:checked + .track .thumb { transform: translateX(16px); }
.switch input:focus-visible + .track { outline: 2px solid var(--primary); outline-offset: 2px; }

/* Leyenda */
.legend { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.chip {
  display: inline-flex; align-items: center; gap: 8px; font: inherit; font-size: .84rem; font-weight: 600;
  padding: 6px 12px; border-radius: 999px; cursor: pointer;
  color: color-mix(in srgb, var(--c, var(--muted)) 55%, var(--text));
  background: color-mix(in srgb, var(--c, var(--muted)) 13%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--c, var(--muted)) 28%, transparent);
  transition: transform .15s var(--ease-out), opacity .2s, background .2s;
}
.chip:hover { transform: translateY(-1px); }
.chip.off { opacity: .4; filter: grayscale(.8); }
.chip.off .dot { box-shadow: none; }
.chip.static { cursor: default; color: var(--muted); }
.chip.static:hover { transform: none; }
.stripes {
  width: 18px; height: 10px; border-radius: 3px;
  background: repeating-linear-gradient(-45deg, var(--muted) 0 2px, transparent 2px 5px);
  opacity: .7;
}
.holiday-chip { --c: var(--holiday); color: var(--holiday); }
.hint { margin-left: auto; }

.cal-stage { transition: opacity .3s; }
.cal-stage.loading { opacity: .75; }

/* Transición entre meses */
.slide-next-enter-active, .slide-next-leave-active,
.slide-prev-enter-active, .slide-prev-leave-active { transition: opacity .22s ease, transform .28s var(--ease-out); }
.slide-next-enter-from, .slide-prev-leave-to { opacity: 0; transform: translateX(24px); }
.slide-next-leave-to, .slide-prev-enter-from { opacity: 0; transform: translateX(-24px); }

/* Detalle */
.detail-head { display: flex; align-items: center; gap: 10px; }
.detail-type {
  font-weight: 700; padding: 5px 12px; border-radius: 10px;
  color: color-mix(in srgb, var(--c) 55%, var(--text));
  background: color-mix(in srgb, var(--c) 18%, var(--surface));
  box-shadow: inset 3px 0 0 var(--c);
}
.detail-range { font-family: var(--font-display); font-size: 1.3rem; font-weight: 650; }

@media (max-width: 720px) {
  .month { min-width: 0; font-size: 1.5rem; }
  .hint { display: none; }
}
</style>
