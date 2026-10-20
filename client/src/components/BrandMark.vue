<script setup>
defineProps({ size: { type: Number, default: 32 } });
</script>

<template>
  <!-- Saturno: el planeta con su anillo, con la paleta de la aplicación -->
  <svg :width="size" :height="size" viewBox="0 0 32 32" class="mark" aria-hidden="true">
    <defs>
      <linearGradient id="saturno-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#8380f5" />
        <stop offset="1" stop-color="#b18cf8" />
      </linearGradient>
    </defs>
    <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#saturno-g)" />
    <!-- Mitad trasera del anillo, el planeta y la mitad delantera encima -->
    <ellipse cx="16" cy="16" rx="12" ry="4" transform="rotate(-20 16 16)" fill="none" stroke="#ffd3d5" stroke-width="1.6" opacity=".6" />
    <circle cx="16" cy="16" r="6.5" fill="#fff" opacity=".95" />
    <circle cx="14" cy="14" r="2.2" fill="#bdf0df" opacity=".7" />
    <path d="M4.7 20.1 A12 4 -20 0 0 27.3 11.9" transform="" fill="none" stroke="#ffd3d5" stroke-width="1.6" stroke-linecap="round" />
  </svg>
</template>

<style scoped>
.mark { flex: none; filter: drop-shadow(0 4px 10px rgb(131 128 245 / 45%)); transition: transform .4s var(--ease-out); }
.mark:hover { transform: rotate(-8deg) scale(1.06); }
</style>
