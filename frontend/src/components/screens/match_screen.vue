<script setup lang="ts">
import {onMounted, ref, watch} from 'vue'
import {memeCatalogue, pickRandomMemes} from '@/services/meme_catalogue'
import {getYouTubeThumbnailUrl} from '@/services/youtube'
import type {Meme} from '@/types/meme'

const selectedMemes = ref<Meme[]>([])

/**
 * Loads a new random selection of memes into the match screen.
 */
function refreshSelection(): void {
  if (memeCatalogue.value.length > 0) {
    selectedMemes.value = pickRandomMemes(3)
  }
}

/**
 * Resolves the YouTube thumbnail URL for a given video URL.
 * @param videoUrl - Full URL to YouTube video.
 * @returns URL string for the thumbnail image.
 */
function getThumbnailUrl(videoUrl: string): string {
  return getYouTubeThumbnailUrl(videoUrl) ?? ''
}

/**
 * Action button click handler (placeholder for future match interaction).
 */
function handleAction(): void {
  // Placeholder: does nothing for now.
}

onMounted(() => {
  refreshSelection()
})

watch(
  () => memeCatalogue.value,
  () => {
    if (selectedMemes.value.length === 0) {
      refreshSelection()
    }
  },
)
</script>

<template>
  <main class="match-screen">
    <h1 class="visually-hidden">
      Match
    </h1>

    <div class="content">
      <div class="thumbnails-column">
        <img
          v-for="meme in selectedMemes"
          :key="meme.id"
          :src="getThumbnailUrl(meme.url)"
          :alt="meme.name"
          class="thumbnail-image"
          width="320"
          height="180"
          loading="eager"
        >
      </div>

      <button
        type="button"
        class="action-button"
        @click="handleAction"
      >
        CONTINUE
      </button>
    </div>
  </main>
</template>

<style scoped>
.match-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  width: 100%;
  padding: 1.5rem;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  width: 100%;
  max-width: 360px;
}

.thumbnails-column {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
}

.thumbnail-image {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border: 2px solid #ffffff;
  border-radius: 4px;
  background: var(--panel);
}

.action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 160px;
  min-height: 48px;
  padding: 0.75rem 2.5rem;
  background: var(--accent);
  color: var(--ground);
  border: 1px solid var(--accent);
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: filter 0.15s ease, transform 0.1s ease;
}

.action-button:hover {
  filter: brightness(1.12);
}

.action-button:active {
  filter: brightness(0.95);
  transform: scale(0.98);
}
</style>
