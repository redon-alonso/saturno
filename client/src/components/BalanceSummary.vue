<script setup>
import { computed } from 'vue';
import { num } from '../format.js';

const props = defineProps({ balance: { type: Object, required: true } });

const v = computed(() => props.balance.vacation);
// Reparto del total en el anillo: disfrutado, pendiente y disponible
const parts = computed(() => {
  const total = Math.max(v.value.total, v.value.used + v.value.pending, 0.0001);
  return { used: v.value.used / total, pending: v.value.pending / total };
});
</script>

<template>
  <div class="stack">
    <div class="summary">
      <div
        class="gauge"
        :class="{ low: v.available <= 3 }"
        :style="{ '--used': parts.used, '--pend': parts.pending }"
        role="img"
        :aria-label="`${num(v.available)} días disponibles de ${num(v.total)}`"
      >
        <div class="gauge-inner">
          <span class="value">{{ num(v.available) }}</span>
          <span class="label">días para pedir</span>
        </div>
      </div>

      <div class="tiles">
        <div class="tile">
          <span class="label"><span class="key used" /> Disfrutados</span>
          <span class="tile-value">{{ num(v.used) }}</span>
        </div>
        <div class="tile">
          <span class="label"><span class="key pending" /> Pendientes de aprobar</span>
          <span class="tile-value">{{ num(v.pending) }}</span>
        </div>
        <div class="tile">
          <span class="label"><span class="key total" /> Generados en total</span>
          <span class="tile-value">{{ num(v.total) }}</span>
        </div>
        <div v-for="qt in balance.quotas" :key="qt.type_id" class="tile quota" :style="{ '--c': qt.color }">
          <span class="label"><span class="dot" /> {{ qt.name }} · {{ qt.cycle }}</span>
          <span class="tile-value">{{ num(qt.available) }}<small> de {{ num(qt.quota) }}</small></span>
          <span class="mini-bar"><span :style="{ width: `${qt.quota ? (qt.available / qt.quota) * 100 : 0}%` }" /></span>
        </div>
      </div>
    </div>

    <details>
      <summary>Cómo se calcula · los días no caducan, se acumulan de un ciclo a otro</summary>
      <div class="table-wrap">
        <table class="small">
          <thead>
            <tr><th>Ciclo</th><th class="num">Días trabajados</th><th class="num">Generados</th><th class="num">Disfrutados</th></tr>
          </thead>
          <tbody>
            <tr v-for="c in v.cycles" :key="c.label">
              <td>{{ c.label }}</td>
              <td class="num">{{ c.worked }} / {{ c.length }}</td>
              <td class="num">{{ num(c.days) }}</td>
              <td class="num">{{ num(c.used) }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr v-if="v.initial"><td colspan="2">Saldo inicial</td><td class="num">{{ num(v.initial) }}</td><td /></tr>
            <tr v-if="v.adjustments"><td colspan="2">Ajustes de RRHH</td><td class="num">{{ num(v.adjustments) }}</td><td /></tr>
            <tr>
              <th colspan="2">Total</th>
              <th class="num">{{ num(v.total) }}</th>
              <th class="num">{{ num(v.used) }}</th>
            </tr>
          </tfoot>
        </table>
      </div>
    </details>
  </div>
</template>

<style scoped>
.summary { display: grid; grid-template-columns: auto 1fr; gap: 24px; align-items: center; }

/* Anillo: coral = disfrutado, ámbar = pendiente, verde = disponible */
.gauge {
  --ok: var(--success);
  width: 168px; aspect-ratio: 1; border-radius: 50%; position: relative; display: grid; place-items: center;
  background: conic-gradient(
    var(--load-high) 0 calc(var(--used) * 360deg),
    var(--load-mid) 0 calc((var(--used) + var(--pend)) * 360deg),
    var(--ok) 0);
  box-shadow: 0 10px 30px -12px color-mix(in srgb, var(--ok) 70%, transparent);
  animation: spin-in 1s var(--ease-out) both;
}
.gauge.low { --ok: var(--warning); }
@keyframes spin-in { from { transform: rotate(-90deg) scale(.85); opacity: 0; } }
.gauge-inner {
  width: 128px; aspect-ratio: 1; border-radius: 50%; background: var(--surface);
  display: grid; place-content: center; text-align: center; gap: 2px;
}
.value { font-family: var(--font-display); font-size: 2.4rem; font-weight: 750; line-height: 1; color: var(--ok); }
.gauge-inner .label { font-size: .75rem; color: var(--muted); font-weight: 600; }

.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
.tile {
  display: grid; gap: 4px; padding: 14px; border-radius: 14px;
  background: var(--surface-2); border: 1px solid var(--border);
  transition: transform .2s var(--ease-out), box-shadow .2s;
}
.tile:hover { transform: translateY(-2px); box-shadow: var(--shadow); }
.label { font-size: .78rem; color: var(--muted); font-weight: 600; display: flex; align-items: center; gap: 7px; }
.tile-value { font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.tile-value small { font-size: .85rem; color: var(--muted); font-weight: 500; font-family: var(--font); }
.key { width: 10px; height: 10px; border-radius: 4px; }
.key.used { background: var(--load-high); }
.key.pending { background: var(--load-mid); }
.key.total { background: var(--success); }
.mini-bar { height: 5px; border-radius: 5px; background: color-mix(in srgb, var(--c) 15%, transparent); overflow: hidden; }
.mini-bar span { display: block; height: 100%; border-radius: inherit; background: var(--c); transition: width .6s var(--ease-out); }

details { margin-top: 2px; }
summary { cursor: pointer; color: var(--muted); font-size: .85rem; font-weight: 600; }
summary:hover { color: var(--text); }

@media (max-width: 640px) {
  .summary { grid-template-columns: 1fr; justify-items: center; }
  .tiles { width: 100%; }
}
</style>
