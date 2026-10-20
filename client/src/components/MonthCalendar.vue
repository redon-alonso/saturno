<script setup>
import { computed, ref } from 'vue';
import { addDays, diffDays, isoWeekday, monthEnd, todayStr } from '@shared/dates.js';
import { range, STATUS_LABELS } from '../format.js';

const props = defineProps({
  month: { type: String, required: true }, // 'YYYY-MM'
  events: { type: Array, default: () => [] },
  headcount: { type: Number, default: 0 },
  highlightId: { type: Number, default: null },
  holidays: { type: Array, default: () => [] }, // [{ date, name }]
});
const emit = defineEmits(['day-click', 'event-click']);

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const WEEKDAYS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D']; // en el móvil
const today = todayStr();

/** Persona bajo el ratón: se resaltan todas sus ausencias y se atenúa el resto. */
const focusUser = ref(null);

/** Recorta cada ausencia a la semana y la coloca en el primer carril libre. */
function layoutWeek(ws, we) {
  const segs = props.events
    .filter((e) => e.start_date <= we && e.end_date >= ws)
    .map((e) => ({
      ev: e,
      from: diffDays(ws, e.start_date < ws ? ws : e.start_date),
      to: diffDays(ws, e.end_date > we ? we : e.end_date),
      contLeft: e.start_date < ws,
      contRight: e.end_date > we,
    }))
    .sort((a, b) => a.from - b.from || (b.to - b.from) - (a.to - a.from));

  const laneEnds = [];
  for (const s of segs) {
    let lane = laneEnds.findIndex((end) => end < s.from);
    if (lane === -1) lane = laneEnds.push(s.to) - 1;
    else laneEnds[lane] = s.to;
    s.lane = lane;
  }
  return { segs, lanes: laneEnds.length };
}

const holidayByDate = computed(() => new Map(props.holidays.map((h) => [h.date, h.name])));

function loadLevel(out) {
  const ratio = props.headcount ? out / props.headcount : 0;
  return ratio >= 0.5 ? 'high' : ratio >= 0.34 ? 'mid' : 'ok';
}

const weeks = computed(() => {
  const first = `${props.month}-01`;
  const start = addDays(first, 1 - isoWeekday(first));
  const last = monthEnd(first);
  const end = addDays(last, 7 - isoWeekday(last));
  const out = [];
  for (let ws = start, wi = 0; ws <= end; ws = addDays(ws, 7), wi++) {
    const we = addDays(ws, 6);
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(ws, i);
      const covering = props.events.filter((e) => e.is_absence && e.start_date <= date && e.end_date >= date);
      const outCount = covering.filter((e) => e.status === 'aprobada').length;
      const pending = covering.filter((e) => e.status === 'pendiente').length;
      return {
        date,
        day: Number(date.slice(8)),
        inMonth: date.slice(0, 7) === props.month,
        isToday: date === today,
        past: date < today, // no se pueden pedir ausencias en días pasados
        closed: i >= 5 || holidayByDate.value.has(date), // ni en días no laborables
        weekend: i >= 5,
        holiday: holidayByDate.value.get(date) ?? null,
        out: outCount,
        pending,
        level: loadLevel(outCount),
        load: props.headcount ? Math.min(1, outCount / props.headcount) : 0,
        loadPending: props.headcount ? Math.min(1, (outCount + pending) / props.headcount) : 0,
      };
    });
    out.push({ start: ws, index: wi, days, ...layoutWeek(ws, we) });
  }
  return out;
});

function barStyle(s, w) {
  return {
    gridColumn: `${s.from + 1} / ${s.to + 2}`,
    gridRow: s.lane + 2,
    '--c': s.ev.color,
    '--delay': `${w.index * 40 + s.from * 25 + s.lane * 20}ms`,
  };
}

/** '09:00:00' → '9:00' */
const hhmm = (t) => t.slice(0, 5).replace(/^0/, '');
/* Piscis, donde está Saturno: posiciones reales (declinación hacia la derecha, ascensión recta
   hacia abajo, ×10) para que la figura encaje vertical en la franja del sábado y el domingo.
   r según el brillo: Alrescha (α), η y γ son las más brillantes. */
const PISCES_STARS = {
  gam: [33, 0, 3.2], s7: [54, 7, 1.8], the: [64, 27, 2.4], iot: [56, 57, 2.4], lam: [18, 62, 1.8], kap: [13, 24, 1.8],
  ome: [69, 105, 2.6], del: [76, 229, 2.2], eps: [79, 264, 2.4], zet: [76, 291, 1.8], mu: [61, 333, 2],
  nu: [55, 361, 2], xi: [32, 391, 2], alf: [28, 412, 3.2], omi: [92, 371, 2.4], eta: [154, 336, 3.4],
  rho: [192, 323, 1.6], chi: [210, 286, 2], phi: [246, 291, 2.2], ups: [273, 306, 2.2], tau: [301, 286, 2.2],
};
const PISCES_LINES = [
  ['gam', 's7', 'the', 'iot', 'lam', 'kap', 'gam'], // el pez del oeste (el «Circlet»)
  ['iot', 'ome', 'del', 'eps', 'zet', 'mu', 'nu', 'xi', 'alf'], // cordón hasta el nudo, Alrescha
  ['alf', 'omi', 'eta', 'rho', 'chi', 'phi', 'ups', 'tau'], // cordón y pez del norte
].map((names) => names.map((n) => PISCES_STARS[n].slice(0, 2).join(',')).join(' '));

/** En el móvil solo cabe el nombre de pila */
const firstName = (name) => name.split(/\s+/)[0];

const barTitle = (e) => `${e.user_name} · ${e.type_name}\n${range(e)}\n${STATUS_LABELS[e.status]}`;

function dayLabel(d) {
  let label = d.date;
  if (d.holiday) label += `, festivo: ${d.holiday}`;
  if (d.out) label += `, ${d.out} ${d.out === 1 ? 'persona fuera' : 'personas fuera'}`;
  if (d.pending) label += `, ${d.pending} pendientes`;
  return label;
}
</script>

<template>
  <div class="cal-scroll">
    <div class="cal" :class="{ focusing: focusUser != null }" role="grid">
      <div class="cal-head" role="row">
        <span v-for="(d, i) in WEEKDAYS" :key="d" role="columnheader" :class="{ weekend: i >= 5 }" :aria-label="d">
          <span class="wd-long">{{ d }}</span><span class="wd-short" aria-hidden="true">{{ WEEKDAYS_SHORT[i] }}</span>
        </span>
      </div>
      <div class="cal-body">
      <!-- Piscis en el cielo del fin de semana, con Saturno al lado: decoración muy tenue -->
      <svg class="pisces" viewBox="-30 -30 360 470" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <polyline v-for="(pts, i) in PISCES_LINES" :key="i" :points="pts" />
        <circle v-for="([x, y, r], n) in PISCES_STARS" :key="n" :cx="x" :cy="y" :r="r" />
        <g class="saturn" transform="translate(8 232) rotate(-18)">
          <circle r="5" />
          <ellipse rx="10" ry="2.6" />
        </g>
      </svg>
      <div
        v-for="w in weeks"
        :key="w.start"
        class="cal-week"
        role="row"
        :style="{ gridTemplateRows: `var(--row-top) repeat(${w.lanes}, var(--row-lane)) minmax(var(--row-foot), 1fr)` }"
      >
        <button
          v-for="(d, i) in w.days"
          :key="d.date"
          class="cal-day"
          :class="{ out: !d.inMonth, weekend: d.weekend, today: d.isToday, holiday: d.holiday, past: d.past }"
          :style="{ gridColumn: i + 1 }"
          :aria-label="dayLabel(d)"
          :title="d.holiday ?? undefined"
          :disabled="d.past || d.closed"
          role="gridcell"
          @click="!d.past && !d.closed && emit('day-click', d.date)"
        >
          <span class="day-top">
            <span class="num">{{ d.day }}</span>
            <span v-if="d.holiday" class="holiday-name">✦<span class="holiday-text">{{ d.holiday }}</span></span>
            <span
              v-if="d.out || d.pending"
              class="count"
              :class="d.level"
              :title="`${d.out} fuera${headcount ? ` de ${headcount}` : ''}${d.pending ? ` · ${d.pending} pendientes` : ''}`"
            >
              {{ d.out }}<template v-if="headcount">/{{ headcount }}</template>
            </span>
          </span>
          <!-- Medidor de ocupación: sólido = aprobado, rayado = si se aprueba lo pendiente -->
          <span v-if="headcount && (d.out || d.pending)" class="load" :class="d.level" aria-hidden="true">
            <span class="load-pending" :style="{ width: `${d.loadPending * 100}%` }" />
            <span class="load-fill" :style="{ width: `${d.load * 100}%` }" />
          </span>
        </button>

        <button
          v-for="s in w.segs"
          :key="`${s.ev.id}-${w.start}`"
          class="bar"
          :class="{
            pending: s.ev.status === 'pendiente',
            partial: !!s.ev.start_time,
            highlight: s.ev.id === highlightId,
            lit: focusUser === s.ev.user_id,
            'cont-left': s.contLeft,
            'cont-right': s.contRight,
          }"
          :style="barStyle(s, w)"
          :title="barTitle(s.ev)"
          @mouseenter="focusUser = s.ev.user_id"
          @mouseleave="focusUser = null"
          @focus="focusUser = s.ev.user_id"
          @blur="focusUser = null"
          @click="emit('event-click', s.ev)"
        >
          <span v-if="s.ev.start_time" class="hours">◷ {{ hhmm(s.ev.start_time) }}–{{ hhmm(s.ev.end_time) }}</span>
          <span class="name">{{ s.ev.user_name }}</span>
          <span class="name-short">{{ firstName(s.ev.user_name) }}</span>
          <span class="type">&nbsp;· {{ s.ev.type_name }}</span>
        </button>
      </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cal-scroll { overflow-x: auto; border-radius: var(--radius); }
.cal {
  /* Alto de las filas de cada semana: cabecera del día, cada carril de barras y pie (medidor) */
  --row-top: 34px; --row-lane: 26px; --row-foot: 14px;
  border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden;
  background: var(--weekday); box-shadow: var(--shadow);
}

/* Piscis: ocupa las dos últimas columnas (sábado y domingo) de todo el mes. z-index 1: por encima
   de las celdas; las barras también tienen 1 pero van después en el DOM, así que quedan delante */
.cal-body { position: relative; }
.pisces {
  position: absolute; top: 0; bottom: 0; left: calc(100% * 5 / 7); width: calc(100% * 2 / 7);
  height: 100%; padding: 18px 10px; z-index: 1; pointer-events: none; overflow: visible;
}
.pisces polyline {
  fill: none; stroke: var(--constellation); stroke-width: 1.2; stroke-opacity: .55;
  stroke-linejoin: round; vector-effect: non-scaling-stroke;
}
.pisces > circle { fill: var(--constellation); filter: drop-shadow(0 0 3px var(--constellation)); }
.pisces .saturn circle { fill: var(--constellation); opacity: .9; }
.pisces .saturn ellipse { fill: none; stroke: var(--constellation); stroke-width: 1.4; vector-effect: non-scaling-stroke; }

.cal-head { display: grid; grid-template-columns: repeat(7, 1fr); border-bottom: 1px solid var(--border); }
.cal-head > span {
  padding: 10px 12px; font-size: .72rem; font-weight: 700; letter-spacing: .08em;
  text-transform: uppercase; color: var(--muted); background: var(--surface-2);
}
.cal-head > span.weekend { background: color-mix(in srgb, var(--weekend) 70%, var(--surface-2)); color: var(--weekend-num); }

.cal-week {
  display: grid; grid-template-columns: repeat(7, minmax(0, 1fr));
  min-height: 104px; border-bottom: 1px solid var(--border); row-gap: 4px;
}
.cal-week:last-child { border-bottom: 0; }

/* ---- Celdas de día ---- */
.cal-day {
  position: relative; grid-row: 1 / -1; border: 0; border-right: 1px solid var(--border);
  background: var(--weekday); font: inherit; color: var(--text); cursor: pointer; text-align: left;
  padding: 6px 8px; display: flex; flex-direction: column; transition: background .2s;
}
.cal-day:nth-of-type(7) { border-right: 0; }
.cal-day:hover { background: color-mix(in srgb, var(--primary) 6%, var(--weekday)); }
.cal-day.weekend { background: var(--weekend); }
.cal-day.weekend:hover { background: color-mix(in srgb, var(--primary) 6%, var(--weekend)); }
.cal-day.weekend .num { color: var(--weekend-num); font-weight: 500; }
.cal-day.holiday { background: var(--weekend); isolation: isolate; }
/* Festivos: estrellas fugaces difuminadas. El SVG solo hace de máscara, así que toman el color
   --holiday del tema; isolation + z-index -1 las dejan sobre el fondo de la celda y bajo el texto */
.cal-day.holiday::before {
  content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  background: var(--holiday); opacity: var(--meteor-opacity, .32);
  -webkit-mask: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 180 104'><defs><linearGradient id='t'><stop offset='0' stop-opacity='0'/><stop offset='1'/></linearGradient><filter id='b' x='-20%' y='-200%' width='140%' height='500%'><feGaussianBlur stdDeviation='1.1'/></filter><filter id='h'><feGaussianBlur stdDeviation='2.2'/></filter></defs><g transform='translate(150 60) rotate(28)' opacity='1'><rect x='-86' y='-0.9' width='86' height='1.8' rx='0.9' fill='url(%23t)' filter='url(%23b)'/><circle r='4.5' opacity='.5' filter='url(%23h)'/><circle r='1.53'/></g><g transform='translate(78 92) rotate(28)' opacity='0.7'><rect x='-52' y='-0.7' width='52' height='1.4' rx='0.7' fill='url(%23t)' filter='url(%23b)'/><circle r='3.4' opacity='.5' filter='url(%23h)'/><circle r='1.19'/></g><g transform='translate(118 34) rotate(28)' opacity='0.45'><rect x='-26' y='-0.5' width='26' height='1' rx='0.5' fill='url(%23t)' filter='url(%23b)'/><circle r='0.85'/></g><g transform='translate(176 96) rotate(28)' opacity='0.55'><rect x='-60' y='-0.6' width='60' height='1.2' rx='0.6' fill='url(%23t)' filter='url(%23b)'/><circle r='3' opacity='.5' filter='url(%23h)'/><circle r='1.02'/></g><g transform='translate(40 58) rotate(28)' opacity='0.4'><rect x='-36' y='-0.5' width='36' height='1' rx='0.5' fill='url(%23t)' filter='url(%23b)'/><circle r='0.85'/></g><g transform='translate(104 72) rotate(28)' opacity='0.4'><rect x='-30' y='-0.45' width='30' height='0.9' rx='0.45' fill='url(%23t)' filter='url(%23b)'/><circle r='0.8'/></g><g transform='translate(176 30) rotate(28)' opacity='0.35'><rect x='-32' y='-0.45' width='32' height='0.9' rx='0.45' fill='url(%23t)' filter='url(%23b)'/><circle r='0.8'/></g><g transform='translate(30 100) rotate(28)' opacity='0.35'><rect x='-30' y='-0.45' width='30' height='0.9' rx='0.45' fill='url(%23t)' filter='url(%23b)'/><circle r='0.8'/></g><g transform='translate(134 104) rotate(28)' opacity='0.45'><rect x='-40' y='-0.5' width='40' height='1' rx='0.5' fill='url(%23t)' filter='url(%23b)'/><circle r='2.4' opacity='.5' filter='url(%23h)'/><circle r='0.85'/></g></svg>") center / cover no-repeat;
  mask: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 180 104'><defs><linearGradient id='t'><stop offset='0' stop-opacity='0'/><stop offset='1'/></linearGradient><filter id='b' x='-20%' y='-200%' width='140%' height='500%'><feGaussianBlur stdDeviation='1.1'/></filter><filter id='h'><feGaussianBlur stdDeviation='2.2'/></filter></defs><g transform='translate(150 60) rotate(28)' opacity='1'><rect x='-86' y='-0.9' width='86' height='1.8' rx='0.9' fill='url(%23t)' filter='url(%23b)'/><circle r='4.5' opacity='.5' filter='url(%23h)'/><circle r='1.53'/></g><g transform='translate(78 92) rotate(28)' opacity='0.7'><rect x='-52' y='-0.7' width='52' height='1.4' rx='0.7' fill='url(%23t)' filter='url(%23b)'/><circle r='3.4' opacity='.5' filter='url(%23h)'/><circle r='1.19'/></g><g transform='translate(118 34) rotate(28)' opacity='0.45'><rect x='-26' y='-0.5' width='26' height='1' rx='0.5' fill='url(%23t)' filter='url(%23b)'/><circle r='0.85'/></g><g transform='translate(176 96) rotate(28)' opacity='0.55'><rect x='-60' y='-0.6' width='60' height='1.2' rx='0.6' fill='url(%23t)' filter='url(%23b)'/><circle r='3' opacity='.5' filter='url(%23h)'/><circle r='1.02'/></g><g transform='translate(40 58) rotate(28)' opacity='0.4'><rect x='-36' y='-0.5' width='36' height='1' rx='0.5' fill='url(%23t)' filter='url(%23b)'/><circle r='0.85'/></g><g transform='translate(104 72) rotate(28)' opacity='0.4'><rect x='-30' y='-0.45' width='30' height='0.9' rx='0.45' fill='url(%23t)' filter='url(%23b)'/><circle r='0.8'/></g><g transform='translate(176 30) rotate(28)' opacity='0.35'><rect x='-32' y='-0.45' width='32' height='0.9' rx='0.45' fill='url(%23t)' filter='url(%23b)'/><circle r='0.8'/></g><g transform='translate(30 100) rotate(28)' opacity='0.35'><rect x='-30' y='-0.45' width='30' height='0.9' rx='0.45' fill='url(%23t)' filter='url(%23b)'/><circle r='0.8'/></g><g transform='translate(134 104) rotate(28)' opacity='0.45'><rect x='-40' y='-0.5' width='40' height='1' rx='0.5' fill='url(%23t)' filter='url(%23b)'/><circle r='2.4' opacity='.5' filter='url(%23h)'/><circle r='0.85'/></g></svg>") center / cover no-repeat;
  transition: opacity .4s, transform .8s var(--ease-out);
}
.cal-day.holiday:hover::before { opacity: calc(var(--meteor-opacity, .32) + .15); transform: translate(3px, 1.5px); }
/* Días pasados: no se pueden pedir; se ven apagados y no reaccionan al ratón */
.cal-day.past, .cal-day:disabled { cursor: default; }
.cal-day.past:hover { background: var(--weekday); }
.cal-day.weekend:disabled:hover, .cal-day.holiday:disabled:hover { background-color: var(--weekend); }
.cal-day.past .num { opacity: .5; }
.cal-day.out .num { opacity: .35; }
.cal-day.out { background-color: color-mix(in srgb, var(--bg) 40%, var(--weekday)); }
/* Los fines de semana de otro mes conservan su tono: la franja del sábado y el domingo no se corta */
.cal-day.out.weekend { background-color: color-mix(in srgb, var(--bg) 40%, var(--weekend)); }

.day-top { display: flex; align-items: center; gap: 6px; min-width: 0; height: 22px; }
.num { font-family: var(--font-display); font-size: .95rem; font-weight: 650; font-variant-numeric: tabular-nums; }
.cal-day.today .num {
  display: grid; place-items: center; min-width: 26px; height: 26px; padding: 0 6px; border-radius: 9px;
  color: #fff; background: linear-gradient(135deg, var(--primary), var(--primary-2));
  box-shadow: 0 4px 14px -3px color-mix(in srgb, var(--primary) 80%, transparent);
}
.cal-day.today::after { /* halo suave que respira */
  content: ''; position: absolute; inset: 0; pointer-events: none;
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--primary) 45%, transparent);
  animation: breathe 3s ease-in-out infinite;
}
@keyframes breathe { 50% { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--primary) 15%, transparent); } }

.holiday-text { margin-left: .3em; }
.holiday-name {
  font-size: .68rem; font-weight: 700; color: var(--holiday);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
}
.count {
  margin-left: auto; font-size: .68rem; font-weight: 700; padding: 1px 7px; border-radius: 999px;
  font-variant-numeric: tabular-nums; white-space: nowrap;
  color: var(--load-ok); background: color-mix(in srgb, var(--load-ok) 13%, transparent);
}
.count.mid { color: var(--load-mid); background: color-mix(in srgb, var(--load-mid) 15%, transparent); }
.count.high { color: var(--load-high); background: color-mix(in srgb, var(--load-high) 15%, transparent); }

.load {
  position: absolute; left: 8px; right: 8px; bottom: 6px; height: 4px; border-radius: 4px; overflow: hidden;
  background: color-mix(in srgb, var(--text) 7%, transparent);
  --lc: var(--load-ok);
}
.load.mid { --lc: var(--load-mid); }
.load.high { --lc: var(--load-high); }
.load-fill, .load-pending { position: absolute; inset: 0 auto 0 0; border-radius: inherit; transition: width .5s var(--ease-out); }
.load-fill { background: linear-gradient(90deg, color-mix(in srgb, var(--lc) 70%, transparent), var(--lc)); }
.load-pending {
  background: repeating-linear-gradient(-45deg, color-mix(in srgb, var(--lc) 45%, transparent) 0 3px, transparent 3px 6px);
}

/* ---- Barras ---- */
.bar {
  position: relative; z-index: 1; margin: 0 5px; padding: 0 10px; border: 0; border-radius: 8px;
  font: inherit; font-size: .78rem; font-weight: 700; text-align: left; cursor: pointer; min-width: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: color-mix(in srgb, var(--c) 40%, var(--text));
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--c) var(--tint-a), var(--surface)),
    color-mix(in srgb, var(--c) var(--tint-b), var(--surface)));
  box-shadow: inset 3px 0 0 var(--c);
  transform-origin: left center;
  animation: bar-in .5s var(--ease-out) both;
  animation-delay: var(--delay);
  transition: transform .2s var(--ease-out), box-shadow .2s, opacity .25s, filter .25s;
}
@keyframes bar-in { from { opacity: 0; transform: scaleX(.4); } }
.bar .type { font-weight: 500; opacity: .8; }
.bar:hover, .bar.lit {
  transform: translateY(-1px);
  box-shadow: inset 3px 0 0 var(--c), 0 6px 16px -6px color-mix(in srgb, var(--c) 75%, transparent);
}
.bar.cont-left { margin-left: 0; border-top-left-radius: 0; border-bottom-left-radius: 0; box-shadow: none; }
.bar.cont-right { margin-right: 0; border-top-right-radius: 0; border-bottom-right-radius: 0; }
.bar.cont-left:hover, .bar.cont-left.lit { box-shadow: 0 6px 16px -6px color-mix(in srgb, var(--c) 75%, transparent); }

/* Por horas: franja horaria delante y borde punteado (no es el día entero) */
.bar .hours {
  font-size: .7rem; font-weight: 700; margin-right: 6px; padding: 1px 5px; border-radius: 5px;
  background: color-mix(in srgb, var(--c) 22%, transparent);
}
.bar.partial:not(.pending) {
  box-shadow: none;
  background-image:
    linear-gradient(var(--c) 50%, transparent 0),
    linear-gradient(90deg,
      color-mix(in srgb, var(--c) var(--tint-a), var(--surface)),
      color-mix(in srgb, var(--c) var(--tint-b), var(--surface)));
  background-size: 3px 6px, 100% 100%;
  background-repeat: repeat-y, no-repeat;
}

/* Pendiente: rayas que avanzan, como "en espera" */
.bar.pending {
  color: color-mix(in srgb, var(--c) 45%, var(--text));
  background-color: color-mix(in srgb, var(--c) 8%, var(--surface));
  background-image: linear-gradient(-45deg,
    color-mix(in srgb, var(--c) 20%, transparent) 25%, transparent 25%, transparent 50%,
    color-mix(in srgb, var(--c) 20%, transparent) 50%, color-mix(in srgb, var(--c) 20%, transparent) 75%,
    transparent 75%);
  background-size: 12px 12px;
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--c) 55%, transparent);
  animation: bar-in .5s var(--ease-out) both, march 1.2s linear infinite;
  animation-delay: var(--delay), 0s;
}
@keyframes march { to { background-position: 12px 0; } }

.bar.highlight {
  z-index: 2;
  outline: 2px solid var(--c); outline-offset: 2px;
  animation: bar-in .5s var(--ease-out) both, glow 1.6s ease-in-out 3;
}
@keyframes glow { 50% { outline-offset: 5px; outline-color: transparent; } }

/* Al enfocar a una persona, el resto se difumina */
.cal.focusing .bar:not(.lit) { opacity: .28; filter: saturate(.4); }

@media (max-width: 900px) { .bar .type { display: none; } }

.wd-short, .name-short { display: none; }

/* Móvil: el mes entero cabe a lo ancho, sin desplazamiento lateral */
@media (max-width: 640px) {
  .cal { --row-top: 28px; --row-lane: 19px; --row-foot: 10px; }
  .cal-head > span { padding: 7px 0; text-align: center; letter-spacing: 0; }
  .wd-long { display: none; }
  .wd-short { display: inline; }
  .cal-week { min-height: 68px; row-gap: 3px; }
  .cal-day { padding: 4px 0 0; align-items: center; }
  .day-top { justify-content: center; height: 20px; }
  .num { font-size: .8rem; }
  .cal-day.today .num { min-width: 22px; height: 22px; padding: 0 4px; border-radius: 7px; }
  /* El nombre del festivo y el contador no caben: quedan en el aviso al pulsar y en la barrita */
  .holiday-text, .count { display: none; }
  .day-top { gap: 2px; }
  .load { left: 4px; right: 4px; bottom: 4px; height: 3px; }
  .bar { margin: 0 2px; padding: 0 4px; border-radius: 5px; font-size: .64rem; }
  .bar.cont-left { margin-left: 0; }
  .bar.cont-right { margin-right: 0; }
  .bar .name, .bar .hours { display: none; }
  .bar .name-short { display: inline; }
}
</style>
