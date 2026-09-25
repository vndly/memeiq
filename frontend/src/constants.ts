import memesCatalogueUrl from '@/assets/memes.json?url&no-inline'
import type {Difficulty} from '@/types/difficulty'

/**
 * Application constants.
 */

/** Endpoint for fetching the meme catalogue. */
export const MEME_CATALOGUE_URL = memesCatalogueUrl

/** Default YouTube thumbnail aspect ratio (width to height). */
export const THUMBNAIL_RATIO = 16 / 9

/** Default difficulty level when none is specified. */
export const DEFAULT_DIFFICULTY: Difficulty = 'easy'

/** Number of meme cards displayed for each difficulty level. */
export const DIFFICULTY_CARD_COUNTS: Record<Difficulty, number> = {
  easy: 3,
  medium: 4,
  hard: 6,
}

