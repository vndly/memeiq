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
const clickedMemeId = ref<number | null>(null)

let audioPlayer: YouTubeAudioPlayer | null = null
let resetTimeoutId: ReturnType<typeof setTimeout> | null = null

const RESET_ROUND_DELAY_MS = 2000

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
  if (clickedMemeId.value !== null) {
    return true
  }
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
 * Resets match state by clearing selection, picking fresh memes, and reloading audio.
 */
function resetRound(): void {
  clickedMemeId.value = null
  if (resetTimeoutId !== null) {
    clearTimeout(resetTimeoutId)
    resetTimeoutId = null
  }
  const previousActiveMeme = activeMeme.value
  refreshSelection()
  if (previousActiveMeme === activeMeme.value && activeMeme.value !== null) {
    setupAudioPlayer()
  }
}

/**
 * Handles meme card selection, visual match feedback, sound cutoff, and scheduled reset.
 * @param meme - Clicked meme card.
 */
function handleCardClick(meme: Meme): void {
  if (clickedMemeId.value !== null || activeMeme.value === null) {
    return
  }

  clickedMemeId.value = meme.id

  if (isPlaying.value) {
    audioPlayer?.stop()
    isPlaying.value = false
  }

  resetTimeoutId = setTimeout(() => {
    resetRound()
  }, RESET_ROUND_DELAY_MS)
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
  if (resetTimeoutId !== null) {
    clearTimeout(resetTimeoutId)
    resetTimeoutId = null
  }
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
          :class="{
            'is-correct': clickedMemeId === meme.id && meme.id === activeMeme?.id,
            'is-incorrect': clickedMemeId === meme.id && meme.id !== activeMeme?.id,
          }"
          :disabled="clickedMemeId !== null"
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
  background: var(--ground) url('@/assets/background.jpg') center / cover no-repeat;
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
  gap: 2.25rem;
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
  box-shadow: 0 8px 24px rgb(0 0 0 / 25%);
  transition: border-color 0.15s ease, filter 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease;
}

.card:hover:not(:disabled) {
  border-color: var(--accent);
  filter: brightness(1.08);
  box-shadow: 0 10px 28px rgb(0 0 0 / 35%);
}

.card:active:not(:disabled) {
  filter: brightness(0.96);
  transform: scale(0.99);
  box-shadow: 0 4px 14px rgb(0 0 0 / 20%);
}

.card:disabled {
  cursor: default;
}

.card.is-correct {
  border-color: #34c759;
  box-shadow: 0 0 16px rgb(52 199 89 / 40%), 0 8px 24px rgb(0 0 0 / 25%);
}

.card.is-incorrect {
  border-color: #ff3b30;
  box-shadow: 0 0 16px rgb(255 59 48 / 40%), 0 8px 24px rgb(0 0 0 / 25%);
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
  margin-top: 0.5rem;
  padding: 0.75rem 1.5rem;
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
  transition: filter 0.15s ease, transform 0.1s ease, opacity 0.15s ease, background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}

.action-button:hover:not(:disabled) {
  filter: brightness(1.08);
  box-shadow: 0 8px 24px rgb(0 0 0 / 35%);
}

.action-button:active:not(:disabled) {
  filter: brightness(0.95);
  transform: scale(0.98);
  box-shadow: 0 4px 12px rgb(0 0 0 / 20%);
}

.action-button:disabled {
  background: #475569;
  border-color: #64748b;
  color: #cbd5e1;
  cursor: not-allowed;
  box-shadow: none;
  filter: none;
}

.action-button.is-playing {
  background: #ff3b30;
  border-color: #ffffff;
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
