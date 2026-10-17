<script setup lang="ts">
import {computed, nextTick, onUnmounted, ref, useTemplateRef, watch} from 'vue'
import {THUMBNAIL_RATIO} from '@/constants'
import {analytics} from '@/services/analytics'
import {getMemeAudioUrl, getMemeThumbnailUrl} from '@/services/meme_media'
import {playButtonSound} from '@/services/sound_effects'
import type {Meme} from '@/types/meme'
import type {StageResult} from '@/types/stage_result'

export interface MatchReviewProps {
  isOpen: boolean
  stageResults: StageResult[]
}

/**
 * Card of the review, showing one stage's meme.
 */
interface ReviewCard {
  meme: Meme
  isCorrect: boolean
  stageNumber: number
  audioUrl: string | null
  thumbnailUrl: string
}

const props = defineProps<MatchReviewProps>()

const emit = defineEmits<{
  close: []
  play: []
}>()

const backButton = useTemplateRef<HTMLButtonElement>('backButton')
const playingMemeId = ref<string | null>(null)
const isClipLoading = ref(false)

// One element plays every clip, started inside the tap, since iOS refuses playback that starts after an asynchronous download
const clipAudio = typeof Audio !== 'undefined' ? new Audio() : null
let clipGeneration = 0

const reviewCards = computed<ReviewCard[]>(() => {
  return props.stageResults.map((stageResult, index) => ({
    meme: stageResult.meme,
    isCorrect: stageResult.isCorrect,
    stageNumber: index + 1,
    audioUrl: getMemeAudioUrl(stageResult.meme.id),
    thumbnailUrl: getMemeThumbnailUrl(stageResult.meme.id) ?? '',
  }))
})

/**
 * Describes a card for screen readers.
 * @param card - Card to describe.
 * @returns The meme name, whether the player picked it, and whether it has no sound.
 */
function getCardLabel(card: ReviewCard): string {
  const result = card.isCorrect ? 'correct' : 'missed'
  return card.audioUrl !== null ? `${card.meme.name}, ${result}` : `${card.meme.name}, ${result}, no sound`
}

/**
 * Plays a card's clip from the beginning, or stops it when it is the clip playing.
 * @param card - Tapped card.
 */
function handleCardClick(card: ReviewCard): void {
  if (card.audioUrl === null || clipAudio === null) {
    return
  }
  if (playingMemeId.value === card.meme.id) {
    stopClip()
    return
  }

  const generation = ++clipGeneration
  playingMemeId.value = card.meme.id
  isClipLoading.value = true
  clipAudio.src = card.audioUrl
  void clipAudio.play().catch(() => {
    // A newer tap or a stop already took over an interrupted start, so only a refused or failed one is cleared
    if (generation === clipGeneration) {
      stopClip()
    }
  })
  emit('play')
  analytics.trackReviewAudioPlay({
    videoId: card.meme.id,
    videoName: card.meme.name,
    result: card.isCorrect ? 'success' : 'failure',
    stageNumber: card.stageNumber,
  })
}

/**
 * Stops the clip playing, if any, and releases it.
 */
function stopClip(): void {
  clipGeneration++
  playingMemeId.value = null
  isClipLoading.value = false
  if (clipAudio !== null) {
    clipAudio.pause()
    // Loading without a source releases the clip
    clipAudio.removeAttribute('src')
    clipAudio.load()
  }
}

/**
 * Handles the clip starting to play.
 */
function handleClipPlaying(): void {
  isClipLoading.value = false
}

/**
 * Handles the clip failing to load or play, returning its card to normal.
 */
function handleClipError(): void {
  // Releasing a clip leaves no error behind, so only a failure of the clip playing lands here
  if (playingMemeId.value !== null && clipAudio !== null && clipAudio.error !== null) {
    stopClip()
  }
}

/**
 * Closes the review from the back button.
 */
function handleBackClick(): void {
  playButtonSound()
  emit('close')
}

/**
 * Closes the review when the Escape key is pressed.
 * @param event - Keyboard event.
 */
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('close')
  }
}

if (clipAudio !== null) {
  clipAudio.addEventListener('playing', handleClipPlaying)
  clipAudio.addEventListener('ended', stopClip)
  clipAudio.addEventListener('error', handleClipError)
}

watch(
  () => props.isOpen,
  (isOpen) => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeydown)
      void nextTick(() => {
        backButton.value?.focus()
      })
    } else {
      window.removeEventListener('keydown', handleKeydown)
      stopClip()
    }
  },
  {
    immediate: true,
  },
)

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  stopClip()
})
</script>

<template>
  <div
    v-if="isOpen"
    class="review"
    role="dialog"
    aria-modal="true"
    aria-labelledby="review-title"
  >
    <header class="review-header">
      <button
        ref="backButton"
        type="button"
        class="back-button"
        aria-label="Back"
        @click="handleBackClick"
      >
        <svg
          class="back-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
      </button>

      <h2
        id="review-title"
        class="review-title"
      >
        Review
      </h2>
    </header>

    <div class="review-scroll">
      <ol class="review-cards">
        <li
          v-for="card in reviewCards"
          :key="card.meme.id"
        >
          <button
            type="button"
            class="review-card"
            :class="card.isCorrect ? 'is-correct' : 'is-incorrect'"
            :disabled="card.audioUrl === null"
            :aria-label="getCardLabel(card)"
            :aria-pressed="playingMemeId === card.meme.id"
            @click="handleCardClick(card)"
          >
            <img
              :src="card.thumbnailUrl"
              alt=""
              class="review-thumbnail"
              width="320"
              height="180"
              loading="lazy"
            >

            <svg
              v-if="card.isCorrect"
              class="result-badge is-correct"
              viewBox="-5 -5 34 34"
              fill="none"
              stroke="currentColor"
              stroke-width="3.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <svg
              v-else
              class="result-badge is-incorrect"
              viewBox="-5 -5 34 34"
              fill="none"
              stroke="currentColor"
              stroke-width="3.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>

            <span
              v-if="card.audioUrl === null"
              class="clip-state"
              aria-hidden="true"
            >
              <svg
                class="clip-badge clip-badge--muted"
                viewBox="-4 -4 32 32"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M11 5 6 9H2v6h4l5 4V5Z"
                  fill="currentColor"
                />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            </span>
            <span
              v-else-if="playingMemeId === card.meme.id"
              class="clip-state"
              aria-hidden="true"
            >
              <span
                v-if="isClipLoading"
                class="clip-spinner"
              />
              <span
                v-else
                class="clip-badge clip-badge--playing"
              >
                <span class="sound-bar" />
                <span class="sound-bar" />
                <span class="sound-bar" />
              </span>
            </span>
          </button>
        </li>
      </ol>
    </div>
  </div>
</template>

<style scoped>
.review {
  --safe-top: max(0.75rem, env(safe-area-inset-top, 0px));
  --safe-bottom: max(0.75rem, env(safe-area-inset-bottom, 0px));
  --safe-right: max(1rem, env(safe-area-inset-right, 0px));
  --safe-left: max(1rem, env(safe-area-inset-left, 0px));
  --button-height: 44px;
  --card-gap: 0.75rem;

  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  /* The cards scroll in the height left below the header */
  grid-template-rows: auto minmax(0, 1fr);
  row-gap: 0.75rem;
  padding-top: var(--safe-top);
  background:
    linear-gradient(color-mix(in srgb, var(--ground) 55%, transparent), color-mix(in srgb, var(--ground) 55%, transparent)),
    var(--ground) url('@/assets/background.jpg') center / cover no-repeat;
}

.review-header {
  display: grid;
  /* Equal side columns keep the title centered beside the back button */
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  column-gap: 0.75rem;
  padding-right: var(--safe-right);
  padding-left: var(--safe-left);
}

.back-button {
  grid-column: 1;
  justify-self: start;
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

.back-button:hover {
  filter: brightness(0.94);
}

.back-button:active {
  transform: translateY(3px);
  box-shadow: 0 1px 0 var(--ink);
}

.back-icon {
  width: 24px;
  height: 24px;
}

.review-title {
  grid-column: 2;
  font-family: var(--font-display);
  font-size: clamp(2rem, 8vw, 2.75rem);
  font-weight: 400;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-main);
  line-height: 1;
  -webkit-text-stroke: 6px var(--ink);
  paint-order: stroke fill;
  text-shadow: 0 4px 0 var(--ink);
}

.review-scroll {
  overflow-y: auto;
  overscroll-behavior: contain;
  /* Room for the cards' outline rings and drop shadows inside the scroll box */
  padding: 6px var(--safe-right) calc(var(--safe-bottom) + 8px) var(--safe-left);
}

.review-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--card-gap);
  max-width: 720px;
  margin: 0 auto;
  list-style: none;
}

.review-card {
  position: relative;
  display: block;
  width: 100%;
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
  transition: filter 0.15s ease, transform 0.08s ease, box-shadow 0.08s ease;
}

.review-card:hover:not(:disabled) {
  filter: brightness(1.06);
}

.review-card:active:not(:disabled) {
  transform: translateY(3px);
  box-shadow: 0 0 0 3px var(--ink), 0 1px 0 3px var(--ink);
}

.review-card:disabled {
  cursor: default;
}

.review-card:focus-visible {
  /* Clears the card's outline ring */
  outline-offset: 6px;
}

.review-card.is-correct {
  border-color: #34c759;
}

.review-card.is-incorrect {
  border-color: #ff3b30;
}

.review-thumbnail {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.result-badge {
  position: absolute;
  top: 5px;
  right: 5px;
  width: clamp(26px, 7vw, 36px);
  height: auto;
  aspect-ratio: 1;
  color: var(--paper);
  border: 2px solid var(--ink);
  border-radius: 50%;
  box-shadow: 0 2px 0 var(--ink);
  transform: rotate(-10deg);
}

.result-badge.is-correct {
  background: #34c759;
}

.result-badge.is-incorrect {
  background: #ff3b30;
}

.clip-state {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}

.clip-badge {
  width: clamp(40px, 12vw, 56px);
  height: auto;
  aspect-ratio: 1;
  color: var(--ink);
  border: 3px solid var(--ink);
  border-radius: 50%;
  box-shadow: 0 3px 0 var(--ink);
}

.clip-badge--muted {
  background: var(--paper);
}

.clip-badge--playing {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9%;
  background: var(--accent);
}

.sound-bar {
  width: 12%;
  height: 46%;
  border-radius: 2px;
  background: var(--ink);
  animation: sound-bar 0.9s ease-in-out infinite;
}

.sound-bar:nth-child(1) {
  height: 30%;
  animation-delay: -0.3s;
}

.sound-bar:nth-child(3) {
  height: 38%;
  animation-delay: -0.6s;
}

@keyframes sound-bar {
  50% {
    transform: scaleY(0.45);
  }
}

.clip-spinner {
  width: clamp(32px, 9vw, 44px);
  height: auto;
  aspect-ratio: 1;
  border: 5px solid var(--paper);
  border-top-color: var(--accent);
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--ink), inset 0 0 0 2px var(--ink);
  /* Hidden for its first moments, so a clip that starts at once never flashes it */
  animation: clip-spinner-spin 0.8s linear infinite, clip-spinner-reveal 0.01s 0.25s backwards;
}

@keyframes clip-spinner-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes clip-spinner-reveal {
  from {
    opacity: 0;
  }
}

@media (min-width: 768px) {
  .review {
    --button-height: 48px;
    --card-gap: 1.25rem;
    --safe-top: max(1.5rem, env(safe-area-inset-top, 0px));
    row-gap: 1.25rem;
  }

  .review-card {
    border-width: 4px;
    border-radius: 14px;
    box-shadow: 0 0 0 3px var(--ink), 0 6px 0 3px var(--ink);
  }

  .review-card:active:not(:disabled) {
    transform: translateY(5px);
  }

  .result-badge {
    top: 7px;
    right: 7px;
  }
}
</style>
