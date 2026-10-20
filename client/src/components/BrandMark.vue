<script setup>
defineProps({ size: { type: Number, default: 32 } });
</script>

<template>
  <!-- El planeta suelto, sin el recuadro del favicon, para que flote sobre la cabecera -->
  <img src="/planeta.svg" :width="Math.round(size * 52 / 28)" :height="size" class="mark" alt="" />
</template>

<style scoped>
.mark {
  flex: none; object-fit: contain; overflow: visible;
  filter: drop-shadow(0 0 1px color-mix(in srgb, var(--primary) 70%, transparent))
          drop-shadow(0 2px 10px color-mix(in srgb, var(--primary-2) 55%, transparent));
  transition: transform .6s var(--ease-out);
}
.mark:hover { transform: rotate(-10deg) scale(1.08); }
</style>
