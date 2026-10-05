<script setup lang="ts">
import {computed, ref} from 'vue'
import {useRouter} from 'vue-router'
import {analytics} from '@/services/analytics'
import {getMatchMemeCount} from '@/services/meme_catalogue'
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
  analytics.trackMatchStart(selectedDifficulty.value, selectedMatchLength.value)
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
  gap: clamp(4rem, 12vh, 10.5rem);
  width: 100%;
  transform: translateY(-4vh);
}

.title {
  font-family: var(--font-display);
  font-size: clamp(3.5rem, 9vw, 5.25rem);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-main);
  text-align: center;
  line-height: 1.05;
  -webkit-text-stroke: 2.5px #000000;
  paint-order: stroke fill;
  text-shadow: 0 6px 18px rgb(0 0 0 / 50%);
}

.menu {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: min(100%, 340px);
}

.selector-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.selector-group + .selector-group {
  margin-top: 0.75rem;
}

.selector-caption {
  font-family: var(--font-display);
  font-size: 1.625rem;
  line-height: 1;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-main);
  text-align: center;
  -webkit-text-stroke: 1.5px #000000;
  paint-order: stroke fill;
  text-shadow: 0 4px 12px rgb(0 0 0 / 50%);
}

.option-selector {
  display: flex;
  padding: 4px;
  gap: 4px;
  background: rgb(10 15 29 / 55%);
  border: 2px solid #ffffff;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgb(0 0 0 / 25%);
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
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--text-dim);
  transition: background-color 0.15s ease, color 0.15s ease;
}

.option:hover .option-label {
  color: var(--text-main);
}

.option-input:checked + .option-label {
  background: var(--accent);
  color: var(--accent-contrast);
}

.option-label--count {
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
}

.option-input:focus-visible + .option-label {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
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
  margin-top: 3rem;
  align-items: center;
  justify-content: center;
  min-width: 180px;
  min-height: 48px;
  padding: 0.75rem 2.5rem;
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
  transition: filter 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease;
}

.menu-button:hover {
  filter: brightness(1.08);
  box-shadow: 0 8px 24px rgb(0 0 0 / 35%);
}

.menu-button:active {
  filter: brightness(0.95);
  transform: scale(0.98);
  box-shadow: 0 4px 12px rgb(0 0 0 / 20%);
}
</style>

