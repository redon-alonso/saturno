<script setup>
import { ref, watch, onMounted } from 'vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
});
const emit = defineEmits(['close']);
const el = ref(null);

function sync() {
  if (!el.value) return;
  if (props.open && !el.value.open) el.value.showModal();
  if (!props.open && el.value.open) el.value.close();
}
watch(() => props.open, sync);
onMounted(sync);
</script>

<template>
  <dialog ref="el" class="dialog" @close="emit('close')" @click.self="emit('close')">
    <div v-if="open" class="dialog-body">
      <header>
        <h2>{{ title }}</h2>
        <button class="btn icon close" aria-label="Cerrar" @click="emit('close')">✕</button>
      </header>
      <slot />
    </div>
  </dialog>
</template>

<style scoped>
.dialog {
  border: 1px solid var(--border); border-radius: 22px; padding: 0;
  background: var(--surface); color: var(--text); width: min(580px, calc(100vw - 32px));
  box-shadow: var(--shadow-lg);
}
.dialog[open] { animation: pop .32s var(--ease-out); }
@keyframes pop { from { opacity: 0; transform: translateY(12px) scale(.96); } }
.dialog::backdrop {
  background: color-mix(in srgb, #0d0c15 45%, transparent);
  backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
}
.dialog[open]::backdrop { animation: fade .3s ease; }
@keyframes fade { from { opacity: 0; } }
.dialog-body { padding: 22px 24px 24px; }
header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; }
header h2 { margin: 0; font-size: 1.35rem; }
.close { width: 32px; height: 32px; font-size: .85rem; }
</style>
