<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, loadSession } from '../api.js';
import { setToken } from '../store.js';
import BrandMark from '../components/BrandMark.vue';

const route = useRoute();
const router = useRouter();
const email = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    const { token } = await api('/auth/login', { method: 'POST', body: { email: email.value, password: password.value } });
    setToken(token);
    await loadSession();
    router.replace(typeof route.query.next === 'string' ? route.query.next : '/calendario');
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="login">
    <!-- Barras decorativas que flotan detrás, como un calendario abstracto -->
    <div class="floaters" aria-hidden="true">
      <span v-for="i in 7" :key="i" :class="`f f${i}`" />
    </div>
    <form class="panel stack" :class="{ shake: error }" @submit.prevent="submit">
      <div class="brand">
        <BrandMark :size="48" />
        <div>
          <h1>Saturno</h1>
          <p class="muted">Vacaciones, permisos y teletrabajo</p>
        </div>
      </div>
      <label class="field">Correo
        <input v-model="email" type="email" autocomplete="username" required autofocus />
      </label>
      <label class="field">Contraseña
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button class="btn primary big" :disabled="busy">{{ busy ? 'Entrando…' : 'Entrar' }}</button>
    </form>
  </div>
</template>

<style scoped>
.login { position: relative; min-height: 100vh; display: grid; place-items: center; padding: 16px; overflow: hidden; }
.panel {
  position: relative; width: min(400px, 100%); padding: 32px; gap: 16px;
  background: color-mix(in srgb, var(--surface) 78%, transparent);
  backdrop-filter: blur(18px) saturate(1.5); -webkit-backdrop-filter: blur(18px) saturate(1.5);
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  border-radius: 24px; box-shadow: var(--shadow-lg);
  animation: rise .6s var(--ease-out) both;
}
@keyframes rise { from { opacity: 0; transform: translateY(16px) scale(.98); } }
.shake { animation: shake .4s; }
@keyframes shake { 20%, 60% { transform: translateX(-6px); } 40%, 80% { transform: translateX(6px); } }

.brand { display: flex; gap: 14px; align-items: center; margin-bottom: 6px; }
.brand h1 { margin: 0; font-size: 1.8rem; }
.brand p { margin: 2px 0 0; font-size: .9rem; }
.big { padding: 11px; font-size: 1rem; }

.floaters { position: absolute; inset: 0; pointer-events: none; }
.f {
  position: absolute; height: 18px; border-radius: 9px; opacity: .55;
  background: color-mix(in srgb, var(--c) 35%, transparent); box-shadow: inset 4px 0 0 var(--c);
  animation: drift 14s ease-in-out infinite alternate;
}
.f1 { --c: #e5676c; width: 180px; top: 14%; left: 8%; }
.f2 { --c: #e0a23a; width: 110px; top: 24%; right: 12%; animation-delay: -3s; }
.f3 { --c: #3e9ad6; width: 140px; top: 70%; left: 12%; animation-delay: -6s; }
.f4 { --c: #2fa58a; width: 90px; top: 82%; right: 18%; animation-delay: -2s; }
.f5 { --c: #9b6cf2; width: 220px; top: 58%; right: 6%; animation-delay: -8s; }
.f6 { --c: #e5676c; width: 70px; top: 40%; left: 4%; animation-delay: -5s; }
.f7 { --c: #3e9ad6; width: 120px; top: 8%; right: 30%; animation-delay: -10s; }
@keyframes drift { to { transform: translate3d(30px, -24px, 0); } }
@media (max-width: 560px) { .floaters { display: none; } }
</style>
