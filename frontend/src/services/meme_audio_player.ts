/** Milliseconds a download may go without receiving any data before it is restarted. */
const AUDIO_STALL_TIMEOUT_MS = 15000

/** Milliseconds before the first restart of a download that failed temporarily; each further restart waits twice as long. */
const AUDIO_RETRY_BASE_DELAY_MS = 1000

/** Longest wait, in milliseconds, before restarting a download that failed temporarily. */
const AUDIO_RETRY_MAX_DELAY_MS = 10000

export interface MemeAudioPlayerCallbacks {
  onEnded: () => void
  onError: () => void
  onReady?: () => void
  onPlaying?: () => void
}

/**
 * Headless audio player for a meme's self-hosted audio clip.
 * Downloads the whole clip before reporting ready, since mobile browsers ignore preload hints and would otherwise only fetch it on play.
 */
export class MemeAudioPlayer {
  private audioElement: HTMLAudioElement | null = null
  private objectUrl: string | null = null
  private abortController: AbortController | null = null
  private isPlayerReady: boolean = false
  private pendingPlay: boolean = false
  private isPlaybackActive: boolean = false
  private isFailed: boolean = false
  private callbacks: MemeAudioPlayerCallbacks
  private loadGeneration: number = 0
  private loadTimeoutId: ReturnType<typeof setTimeout> | null = null
  private retryTimeoutId: ReturnType<typeof setTimeout> | null = null
  private retryAttempt: number = 0

  /**
   * Constructs a new audio player instance.
   * @param callbacks - Callback handlers for playback lifecycle events.
   */
  constructor(callbacks: MemeAudioPlayerCallbacks) {
    this.callbacks = callbacks // Callback handlers
    this.audioElement = null // Element playing the downloaded clip
    this.objectUrl = null // Object URL of the downloaded clip, revoked on teardown
    this.abortController = null // Aborts the download in progress
    this.isPlayerReady = false // Whether the clip is downloaded and ready for playback
    this.pendingPlay = false // Whether playback was queued before ready
    this.isPlaybackActive = false // Whether playback was requested and has not been paused, stopped, or ended
    this.isFailed = false // Whether the clip can never play, or failed during playback
    this.loadGeneration = 0 // Generation counter to guard async loads
    this.loadTimeoutId = null // Pending timeout that restarts a download that stops receiving data
    this.retryTimeoutId = null // Pending timeout that restarts a download after a temporary failure
    this.retryAttempt = 0 // Restarts made since the last external load, which sets the next restart's delay
  }

  /**
   * Indicates whether the clip is downloaded and ready to play.
   */
  get ready(): boolean {
    return this.isPlayerReady
  }

  /**
   * Indicates whether the audio is playing, or was asked to play and has not been paused, stopped, or ended.
   */
  get playing(): boolean {
    return this.isPlaybackActive
  }

  /**
   * Indicates whether the player reported an error, either a clip that can never play or a failure during playback.
   */
  get failed(): boolean {
    return this.isFailed
  }

  /**
   * Indicates whether the player is waiting out the delay before restarting a download that failed temporarily.
   */
  get retrying(): boolean {
    return this.retryTimeoutId !== null
  }

  /**
   * Downloads a clip, replacing any previous one.
   * Temporary download failures restart it after a growing delay instead of reporting an error.
   * @param audioUrl - URL of the clip to load.
   * @returns Resolves when the first attempt has finished or been superseded.
   */
  async load(audioUrl: string): Promise<void> {
    this.retryAttempt = 0
    await this.loadAttempt(audioUrl)
  }

  /**
   * Makes one attempt at downloading a clip, replacing any previous one.
   * @param audioUrl - URL of the clip to load.
   * @returns Resolves when the attempt has finished or been superseded.
   */
  private async loadAttempt(audioUrl: string): Promise<void> {
    this.destroy()
    const currentGeneration = ++this.loadGeneration
    const abortController = new AbortController()
    this.abortController = abortController

    // A stalled download reports neither success nor failure, so restart it once no data has arrived for a while
    this.restartStallTimeout(audioUrl, currentGeneration)

    let audioBlob: Blob
    try {
      const response = await fetch(audioUrl, {
        signal: abortController.signal,
      })
      if (!response.ok) {
        if (this.loadGeneration === currentGeneration) {
          // A server error may clear up on a fresh download, but any other failed response never will
          if (response.status >= 500) {
            this.scheduleRetry(audioUrl)
          } else {
            this.handleError()
          }
        }
        return
      }
      audioBlob = await this.readBody(response, audioUrl, currentGeneration)
    } catch {
      // Network failures may clear up on a fresh download; an abort comes from a teardown that already superseded this attempt
      if (this.loadGeneration === currentGeneration) {
        this.scheduleRetry(audioUrl)
      }
      return
    }

    if (this.loadGeneration !== currentGeneration) {
      return
    }

    const objectUrl = URL.createObjectURL(audioBlob)
    const audioElement = new Audio(objectUrl)
    audioElement.preload = 'auto'
    audioElement.addEventListener('playing', () => {
      if (this.loadGeneration === currentGeneration && this.callbacks.onPlaying !== undefined) {
        this.callbacks.onPlaying()
      }
    })
    audioElement.addEventListener('ended', () => {
      if (this.loadGeneration === currentGeneration) {
        this.isPlaybackActive = false
        this.callbacks.onEnded()
      }
    })
    audioElement.addEventListener('error', () => {
      if (this.loadGeneration === currentGeneration) {
        this.handleError()
      }
    })
    this.objectUrl = objectUrl
    this.audioElement = audioElement
    this.handleReady()
  }

  /**
   * Reads a response body chunk by chunk, so a slow download that keeps receiving data is never mistaken for a stalled one.
   * @param response - Response of the clip download.
   * @param audioUrl - URL of the clip to load.
   * @param generation - Load generation the download belongs to.
   * @returns The whole clip.
   */
  private async readBody(response: Response, audioUrl: string, generation: number): Promise<Blob> {
    if (response.body === null) {
      return await response.blob()
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array<ArrayBuffer>[] = []
    let result = await reader.read()
    while (!result.done) {
      chunks.push(result.value)
      this.restartStallTimeout(audioUrl, generation)
      result = await reader.read()
    }
    return new Blob(chunks, {
      type: response.headers.get('Content-Type') ?? '',
    })
  }

  /**
   * Starts, or starts over, the timeout that restarts the download when no data arrives in time.
   * @param audioUrl - URL of the clip to load.
   * @param generation - Load generation the download belongs to; a superseded download leaves the newer one's timeout alone.
   */
  private restartStallTimeout(audioUrl: string, generation: number): void {
    if (this.loadGeneration !== generation) {
      return
    }
    this.clearLoadTimeout()
    this.loadTimeoutId = setTimeout(() => {
      this.loadTimeoutId = null
      if (this.loadGeneration === generation) {
        this.scheduleRetry(audioUrl)
      }
    }, AUDIO_STALL_TIMEOUT_MS)
  }

  /**
   * Tears down the failed download and starts it again after a delay that doubles with each attempt, up to a maximum.
   * @param audioUrl - URL of the clip to load.
   */
  private scheduleRetry(audioUrl: string): void {
    this.destroy()
    const delay = Math.min(AUDIO_RETRY_BASE_DELAY_MS * 2 ** this.retryAttempt, AUDIO_RETRY_MAX_DELAY_MS)
    this.retryAttempt++
    const retryGeneration = this.loadGeneration
    this.retryTimeoutId = setTimeout(() => {
      this.retryTimeoutId = null
      if (this.loadGeneration === retryGeneration) {
        void this.loadAttempt(audioUrl)
      }
    }, delay)
  }

  /**
   * Plays the audio from the beginning.
   */
  play(): void {
    this.isPlaybackActive = true
    if (this.audioElement !== null && this.isPlayerReady) {
      this.audioElement.currentTime = 0
      this.startPlayback(this.audioElement)
    } else {
      this.pendingPlay = true
    }
  }

  /**
   * Pauses the audio, keeping its position so it can be resumed.
   */
  pause(): void {
    this.pendingPlay = false
    this.isPlaybackActive = false
    if (this.audioElement !== null && this.isPlayerReady) {
      this.audioElement.pause()
    }
  }

  /**
   * Continues the audio from the position where it was paused.
   */
  resume(): void {
    if (this.audioElement !== null && this.isPlayerReady) {
      this.isPlaybackActive = true
      this.startPlayback(this.audioElement)
    }
  }

  /**
   * Stops the audio playback.
   */
  stop(): void {
    this.pendingPlay = false
    this.isPlaybackActive = false
    if (this.audioElement !== null && this.isPlayerReady) {
      this.audioElement.pause()
      this.audioElement.currentTime = 0
    }
  }

  /**
   * Cancels any download in progress and releases the loaded clip.
   */
  destroy(): void {
    this.loadGeneration++
    this.clearLoadTimeout()
    this.clearRetryTimeout()
    this.pendingPlay = false
    this.isPlaybackActive = false
    this.isPlayerReady = false
    this.isFailed = false
    if (this.abortController !== null) {
      this.abortController.abort()
      this.abortController = null
    }
    if (this.audioElement !== null) {
      this.audioElement.pause()
      // Loading without a source releases the decoded clip
      this.audioElement.removeAttribute('src')
      this.audioElement.load()
      this.audioElement = null
    }
    if (this.objectUrl !== null) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
  }

  /**
   * Starts the audio element, ignoring the rejection when the browser blocks autoplay or a pause interrupts it.
   * @param audioElement - Element to start.
   */
  private startPlayback(audioElement: HTMLAudioElement): void {
    void audioElement.play().catch(() => {
      // Audio playback aborted or blocked
    })
  }

  /**
   * Handles the clip finishing its download.
   */
  private handleReady(): void {
    this.clearLoadTimeout()
    this.abortController = null
    this.isPlayerReady = true
    if (this.callbacks.onReady !== undefined) {
      this.callbacks.onReady()
    }
    if (this.pendingPlay) {
      this.pendingPlay = false
      this.play()
    }
  }

  /**
   * Handles a clip that can never play, or that failed during playback.
   */
  private handleError(): void {
    this.clearLoadTimeout()
    this.pendingPlay = false
    this.isPlaybackActive = false
    this.isFailed = true
    this.callbacks.onError()
  }

  /**
   * Cancels the pending download timeout, if any.
   */
  private clearLoadTimeout(): void {
    if (this.loadTimeoutId !== null) {
      clearTimeout(this.loadTimeoutId)
      this.loadTimeoutId = null
    }
  }

  /**
   * Cancels the pending restart after a temporary failure, if any.
   */
  private clearRetryTimeout(): void {
    if (this.retryTimeoutId !== null) {
      clearTimeout(this.retryTimeoutId)
      this.retryTimeoutId = null
    }
  }
}
