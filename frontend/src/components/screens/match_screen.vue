<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, watch} from 'vue'
import {onBeforeRouteLeave, useRoute, useRouter} from 'vue-router'
import type {RouteLocationRaw} from 'vue-router'
import failAudioUrl from '@/assets/fail.mp3'
import winAudioUrl from '@/assets/win.mp3'
import ConfirmDialog from '@/components/confirm_dialog.vue'
import LoadingSpinner from '@/components/loading_spinner.vue'
import PauseDialog from '@/components/pause_dialog.vue'
import {DEFAULT_DIFFICULTY, DEFAULT_MATCH_LENGTH, DIFFICULTY_CARD_COUNTS, THUMBNAIL_RATIO} from '@/constants'
import {analytics} from '@/services/analytics'
import {getMatchMemeCount, memeCatalogue, pickStageMemes, shuffleMemes} from '@/services/meme_catalogue'
import {loadThumbnail} from '@/services/thumbnail_loader'
import {extractYouTubeVideoId, getYouTubeThumbnailUrl} from '@/services/youtube'
import {YouTubeAudioPlayer} from '@/services/youtube_player'
import {isDifficulty} from '@/types/difficulty'
import type {Difficulty} from '@/types/difficulty'
import {isMatchLength} from '@/types/match_length'
import type {MatchLength} from '@/types/match_length'
import type {Meme} from '@/types/meme'

const router = useRouter()
const route = useRoute()
const isPauseOpen = ref(false)
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

const matchLength = computed<MatchLength>(() => {
  const queryMatchLength = route.query.length
  if (typeof queryMatchLength === 'string' && isMatchLength(queryMatchLength)) {
    return queryMatchLength
  }
  return DEFAULT_MATCH_LENGTH
})

const cardCount = computed<number>(() => {
  return DIFFICULTY_CARD_COUNTS[difficulty.value]
})

const stageTargetMemes = ref<Meme[]>([])
const stageIndex = ref(0)
const correctAnswerCount = ref(0)
const isStageLoading = ref(true)
const isMatchComplete = ref(false)
const selectedMemes = ref<Meme[]>([])
const thumbnailUrls = ref<Record<number, string>>({})
const activeMeme = ref<Meme | null>(null)
const isPlayerReady = ref(false)
const isAudioUnavailable = ref(false)
const playerHostElement = ref<HTMLElement | null>(null)
const clickedMemeId = ref<number | null>(null)
const hasAudioPlayed = ref(false)
const isPlayButtonVisible = ref(false)
const isPlayButtonPressed = ref(false)

const winAudio = typeof Audio !== 'undefined' ? new Audio(winAudioUrl) : null
const failAudio = typeof Audio !== 'undefined' ? new Audio(failAudioUrl) : null

let audioPlayer: YouTubeAudioPlayer | null = null
let resetTimeoutId: ReturnType<typeof setTimeout> | null = null
let autoplayCheckTimeoutId: ReturnType<typeof setTimeout> | null = null
let resolveAudioLoad: (() => void) | null = null
let isAudioPausedByDialog = false
let stageLoadGeneration = 0

const RESET_ROUND_DELAY_MS = 1000
const AUTOPLAY_CHECK_DELAY_MS = 2000

const stageCount = computed(() => {
  return stageTargetMemes.value.length
})

const stageNumber = computed(() => {
  return stageIndex.value + 1
})

const isCardDisabled = computed(() => {
  return clickedMemeId.value !== null || (!hasAudioPlayed.value && !isAudioUnavailable.value)
})

const isPlayButtonDisabled = computed(() => {
  return isPlayButtonPressed.value || clickedMemeId.value !== null || !isPlayerReady.value
})

const isDialogOpen = computed(() => {
  return isPauseOpen.value || isConfirmOpen.value
})

/**
 * Starts a new match with one stage per randomly picked catalogue meme, as many as the match length allows.
 */
function startMatch(): void {
  if (memeCatalogue.value.length === 0) {
    return
  }
  stageTargetMemes.value = shuffleMemes(memeCatalogue.value).slice(0, getMatchMemeCount(matchLength.value))
  stageIndex.value = 0
  correctAnswerCount.value = 0
  isMatchComplete.value = false
  void loadStage()
}

/**
 * Picks the current stage's memes, waits for their thumbnails and the target audio to load, then reveals the cards and autoplays the audio.
 * @returns Resolves once the stage is revealed or superseded by a newer load.
 */
async function loadStage(): Promise<void> {
  const generation = ++stageLoadGeneration
  const targetMeme = stageTargetMemes.value[stageIndex.value]
  if (targetMeme === undefined) {
    return
  }

  isStageLoading.value = true
  clickedMemeId.value = null
  hasAudioPlayed.value = false
  isAudioUnavailable.value = false
  isPlayButtonVisible.value = false
  isPlayButtonPressed.value = false
  clearResetTimeout()
  clearAutoplayCheckTimeout()
  stopSoundEffects()

  selectedMemes.value = pickStageMemes(targetMeme, cardCount.value, stageTargetMemes.value.slice(0, stageIndex.value))
  activeMeme.value = targetMeme

  const thumbnailLoads = selectedMemes.value.map(async (meme) => {
    const thumbnailUrl = getYouTubeThumbnailUrl(meme.url)
    const loadedUrl = thumbnailUrl !== null ? await loadThumbnail(thumbnailUrl) : ''
    return [
      meme.id,
      loadedUrl,
    ] as const
  })
  const [loadedThumbnails] = await Promise.all([
    Promise.all(thumbnailLoads),
    loadAudio(),
  ])

  if (generation !== stageLoadGeneration) {
    return
  }

  thumbnailUrls.value = Object.fromEntries(loadedThumbnails)
  isStageLoading.value = false
  autoplayAudio()
}

/**
 * Moves to the next stage, or completes the match after the last one.
 */
function advanceStage(): void {
  if (stageNumber.value >= stageCount.value) {
    stageLoadGeneration++
    clearAutoplayCheckTimeout()
    stopSoundEffects()
    audioPlayer?.destroy()
    isMatchComplete.value = true
    return
  }
  stageIndex.value++
  void loadStage()
}

/**
 * Mounts the audio player for the active meme.
 * @returns Resolves once the audio is ready to play or has failed to load.
 */
function loadAudio(): Promise<void> {
  return new Promise((resolve) => {
    resolveAudioLoad = resolve
    setupAudioPlayer()
  })
}

/**
 * Resolves the pending audio load, if any.
 */
function settleAudioLoad(): void {
  if (resolveAudioLoad !== null) {
    resolveAudioLoad()
    resolveAudioLoad = null
  }
}

/**
 * Resolves the image shown on a meme card, trimmed of black bands when possible.
 * @param meme - Meme shown on the card.
 * @returns URL string for the card image.
 */
function getCardImageUrl(meme: Meme): string {
  return thumbnailUrls.value[meme.id] ?? getYouTubeThumbnailUrl(meme.url) ?? ''
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
 * Cancels the pending transition to the next stage.
 */
function clearResetTimeout(): void {
  if (resetTimeoutId !== null) {
    clearTimeout(resetTimeoutId)
    resetTimeoutId = null
  }
}

/**
 * Cancels the pending check for blocked autoplay.
 */
function clearAutoplayCheckTimeout(): void {
  if (autoplayCheckTimeoutId !== null) {
    clearTimeout(autoplayCheckTimeoutId)
    autoplayCheckTimeoutId = null
  }
}

/**
 * Handles meme card selection, visual match feedback, sound cutoff, and scheduled stage advance.
 * @param meme - Clicked meme card.
 */
function handleCardClick(meme: Meme): void {
  if (isCardDisabled.value || activeMeme.value === null) {
    return
  }

  clickedMemeId.value = meme.id
  audioPlayer?.stop()

  const isCorrect = meme.id === activeMeme.value.id
  if (isCorrect) {
    correctAnswerCount.value++
  }
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

  scheduleStageAdvance()
}

/**
 * Moves to the next stage once the selection feedback has been shown.
 */
function scheduleStageAdvance(): void {
  clearResetTimeout()
  resetTimeoutId = setTimeout(() => {
    resetTimeoutId = null
    advanceStage()
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
        // Audio is played once per stage; nothing to reset when it ends
      },
      onError: (): void => {
        isPlayerReady.value = false
        isAudioUnavailable.value = true
        settleAudioLoad()
      },
      onPlaying: (): void => {
        hasAudioPlayed.value = true
        if (!isPlayButtonPressed.value) {
          isPlayButtonVisible.value = false
        }
      },
      onReady: (): void => {
        isPlayerReady.value = true
        settleAudioLoad()
      },
    })
  }

  const videoId = activeMeme.value !== null ? extractYouTubeVideoId(activeMeme.value.url) : null
  if (videoId !== null && playerHostElement.value !== null) {
    void audioPlayer.mount(playerHostElement.value, videoId)
  } else {
    isAudioUnavailable.value = true
    settleAudioLoad()
  }
}

/**
 * Starts the active meme's audio as soon as the stage is revealed.
 * Browsers may block it without a prior user gesture, so the play button is shown if the audio has not started shortly after.
 */
function autoplayAudio(): void {
  clearAutoplayCheckTimeout()
  autoplayCheckTimeoutId = setTimeout(() => {
    autoplayCheckTimeoutId = null
    if (!hasAudioPlayed.value && !isAudioUnavailable.value) {
      isPlayButtonVisible.value = true
    }
  }, AUTOPLAY_CHECK_DELAY_MS)

  if (isDialogOpen.value || !isPlayerReady.value || audioPlayer === null) {
    return
  }

  audioPlayer.play()
}

/**
 * Plays the meme audio once after the browser blocked autoplay.
 */
function handlePlayClick(): void {
  if (isPlayButtonDisabled.value || activeMeme.value === null || audioPlayer === null) {
    return
  }

  isPlayButtonPressed.value = true
  hasAudioPlayed.value = true
  const videoId = extractYouTubeVideoId(activeMeme.value.url) ?? undefined
  analytics.trackAudioPlay({
    videoId: videoId,
    videoName: activeMeme.value.name,
  })
  audioPlayer.play()
}

/**
 * Stops active audio playback, sound effects, and pending stage transitions.
 */
function haltPlayback(): void {
  audioPlayer?.stop()
  stopSoundEffects()
  clearResetTimeout()
}

/**
 * Halts the match and opens the pause dialog, pausing the meme audio so it can be resumed where it left off.
 */
function pauseMatch(): void {
  isAudioPausedByDialog = audioPlayer?.playing ?? false
  audioPlayer?.pause()
  stopSoundEffects()
  clearResetTimeout()
  isPauseOpen.value = true
  analytics.trackPauseDialogShown()
}

/**
 * Pauses the match from the pause button.
 */
function handlePauseClick(): void {
  if (isDialogOpen.value) {
    return
  }
  pauseMatch()
}

/**
 * Closes the pause dialog and resumes the halted stage: advances if a card was already picked, resumes the meme audio if it was paused, or starts it if it never played.
 */
function handleResume(): void {
  analytics.trackMatchResume()
  isPauseOpen.value = false
  targetRoute.value = null
  const wasAudioPaused = isAudioPausedByDialog
  isAudioPausedByDialog = false
  if (isStageLoading.value || isMatchComplete.value) {
    return
  }
  if (clickedMemeId.value !== null) {
    scheduleStageAdvance()
    return
  }
  if (wasAudioPaused) {
    audioPlayer?.resume()
  } else if (!hasAudioPlayed.value) {
    autoplayAudio()
  }
}

/**
 * Swaps the pause dialog for the confirmation to leave the match.
 */
function handleQuit(): void {
  isPauseOpen.value = false
  isConfirmOpen.value = true
  analytics.trackLeaveDialogShown()
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
 * Cancels navigation away from the match screen and returns to the pause dialog.
 */
function handleCancelLeave(): void {
  analytics.trackMatchStay()
  isConfirmOpen.value = false
  isPauseOpen.value = true
}

/**
 * Returns to the main menu after the match is complete.
 */
function handleMenuClick(): void {
  void router.push({
    name: 'home',
  })
}

onBeforeRouteLeave((to) => {
  if (isNavigationConfirmed.value || isMatchComplete.value) {
    return true
  }

  targetRoute.value = to
  if (!isDialogOpen.value) {
    pauseMatch()
  }
  return false
})

onMounted(() => {
  startMatch()
})

onUnmounted(() => {
  stageLoadGeneration++
  clearResetTimeout()
  clearAutoplayCheckTimeout()
  if (audioPlayer !== null) {
    audioPlayer.destroy()
    audioPlayer = null
  }
  stopSoundEffects()
})

watch(
  [
    difficulty,
    matchLength,
  ],
  () => {
    haltPlayback()
    startMatch()
  },
)

watch(
  () => memeCatalogue.value,
  () => {
    if (stageTargetMemes.value.length === 0) {
      startMatch()
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
      v-if="isMatchComplete"
      class="results"
    >
      <h2 class="results-title">
        Match complete
      </h2>
      <p class="results-score">
        {{ correctAnswerCount }}/{{ stageCount }}
      </p>
      <p class="results-caption">
        memes guessed right
      </p>
      <button
        type="button"
        class="action-button"
        @click="handleMenuClick"
      >
        MENU
      </button>
    </div>

    <template v-else>
      <p
        v-if="stageCount > 0"
        class="stage-counter"
      >
        <span class="visually-hidden">Stage </span>{{ stageNumber }}/{{ stageCount }}
      </p>

      <div
        v-if="isStageLoading"
        class="stage-loading"
      >
        <LoadingSpinner label="Loading stage" />
      </div>

      <template v-else>
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
              :src="getCardImageUrl(meme)"
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
          class="action-button play-button"
          :class="{'is-hidden': !isPlayButtonVisible}"
          :disabled="isPlayButtonDisabled"
          @click="handlePlayClick"
        >
          PLAY
        </button>
      </template>

      <button
        type="button"
        class="pause-button"
        aria-label="Pause"
        @click="handlePauseClick"
      >
        <svg
          class="pause-icon"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      </button>
    </template>

    <PauseDialog
      :is-open="isPauseOpen"
      @resume="handleResume"
      @quit="handleQuit"
    />

    <ConfirmDialog
      :is-open="isConfirmOpen"
      @confirm="handleConfirmLeave"
      @cancel="handleCancelLeave"
    />
  </main>
</template>

<style scoped>
.match-screen {
  --safe-top: max(0.75rem, env(safe-area-inset-top, 0px));
  --safe-bottom: max(0.75rem, env(safe-area-inset-bottom, 0px));
  --safe-right: max(1rem, env(safe-area-inset-right, 0px));
  --safe-left: max(1rem, env(safe-area-inset-left, 0px));
  --counter-size: 1.75rem;
  --button-height: 44px;
  --stage-gap: 0.75rem;
  /* Rows above and below the cards share the same height, sized for the taller of counter and button */
  --ui-overhead: calc(var(--safe-top) + var(--safe-bottom) + 2 * var(--button-height) + 2 * var(--stage-gap));

  position: relative;
  display: grid;
  grid-template-rows: 1fr auto 1fr;
  grid-template-columns: 100%;
  justify-items: center;
  row-gap: var(--stage-gap);
  height: 100dvh;
  max-height: 100dvh;
  width: 100%;
  padding-top: var(--safe-top);
  padding-right: var(--safe-right);
  padding-bottom: var(--safe-bottom);
  padding-left: var(--safe-left);
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

.stage-counter {
  grid-row: 1;
  align-self: start;
  font-family: var(--font-display);
  font-size: var(--counter-size);
  line-height: 1;
  letter-spacing: 0.06em;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
  -webkit-text-stroke: 1.5px #000000;
  paint-order: stroke fill;
  text-shadow: 0 4px 12px rgb(0 0 0 / 50%);
}

.stage-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}

.results {
  grid-row: 1 / -1;
  align-self: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  text-align: center;
}

.results-title {
  font-family: var(--font-display);
  font-size: clamp(2.25rem, 7vw, 3.25rem);
  font-weight: 400;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-main);
  line-height: 1.05;
  -webkit-text-stroke: 2.5px #000000;
  paint-order: stroke fill;
  text-shadow: 0 6px 18px rgb(0 0 0 / 50%);
}

.results-score {
  font-family: var(--font-display);
  font-size: clamp(5rem, 22vw, 11rem);
  line-height: 1;
  letter-spacing: 0.02em;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  -webkit-text-stroke: 4px #000000;
  paint-order: stroke fill;
  text-shadow: 0 8px 24px rgb(0 0 0 / 50%);
}

.results-caption {
  font-family: var(--font-ui);
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-main);
  text-shadow: 0 2px 8px rgb(0 0 0 / 60%);
}

.results .action-button {
  margin-top: 2rem;
}

.thumbnails {
  --mobile-card-gap: 0.5rem;
  grid-row: 2;
  display: grid;
  width: 100%;
  max-width: 480px;
  gap: var(--mobile-card-gap);
  align-content: center;
  justify-content: center;
  align-items: center;
  justify-items: center;
}

.thumbnails--easy {
  grid-template-columns: 1fr;
}

.thumbnails--easy .card {
  max-height: calc((100dvh - var(--ui-overhead) - 2 * var(--mobile-card-gap)) / 3);
}

.thumbnails--medium {
  grid-template-columns: 1fr;
}

.thumbnails--medium .card {
  max-height: calc((100dvh - var(--ui-overhead) - 3 * var(--mobile-card-gap)) / 4);
}

.thumbnails--hard {
  grid-template-columns: repeat(2, 1fr);
}

.thumbnails--hard .card {
  max-height: calc((100dvh - var(--ui-overhead) - 2 * var(--mobile-card-gap)) / 3);
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

.play-button {
  grid-row: 3;
  align-self: end;
}

.action-button.is-hidden {
  visibility: hidden;
}

.pause-button {
  position: absolute;
  top: var(--safe-top);
  right: var(--safe-right);
  z-index: 1;
  display: grid;
  place-items: center;
  width: var(--button-height);
  height: var(--button-height);
  padding: 0;
  background: var(--accent);
  color: var(--accent-contrast);
  border: 2px solid #ffffff;
  border-radius: 6px;
  cursor: pointer;
  box-shadow: 0 6px 20px rgb(0 0 0 / 25%);
  transition: filter 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease;
}

.pause-button:hover {
  filter: brightness(1.08);
  box-shadow: 0 8px 24px rgb(0 0 0 / 35%);
}

.pause-button:active {
  filter: brightness(0.95);
  transform: scale(0.98);
  box-shadow: 0 4px 12px rgb(0 0 0 / 20%);
}

.pause-icon {
  width: 22px;
  height: 22px;
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
    --counter-size: 2.25rem;
    --stage-gap: 2.75rem;
    height: auto;
    min-height: 100%;
    max-height: none;
    overflow: visible;
    padding: 1.5rem var(--card-gap);
  }

  .thumbnails {
    max-width: 100%;
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

  .card,
  .thumbnails--easy .card,
  .thumbnails--medium .card,
  .thumbnails--hard .card {
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

  .play-button {
    align-self: start;
  }

  .pause-button {
    --button-height: 48px;
    top: 1.5rem;
    right: var(--card-gap);
  }
}

</style>
