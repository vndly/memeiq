/**
 * Type declarations for the YouTube IFrame Player API.
 */

export interface YouTubePlayerVars {
  autoplay?: 0 | 1
  controls?: 0 | 1
  disablekb?: 0 | 1
  fs?: 0 | 1
  playsinline?: 0 | 1
  rel?: 0 | 1
  origin?: string
}

export interface YouTubePlayerReadyEvent {
  target: YouTubePlayer
}

export interface YouTubePlayerStateChangeEvent {
  target: YouTubePlayer
  data: number
}

export interface YouTubePlayerErrorEvent {
  target: YouTubePlayer
  data: number
}

export interface YouTubePlayerEvents {
  onReady?: (event: YouTubePlayerReadyEvent) => void
  onStateChange?: (event: YouTubePlayerStateChangeEvent) => void
  onError?: (event: YouTubePlayerErrorEvent) => void
}

export interface YouTubePlayerOptions {
  videoId: string
  playerVars?: YouTubePlayerVars
  events?: YouTubePlayerEvents
}

export interface YouTubePlayer {
  playVideo: () => void
  pauseVideo: () => void
  stopVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  destroy: () => void
  getPlayerState: () => number
  cueVideoById: (videoId: string) => void
  loadVideoById: (videoId: string) => void
}

export interface YouTubePlayerStateMap {
  UNSTARTED: number
  ENDED: number
  PLAYING: number
  PAUSED: number
  BUFFERING: number
  CUED: number
}

export interface YouTubeNamespace {
  Player: new (element: HTMLElement | string, options: YouTubePlayerOptions) => YouTubePlayer
  PlayerState: YouTubePlayerStateMap
}

declare global {
  interface Window {
    YT?: YouTubeNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}
