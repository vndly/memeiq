<script setup lang="ts">
import {catalogueError, fetchMemeCatalogue, isCatalogueLoading} from '@/services/meme_catalogue'

/**
 * Retries fetching the meme catalogue.
 */
function retryFetch(): void {
  void fetchMemeCatalogue()
}
</script>

<template>
  <main class="loading-screen">
    <div
      v-if="isCatalogueLoading"
      class="content"
    >
      <div
        class="spinner"
        role="status"
        aria-label="Loading meme catalogue"
      />
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
}

.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.spinner {
  width: 44px;
  height: 44px;
  border: 3px solid rgb(255 255 255 / 20%);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  color: var(--text-dim);
}

.error-content {
  text-align: center;
  max-width: 360px;
}

.error-text {
  font-family: var(--font-mono);
  font-size: 0.95rem;
  line-height: 1.4;
  color: var(--text-main);
}

.retry-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 140px;
  min-height: 44px;
  padding: 0.6rem 2rem;
  background: var(--accent);
  color: var(--accent-contrast);
  border: 2px solid #ffffff;
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  cursor: pointer;
  box-shadow: 0 6px 20px rgb(0 0 0 / 25%);
  transition: filter 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease;
}

.retry-button:hover {
  filter: brightness(1.08);
  box-shadow: 0 8px 24px rgb(0 0 0 / 35%);
}

.retry-button:active {
  filter: brightness(0.95);
  transform: scale(0.98);
  box-shadow: 0 4px 12px rgb(0 0 0 / 20%);
}
</style>
