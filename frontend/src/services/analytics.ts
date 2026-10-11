import {getAnalytics, isSupported, logEvent} from 'firebase/analytics'
import type {Analytics} from 'firebase/analytics'
import type {FirebaseApp} from 'firebase/app'
import {app} from '@/firebase'
import type {Difficulty} from '@/types/difficulty'
import type {MatchLength} from '@/types/match_length'

/**
 * Parameters for tracking an audio playback event.
 */
export interface AudioPlayParams {
  videoId?: string
  videoName?: string
  isReplay: boolean
}

/**
 * Parameters for tracking a meme whose audio cannot be played.
 */
export interface AudioUnavailableParams {
  videoId?: string
  videoName?: string
  reason: 'error' | 'not_started' | 'missing_video'
}

/**
 * Parameters for tracking a meme whose autoplay did not start.
 */
export interface AutoplayBlockedParams {
  videoId?: string
  videoName?: string
}

/**
 * Parameters for tracking a meme card whose thumbnail fails to download.
 */
export interface ThumbnailLoadFailureParams {
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
  stageNumber: number
  answerSeconds: number
}

/**
 * Parameters for tracking a completed match.
 */
export interface MatchCompleteParams {
  difficulty: Difficulty
  matchLength: MatchLength
  iqScore: number
  correctCount: number
  stageCount: number
}

/**
 * Parameters for tracking a match the player left before finishing.
 */
export interface MatchLeaveParams {
  stageNumber: number
  correctCount: number
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
   * @param matchLength - Selected match length.
   */
  trackMatchStart(difficulty?: Difficulty, matchLength?: MatchLength): void {
    const payload: Record<string, string | number | boolean> = {}

    if (difficulty !== undefined) {
      payload.difficulty = difficulty
    }
    if (matchLength !== undefined) {
      payload.match_length = matchLength
    }

    this.log('match_start', payload)
  }

  /**
   * Tracks when the pause dialog is displayed.
   */
  trackPauseDialogShown(): void {
    this.log('pause_dialog_shown')
  }

  /**
   * Tracks when the player closes the pause dialog and resumes the match.
   */
  trackMatchResume(): void {
    this.log('match_resume')
  }

  /**
   * Tracks when the confirmation dialog to leave a match is displayed.
   */
  trackLeaveDialogShown(): void {
    this.log('leave_dialog_shown')
  }

  /**
   * Tracks when the player confirms leaving a match via the dialog.
   * @param params - Stage reached and correct answers so far.
   */
  trackMatchLeave(params: MatchLeaveParams): void {
    this.log('match_leave', {
      stage_number: params.stageNumber,
      correct_count: params.correctCount,
    })
  }

  /**
   * Tracks when the player cancels leaving and stays in the match.
   */
  trackMatchStay(): void {
    this.log('match_stay')
  }

  /**
   * Tracks when the player initiates meme audio playback.
   * @param params - Video identifier or name, and whether the audio already played in this stage.
   */
  trackAudioPlay(params: AudioPlayParams): void {
    const payload: Record<string, string | number | boolean> = {
      is_replay: params.isReplay,
    }

    if (params.videoId !== undefined) {
      payload.video_id = params.videoId
    }
    if (params.videoName !== undefined) {
      payload.video_name = params.videoName
    }

    this.log('audio_play', payload)
  }

  /**
   * Tracks when a meme's audio cannot be played and the cards unlock without it.
   * @param params - Video identifier or name, and why the audio is unavailable.
   */
  trackAudioUnavailable(params: AudioUnavailableParams): void {
    const payload: Record<string, string | number | boolean> = {
      reason: params.reason,
    }

    if (params.videoId !== undefined) {
      payload.video_id = params.videoId
    }
    if (params.videoName !== undefined) {
      payload.video_name = params.videoName
    }

    this.log('audio_unavailable', payload)
  }

  /**
   * Tracks when a stage's audio does not start on its own, so the player has to press play.
   * @param params - Video identifier or name.
   */
  trackAutoplayBlocked(params: AutoplayBlockedParams): void {
    const payload: Record<string, string | number | boolean> = {}

    if (params.videoId !== undefined) {
      payload.video_id = params.videoId
    }
    if (params.videoName !== undefined) {
      payload.video_name = params.videoName
    }

    this.log('autoplay_blocked', payload)
  }

  /**
   * Tracks when a meme card's thumbnail fails to download.
   * @param params - Video identifier or name.
   */
  trackThumbnailLoadFailure(params: ThumbnailLoadFailureParams): void {
    const payload: Record<string, string | number | boolean> = {}

    if (params.videoId !== undefined) {
      payload.video_id = params.videoId
    }
    if (params.videoName !== undefined) {
      payload.video_name = params.videoName
    }

    this.log('thumbnail_load_failure', payload)
  }

  /**
   * Tracks when the player selects a meme thumbnail card.
   * @param params - Selected and target video details, selection outcome, stage, and answer time.
   */
  trackThumbnailSelect(params: ThumbnailSelectParams): void {
    const payload: Record<string, string | number | boolean> = {
      result: params.result,
      stage_number: params.stageNumber,
      answer_seconds: params.answerSeconds,
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

  /**
   * Tracks when a match finishes and the results are shown.
   * @param params - Match settings and final result.
   */
  trackMatchComplete(params: MatchCompleteParams): void {
    this.log('match_complete', {
      difficulty: params.difficulty,
      match_length: params.matchLength,
      iq_score: params.iqScore,
      correct_count: params.correctCount,
      stage_count: params.stageCount,
    })
  }

  /**
   * Tracks when the player returns to the main menu from the results.
   * @param iqScore - Final IQ score of the match.
   */
  trackResultsMenuClick(iqScore: number): void {
    this.log('results_menu_click', {
      iq_score: iqScore,
    })
  }

  /**
   * Tracks when the meme catalogue fails to load.
   * @param errorMessage - Reason the catalogue could not be loaded.
   */
  trackCatalogueLoadError(errorMessage: string): void {
    this.log('catalogue_load_error', {
      error_message: errorMessage,
    })
  }

  /**
   * Tracks when the player retries loading the meme catalogue.
   */
  trackCatalogueRetry(): void {
    this.log('catalogue_retry')
  }
}

export const analytics = new AnalyticsService()
