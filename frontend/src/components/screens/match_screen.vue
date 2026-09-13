<script setup lang="ts">
</script>

<template>
  <main class="match-screen">
    <div class="content">
      <h1 class="title">
        MATCH
      </h1>
    </div>
  </main>
</template>

<style scoped>
.match-screen {
  display: grid;
  place-items: center;
  min-height: 100%;
  width: 100%;
  padding: 1.5rem;
}

.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.title {
  font-family: var(--font-mono);
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--text-main);
}
</style>
