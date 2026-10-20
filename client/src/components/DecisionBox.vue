<script setup>
import { ref } from 'vue';
import { api } from '../api.js';

const props = defineProps({ requestId: { type: Number, required: true } });
const emit = defineEmits(['decided']);

const comment = ref('');
const error = ref('');
const busy = ref(false);

async function decide(decision) {
  error.value = '';
  busy.value = true;
  try {
    const r = await api(`/requests/${props.requestId}/decision`, {
      method: 'POST',
      body: { decision, review_comment: comment.value },
    });
    emit('decided', r);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="stack decision">
    <input v-model="comment" placeholder="Comentario (opcional)" maxlength="500" aria-label="Comentario de la decisión" />
    <div class="row">
      <button class="btn success" :disabled="busy" @click="decide('aprobada')">Aprobar</button>
      <button class="btn danger" :disabled="busy" @click="decide('rechazada')">Rechazar</button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.decision { gap: 8px; }
</style>
