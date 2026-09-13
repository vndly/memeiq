<script setup lang="ts">
import {useRouter} from 'vue-router'
import faviconUrl from '@/assets/favicon.png'

const router = useRouter()

/**
 * Navigates to the match screen.
 */
function startMatch(): void {
  void router.push({
    name: 'match',
  })
}
</script>

<template>
  <main class="main-screen">
    <div class="content">
      <img
        :src="faviconUrl"
        alt="Meme IQ logo"
        class="logo"
        width="128"
        height="128"
      >
      <button
        type="button"
        class="start-button"
        @click="startMatch"
      >
        START
      </button>
    </div>
  </main>
</template>

<style scoped>
.main-screen {
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
  gap: 2.5rem;
}

.logo {
  display: block;
  width: 128px;
  height: 128px;
  max-width: 100%;
  user-select: none;
}

.start-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 160px;
  min-height: 48px;
  padding: 0.75rem 2.5rem;
  background: transparent;
  color: var(--text-main);
  border: 1px solid var(--accent);
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, transform 0.1s ease;
}

.start-button:hover {
  background: var(--accent);
  color: var(--ground);
}

.start-button:active {
  transform: scale(0.98);
}
</style>
