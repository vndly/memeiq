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
  border: 8px solid var(--paper);
  border-top-color: var(--accent);
  border-radius: 50%;
  box-shadow: 0 0 0 3px var(--ink), inset 0 0 0 3px var(--ink);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
