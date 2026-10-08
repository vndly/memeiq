import type {YouTubeNamespace,
  YouTubePlayer,
  YouTubePlayerErrorEvent,
  YouTubePlayerReadyEvent,
  YouTubePlayerStateChangeEvent} from '@/types/youtube'

let apiPromise: Promise<YouTubeNamespace> | null = null

/** Milliseconds a mounted player may take to report ready before it is treated as failed. */
const PLAYER_READY_TIMEOUT_MS = 15000

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
  private callbacks: YouTubeAudioPlayerCallbacks
  private hostElement: HTMLElement | null = null
  private mountGeneration: number = 0
  private readyTimeoutId: ReturnType<typeof setTimeout> | null = null

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
    this.hostElement = null // Host container element
    this.mountGeneration = 0 // Generation counter to guard async mount
    this.readyTimeoutId = null // Pending timeout that fails a player that never reports ready
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
   * Mounts the YouTube player to a container element for a specific video ID.
   * @param container - Host DOM element for the iframe.
   * @param videoId - YouTube video ID to load.
   * @returns Resolves when the player instance is initialized.
   */
  async mount(container: HTMLElement, videoId: string): Promise<void> {
    this.destroy()
    this.hostElement = container
    this.isPlayerReady = false
    const currentGeneration = ++this.mountGeneration

    try {
      const namespace = await loadYouTubeIframeApi()

      if (this.hostElement === null || this.mountGeneration !== currentGeneration) {
        return
      }

      container.replaceChildren()
      const placeholder = document.createElement('div')
      container.appendChild(placeholder)

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
            if (this.mountGeneration === currentGeneration) {
              this.handleError(event)
            }
          },
        },
      })

      // A player whose iframe never loads reports neither ready nor error, so give up on it after a while
      this.readyTimeoutId = setTimeout(() => {
        this.readyTimeoutId = null
        if (this.mountGeneration === currentGeneration) {
          this.destroy()
          this.callbacks.onError()
        }
      }, PLAYER_READY_TIMEOUT_MS)
    } catch {
      if (this.mountGeneration === currentGeneration) {
        this.callbacks.onError()
      }
    }
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
    this.pendingPlay = false
    this.isPlaybackActive = false
    this.isPlayerReady = false
    if (this.player !== null) {
      try {
        this.player.destroy()
      } catch {
        // Player may already be torn down
      }
      this.player = null
    }
    if (this.hostElement !== null) {
      this.hostElement.replaceChildren()
      this.hostElement = null
    }
  }

  /**
   * Handles player ready event.
   * @param _event - YouTube ready event.
   */
  private handleReady(_event: YouTubePlayerReadyEvent): void {
    this.clearReadyTimeout()
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
}
