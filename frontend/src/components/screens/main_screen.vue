<script setup lang="ts">
import {computed, ref} from 'vue'
import {useRouter} from 'vue-router'
import {getMatchMemeCount} from '@/services/meme_catalogue'
import {playButtonSound} from '@/services/sound_effects'
import type {Difficulty} from '@/types/difficulty'
import type {MatchLength} from '@/types/match_length'

interface DifficultyOption {
  difficulty: Difficulty
  label: string
}

interface MatchLengthOption {
  matchLength: MatchLength
  memeCount: number
}

const router = useRouter()
const selectedDifficulty = ref<Difficulty>('medium')
const selectedMatchLength = ref<MatchLength>('medium')

const DIFFICULTY_OPTIONS: readonly DifficultyOption[] = [
  {
    difficulty: 'easy',
    label: 'EASY',
  },
  {
    difficulty: 'medium',
    label: 'MEDIUM',
  },
  {
    difficulty: 'hard',
    label: 'HARD',
  },
]

const MATCH_LENGTHS: readonly MatchLength[] = [
  'small',
  'medium',
  'full',
]

const matchLengthOptions = computed<MatchLengthOption[]>(() => {
  return MATCH_LENGTHS.map((matchLength) => ({
    matchLength: matchLength,
    memeCount: getMatchMemeCount(matchLength),
  }))
})

/**
 * Navigates to the match screen with the selected difficulty and match length.
 */
function handleStartClick(): void {
  playButtonSound()
  void router.push({
    name: 'match',
    query: {
      difficulty: selectedDifficulty.value,
      length: selectedMatchLength.value,
    },
  })
}
</script>

<template>
  <main class="main-screen">
    <div class="content">
      <h1 class="title">
        Meme IQ
      </h1>
      <div class="menu">
        <div class="selector-group">
          <p
            class="selector-caption"
            aria-hidden="true"
          >
            Memes
          </p>
          <fieldset class="option-selector">
            <legend class="visually-hidden">
              Number of memes
            </legend>
            <label
              v-for="option in matchLengthOptions"
              :key="option.matchLength"
              class="option"
            >
              <input
                v-model="selectedMatchLength"
                type="radio"
                name="match-length"
                class="option-input"
                :value="option.matchLength"
                @change="playButtonSound"
              >
              <span class="option-label option-label--count">{{ option.memeCount }}</span>
            </label>
          </fieldset>
        </div>
        <div class="selector-group">
          <p
            class="selector-caption"
            aria-hidden="true"
          >
            Difficulty
          </p>
          <fieldset class="option-selector">
            <legend class="visually-hidden">
              Difficulty
            </legend>
            <label
              v-for="option in DIFFICULTY_OPTIONS"
              :key="option.difficulty"
              class="option"
            >
              <input
                v-model="selectedDifficulty"
                type="radio"
                name="difficulty"
                class="option-input"
                :value="option.difficulty"
                @change="playButtonSound"
              >
              <span class="option-label">{{ option.label }}</span>
            </label>
          </fieldset>
        </div>
        <button
          type="button"
          class="menu-button"
          @click="handleStartClick"
        >
          START
        </button>
      </div>
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
  gap: clamp(3rem, 9vh, 7rem);
  width: 100%;
  transform: translateY(-4vh);
}

.title {
  font-family: var(--font-display);
  font-size: clamp(4.5rem, 18vw, 7.5rem);
  font-weight: 400;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-main);
  text-align: center;
  line-height: 1;
  -webkit-text-stroke: 8px var(--ink);
  paint-order: stroke fill;
  text-shadow: 0 6px 0 var(--ink);
  transform: rotate(-3deg);
}

.menu {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: min(100%, 360px);
}

.selector-group {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.selector-group + .selector-group {
  margin-top: 0.5rem;
}

.selector-caption {
  font-family: var(--font-display);
  font-size: 1.625rem;
  line-height: 1;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-main);
  text-align: center;
  -webkit-text-stroke: 5px var(--ink);
  paint-order: stroke fill;
  text-shadow: 0 3px 0 var(--ink);
}

.option-selector {
  display: flex;
  padding: 5px;
  gap: 5px;
  background: var(--paper);
  border: 3px solid var(--ink);
  border-radius: 14px;
  box-shadow: 0 5px 0 var(--ink);
}

.option {
  position: relative;
  flex: 1 1 0;
  display: flex;
  cursor: pointer;
}

.option-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.option-label {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 44px;
  padding: 0 0.5rem;
  border-radius: 9px;
  font-family: var(--font-display);
  font-size: 1.25rem;
  line-height: 1;
  letter-spacing: 0.04em;
  color: var(--ink);
  transition: background-color 0.15s ease, color 0.15s ease;
}

.option:hover .option-label {
  background: rgb(0 0 0 / 8%);
}

.option-input:checked + .option-label {
  background: var(--ink);
  color: var(--paper);
}

.option-label--count {
  font-size: 1.5rem;
  font-variant-numeric: tabular-nums;
}

.option-input:focus-visible + .option-label {
  outline: 2px solid var(--ink);
  outline-offset: 1px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.menu-button {
  display: inline-flex;
  margin-top: 2.5rem;
  align-items: center;
  justify-content: center;
  min-width: 180px;
  min-height: 60px;
  padding: 0.5rem 2.5rem;
  background: var(--accent);
  color: var(--ink);
  border: 3px solid var(--ink);
  border-radius: 14px;
  font-family: var(--font-display);
  font-size: 2rem;
  line-height: 1;
  letter-spacing: 0.05em;
  cursor: pointer;
  box-shadow: 0 6px 0 var(--ink);
  transition: filter 0.15s ease, transform 0.08s ease, box-shadow 0.08s ease;
}

.menu-button:hover {
  filter: brightness(1.06);
}

.menu-button:active {
  transform: translateY(5px);
  box-shadow: 0 1px 0 var(--ink);
}
</style>

