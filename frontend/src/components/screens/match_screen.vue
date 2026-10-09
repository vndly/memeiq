<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, watch} from 'vue'
import {onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter} from 'vue-router'
import type {LocationQuery, RouteLocationNormalized, RouteLocationRaw} from 'vue-router'
import failAudioUrl from '@/assets/fail.mp3'
import finishedAudioUrl from '@/assets/finished.mp3'
import winAudioUrl from '@/assets/win.mp3'
import ConfirmDialog from '@/components/confirm_dialog.vue'
import LoadingSpinner from '@/components/loading_spinner.vue'
import PauseDialog from '@/components/pause_dialog.vue'
import {DEFAULT_DIFFICULTY, DEFAULT_MATCH_LENGTH, DIFFICULTY_CARD_COUNTS, IQ_PENALTY_SECONDS_PER_POINT, MAX_IQ_SCORE, THUMBNAIL_RATIO} from '@/constants'
import {analytics} from '@/services/analytics'
import {getMatchMemeCount, memeCatalogue, pickStageMemes, shuffleMemes} from '@/services/meme_catalogue'
import {playButtonSound} from '@/services/sound_effects'
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

/**
 * Reads the match difficulty from a route query.
 * @param query - Route query to read.
 * @returns The queried difficulty, or the default when missing or invalid.
 */
function parseDifficulty(query: LocationQuery): Difficulty {
  const queryDifficulty = query.difficulty
  if (typeof queryDifficulty === 'string' && isDifficulty(queryDifficulty)) {
    return queryDifficulty
  }
  return DEFAULT_DIFFICULTY
}

/**
 * Reads the match length from a route query.
 * @param query - Route query to read.
 * @returns The queried match length, or the default when missing or invalid.
 */
function parseMatchLength(query: LocationQuery): MatchLength {
  const queryMatchLength = query.length
  if (typeof queryMatchLength === 'string' && isMatchLength(queryMatchLength)) {
    return queryMatchLength
  }
  return DEFAULT_MATCH_LENGTH
}

const difficulty = computed<Difficulty>(() => {
  return parseDifficulty(route.query)
})

const matchLength = computed<MatchLength>(() => {
  return parseMatchLength(route.query)
})

const cardCount = computed<number>(() => {
  return DIFFICULTY_CARD_COUNTS[difficulty.value]
})

const stageTargetMemes = ref<Meme[]>([])
const stageIndex = ref(0)
const correctAnswerCount = ref(0)
const iqScore = ref(0)
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
const isAudioStarting = ref(false)
const isAudioPlaying = ref(false)
const displayedIqScore = ref(0)

const winAudio = typeof Audio !== 'undefined' ? new Audio(winAudioUrl) : null
const failAudio = typeof Audio !== 'undefined' ? new Audio(failAudioUrl) : null
const finishedAudio = typeof Audio !== 'undefined' ? new Audio(finishedAudioUrl) : null

let audioPlayer: YouTubeAudioPlayer | null = null
let resetTimeoutId: ReturnType<typeof setTimeout> | null = null
let autoplayCheckTimeoutId: ReturnType<typeof setTimeout> | null = null
let resolveAudioLoad: (() => void) | null = null
let isAudioPausedByDialog = false
let stageLoadGeneration = 0
let isStageClockStarted = false
let stageClockRunningSince: number | null = null
let stageClockElapsedMs = 0
let iqCountUpFrameId: number | null = null

const RESET_ROUND_DELAY_MS = 1000
const AUTOPLAY_CHECK_DELAY_MS = 2000
const IQ_COUNT_UP_DURATION_MS = 1200

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
  return isDialogOpen.value || isStageLoading.value || isAudioStarting.value || isAudioPlaying.value || clickedMemeId.value !== null || !isPlayerReady.value
})

const isDialogOpen = computed(() => {
  return isPauseOpen.value || isConfirmOpen.value
})

const roundedIqScore = computed(() => {
  return Math.round(iqScore.value)
})

const iqScoreMinWidth = computed(() => {
  return `${String(roundedIqScore.value).length}ch`
})

/**
 * Starts a new match with one stage per randomly picked catalogue meme, as many as the match length allows.
 */
function startMatch(): void {
  if (memeCatalogue.value.length === 0) {
    return
  }
  analytics.trackMatchStart(difficulty.value, matchLength.value)
  stageTargetMemes.value = shuffleMemes(memeCatalogue.value).slice(0, getMatchMemeCount(matchLength.value))
  stageIndex.value = 0
  correctAnswerCount.value = 0
  iqScore.value = 0
  isMatchComplete.value = false
  cancelIqCountUp()
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
  isAudioStarting.value = false
  isAudioPlaying.value = false
  resetStageClock()
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
  if (isAudioUnavailable.value) {
    startStageClock()
  }
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
    playSoundEffect(finishedAudio)
    startIqCountUp()
    return
  }
  stageIndex.value++
  void loadStage()
}

/**
 * Counts the displayed IQ up from zero to the final score, or shows the final score at once when reduced motion is preferred.
 */
function startIqCountUp(): void {
  cancelIqCountUp()
  const finalScore = roundedIqScore.value
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    displayedIqScore.value = finalScore
    return
  }

  const startTime = performance.now()
  const renderCountUpFrame = (timestamp: number): void => {
    const progress = Math.min(1, Math.max(0, (timestamp - startTime) / IQ_COUNT_UP_DURATION_MS))
    const easedProgress = 1 - (1 - progress) ** 3
    displayedIqScore.value = Math.round(finalScore * easedProgress)
    iqCountUpFrameId = progress < 1 ? requestAnimationFrame(renderCountUpFrame) : null
  }
  displayedIqScore.value = 0
  iqCountUpFrameId = requestAnimationFrame(renderCountUpFrame)
}

/**
 * Stops the IQ count-up, if running.
 */
function cancelIqCountUp(): void {
  if (iqCountUpFrameId !== null) {
    cancelAnimationFrame(iqCountUpFrameId)
    iqCountUpFrameId = null
  }
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
  if (finishedAudio !== null) {
    finishedAudio.pause()
    finishedAudio.currentTime = 0
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
 * Cancels the pending check for blocked playback.
 */
function clearAutoplayCheckTimeout(): void {
  if (autoplayCheckTimeoutId !== null) {
    clearTimeout(autoplayCheckTimeoutId)
    autoplayCheckTimeoutId = null
  }
}

/**
 * Clears the current stage's answer clock.
 */
function resetStageClock(): void {
  isStageClockStarted = false
  stageClockRunningSince = null
  stageClockElapsedMs = 0
}

/**
 * Starts the current stage's answer clock once; it stays frozen while a dialog is open.
 */
function startStageClock(): void {
  if (isStageClockStarted) {
    return
  }
  isStageClockStarted = true
  stageClockRunningSince = isDialogOpen.value ? null : performance.now()
}

/**
 * Freezes the current stage's answer clock, keeping the time elapsed so far.
 */
function pauseStageClock(): void {
  if (stageClockRunningSince !== null) {
    stageClockElapsedMs += performance.now() - stageClockRunningSince
    stageClockRunningSince = null
  }
}

/**
 * Restarts the current stage's answer clock if it was started and is frozen.
 */
function resumeStageClock(): void {
  if (isStageClockStarted && stageClockRunningSince === null) {
    stageClockRunningSince = performance.now()
  }
}

/**
 * Measures how long the current stage's answer clock has been running.
 * @returns Elapsed seconds, excluding frozen time.
 */
function getStageElapsedSeconds(): number {
  const runningMs = stageClockRunningSince !== null ? performance.now() - stageClockRunningSince : 0
  return (stageClockElapsedMs + runningMs) / 1000
}

/**
 * Computes the IQ points earned by a correct pick: an even share of the maximum IQ, minus one point per penalty interval elapsed.
 * @returns IQ points, never below zero.
 */
function getCorrectPickPoints(): number {
  const baseScore = MAX_IQ_SCORE / stageCount.value
  const penalty = getStageElapsedSeconds() / IQ_PENALTY_SECONDS_PER_POINT
  return Math.max(0, baseScore - penalty)
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
    iqScore.value += getCorrectPickPoints()
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
        // A clip that ends just as the pause dialog opens must not replay on resume
        isAudioPausedByDialog = false
        isAudioPlaying.value = false
      },
      onError: (): void => {
        isPlayerReady.value = false
        isAudioUnavailable.value = true
        if (!isStageLoading.value) {
          startStageClock()
        }
        settleAudioLoad()
      },
      onPlaying: (): void => {
        hasAudioPlayed.value = true
        startStageClock()
        isAudioStarting.value = false
        isAudioPlaying.value = true
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
 * Browsers may block it without a prior user gesture, so the play button is re-enabled if the audio has not started shortly after.
 */
function autoplayAudio(): void {
  if (isDialogOpen.value || !isPlayerReady.value || audioPlayer === null) {
    return
  }

  isAudioStarting.value = true
  audioPlayer.play()

  clearAutoplayCheckTimeout()
  autoplayCheckTimeoutId = setTimeout(() => {
    autoplayCheckTimeoutId = null
    isAudioStarting.value = false
  }, AUTOPLAY_CHECK_DELAY_MS)
}

/**
 * Plays the meme audio from the beginning, to start it after the browser blocked autoplay or to replay it once it finished.
 * The play button is re-enabled once the audio finishes, or shortly after if it does not start; in that case the cards unlock without it.
 */
function handlePlayClick(): void {
  if (isPlayButtonDisabled.value || activeMeme.value === null || audioPlayer === null) {
    return
  }

  isAudioStarting.value = true
  const videoId = extractYouTubeVideoId(activeMeme.value.url) ?? undefined
  analytics.trackAudioPlay({
    videoId: videoId,
    videoName: activeMeme.value.name,
  })
  audioPlayer.play()

  clearAutoplayCheckTimeout()
  autoplayCheckTimeoutId = setTimeout(() => {
    autoplayCheckTimeoutId = null
    isAudioStarting.value = false
    if (!hasAudioPlayed.value) {
      isAudioUnavailable.value = true
      startStageClock()
    }
  }, AUTOPLAY_CHECK_DELAY_MS)
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
  pauseStageClock()
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
  playButtonSound()
  pauseMatch()
}

/**
 * Closes the pause dialog and resumes the halted stage: advances if a card was already picked, resumes the meme audio if it was paused, or starts it if it never played.
 */
function handleResume(): void {
  analytics.trackMatchResume()
  isPauseOpen.value = false
  targetRoute.value = null
  resumeStageClock()
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
  leaveMatch(destination)
}

/**
 * Cancels navigation away from the match screen and returns to the pause dialog.
 */
function handleCancelLeave(): void {
  analytics.trackMatchStay()
  isConfirmOpen.value = false
  isPauseOpen.value = true
  analytics.trackPauseDialogShown()
}

/**
 * Returns to the main menu after the match is complete.
 */
function handleMenuClick(): void {
  playButtonSound()
  leaveMatch({
    name: 'home',
  })
}

/**
 * Leaves the match screen without stacking a new history entry on top of it.
 * Steps back when the previous entry is the destination, so Back cannot return to the match;
 * otherwise replaces the match entry.
 * @param destination - Route to navigate to.
 */
function leaveMatch(destination: RouteLocationRaw): void {
  const previousPath = router.options.history.state.back
  if (previousPath === router.resolve(destination).fullPath) {
    router.back()
  } else {
    void router.replace(destination)
  }
}

/**
 * Holds navigation that would abandon an in-progress match until the player confirms it, pausing the match to ask.
 * @param to - Route being navigated to.
 * @returns Whether the navigation may proceed.
 */
function guardMatchExit(to: RouteLocationNormalized): boolean {
  if (isNavigationConfirmed.value || isMatchComplete.value) {
    return true
  }

  targetRoute.value = to
  if (!isDialogOpen.value) {
    pauseMatch()
  }
  return false
}

onBeforeRouteLeave((to) => {
  return guardMatchExit(to)
})

// Navigating between match URLs reuses this screen and skips the leave guard, so a settings change restarting the match needs the same confirmation
onBeforeRouteUpdate((to) => {
  if (parseDifficulty(to.query) === difficulty.value && parseMatchLength(to.query) === matchLength.value) {
    return true
  }
  return guardMatchExit(to)
})

onMounted(() => {
  startMatch()
})

onUnmounted(() => {
  stageLoadGeneration++
  clearResetTimeout()
  clearAutoplayCheckTimeout()
  cancelIqCountUp()
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
    // A confirmed settings change restarts the match in place, so the new match must guard its own exit again
    isNavigationConfirmed.value = false
    targetRoute.value = null
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
      <p class="results-iq">
        <span class="results-iq-unit">IQ</span>
        <span
          class="results-iq-value"
          aria-hidden="true"
        >{{ displayedIqScore }}</span>
        <span class="visually-hidden">{{ roundedIqScore }}</span>
      </p>
      <p class="results-correct">
        {{ correctAnswerCount }}/{{ stageCount }} correct
      </p>
      <dl class="results-settings">
        <div class="results-setting">
          <dt class="results-setting-caption">
            Memes
          </dt>
          <dd class="results-setting-frame">
            <span class="results-setting-value results-setting-value--count">{{ stageCount }}</span>
          </dd>
        </div>
        <div class="results-setting">
          <dt class="results-setting-caption">
            Difficulty
          </dt>
          <dd class="results-setting-frame">
            <span class="results-setting-value">{{ difficulty }}</span>
          </dd>
        </div>
      </dl>
      <button
        type="button"
        class="action-button"
        @click="handleMenuClick"
      >
        MENU
      </button>
    </div>

    <template v-else>
      <header class="stage-header">
        <p
          v-if="stageCount > 0"
          class="stage-counter"
        >
          <span class="visually-hidden">Stage </span>{{ stageNumber }}/{{ stageCount }}
        </p>

        <button
          type="button"
          class="action-button play-button"
          :disabled="isPlayButtonDisabled"
          @click="handlePlayClick"
        >
          <svg
            class="play-icon"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M6 3.5v17a1 1 0 0 0 1.5.86l14-8.5a1 1 0 0 0 0-1.72l-14-8.5A1 1 0 0 0 6 3.5Z" />
          </svg>
          PLAY
        </button>

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
      </header>

      <div
        v-if="isStageLoading"
        class="stage-loading"
      >
        <LoadingSpinner label="Loading stage" />
      </div>

      <div
        v-else
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
              viewBox="-5 -5 34 34"
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
              viewBox="-5 -5 34 34"
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

  position: relative;
  display: grid;
  /* Cards take all the height left below the header */
  grid-template-rows: minmax(var(--button-height), auto) minmax(0, 1fr);
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
  background:
    linear-gradient(color-mix(in srgb, var(--ground) 55%, transparent), color-mix(in srgb, var(--ground) 55%, transparent)),
    var(--ground) url('@/assets/background.jpg') center / cover no-repeat;
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

.stage-header {
  grid-row: 1;
  align-self: start;
  position: relative;
  z-index: 1;
  display: grid;
  /* Equal side columns keep the play button centered while the counter's width changes */
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  column-gap: 0.75rem;
  width: 100%;
}

.stage-counter {
  grid-column: 1;
  justify-self: start;
  display: flex;
  align-items: center;
  min-height: var(--button-height);
  padding: 0 0.75rem;
  font-family: var(--font-display);
  font-size: 1.5rem;
  line-height: 1;
  letter-spacing: 0.04em;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  background: var(--paper);
  border: 3px solid var(--ink);
  border-radius: 12px;
  box-shadow: 0 4px 0 var(--ink);
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
  /* Scrolls from the top instead of clipping when the column is taller than short landscape screens */
  align-self: safe center;
  max-height: 100%;
  overflow-y: auto;
  /* Room for the outline strokes, drop shadows and tilted IQ badge inside the scroll box */
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(1rem, 5dvh, 2.5rem);
  text-align: center;
}

.results-title {
  font-family: var(--font-display);
  font-size: clamp(2.25rem, min(9vw, 8dvh), 3.75rem);
  font-weight: 400;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-main);
  line-height: 1;
  -webkit-text-stroke: 7px var(--ink);
  paint-order: stroke fill;
  text-shadow: 0 5px 0 var(--ink);
}

.results-iq {
  display: flex;
  align-items: baseline;
  gap: 0.12em;
  padding: 0.12em 0.3em 0.1em;
  font-family: var(--font-display);
  font-size: clamp(3.5rem, min(24vw, 20dvh), 9rem);
  line-height: 1;
  letter-spacing: 0.02em;
  color: var(--ink);
  background: var(--accent);
  border: 4px solid var(--ink);
  border-radius: 20px;
  box-shadow: 0 8px 0 var(--ink);
  transform: rotate(-4deg);
}

.results-iq-unit {
  font-size: 0.4em;
}

.results-iq-value {
  min-width: v-bind(iqScoreMinWidth);
  letter-spacing: 0;
  font-variant-numeric: tabular-nums;
}

.results-correct {
  font-family: var(--font-display);
  font-size: var(--counter-size);
  line-height: 1;
  letter-spacing: 0.04em;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
  -webkit-text-stroke: 5px var(--ink);
  paint-order: stroke fill;
  text-shadow: 0 3px 0 var(--ink);
}

.results-settings {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem 1.25rem;
}

.results-setting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.results-setting-caption {
  font-family: var(--font-display);
  font-size: 1.25rem;
  line-height: 1;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-main);
  -webkit-text-stroke: 4px var(--ink);
  paint-order: stroke fill;
  text-shadow: 0 2px 0 var(--ink);
}

.results-setting-frame {
  display: flex;
  padding: 4px;
  background: var(--paper);
  border: 3px solid var(--ink);
  border-radius: 12px;
  box-shadow: 0 4px 0 var(--ink);
}

.results-setting-value {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 4.5rem;
  min-height: 36px;
  padding: 0 0.75rem;
  border-radius: 8px;
  font-family: var(--font-display);
  font-size: 1.125rem;
  line-height: 1;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--paper);
  background: var(--ink);
}

.results-setting-value--count {
  font-size: 1.375rem;
  font-variant-numeric: tabular-nums;
}

.results .action-button {
  margin-top: 2rem;
}

.thumbnails {
  --mobile-card-gap: 0.75rem;
  /* Cards are sized from the height this container gets */
  container-type: size;
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
  --card-max-height: calc((100cqh - 2 * var(--mobile-card-gap)) / 3);
  grid-template-columns: 1fr;
  align-content: space-evenly;
}

.thumbnails--medium {
  --card-max-height: calc((100cqh - 3 * var(--mobile-card-gap)) / 4);
  grid-template-columns: 1fr;
  align-content: space-evenly;
}

.thumbnails--hard {
  --card-max-height: calc((100cqh - 5 * var(--mobile-card-gap)) / 6);
  grid-template-columns: 1fr;
  align-content: space-evenly;
}

.card {
  position: relative;
  display: block;
  /* Size comes only from the layout, never from the thumbnail, so every card matches */
  width: min(100%, calc(var(--card-max-height) * v-bind(THUMBNAIL_RATIO)));
  height: auto;
  aspect-ratio: v-bind(THUMBNAIL_RATIO);
  padding: 0;
  margin: 0;
  border: 3px solid var(--paper);
  border-radius: 10px;
  background: var(--ink);
  cursor: pointer;
  overflow: hidden;
  line-height: 0;
  box-shadow: 0 0 0 3px var(--ink), 0 4px 0 3px var(--ink);
  transition: border-color 0.15s ease, filter 0.15s ease, transform 0.08s ease, box-shadow 0.08s ease;
}

.card:hover:not(:disabled) {
  border-color: var(--accent);
  filter: brightness(1.06);
}

.card:active:not(:disabled) {
  transform: translateY(3px);
  box-shadow: 0 0 0 3px var(--ink), 0 1px 0 3px var(--ink);
}

.card:disabled {
  cursor: default;
}

.card.is-correct {
  border-color: #34c759;
  animation: card-pop 0.35s ease-out;
}

.card.is-incorrect {
  border-color: #ff3b30;
  animation: card-shake 0.4s ease-in-out;
}

@keyframes card-pop {
  40% {
    transform: scale(1.05);
  }
}

@keyframes card-shake {
  20% {
    transform: translateX(-8px);
  }

  40% {
    transform: translateX(8px);
  }

  60% {
    transform: translateX(-5px);
  }

  80% {
    transform: translateX(5px);
  }
}

.feedback-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 25%);
  pointer-events: none;
}

.feedback-icon {
  width: auto;
  height: min(clamp(44px, 11vw, 88px), 60%);
  aspect-ratio: 1;
  color: var(--paper);
  border: 3px solid var(--ink);
  border-radius: 50%;
  box-shadow: 0 4px 0 var(--ink);
  transform: rotate(-10deg);
}

.feedback-icon.is-correct {
  background: #34c759;
}

.feedback-icon.is-incorrect {
  background: #ff3b30;
}

.thumbnail-image {
  position: absolute;
  inset: 0;
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
  gap: 0.5rem;
  min-width: 180px;
  min-height: 44px;
  padding: 0.5rem 1.75rem;
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
  transition: filter 0.15s ease, transform 0.08s ease, background-color 0.15s ease, color 0.15s ease, box-shadow 0.08s ease;
}

.action-button:hover:not(:disabled) {
  filter: brightness(1.06);
}

.action-button:active:not(:disabled) {
  transform: translateY(4px);
  box-shadow: 0 1px 0 var(--ink);
}

.action-button:disabled {
  background: #b3b3b3;
  color: var(--ink);
  cursor: not-allowed;
  transform: translateY(4px);
  box-shadow: 0 1px 0 var(--ink);
  filter: none;
}

.play-icon {
  width: 0.8em;
  height: 0.8em;
}

.play-button {
  grid-column: 2;
  min-width: 0;
  min-height: var(--button-height);
  padding: 0 1.25rem;
  box-shadow: 0 4px 0 var(--ink);
}

.pause-button {
  grid-column: 3;
  justify-self: end;
  display: grid;
  place-items: center;
  width: var(--button-height);
  height: var(--button-height);
  padding: 0;
  background: var(--paper);
  color: var(--ink);
  border: 3px solid var(--ink);
  border-radius: 12px;
  cursor: pointer;
  box-shadow: 0 4px 0 var(--ink);
  transition: filter 0.15s ease, transform 0.08s ease, box-shadow 0.08s ease;
}

.pause-button:hover {
  filter: brightness(0.94);
}

.pause-button:active {
  transform: translateY(3px);
  box-shadow: 0 1px 0 var(--ink);
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
    grid-template-rows: 1fr auto 1fr;
  }

  .thumbnails--easy,
  .thumbnails--medium,
  .thumbnails--hard {
    align-content: center;
  }

  .thumbnails {
    container-type: normal;
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

  .card {
    width: 100%;
    border-width: 4px;
    border-radius: 14px;
  }

  .card {
    box-shadow: 0 0 0 3px var(--ink), 0 6px 0 3px var(--ink);
  }

  .card:active:not(:disabled) {
    transform: translateY(5px);
  }

  .action-button {
    min-height: 52px;
    padding: 0.5rem 2rem;
    font-size: 1.75rem;
  }

  .play-button {
    min-height: 48px;
    padding: 0 1.5rem;
  }

  .stage-counter {
    --button-height: 48px;
    padding: 0 1rem;
    font-size: 1.875rem;
  }

  .pause-button {
    --button-height: 48px;
  }
}

</style>
