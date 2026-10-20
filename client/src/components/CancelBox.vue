<script setup>
import { ref } from 'vue';
import { api } from '../api.js';

const props = defineProps({ requestId: { type: Number, required: true } });
const emit = defineEmits(['cancelled']);

const open = ref(false);
const reason = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    const r = await api(`/requests/${props.requestId}/cancel`, { method: 'POST', body: { reason: reason.value } });
    emit('cancelled', r);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <button v-if="!open" type="button" class="btn small danger" @click="open = true">Anular…</button>
  <form v-else class="cancel-box stack" @submit.prevent="submit">
    <label class="field">Motivo de la anulación (la verá la persona afectada)
      <textarea v-model="reason" rows="2" maxlength="500" required autofocus />
    </label>
    <div class="row">
      <button type="button" class="btn small" @click="open = false">Volver</button>
      <button class="btn small danger" :disabled="busy || !reason.trim()">Anular solicitud</button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </form>
</template>

<style scoped>
.cancel-box {
  gap: 10px; padding: 14px; border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent);
  background: color-mix(in srgb, var(--danger) 6%, var(--surface));
  animation: unfold .25s var(--ease-out);
}
@keyframes unfold { from { opacity: 0; transform: translateY(-4px); } }
</style>
