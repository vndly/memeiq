<script setup lang="ts">
import {onUnmounted, watch} from 'vue'

export interface PauseDialogProps {
  isOpen: boolean
}

const props = defineProps<PauseDialogProps>()

const emit = defineEmits<{
  resume: []
  quit: []
}>()

/**
 * Resumes the match when the Escape key is pressed.
 * @param event - Keyboard event.
 */
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('resume')
  }
}

watch(
  () => props.isOpen,
  (isOpen) => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeydown)
    } else {
      window.removeEventListener('keydown', handleKeydown)
    }
  },
  {
    immediate: true,
  },
)

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    v-if="isOpen"
    class="backdrop"
    @click.self="emit('resume')"
  >
    <div
      class="dialog-container"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-dialog-title"
      @click.stop
    >
      <h2
        id="pause-dialog-title"
        class="dialog-title"
      >
        PAUSE
      </h2>

      <div class="dialog-actions">
        <button
          type="button"
          class="dialog-button resume-button"
          @click="emit('resume')"
        >
          CONTINUE
        </button>
        <button
          type="button"
          class="dialog-button quit-button"
          @click="emit('quit')"
        >
          QUIT
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: color-mix(in srgb, var(--ground) 55%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.dialog-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  width: 100%;
  max-width: 400px;
  padding: 2rem 1.75rem 2.25rem;
  background: var(--paper);
  border: 3px solid var(--ink);
  border-radius: 20px;
  box-shadow: 0 8px 0 var(--ink);
  text-align: center;
}

.dialog-title {
  font-family: var(--font-display);
  font-size: clamp(2.25rem, 8vw, 3rem);
  font-weight: 400;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--ink);
  line-height: 1;
}

.dialog-actions {
  display: flex;
  flex-direction: row;
  justify-content: center;
  gap: 1rem;
  width: 100%;
}

.dialog-button {
  flex: 1 1 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  padding: 0.5rem 1.25rem;
  border: 3px solid var(--ink);
  border-radius: 12px;
  font-family: var(--font-display);
  font-size: 1.5rem;
  line-height: 1;
  letter-spacing: 0.05em;
  cursor: pointer;
  box-shadow: 0 5px 0 var(--ink);
  transition: filter 0.15s ease, transform 0.08s ease, box-shadow 0.08s ease;
}

.dialog-button:hover {
  filter: brightness(1.06);
}

.dialog-button:active {
  transform: translateY(4px);
  box-shadow: 0 1px 0 var(--ink);
}

.resume-button {
  background: var(--accent);
  color: var(--ink);
}

.quit-button {
  background: #ff3b30;
  color: var(--paper);
}
</style>
