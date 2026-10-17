import type {Meme} from '@/types/meme'

/**
 * Outcome of one match stage.
 */
export interface StageResult {
  /** Meme whose audio played in the stage. */
  meme: Meme
  /** Whether the player picked that meme. */
  isCorrect: boolean
}
