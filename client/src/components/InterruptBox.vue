<script setup>
import { computed, ref } from 'vue';
import { addDays, maxDate, minDate, todayStr } from '@shared/dates.js';
import { api } from '../api.js';

// Interrumpir una ausencia aprobada: se recorta hasta el último día disfrutado y el resto vuelve al saldo
const props = defineProps({ request: { type: Object, required: true } });
const emit = defineEmits(['interrupted']);

const lastMax = computed(() => addDays(props.request.end_date, -1));
const open = ref(false);
// Por defecto, hoy (si cae dentro de la ausencia): «vuelve mañana»
const lastDay = ref(minDate(maxDate(todayStr(), props.request.start_date), lastMax.value));
const reason = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    const r = await api(`/requests/${props.request.id}/interrupt`, {
      method: 'POST', body: { last_day: lastDay.value, reason: reason.value },
    });
    emit('interrupted', r);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <button v-if="!open" type="button" class="btn small" @click="open = true">Interrumpir…</button>
  <form v-else class="interrupt-box stack" @submit.prevent="submit">
    <label class="field">Último día que disfruta
      <input v-model="lastDay" type="date" :min="request.start_date" :max="lastMax" required />
    </label>
    <label class="field">Motivo (lo verá la persona afectada)
      <textarea v-model="reason" rows="2" maxlength="500" required />
    </label>
    <p class="muted small">Los días siguientes se devuelven a su saldo.</p>
    <div class="row">
      <button type="button" class="btn small" @click="open = false">Volver</button>
      <button class="btn small primary" :disabled="busy || !reason.trim()">Interrumpir</button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </form>
</template>

<style scoped>
.interrupt-box {
  gap: 10px; padding: 14px; border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--warning) 40%, transparent);
  background: color-mix(in srgb, var(--warning) 7%, var(--surface));
  animation: unfold .25s var(--ease-out);
}
@keyframes unfold { from { opacity: 0; transform: translateY(-4px); } }
</style>
