<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, watch} from 'vue'
import {THUMBNAIL_RATIO} from '@/constants'
import {memeCatalogue, pickRandomMemes} from '@/services/meme_catalogue'
import {extractYouTubeVideoId, getYouTubeThumbnailUrl} from '@/services/youtube'
import {YouTubeAudioPlayer} from '@/services/youtube_player'
import type {Meme} from '@/types/meme'

const selectedMemes = ref<Meme[]>([])
const activeMeme = ref<Meme | null>(null)
const isPlaying = ref(false)
const isPlayerReady = ref(false)
const playerHostElement = ref<HTMLElement | null>(null)

let audioPlayer: YouTubeAudioPlayer | null = null

const actionButtonText = computed(() => {
  if (isPlaying.value) {
    return 'STOP'
  }
  if (!isPlayerReady.value || activeMeme.value === null) {
    return 'LOADING...'
  }
  return 'PLAY'
})

const isActionButtonDisabled = computed(() => {
  if (isPlaying.value) {
    return false
  }
  return !isPlayerReady.value || activeMeme.value === null
})

/**
 * Loads a new random selection of memes and picks one target meme.
 */
function refreshSelection(): void {
  if (memeCatalogue.value.length > 0) {
    selectedMemes.value = pickRandomMemes(3)
    const randomIndex = Math.floor(Math.random() * selectedMemes.value.length)
    activeMeme.value = selectedMemes.value[randomIndex] ?? null
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
 * Meme card click handler (placeholder for future match interaction).
 * @param _meme - Clicked meme card.
 */
function handleCardClick(_meme: Meme): void {
  // Placeholder: does nothing for now.
}

/**
 * Initializes or remounts the YouTube audio player for the current active meme.
 */
function setupAudioPlayer(): void {
  isPlayerReady.value = false
  if (audioPlayer === null) {
    audioPlayer = new YouTubeAudioPlayer({
      onEnded: (): void => {
        isPlaying.value = false
      },
      onError: (): void => {
        isPlayerReady.value = false
        isPlaying.value = false
      },
      onReady: (): void => {
        isPlayerReady.value = true
      },
    })
  }

  if (activeMeme.value !== null && playerHostElement.value !== null) {
    const videoId = extractYouTubeVideoId(activeMeme.value.url)
    if (videoId !== null) {
      void audioPlayer.mount(playerHostElement.value, videoId)
    }
  }
}

/**
 * Toggles meme audio playback (plays when ready/stopped, stops when playing).
 */
function handleTogglePlayback(): void {
  if (isPlaying.value) {
    audioPlayer?.stop()
    isPlaying.value = false
    return
  }

  if (!isPlayerReady.value || activeMeme.value === null || audioPlayer === null) {
    return
  }

  isPlaying.value = true
  audioPlayer.play()
}

onMounted(() => {
  refreshSelection()
})

onUnmounted(() => {
  if (audioPlayer !== null) {
    audioPlayer.destroy()
    audioPlayer = null
  }
})

watch(
  () => memeCatalogue.value,
  () => {
    if (selectedMemes.value.length === 0) {
      refreshSelection()
    }
  },
)

watch(
  () => activeMeme.value,
  (newMeme) => {
    if (newMeme !== null && playerHostElement.value !== null) {
      setupAudioPlayer()
    }
  },
)
</script>

<template>
  <main class="match-screen">
    <h1 class="visually-hidden">
      Match
    </h1>

    <div
      ref="playerHostElement"
      class="audio-player-host"
      aria-hidden="true"
      tabindex="-1"
    />

    <div class="content">
      <div class="thumbnails-column">
        <button
          v-for="meme in selectedMemes"
          :key="meme.id"
          type="button"
          class="card"
          @click="handleCardClick(meme)"
        >
          <img
            :src="getThumbnailUrl(meme.url)"
            :alt="meme.name"
            class="thumbnail-image"
            width="320"
            height="180"
            loading="eager"
          >
        </button>
      </div>

      <button
        type="button"
        class="action-button"
        :class="{'is-playing': isPlaying}"
        :disabled="isActionButtonDisabled"
        @click="handleTogglePlayback"
      >
        {{ actionButtonText }}
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

.card {
  display: block;
  width: 100%;
  padding: 0;
  margin: 0;
  border: 2px solid #ffffff;
  border-radius: 12px;
  background: var(--panel);
  cursor: pointer;
  overflow: hidden;
  line-height: 0;
  transition: filter 0.15s ease, transform 0.1s ease;
}

.card:hover {
  filter: brightness(1.08);
}

.card:active {
  filter: brightness(0.96);
  transform: scale(0.99);
}

.thumbnail-image {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: v-bind(THUMBNAIL_RATIO);
  object-fit: cover;
}

.action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 180px;
  min-height: 48px;
  padding: 0.75rem 1.5rem;
  background: var(--accent);
  color: var(--ground);
  border: 1px solid var(--accent);
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: filter 0.15s ease, transform 0.1s ease, opacity 0.15s ease, background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.action-button:hover:not(:disabled) {
  filter: brightness(1.12);
}

.action-button:active:not(:disabled) {
  filter: brightness(0.95);
  transform: scale(0.98);
}

.action-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.action-button.is-playing {
  background: #d9383a;
  border-color: #d9383a;
  color: #ffffff;
}

.audio-player-host {
  position: fixed;
  top: -9999px;
  left: -9999px;
  width: 200px;
  height: 200px;
  opacity: 0;
  pointer-events: none;
}
</style>
