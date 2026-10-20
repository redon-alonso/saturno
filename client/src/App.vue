<script setup>
import { computed } from 'vue';
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
  return v && v.total > 0 ? Math.max(0, Math.min(1, v.available / v.total)) : 0;
});
const initials = computed(() =>
  (session.user?.name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase());

function exit() {
  logout();
  router.push('/login');
}
</script>

<template>
  <header v-if="session.user && !route.meta.public" class="topbar">
    <div class="topbar-inner">
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
        :class="{ low: vacation.available <= 3 }"
        :style="{ '--p': ratio }"
        :title="`Te quedan ${num(vacation.available)} días de vacaciones por pedir`"
      >
        <span class="ring" aria-hidden="true" />
        <span><b>{{ num(vacation.available) }}</b> días libres</span>
      </RouterLink>
      <span class="who">
        <span class="avatar" aria-hidden="true">{{ initials }}</span>
        <span class="who-text">
          {{ session.user.name }}
          <small>{{ ROLE_LABELS[session.user.role] }}</small>
        </span>
      </span>
      <button class="btn small" @click="exit">Salir</button>
    </div>
  </header>
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

.who { display: flex; align-items: center; gap: 9px; }
.avatar {
  display: grid; place-items: center; width: 34px; height: 34px; border-radius: 11px; flex: none;
  font-size: .78rem; font-weight: 800; color: #fff;
  background: linear-gradient(135deg, var(--primary-2), var(--primary));
}
.who-text { display: grid; font-size: .88rem; font-weight: 600; line-height: 1.2; }
.who-text small { color: var(--muted); font-weight: 500; }
@media (max-width: 760px) { .who-text { display: none; } }
</style>
