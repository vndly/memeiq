import memesCatalogueUrl from '@/assets/memes.json?url&no-inline'
import type {Difficulty} from '@/types/difficulty'
import type {MatchLength} from '@/types/match_length'

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

/** Default match length when none is specified. */
export const DEFAULT_MATCH_LENGTH: MatchLength = 'full'

/** Number of memes played for each match length; the full length plays the whole catalogue. */
export const MATCH_LENGTH_MEME_COUNTS: Record<MatchLength, number> = {
  small: 10,
  medium: 20,
  full: Infinity,
}

/** Highest IQ a match can award, split evenly across its memes. */
export const MAX_IQ_SCORE = 150

/** Seconds of answer time that cost one IQ point on a correct pick. */
export const IQ_PENALTY_SECONDS_PER_POINT = 3
