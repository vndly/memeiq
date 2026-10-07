<script setup lang="ts">
import LoadingSpinner from '@/components/loading_spinner.vue'
import {catalogueError, fetchMemeCatalogue, isCatalogueLoading} from '@/services/meme_catalogue'
import {playButtonSound} from '@/services/sound_effects'

/**
 * Retries fetching the meme catalogue.
 */
function retryFetch(): void {
  playButtonSound()
  void fetchMemeCatalogue()
}
</script>

<template>
  <main class="loading-screen">
    <div
      v-if="isCatalogueLoading"
      class="content"
    >
      <LoadingSpinner label="Loading meme catalogue" />
      <p class="loading-text">
        Loading...
      </p>
    </div>
    <div
      v-else-if="catalogueError"
      class="content error-content"
    >
      <p class="error-text">
        {{ catalogueError }}
      </p>
      <button
        type="button"
        class="retry-button"
        @click="retryFetch"
      >
        RETRY
      </button>
    </div>
  </main>
</template>

<style scoped>
.loading-screen {
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
  gap: 2rem;
}

.loading-text {
  font-family: var(--font-display);
  font-size: clamp(2.75rem, 10vw, 3.75rem);
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-main);
  text-align: center;
  line-height: 1;
  -webkit-text-stroke: 7px var(--ink);
  paint-order: stroke fill;
  text-shadow: 0 5px 0 var(--ink);
}

.error-content {
  gap: 1.5rem;
  max-width: 360px;
  padding: 1.75rem 1.5rem 2rem;
  text-align: center;
  background: var(--paper);
  border: 3px solid var(--ink);
  border-radius: 20px;
  box-shadow: 0 8px 0 var(--ink);
}

.error-text {
  font-family: var(--font-ui);
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.45;
  color: var(--ink);
}

.retry-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 160px;
  min-height: 52px;
  padding: 0.5rem 2rem;
  background: var(--accent);
  color: var(--ink);
  border: 3px solid var(--ink);
  border-radius: 12px;
  font-family: var(--font-display);
  font-size: 1.5rem;
  line-height: 1;
  letter-spacing: 0.05em;
  cursor: pointer;
  box-shadow: 0 5px 0 var(--ink);
  transition: filter 0.15s ease, transform 0.08s ease, box-shadow 0.08s ease;
}

.retry-button:hover {
  filter: brightness(1.06);
}

.retry-button:active {
  transform: translateY(4px);
  box-shadow: 0 1px 0 var(--ink);
}
</style>
