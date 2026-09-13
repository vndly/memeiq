<script setup lang="ts">
import faviconUrl from '@/assets/favicon.png'
</script>

<template>
  <main class="blank-screen">
    <img
      :src="faviconUrl"
      alt="Meme IQ logo"
      class="logo"
      width="128"
      height="128"
    >
  </main>
</template>

<style scoped>
.blank-screen {
  display: grid;
  place-items: center;
  min-height: 100%;
  width: 100%;
  padding: 1.5rem;
}

.logo {
  display: block;
  width: 128px;
  height: 128px;
  max-width: 100%;
  user-select: none;
}
</style>
