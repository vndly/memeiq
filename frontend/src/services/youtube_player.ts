import type {YouTubeNamespace,
  YouTubePlayer,
  YouTubePlayerErrorEvent,
  YouTubePlayerReadyEvent,
  YouTubePlayerStateChangeEvent} from '@/types/youtube'

let apiPromise: Promise<YouTubeNamespace> | null = null

/** Milliseconds a mounted player may take to report ready before it is reloaded. */
const PLAYER_READY_TIMEOUT_MS = 15000

/** Milliseconds before the first reload of a player whose load failed temporarily; each further reload waits twice as long. */
const PLAYER_RETRY_BASE_DELAY_MS = 1000

/** Longest wait, in milliseconds, before reloading a player whose load failed temporarily. */
const PLAYER_RETRY_MAX_DELAY_MS = 10000

/** YouTube error codes for a video that can never play here (invalid ID, removed or private, embedding disabled), so reloading cannot help. */
const PERMANENT_PLAYER_ERROR_CODES: ReadonlySet<number> = new Set([
  2,
  100,
  101,
  150,
])

/**
 * Loads the YouTube IFrame API script and resolves when the global YT namespace is ready.
 * @returns Resolves with the YouTube namespace.
 */
export function loadYouTubeIframeApi(): Promise<YouTubeNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window is not defined'))
  }

  const existingNamespace = window.YT
  if (existingNamespace !== undefined && existingNamespace.Player !== undefined) {
    return Promise.resolve(existingNamespace)
  }

  if (apiPromise !== null) {
    return apiPromise
  }

  const promise = new Promise<YouTubeNamespace>((resolve, reject) => {
    let timerId: ReturnType<typeof setInterval> | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let isFailed = false
    const previousReadyHandler = window.onYouTubeIframeAPIReady

    const cleanup = (): void => {
      if (timerId !== null) {
        clearInterval(timerId)
        timerId = null
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }

    const fail = (message: string): void => {
      // A script error can arrive after the timeout already failed this attempt and a newer one has started
      if (isFailed) {
        return
      }
      isFailed = true
      cleanup()
      window.onYouTubeIframeAPIReady = previousReadyHandler
      if (apiPromise === promise) {
        apiPromise = null
      }
      reject(new Error(message))
    }

    const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]')
    if (existingScript === null) {
      const scriptElement = document.createElement('script')
      scriptElement.src = 'https://www.youtube.com/iframe_api'
      scriptElement.async = true
      scriptElement.onerror = (): void => {
        // Remove the failed tag so the next attempt injects a fresh one instead of waiting on this one
        scriptElement.remove()
        fail('Failed to load YouTube IFrame API script')
      }
      document.head.appendChild(scriptElement)
    }

    window.onYouTubeIframeAPIReady = () => {
      if (previousReadyHandler !== undefined) {
        previousReadyHandler()
      }
      const namespace = window.YT
      if (namespace !== undefined && namespace.Player !== undefined) {
        cleanup()
        resolve(namespace)
      }
    }

    timerId = setInterval(() => {
      const namespace = window.YT
      if (namespace !== undefined && namespace.Player !== undefined) {
        cleanup()
        resolve(namespace)
      }
    }, 50)

    timeoutId = setTimeout(() => {
      fail('Timed out waiting for YouTube IFrame API')
    }, 10000)
  })

  apiPromise = promise
  return promise
}

export interface YouTubeAudioPlayerCallbacks {
  onEnded: () => void
  onError: () => void
  onReady?: () => void
  onPlaying?: () => void
}

/**
 * Headless audio player wrapping the YouTube IFrame API.
 * Plays the audio of a YouTube video without displaying video content.
 */
export class YouTubeAudioPlayer {
  private player: YouTubePlayer | null = null
  private isPlayerReady: boolean = false
  private pendingPlay: boolean = false
  private isPlaybackActive: boolean = false
  private isFailed: boolean = false
  private callbacks: YouTubeAudioPlayerCallbacks
  private wrapperElement: HTMLElement | null = null
  private mountGeneration: number = 0
  private readyTimeoutId: ReturnType<typeof setTimeout> | null = null
  private retryTimeoutId: ReturnType<typeof setTimeout> | null = null
  private retryAttempt: number = 0
  private volume: number = 100

  /**
   * Constructs a new audio player instance.
   * @param callbacks - Callback handlers for playback lifecycle events.
   */
  constructor(callbacks: YouTubeAudioPlayerCallbacks) {
    this.callbacks = callbacks // Callback handlers
    this.player = null // Active YouTube player instance
    this.isPlayerReady = false // Whether player is ready for playback
    this.pendingPlay = false // Whether playback was queued before ready
    this.isPlaybackActive = false // Whether playback was requested and has not been paused, stopped, or ended
    this.isFailed = false // Whether the player reported an error that reloading cannot fix
    this.wrapperElement = null // Element this player owns inside the host container, so players can share a host
    this.mountGeneration = 0 // Generation counter to guard async mount
    this.readyTimeoutId = null // Pending timeout that reloads a player that never reports ready
    this.retryTimeoutId = null // Pending timeout that reloads a player after a temporary load failure
    this.retryAttempt = 0 // Reloads made since the last external mount, which sets the next reload's delay
    this.volume = 100 // Volume (0-100) applied when the player reports ready
  }

  /**
   * Indicates whether the YouTube player is ready.
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
   * Indicates whether the player reported an error, either a video that can never play here or a failure during playback.
   */
  get failed(): boolean {
    return this.isFailed
  }

  /**
   * Indicates whether the player is waiting out the delay before reloading after a temporary load failure.
   */
  get retrying(): boolean {
    return this.retryTimeoutId !== null
  }

  /**
   * Mounts the YouTube player to a container element for a specific video ID.
   * Temporary load failures before the player is ready reload it after a growing delay instead of reporting an error.
   * @param container - Host DOM element for the iframe.
   * @param videoId - YouTube video ID to load.
   * @param volume - Playback volume (1-100) for the video.
   * @returns Resolves when the first attempt's player instance is initialized.
   */
  async mount(container: HTMLElement, videoId: string, volume: number): Promise<void> {
    this.retryAttempt = 0
    await this.mountAttempt(container, videoId, volume)
  }

  /**
   * Makes one attempt at mounting the YouTube player, replacing any previous one.
   * @param container - Host DOM element for the iframe.
   * @param videoId - YouTube video ID to load.
   * @param volume - Playback volume (1-100) for the video.
   * @returns Resolves when the player instance is initialized.
   */
  private async mountAttempt(container: HTMLElement, videoId: string, volume: number): Promise<void> {
    this.destroy()
    const wrapper = document.createElement('div')
    container.appendChild(wrapper)
    this.wrapperElement = wrapper
    this.volume = volume
    const currentGeneration = ++this.mountGeneration

    try {
      const namespace = await loadYouTubeIframeApi()

      if (this.mountGeneration !== currentGeneration) {
        return
      }

      const placeholder = document.createElement('div')
      wrapper.appendChild(placeholder)

      this.player = new namespace.Player(placeholder, {
        videoId: videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: YouTubePlayerReadyEvent): void => {
            if (this.mountGeneration === currentGeneration) {
              this.handleReady(event)
            }
          },
          onStateChange: (event: YouTubePlayerStateChangeEvent): void => {
            if (this.mountGeneration === currentGeneration) {
              this.handleStateChange(event)
            }
          },
          onError: (event: YouTubePlayerErrorEvent): void => {
            if (this.mountGeneration !== currentGeneration) {
              return
            }
            // Before the player is ready, an error not tied to the video itself may clear up on a fresh load
            if (!this.isPlayerReady && !PERMANENT_PLAYER_ERROR_CODES.has(event.data)) {
              this.scheduleRetry(container, videoId, volume)
            } else {
              this.handleError(event)
            }
          },
        },
      })

      // A player whose iframe never loads reports neither ready nor error, so reload it after a while
      this.readyTimeoutId = setTimeout(() => {
        this.readyTimeoutId = null
        if (this.mountGeneration === currentGeneration) {
          this.scheduleRetry(container, videoId, volume)
        }
      }, PLAYER_READY_TIMEOUT_MS)
    } catch {
      if (this.mountGeneration === currentGeneration) {
        this.scheduleRetry(container, videoId, volume)
      }
    }
  }

  /**
   * Tears down the failed player and mounts it again after a delay that doubles with each attempt, up to a maximum.
   * @param container - Host DOM element for the iframe.
   * @param videoId - YouTube video ID to load.
   * @param volume - Playback volume (1-100) for the video.
   */
  private scheduleRetry(container: HTMLElement, videoId: string, volume: number): void {
    this.destroy()
    const delay = Math.min(PLAYER_RETRY_BASE_DELAY_MS * 2 ** this.retryAttempt, PLAYER_RETRY_MAX_DELAY_MS)
    this.retryAttempt++
    const retryGeneration = this.mountGeneration
    this.retryTimeoutId = setTimeout(() => {
      this.retryTimeoutId = null
      if (this.mountGeneration === retryGeneration) {
        void this.mountAttempt(container, videoId, volume)
      }
    }, delay)
  }

  /**
   * Loads or cues a new video ID into the existing player.
   * @param videoId - YouTube video ID to cue.
   */
  cue(videoId: string): void {
    if (this.player !== null && this.isPlayerReady) {
      this.player.cueVideoById(videoId)
    }
  }

  /**
   * Plays the audio from the beginning.
   */
  play(): void {
    this.isPlaybackActive = true
    if (this.player !== null && this.isPlayerReady) {
      this.player.seekTo(0, true)
      this.player.playVideo()
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
    if (this.player !== null && this.isPlayerReady) {
      this.player.pauseVideo()
    }
  }

  /**
   * Continues the audio from the position where it was paused.
   */
  resume(): void {
    if (this.player !== null && this.isPlayerReady) {
      this.isPlaybackActive = true
      this.player.playVideo()
    }
  }

  /**
   * Stops the audio playback.
   */
  stop(): void {
    this.pendingPlay = false
    this.isPlaybackActive = false
    if (this.player !== null && this.isPlayerReady) {
      this.player.stopVideo()
    }
  }

  /**
   * Cleans up the YouTube player and removes DOM nodes.
   */
  destroy(): void {
    this.mountGeneration++
    this.clearReadyTimeout()
    this.clearRetryTimeout()
    this.pendingPlay = false
    this.isPlaybackActive = false
    this.isPlayerReady = false
    this.isFailed = false
    if (this.player !== null) {
      try {
        this.player.destroy()
      } catch {
        // Player may already be torn down
      }
      this.player = null
    }
    if (this.wrapperElement !== null) {
      this.wrapperElement.remove()
      this.wrapperElement = null
    }
  }

  /**
   * Handles player ready event.
   * @param event - YouTube ready event.
   */
  private handleReady(event: YouTubePlayerReadyEvent): void {
    this.clearReadyTimeout()
    event.target.setVolume(this.volume)
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
   * Handles player state change events.
   * @param event - YouTube player state change event.
   */
  private handleStateChange(event: YouTubePlayerStateChangeEvent): void {
    // 1 represents PLAYING in YouTube PlayerState
    if (event.data === 1 && this.callbacks.onPlaying !== undefined) {
      this.callbacks.onPlaying()
    }
    // 0 represents ENDED in YouTube PlayerState
    if (event.data === 0) {
      this.isPlaybackActive = false
      this.callbacks.onEnded()
    }
  }

  /**
   * Handles player error events.
   * @param _event - YouTube player error event.
   */
  private handleError(_event: YouTubePlayerErrorEvent): void {
    this.clearReadyTimeout()
    this.pendingPlay = false
    this.isPlaybackActive = false
    this.isFailed = true
    this.callbacks.onError()
  }

  /**
   * Cancels the pending ready timeout, if any.
   */
  private clearReadyTimeout(): void {
    if (this.readyTimeoutId !== null) {
      clearTimeout(this.readyTimeoutId)
      this.readyTimeoutId = null
    }
  }

  /**
   * Cancels the pending reload after a temporary failure, if any.
   */
  private clearRetryTimeout(): void {
    if (this.retryTimeoutId !== null) {
      clearTimeout(this.retryTimeoutId)
      this.retryTimeoutId = null
    }
  }
}
