<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, watch} from 'vue'
import {onBeforeRouteLeave, useRoute, useRouter} from 'vue-router'
import type {RouteLocationRaw} from 'vue-router'
import failAudioUrl from '@/assets/fail.mp3'
import winAudioUrl from '@/assets/win.mp3'
import ConfirmDialog from '@/components/confirm_dialog.vue'
import {DEFAULT_DIFFICULTY, DIFFICULTY_CARD_COUNTS, THUMBNAIL_RATIO} from '@/constants'
import {analytics} from '@/services/analytics'
import {memeCatalogue, pickRandomMemes} from '@/services/meme_catalogue'
import {extractYouTubeVideoId, getYouTubeThumbnailUrl} from '@/services/youtube'
import {YouTubeAudioPlayer} from '@/services/youtube_player'
import {isDifficulty} from '@/types/difficulty'
import type {Difficulty} from '@/types/difficulty'
import type {Meme} from '@/types/meme'

const router = useRouter()
const route = useRoute()
const isConfirmOpen = ref(false)
const isNavigationConfirmed = ref(false)
const targetRoute = ref<RouteLocationRaw | null>(null)

const difficulty = computed<Difficulty>(() => {
  const queryDifficulty = route.query.difficulty
  if (typeof queryDifficulty === 'string' && isDifficulty(queryDifficulty)) {
    return queryDifficulty
  }
  return DEFAULT_DIFFICULTY
})

const cardCount = computed<number>(() => {
  return DIFFICULTY_CARD_COUNTS[difficulty.value]
})

const selectedMemes = ref<Meme[]>([])
const activeMeme = ref<Meme | null>(null)
const isPlaying = ref(false)
const isPlayerReady = ref(false)
const playerHostElement = ref<HTMLElement | null>(null)
const clickedMemeId = ref<number | null>(null)
const hasAudioPlayed = ref(false)

const winAudio = typeof Audio !== 'undefined' ? new Audio(winAudioUrl) : null
const failAudio = typeof Audio !== 'undefined' ? new Audio(failAudioUrl) : null

let audioPlayer: YouTubeAudioPlayer | null = null
let resetTimeoutId: ReturnType<typeof setTimeout> | null = null

const RESET_ROUND_DELAY_MS = 1000

const isCardDisabled = computed(() => {
  return clickedMemeId.value !== null || !hasAudioPlayed.value
})

const actionButtonText = computed(() => {
  if (isPlaying.value) {
    return 'STOP'
  }
  if (clickedMemeId.value !== null || !isPlayerReady.value || activeMeme.value === null) {
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
    selectedMemes.value = pickRandomMemes(cardCount.value)
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
 * Plays a sound effect from the beginning.
 * @param audio - Target audio element.
 */
function playSoundEffect(audio: HTMLAudioElement | null): void {
  if (audio !== null) {
    audio.currentTime = 0
    void audio.play().catch(() => {
      // Audio playback aborted or blocked
    })
  }
}

/**
 * Halts and rewinds active sound effects.
 */
function stopSoundEffects(): void {
  if (winAudio !== null) {
    winAudio.pause()
    winAudio.currentTime = 0
  }
  if (failAudio !== null) {
    failAudio.pause()
    failAudio.currentTime = 0
  }
}

/**
 * Resets match state by clearing selection, picking fresh memes, and reloading audio.
 */
function resetRound(): void {
  clickedMemeId.value = null
  isPlayerReady.value = false
  hasAudioPlayed.value = false
  if (resetTimeoutId !== null) {
    clearTimeout(resetTimeoutId)
    resetTimeoutId = null
  }
  stopSoundEffects()
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
  if (clickedMemeId.value !== null || activeMeme.value === null || !hasAudioPlayed.value) {
    return
  }

  clickedMemeId.value = meme.id

  if (isPlaying.value) {
    audioPlayer?.stop()
    isPlaying.value = false
  }

  const isCorrect = meme.id === activeMeme.value.id
  playSoundEffect(isCorrect ? winAudio : failAudio)

  const selectedVideoId = extractYouTubeVideoId(meme.url) ?? undefined
  const targetVideoId = extractYouTubeVideoId(activeMeme.value.url) ?? undefined
  analytics.trackThumbnailSelect({
    selectedVideoId: selectedVideoId,
    selectedVideoName: meme.name,
    targetVideoId: targetVideoId,
    targetVideoName: activeMeme.value.name,
    result: isCorrect ? 'success' : 'failure',
  })

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
      onPlaying: (): void => {
        hasAudioPlayed.value = true
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

  hasAudioPlayed.value = true
  isPlaying.value = true
  const videoId = extractYouTubeVideoId(activeMeme.value.url) ?? undefined
  analytics.trackAudioPlay({
    videoId: videoId,
    videoName: activeMeme.value.name,
  })
  audioPlayer.play()
}

/**
 * Stops active audio playback, sound effects, and pending round transitions.
 */
function haltPlayback(): void {
  if (isPlaying.value) {
    audioPlayer?.stop()
    isPlaying.value = false
  }
  stopSoundEffects()
  if (resetTimeoutId !== null) {
    clearTimeout(resetTimeoutId)
    resetTimeoutId = null
  }
}

/**
 * Confirms navigation away from the match screen.
 */
function handleConfirmLeave(): void {
  analytics.trackMatchLeave()
  isNavigationConfirmed.value = true
  isConfirmOpen.value = false
  const destination = targetRoute.value ?? {
    name: 'home',
  }
  void router.push(destination)
}

/**
 * Cancels navigation away from the match screen.
 */
function handleCancelLeave(): void {
  analytics.trackMatchStay()
  isConfirmOpen.value = false
  targetRoute.value = null
}

onBeforeRouteLeave((to) => {
  if (isNavigationConfirmed.value) {
    return true
  }

  haltPlayback()
  targetRoute.value = to
  isConfirmOpen.value = true
  analytics.trackLeaveDialogShown()
  return false
})

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
  stopSoundEffects()
})

watch(
  () => difficulty.value,
  () => {
    haltPlayback()
    resetRound()
  },
)

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

    <div
      class="content"
      :class="`content--${difficulty}`"
    >
      <div
        class="thumbnails"
        :class="`thumbnails--${difficulty}`"
      >
        <button
          v-for="meme in selectedMemes"
          :key="meme.id"
          type="button"
          class="card"
          :class="{
            'is-correct': clickedMemeId === meme.id && meme.id === activeMeme?.id,
            'is-incorrect': clickedMemeId === meme.id && meme.id !== activeMeme?.id,
          }"
          :disabled="isCardDisabled"
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
          <div
            v-if="clickedMemeId === meme.id"
            class="feedback-overlay"
            aria-hidden="true"
          >
            <svg
              v-if="meme.id === activeMeme?.id"
              class="feedback-icon is-correct"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <svg
              v-else
              class="feedback-icon is-incorrect"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
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

    <ConfirmDialog
      :is-open="isConfirmOpen"
      @confirm="handleConfirmLeave"
      @cancel="handleCancelLeave"
    />
  </main>
</template>

<style scoped>
.match-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100dvh;
  max-height: 100dvh;
  width: 100%;
  padding-top: max(0.75rem, env(safe-area-inset-top));
  padding-right: max(1rem, env(safe-area-inset-right));
  padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
  padding-left: max(1rem, env(safe-area-inset-left));
  overflow: hidden;
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
  justify-content: space-between;
  height: 100%;
  max-height: 100%;
  width: 100%;
  max-width: 480px;
  gap: 0.75rem;
}

.thumbnails {
  display: grid;
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
  align-items: center;
  justify-items: center;
}

.thumbnails--easy {
  grid-template-columns: 1fr;
  grid-template-rows: repeat(3, 1fr);
  gap: 0.5rem;
}

.thumbnails--medium {
  grid-template-columns: 1fr;
  grid-template-rows: repeat(4, 1fr);
  gap: 0.4rem;
}

.thumbnails--hard {
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 0.4rem;
}

.card {
  position: relative;
  display: block;
  height: auto;
  width: auto;
  max-height: 100%;
  max-width: 100%;
  aspect-ratio: v-bind(THUMBNAIL_RATIO);
  padding: 0;
  margin: 0;
  border: 3px solid #ffffff;
  border-radius: 8px;
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

.feedback-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 35%);
  pointer-events: none;
}

.feedback-icon {
  width: clamp(48px, 12vw, 104px);
  height: clamp(48px, 12vw, 104px);
  max-width: 75%;
  max-height: 75%;
  filter: drop-shadow(0 2px 8px rgb(0 0 0 / 60%));
}

.feedback-icon.is-correct {
  color: #34c759;
}

.feedback-icon.is-incorrect {
  color: #ff3b30;
}

.thumbnail-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.action-button {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 180px;
  min-height: 44px;
  padding: 0.65rem 1.5rem;
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

@media (min-width: 768px) {
  .match-screen {
    --card-gap: 1.5rem;
    height: auto;
    min-height: 100%;
    max-height: none;
    overflow: visible;
    padding: 1.5rem var(--card-gap);
  }

  .content {
    height: auto;
    max-height: none;
    max-width: 100%;
    justify-content: center;
    gap: 2.75rem;
  }

  .thumbnails {
    flex: none;
    height: auto;
    width: 100%;
    gap: var(--card-gap);
  }

  .thumbnails--easy {
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: none;
  }

  .thumbnails--medium {
    grid-template-columns: repeat(2, 1fr);
    grid-template-rows: none;
    max-width: calc((100% - 2 * var(--card-gap)) * 2 / 3 + var(--card-gap));
  }

  .thumbnails--hard {
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: none;
  }

  .card {
    height: auto;
    width: 100%;
    max-height: none;
    aspect-ratio: auto;
    border-width: 4px;
    border-radius: 12px;
  }

  .thumbnail-image {
    aspect-ratio: v-bind(THUMBNAIL_RATIO);
    height: auto;
  }

  .action-button {
    min-height: 48px;
    padding: 0.75rem 1.5rem;
  }
}

</style>
