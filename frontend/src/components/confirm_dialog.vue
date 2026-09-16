<script setup lang="ts">
import {onUnmounted, watch} from 'vue'

export interface ConfirmDialogProps {
  isOpen: boolean
  title?: string
  confirmText?: string
  cancelText?: string
}

const props = withDefaults(
  defineProps<ConfirmDialogProps>(),
  {
    title: 'LEAVE MATCH?',
    confirmText: 'LEAVE',
    cancelText: 'STAY',
  },
)

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

/**
 * Closes the dialog when the Escape key is pressed.
 * @param event - Keyboard event.
 */
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('cancel')
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
    @click.self="emit('cancel')"
  >
    <div
      class="dialog-container"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      @click.stop
    >
      <h2
        id="confirm-dialog-title"
        class="dialog-title"
      >
        {{ title }}
      </h2>

      <div class="dialog-actions">
        <button
          type="button"
          class="dialog-button cancel-button"
          @click="emit('cancel')"
        >
          {{ cancelText }}
        </button>
        <button
          type="button"
          class="dialog-button confirm-button"
          @click="emit('confirm')"
        >
          {{ confirmText }}
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
  background: rgb(0 0 0 / 65%);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.dialog-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  width: 100%;
  max-width: 400px;
  padding: 2rem 1.75rem;
  background: var(--panel);
  border: 3px solid #ffffff;
  border-radius: 12px;
  box-shadow: 0 16px 40px rgb(0 0 0 / 60%);
  text-align: center;
}

.dialog-title {
  font-family: var(--font-display);
  font-size: clamp(2rem, 6vw, 2.5rem);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-main);
  line-height: 1.1;
  -webkit-text-stroke: 1.5px #000000;
  paint-order: stroke fill;
  text-shadow: 0 4px 12px rgb(0 0 0 / 50%);
}

.dialog-actions {
  display: flex;
  flex-direction: row;
  justify-content: center;
  gap: 1rem;
  width: 100%;
  margin-top: 0.5rem;
}

.dialog-button {
  flex: 1 1 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0.75rem 1.25rem;
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

.dialog-button:hover {
  filter: brightness(1.08);
  box-shadow: 0 8px 24px rgb(0 0 0 / 35%);
}

.dialog-button:active {
  filter: brightness(0.95);
  transform: scale(0.98);
  box-shadow: 0 4px 12px rgb(0 0 0 / 20%);
}

.cancel-button {
  background: var(--accent);
  color: var(--accent-contrast);
}

.confirm-button {
  background: #ff3b30;
  color: #ffffff;
}
</style>
