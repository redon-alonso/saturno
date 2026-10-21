<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { session, logout, ROLE_LABELS } from './store.js';
import { num } from './format.js';
import BrandMark from './components/BrandMark.vue';

const route = useRoute();
const router = useRouter();

const links = computed(() => {
  const role = session.user?.role;
  return [
    { to: '/calendario', label: 'Calendario' },
    { to: '/solicitudes', label: 'Mis solicitudes' },
    ...(role === 'admin' || role === 'jefe' ? [{ to: '/revisar', label: 'Revisar' }] : []),
    ...(role === 'admin' ? [{ to: '/admin', label: 'Administración' }] : []),
  ];
});

const vacation = computed(() => session.balance?.vacation);
/** Proporción del saldo total que queda por pedir (para el anillo). */
const ratio = computed(() => {
  const v = vacation.value;
  return v && v.total > 0 ? Math.max(0, Math.min(1, v.usable / v.total)) : 0;
});

// Móvil: el menú (secciones + saldo) va en un desplegable; se cierra al navegar, al tocar fuera o con Escape
const menuOpen = ref(false);
watch(() => route.fullPath, () => { menuOpen.value = false; });
const onKey = (e) => { if (e.key === 'Escape') menuOpen.value = false; };
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

function exit() {
  logout();
  router.push('/login');
}
</script>

<template>
  <header v-if="session.user && !route.meta.public" class="topbar">
    <div class="topbar-inner">
      <button
        type="button" class="btn icon menu-btn" :aria-expanded="menuOpen" aria-controls="menu-movil"
        :aria-label="menuOpen ? 'Cerrar menú' : 'Abrir menú'" @click="menuOpen = !menuOpen"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path v-if="menuOpen" d="M6 6l12 12M18 6L6 18" />
          <path v-else d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <RouterLink to="/calendario" class="brand" aria-label="Saturno, inicio">
        <BrandMark :size="30" />
        <span class="brand-name">Saturno</span>
      </RouterLink>
      <nav aria-label="Principal">
        <RouterLink v-for="l in links" :key="l.to" :to="l.to">{{ l.label }}</RouterLink>
      </nav>
      <span class="spacer" />
      <RouterLink
        v-if="vacation"
        to="/solicitudes"
        class="balance-chip"
        :class="{ low: vacation.usable <= 3 }"
        :style="{ '--p': ratio }"
        :title="`Te quedan ${vacation.usable} días de vacaciones por pedir`"
      >
        <span class="ring" aria-hidden="true" />
        <span v-if="vacation.usable >= 0"><b>{{ vacation.usable }}</b> días libres</span>
        <span v-else><b>{{ -vacation.usable }}</b> días adelantados</span>
      </RouterLink>
      <span class="who">
        {{ session.user.name }}
        <small>{{ ROLE_LABELS[session.user.role] }}</small>
      </span>
      <button class="btn small" @click="exit">Salir</button>
    </div>
    <Transition name="drop">
      <div v-if="menuOpen" id="menu-movil" class="mobile-menu">
        <div class="mm-user">
          <b>{{ session.user.name }}</b>
          <small>{{ ROLE_LABELS[session.user.role] }}</small>
        </div>
        <RouterLink
          v-if="vacation" to="/solicitudes" class="balance-chip mm-chip"
          :class="{ low: vacation.usable <= 3 }" :style="{ '--p': ratio }"
        >
          <span class="ring" aria-hidden="true" />
          <span v-if="vacation.usable >= 0"><b>{{ vacation.usable }}</b> días libres</span>
          <span v-else><b>{{ -vacation.usable }}</b> días adelantados</span>
        </RouterLink>
        <nav class="mm-nav" aria-label="Principal">
          <RouterLink v-for="l in links" :key="l.to" :to="l.to">{{ l.label }}</RouterLink>
        </nav>
      </div>
    </Transition>
  </header>
  <div v-if="menuOpen" class="mm-backdrop" aria-hidden="true" @click="menuOpen = false" />
  <main>
    <RouterView v-slot="{ Component }">
      <Transition name="view" appear>
        <component :is="Component" />
      </Transition>
    </RouterView>
  </main>
</template>

<style scoped>
.topbar {
  position: sticky; top: 0; z-index: 10;
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  backdrop-filter: blur(16px) saturate(1.6); -webkit-backdrop-filter: blur(16px) saturate(1.6);
  border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
}
.topbar-inner {
  max-width: 1320px; margin: 0 auto; padding: 10px 16px;
  display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
}
.brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--text); }
.brand-name {
  font-family: var(--font-mystic); font-weight: 700; font-size: 1.2rem; letter-spacing: .08em;
  background: linear-gradient(110deg, var(--primary), var(--primary-2) 60%, #e5676c);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}

nav { display: flex; gap: 2px; flex-wrap: wrap; }
nav a {
  position: relative; color: var(--muted); text-decoration: none; font-weight: 600; font-size: .92rem;
  padding: 7px 12px; border-radius: 10px; transition: color .2s, background .2s;
}
nav a:hover { color: var(--text); background: color-mix(in srgb, var(--text) 5%, transparent); }
nav a.router-link-active { color: var(--text); }
nav a.router-link-active::after {
  content: ''; position: absolute; left: 12px; right: 12px; bottom: 2px; height: 3px; border-radius: 3px;
  background: linear-gradient(90deg, var(--primary), var(--primary-2));
  animation: grow .35s var(--ease-out);
}
@keyframes grow { from { transform: scaleX(0); } }
.spacer { flex: 1; }

.balance-chip {
  --tone: var(--success);
  display: inline-flex; align-items: center; gap: 8px; text-decoration: none; color: var(--text);
  font-size: .86rem; padding: 5px 12px 5px 6px; border-radius: 999px;
  background: color-mix(in srgb, var(--tone) 11%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--tone) 30%, transparent);
  transition: transform .15s var(--ease-out);
}
.balance-chip:hover { transform: translateY(-1px); }
.balance-chip b { color: var(--tone); font-size: .95rem; }
.balance-chip.low { --tone: var(--warning); }
.ring {
  width: 22px; height: 22px; border-radius: 50%;
  background: conic-gradient(var(--tone) calc(var(--p) * 360deg), color-mix(in srgb, var(--tone) 18%, transparent) 0);
  -webkit-mask: radial-gradient(circle, transparent 6px, #000 7px); mask: radial-gradient(circle, transparent 6px, #000 7px);
}

.who { display: grid; font-size: .88rem; font-weight: 600; line-height: 1.2; text-align: right; min-width: 0; }
.who small { color: var(--muted); font-weight: 500; }
@media (max-width: 760px) {
  .who { max-width: 40vw; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .who small { display: none; }
}

/* ---- Móvil: logo, usuario y «Salir» en una fila; secciones y saldo en un desplegable ---- */
.menu-btn, .mobile-menu, .mm-backdrop { display: none; }
@media (max-width: 760px) {
  .topbar-inner { flex-wrap: nowrap; gap: 10px; padding: 8px 12px; }
  .topbar-inner > nav, .topbar-inner > .balance-chip { display: none; }
  .menu-btn { display: inline-grid; place-items: center; flex: none; }
  .brand { min-width: 0; flex: none; }
  .who { flex: 1; }
  .mobile-menu {
    display: grid; gap: 12px; padding: 12px 16px 16px;
    border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  }
  .mm-user { display: grid; line-height: 1.25; }
  .mm-user small { color: var(--muted); }
  .mm-chip { justify-self: start; }
  .mm-nav { display: grid; gap: 2px; }
  .mm-nav a {
    color: var(--text); text-decoration: none; font-weight: 600; padding: 11px 12px; border-radius: 12px;
  }
  .mm-nav a.router-link-active {
    background: var(--primary-soft); color: var(--primary);
    box-shadow: inset 3px 0 0 var(--primary);
  }
  .mm-nav a.router-link-active::after { display: none; } /* el subrayado es del menú de escritorio */
  .mm-backdrop { display: block; position: fixed; inset: 0; z-index: 9; background: rgb(11 9 24 / 30%); }
}
.drop-enter-active, .drop-leave-active { transition: opacity .2s, transform .25s var(--ease-out); }
.drop-enter-from, .drop-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
