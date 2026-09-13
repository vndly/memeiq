import type {YouTubeNamespace,
  YouTubePlayer,
  YouTubePlayerErrorEvent,
  YouTubePlayerReadyEvent,
  YouTubePlayerStateChangeEvent} from '@/types/youtube'

let apiPromise: Promise<YouTubeNamespace> | null = null

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

  apiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    let timerId: ReturnType<typeof setInterval> | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null

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

    const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]')
    if (existingScript === null) {
      const scriptElement = document.createElement('script')
      scriptElement.src = 'https://www.youtube.com/iframe_api'
      scriptElement.async = true
      scriptElement.onerror = (): void => {
        cleanup()
        apiPromise = null
        reject(new Error('Failed to load YouTube IFrame API script'))
      }
      document.head.appendChild(scriptElement)
    }

    const previousReadyHandler = window.onYouTubeIframeAPIReady
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
      cleanup()
      apiPromise = null
      reject(new Error('Timed out waiting for YouTube IFrame API'))
    }, 10000)
  })

  return apiPromise
}

export interface YouTubeAudioPlayerCallbacks {
  onEnded: () => void
  onError: () => void
  onReady?: () => void
}

/**
 * Headless audio player wrapping the YouTube IFrame API.
 * Plays the audio of a YouTube video without displaying video content.
 */
export class YouTubeAudioPlayer {
  private player: YouTubePlayer | null = null
  private isPlayerReady: boolean = false
  private pendingPlay: boolean = false
  private callbacks: YouTubeAudioPlayerCallbacks
  private hostElement: HTMLElement | null = null
  private mountGeneration: number = 0

  /**
   * Constructs a new audio player instance.
   * @param callbacks - Callback handlers for playback lifecycle events.
   */
  constructor(callbacks: YouTubeAudioPlayerCallbacks) {
    this.callbacks = callbacks // Callback handlers
    this.player = null // Active YouTube player instance
    this.isPlayerReady = false // Whether player is ready for playback
    this.pendingPlay = false // Whether playback was queued before ready
    this.hostElement = null // Host container element
    this.mountGeneration = 0 // Generation counter to guard async mount
  }

  /**
   * Indicates whether the YouTube player is ready.
   */
  get ready(): boolean {
    return this.isPlayerReady
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
    if (this.player !== null && this.isPlayerReady) {
      this.player.seekTo(0, true)
      this.player.playVideo()
    } else {
      this.pendingPlay = true
    }
  }

  /**
   * Stops the audio playback.
   */
  stop(): void {
    this.pendingPlay = false
    if (this.player !== null && this.isPlayerReady) {
      this.player.stopVideo()
    }
  }

  /**
   * Cleans up the YouTube player and removes DOM nodes.
   */
  destroy(): void {
    this.mountGeneration++
    this.pendingPlay = false
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
    // 0 represents ENDED in YouTube PlayerState
    if (event.data === 0) {
      this.callbacks.onEnded()
    }
  }

  /**
   * Handles player error events.
   * @param _event - YouTube player error event.
   */
  private handleError(_event: YouTubePlayerErrorEvent): void {
    this.pendingPlay = false
    this.callbacks.onError()
  }
}
