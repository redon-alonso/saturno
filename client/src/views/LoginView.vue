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
    <!-- Escena nocturna: órbitas, el planeta, destellos y alguna estrella fugaz -->
    <div class="cosmos" aria-hidden="true">
      <div class="orbits"><span v-for="i in 3" :key="i" :class="`orbit o${i}`" /></div>
      <img class="planet" src="/planeta.svg" alt="" />
      <span v-for="i in 5" :key="`s${i}`" :class="`sparkle s${i}`" />
      <span class="shooting" />
      <span class="shooting late" />
    </div>
    <form class="panel stack" :class="{ shake: error }" @submit.prevent="submit">
      <div class="brand">
        <BrandMark :size="42" />
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
      <p class="motto">El tiempo, bien repartido</p>
    </form>
  </div>
</template>

<style scoped>
.login { position: relative; min-height: 100vh; display: grid; place-items: center; padding: 16px; overflow: hidden; }

/* La entrada es siempre de noche, también con el tema claro */
.cosmos {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(60vmax 45vmax at 78% 18%, rgb(155 108 242 / 32%), transparent 70%),
    radial-gradient(45vmax 35vmax at 10% 90%, rgb(229 103 108 / 14%), transparent 70%),
    radial-gradient(120vmax 90vmax at 50% 40%, #241a5c, #0b0820 70%);
}
/* Las estrellas globales (styles.css) quedan detrás de esta escena: aquí van las suyas */
.cosmos::before {
  content: ''; position: absolute; inset: 0;
  background-image:
    radial-gradient(1.5px 1.5px at 29px 53px, #fff, transparent),
    radial-gradient(1px 1px at 143px 97px, #fff, transparent),
    radial-gradient(1.2px 1.2px at 211px 181px, #ffd3d5, transparent),
    radial-gradient(1px 1px at 67px 223px, #fff, transparent),
    radial-gradient(2px 2px at 283px 37px, #fff, transparent),
    radial-gradient(1px 1px at 317px 251px, #e3c9ff, transparent),
    radial-gradient(1.3px 1.3px at 89px 307px, #fff, transparent);
  background-size: 353px 347px;
  animation: twinkle 6s ease-in-out infinite alternate;
}

/* Órbitas: elipses punteadas, inclinadas en 3D, que giran muy despacio */
.orbits { position: absolute; left: 50%; top: 50%; width: 0; height: 0; perspective: 1200px; }
.orbit {
  position: absolute; left: 50%; top: 50%; border-radius: 50%;
  border: 1px dashed rgb(201 184 255 / 22%);
  transform: translate(-50%, -50%) rotateX(72deg) rotateZ(0deg);
  animation: orbit 120s linear infinite;
}
.o1 { width: 620px; height: 620px; }
.o2 { width: 940px; height: 940px; border-style: dotted; animation-duration: 180s; animation-direction: reverse; }
.o3 { width: 1300px; height: 1300px; border-color: rgb(255 211 213 / 12%); animation-duration: 240s; }
@keyframes orbit { to { transform: translate(-50%, -50%) rotateX(72deg) rotateZ(360deg); } }

.planet {
  position: absolute; width: min(480px, 62vw); right: max(-60px, 3vw); top: 10vh;
  filter: drop-shadow(0 0 70px rgb(177 140 248 / 55%));
  animation: float 16s ease-in-out infinite alternate;
}
@keyframes float { to { transform: translate3d(-18px, 22px, 0) rotate(-4deg); } }

/* Destellos de cuatro puntas */
.sparkle {
  position: absolute; width: 22px; height: 22px; background: #fff4fb;
  clip-path: polygon(50% 0, 56% 44%, 100% 50%, 56% 56%, 50% 100%, 44% 56%, 0 50%, 44% 44%);
  animation: glimmer 5s ease-in-out infinite;
}
.s1 { left: 12%; top: 18%; }
.s2 { left: 22%; top: 76%; width: 14px; height: 14px; background: #ffd3d5; animation-delay: -1.5s; }
.s3 { right: 9%; bottom: 14%; width: 18px; height: 18px; animation-delay: -3s; }
.s4 { left: 6%; top: 48%; width: 10px; height: 10px; background: #bdf0df; animation-delay: -2.2s; }
.s5 { right: 38%; top: 9%; width: 12px; height: 12px; background: #e3c9ff; animation-delay: -4s; }
@keyframes glimmer { 0%, 100% { opacity: .25; transform: scale(.6) rotate(0); } 50% { opacity: 1; transform: scale(1) rotate(45deg); } }

/* Estrella fugaz: cruza en un instante y luego espera */
.shooting {
  position: absolute; left: 8%; top: 12%; width: 160px; height: 1.5px; opacity: 0;
  background: linear-gradient(90deg, transparent, #fff4fb);
  transform: rotate(18deg); transform-origin: left center;
  animation: shoot 11s ease-in 3s infinite;
}
.shooting.late { left: 45%; top: 5%; width: 120px; animation-duration: 17s; animation-delay: 9s; }
@keyframes shoot {
  0% { opacity: 0; translate: 0 0; }
  2% { opacity: 1; }
  7% { opacity: 0; translate: 380px 125px; }
  100% { opacity: 0; translate: 380px 125px; }
}
@keyframes twinkle { from { opacity: .4; } to { opacity: 1; } }

.panel {
  position: relative; width: min(400px, 100%); padding: 32px; gap: 16px;
  background: color-mix(in srgb, var(--surface) 80%, transparent);
  backdrop-filter: blur(18px) saturate(1.5); -webkit-backdrop-filter: blur(18px) saturate(1.5);
  border: 1px solid rgb(201 184 255 / 30%);
  border-radius: 24px;
  box-shadow: var(--shadow-lg), 0 0 0 1px rgb(255 255 255 / 4%) inset, 0 0 80px -20px rgb(155 108 242 / 60%);
  animation: rise .8s var(--ease-out) both;
}
@keyframes rise { from { opacity: 0; transform: translateY(16px) scale(.98); filter: blur(4px); } }
.shake { animation: shake .4s; }
@keyframes shake { 20%, 60% { transform: translateX(-6px); } 40%, 80% { transform: translateX(6px); } }

.brand { display: flex; gap: 14px; align-items: center; margin-bottom: 6px; }
.brand h1 {
  margin: 0; font-family: var(--font-mystic); font-size: 2rem; font-weight: 700; letter-spacing: .08em;
  background: linear-gradient(110deg, var(--primary), var(--primary-2) 55%, #e5676c);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.brand p { margin: 2px 0 0; font-size: .9rem; }
.big { padding: 11px; font-size: 1rem; }
.motto {
  margin: 2px 0 0; text-align: center; font-family: var(--font-mystic); font-size: .72rem;
  letter-spacing: .28em; text-transform: uppercase; color: var(--muted);
}

@media (max-width: 560px) {
  .planet { width: 300px; right: -90px; top: -40px; opacity: .7; }
  .orbits, .shooting { display: none; }
}
</style>
