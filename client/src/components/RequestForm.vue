<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { countDays, hoursBetween, hoursToDays, isWorkingDay, maxDate, nextWorkingDay, todayStr } from '@shared/dates.js';
import { api, refreshBalance } from '../api.js';
import { session } from '../store.js';
import { num, wholeDays } from '../format.js';

const props = defineProps({ date: { type: String, required: true } });
const emit = defineEmits(['saved', 'cancel']);

const today = todayStr();

const holidays = computed(() => new Set(session.holidays.map((h) => h.date)));
// Nunca se propone un día pasado ni uno no laborable
const firstDate = nextWorkingDay(maxDate(props.date, today), holidays.value);

const activeTypes = computed(() => session.types.filter((t) => t.active));
const form = reactive({
  type_id: activeTypes.value[0]?.id,
  start_date: firstDate,
  end_date: firstDate,
  start_time: '',
  end_time: '',
  comment: '',
});
const allDay = ref(true); // lo sencillo por defecto: solo se eligen horas si se desmarca
const error = ref('');
const busy = ref(false);

const type = computed(() => session.types.find((t) => t.id === form.type_id));
const canHours = computed(() => !!type.value?.allows_hours);
const mode = computed(() => (canHours.value && !allDay.value ? 'horas' : 'dias'));

const workday = computed(() => session.config?.workdayHours ?? 8);
/** Por horas: duración, si el día es laborable y si cabe en la jornada. */
const hoursInfo = computed(() => {
  if (mode.value !== 'horas') return null;
  const working = isWorkingDay(form.start_date, holidays.value);
  const valid = form.start_time && form.end_time && form.end_time > form.start_time;
  const hours = valid ? hoursBetween(form.start_time, form.end_time) : 0;
  let problem = null;
  if (!working) problem = 'Ese día no es laborable (fin de semana o festivo).';
  else if (form.start_time && form.end_time && !valid) problem = 'La hora de fin debe ser posterior a la de inicio.';
  else if (hours > workday.value) problem = `Son más de ${num(workday.value)} h: pide el día completo.`;
  return { hours, problem };
});

const days = computed(() => {
  if (!type.value) return 0;
  if (mode.value === 'horas') {
    const h = hoursInfo.value;
    return h.problem || !h.hours ? 0 : hoursToDays(h.hours, workday.value);
  }
  if (startClosed.value) return 0;
  return countDays(form.start_date, form.end_date, type.value.count_mode, holidays.value);
});

/** Por días: tiene que empezar en un día laborable (puede abarcar fines de semana) */
const startClosed = computed(() => mode.value === 'dias' && !!form.start_date && !isWorkingDay(form.start_date, holidays.value));

/** Aviso de saldo en vivo según el tipo elegido. */
const balanceInfo = computed(() => {
  const t = type.value;
  if (!t) return null;
  if (t.deducts_vacation) {
    // Se ven y se piden días enteros; lo que quedará se trunca igual que el saldo
    const exact = session.balance?.vacation?.available ?? 0;
    const available = session.balance?.vacation?.usable ?? 0;
    const after = days.value > available ? available - days.value : wholeDays(exact - days.value);
    return { available, after, unit: 'días de vacaciones' };
  }
  const quota = session.balance?.quotas?.find((x) => x.type_id === t.id);
  if (quota) return { available: quota.available, after: quota.available - days.value, unit: `días de ${t.name.toLowerCase()}` };
  return null;
});

function onStart() {
  // El selector respeta `min`, pero una fecha escrita a mano puede saltárselo
  if (form.start_date < today) form.start_date = today;
  if (form.end_date < form.start_date || mode.value === 'horas') form.end_date = form.start_date;
}
watch(mode, (m) => { if (m === 'horas') form.end_date = form.start_date; });

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    const body = { ...form };
    if (mode.value === 'horas') body.end_date = body.start_date;
    else body.start_time = body.end_time = null;
    await api('/requests', { method: 'POST', body });
    await refreshBalance();
    emit('saved');
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form class="stack" @submit.prevent="submit">
    <fieldset class="types">
      <legend class="muted small">Motivo</legend>
      <label v-for="t in activeTypes" :key="t.id" class="type-opt" :style="{ '--c': t.color }">
        <input v-model="form.type_id" type="radio" name="type" :value="t.id" />
        <span class="dot" /> {{ t.name }}
      </label>
    </fieldset>

    <div v-if="mode === 'dias'" class="grid-2">
      <label class="field">Desde
        <input v-model="form.start_date" type="date" :min="today" required @change="onStart" />
      </label>
      <label class="field">Hasta
        <input v-model="form.end_date" type="date" :min="form.start_date" required />
      </label>
    </div>

    <div v-else class="hours-grid">
      <label class="field">Día
        <input v-model="form.start_date" type="date" :min="today" required @change="onStart" />
      </label>
      <label class="field">De
        <input v-model="form.start_time" type="time" step="900" required />
      </label>
      <label class="field">A
        <input v-model="form.end_time" type="time" step="900" :min="form.start_time" required />
      </label>
    </div>

    <label v-if="canHours" class="check allday">
      <input v-model="allDay" type="checkbox" />
      <span><b>Todo el día</b> <span class="muted">· desmárcalo para pedir solo unas horas</span></span>
    </label>

    <label class="field">Comentario para tu responsable
      <textarea v-model="form.comment" rows="2" maxlength="500" />
    </label>

    <div class="notice" :class="{ warn: startClosed || hoursInfo?.problem || (balanceInfo && balanceInfo.after < 0) }">
      <template v-if="startClosed">Ese día no es laborable (fin de semana o festivo): elige otro día de inicio.</template>
      <template v-else-if="hoursInfo?.problem">{{ hoursInfo.problem }}</template>
      <template v-else-if="mode === 'horas'">
        <b>{{ num(hoursInfo.hours) }} h</b>
        <template v-if="hoursInfo.hours"> · equivalen a <b>{{ num(days) }}</b> días (jornada de {{ num(workday) }} h)</template>
      </template>
      <template v-else>
        <b>{{ num(days) }}</b> {{ days === 1 ? 'día' : 'días' }}
        {{ type?.count_mode === 'laborable' ? (days === 1 ? 'laborable' : 'laborables (sin festivos)') : (days === 1 ? 'natural' : 'naturales') }}
      </template>
      <template v-if="balanceInfo && !startClosed && !hoursInfo?.problem && days">
        · tienes {{ num(balanceInfo.available) }} {{ balanceInfo.unit }},
        <template v-if="balanceInfo.after >= 0">te quedarán <b>{{ num(balanceInfo.after) }}</b>.</template>
        <template v-else><b>no tienes saldo suficiente.</b></template>
      </template>
    </div>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="row">
      <span class="spacer" />
      <button type="button" class="btn" @click="emit('cancel')">Cancelar</button>
      <button class="btn primary" :disabled="busy || !days">Enviar solicitud</button>
    </div>
    <p class="muted small">Quedará pendiente hasta que tu jefe de sección la valide.</p>
  </form>
</template>

<style scoped>
.types { border: 0; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.types legend { margin-bottom: 6px; }
.type-opt {
  display: flex; align-items: center; gap: 8px; padding: 8px 14px; cursor: pointer;
  border: 1px solid var(--border); border-radius: 12px; font-size: .9rem; font-weight: 600;
  background: var(--surface-2);
  transition: background .2s, border-color .2s, transform .15s var(--ease-out), box-shadow .2s;
}
.type-opt:hover { transform: translateY(-1px); }
.type-opt:has(input:checked) {
  border-color: var(--c);
  color: color-mix(in srgb, var(--c) 55%, var(--text));
  background: color-mix(in srgb, var(--c) 16%, var(--surface));
  box-shadow: 0 6px 16px -8px color-mix(in srgb, var(--c) 80%, transparent);
}
.type-opt input { position: absolute; opacity: 0; pointer-events: none; }
.type-opt:has(input:focus-visible) { outline: 2px solid var(--primary); outline-offset: 2px; }
.allday {
  padding: 10px 12px; border-radius: 12px; border: 1px dashed var(--border-strong); background: var(--surface-2);
}
.allday input { width: 18px; height: 18px; }
.hours-grid { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 12px; }
@media (max-width: 520px) { .hours-grid { grid-template-columns: 1fr 1fr; } .hours-grid > :first-child { grid-column: 1 / -1; } }
</style>
