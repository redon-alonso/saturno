<script setup>
defineProps({ size: { type: Number, default: 32 } });
</script>

<template>
  <!-- Saturno con sus anillos: el mismo dibujo que el favicon (public/saturno.svg) -->
  <img src="/saturno.svg" :width="size" :height="size" class="mark" alt="" />
</template>

<style scoped>
.mark { flex: none; filter: drop-shadow(0 4px 12px rgb(131 128 245 / 50%)); transition: transform .6s var(--ease-out); }
.mark:hover { transform: rotate(-12deg) scale(1.08); }
</style>
