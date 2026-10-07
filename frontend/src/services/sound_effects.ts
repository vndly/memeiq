import buttonAudioUrl from '@/assets/button.mp3'

const buttonAudio = typeof Audio !== 'undefined' ? new Audio(buttonAudioUrl) : null

/**
 * Plays the button press sound from the beginning, restarting it if it is already playing.
 */
export function playButtonSound(): void {
  if (buttonAudio !== null) {
    buttonAudio.currentTime = 0
    void buttonAudio.play().catch(() => {
      // Audio playback aborted or blocked
    })
  }
}
