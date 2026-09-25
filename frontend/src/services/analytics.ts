import {getAnalytics, isSupported, logEvent} from 'firebase/analytics'
import type {Analytics} from 'firebase/analytics'
import type {FirebaseApp} from 'firebase/app'
import {app} from '@/firebase'
import type {Difficulty} from '@/types/difficulty'

/**
 * Parameters for tracking an audio playback event.
 */
export interface AudioPlayParams {
  videoId?: string
  videoName?: string
}

/**
 * Parameters for tracking a thumbnail selection event.
 */
export interface ThumbnailSelectParams {
  selectedVideoId?: string
  selectedVideoName?: string
  targetVideoId?: string
  targetVideoName?: string
  result: 'success' | 'failure'
}

/**
 * Service for tracking user and match analytics events via Firebase Analytics.
 */
export class AnalyticsService {
  private firebaseApp: FirebaseApp
  private analyticsPromise: Promise<Analytics | null>

  /**
   * Constructs an analytics service instance.
   * @param firebaseApp - Firebase application instance.
   */
  constructor(firebaseApp: FirebaseApp = app) {
    this.firebaseApp = firebaseApp // Firebase application instance
    this.analyticsPromise = this.initialize() // Initialized analytics promise
  }

  /**
   * Initializes Firebase Analytics if supported in the current environment.
   * @returns Analytics instance or null if unsupported.
   */
  private async initialize(): Promise<Analytics | null> {
    if (typeof window === 'undefined') {
      return null
    }

    try {
      const supported = await isSupported()
      if (supported) {
        return getAnalytics(this.firebaseApp)
      }
    } catch {
      // Analytics unsupported or blocked
    }

    return null
  }

  /**
   * Logs an event to Firebase Analytics if available.
   * @param eventName - Event name identifier.
   * @param eventParams - Key-value event parameters.
   */
  log(eventName: string, eventParams?: Record<string, string | number | boolean>): void {
    void this.analyticsPromise.then((analyticsInstance) => {
      if (analyticsInstance !== null) {
        logEvent(analyticsInstance, eventName, eventParams)
      }
    })
  }

  /**
   * Tracks when a player starts a new match.
   * @param difficulty - Selected match difficulty.
   */
  trackMatchStart(difficulty?: Difficulty): void {
    if (difficulty !== undefined) {
      this.log('match_start', {
        difficulty: difficulty,
      })
      return
    }
    this.log('match_start')
  }

  /**
   * Tracks when the confirmation dialog to leave a match is displayed.
   */
  trackLeaveDialogShown(): void {
    this.log('leave_dialog_shown')
  }

  /**
   * Tracks when the player confirms leaving a match via the dialog.
   */
  trackMatchLeave(): void {
    this.log('match_leave')
  }

  /**
   * Tracks when the player cancels leaving and stays in the match.
   */
  trackMatchStay(): void {
    this.log('match_stay')
  }

  /**
   * Tracks when the player initiates meme audio playback.
   * @param params - Video identifier or name.
   */
  trackAudioPlay(params: AudioPlayParams): void {
    const payload: Record<string, string | number | boolean> = {}

    if (params.videoId !== undefined) {
      payload.video_id = params.videoId
    }
    if (params.videoName !== undefined) {
      payload.video_name = params.videoName
    }

    this.log('audio_play', payload)
  }

  /**
   * Tracks when the player selects a meme thumbnail card.
   * @param params - Selected and target video details and selection outcome.
   */
  trackThumbnailSelect(params: ThumbnailSelectParams): void {
    const payload: Record<string, string | number | boolean> = {
      result: params.result,
    }

    if (params.selectedVideoId !== undefined) {
      payload.selected_video_id = params.selectedVideoId
    }
    if (params.selectedVideoName !== undefined) {
      payload.selected_video_name = params.selectedVideoName
    }
    if (params.targetVideoId !== undefined) {
      payload.target_video_id = params.targetVideoId
    }
    if (params.targetVideoName !== undefined) {
      payload.target_video_name = params.targetVideoName
    }

    this.log('thumbnail_select', payload)
  }
}

export const analytics = new AnalyticsService()
