<script setup lang="ts">
defineProps<{
  label: string
}>()
</script>

<template>
  <div
    class="spinner"
    role="status"
    :aria-label="label"
  />
</template>

<style scoped>
.spinner {
  width: 64px;
  height: 64px;
  border: 6px solid #000000;
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  filter: drop-shadow(0 0 1px #000000) drop-shadow(0 4px 12px rgb(0 0 0 / 35%));
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
