<script setup lang="ts">
import {useRouter} from 'vue-router'

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
      <h1 class="title">
        Meme IQ
      </h1>
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
  background: var(--ground) url('@/assets/background.jpg') center / cover no-repeat;
}

.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3.5rem;
  transform: translateY(-4vh);
}

.title {
  font-family: var(--font-display);
  font-size: clamp(3.5rem, 9vw, 5.25rem);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-main);
  text-align: center;
  line-height: 1.05;
  -webkit-text-stroke: 2.5px #000000;
  paint-order: stroke fill;
  text-shadow: 0 6px 18px rgb(0 0 0 / 50%);
}

.start-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 160px;
  min-height: 48px;
  padding: 0.75rem 2.5rem;
  background: var(--accent);
  color: var(--accent-contrast);
  border: 2px solid #ffffff;
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  cursor: pointer;
  box-shadow: 0 6px 20px rgb(0 0 0 / 25%);
  transition: filter 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease;
}

.start-button:hover {
  filter: brightness(1.08);
  box-shadow: 0 8px 24px rgb(0 0 0 / 35%);
}

.start-button:active {
  filter: brightness(0.95);
  transform: scale(0.98);
  box-shadow: 0 4px 12px rgb(0 0 0 / 20%);
}
</style>
