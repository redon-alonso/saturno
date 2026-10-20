<script setup>
import { onMounted, ref } from 'vue';
import { todayStr } from '@shared/dates.js';
import AppDialog from '../components/AppDialog.vue';
import RequestForm from '../components/RequestForm.vue';
import BalanceSummary from '../components/BalanceSummary.vue';
import { api, refreshBalance } from '../api.js';
import { session } from '../store.js';
import { amount, range, STATUS_LABELS } from '../format.js';

const rows = ref([]);
const error = ref('');
const creating = ref(false);
const today = todayStr();

async function load() {
  try {
    rows.value = await api('/requests/mine');
  } catch (e) {
    error.value = e.message;
  }
}
onMounted(() => Promise.all([load(), refreshBalance()]));

const canCancel = (r) => r.status === 'pendiente' || (r.status === 'aprobada' && r.start_date > today);

async function cancel(r) {
  error.value = '';
  try {
    await api(`/requests/${r.id}/cancel`, { method: 'POST' });
    await Promise.all([load(), refreshBalance()]);
  } catch (e) {
    error.value = e.message;
  }
}

async function onSaved() {
  creating.value = false;
  await load();
}
</script>

<template>
  <div class="page stack">
    <div class="row">
      <h1>Mis solicitudes</h1>
      <span class="spacer" />
      <button class="btn primary" @click="creating = true">+ Nueva solicitud</button>
    </div>

    <section v-if="session.balance" class="card">
      <h2>Mi saldo</h2>
      <BalanceSummary :balance="session.balance" />
    </section>

    <section class="card">
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="!rows.length" class="muted">Todavía no has hecho ninguna solicitud.</p>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr><th>Motivo</th><th>Fechas</th><th class="num">Duración</th><th>Estado</th><th>Respuesta</th><th /></tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id">
              <td><span class="row"><span class="dot" :style="{ '--c': r.color }" />{{ r.type_name }}</span></td>
              <td>{{ range(r) }}</td>
              <td class="num">{{ amount(r) }}</td>
              <td><span class="badge" :class="r.status">{{ STATUS_LABELS[r.status] }}</span></td>
              <td class="small">
                <template v-if="r.reviewer_name">{{ r.reviewer_name }}</template>
                <div v-if="r.review_comment" class="muted">{{ r.review_comment }}</div>
                <div v-if="r.cancelled_by && r.cancelled_by !== r.user_id" class="cancel-info">
                  Anulada por {{ r.cancelled_by_name }}<template v-if="r.cancel_reason">: «{{ r.cancel_reason }}»</template>
                </div>
              </td>
              <td class="num">
                <button v-if="canCancel(r)" class="btn small danger" @click="cancel(r)">Cancelar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <AppDialog :open="creating" title="Nueva solicitud" @close="creating = false">
      <RequestForm v-if="creating" :date="today" @saved="onSaved" @cancel="creating = false" />
    </AppDialog>
  </div>
</template>
