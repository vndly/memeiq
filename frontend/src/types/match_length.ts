/**
 * Supported match lengths, from a short match to the whole catalogue.
 */
export type MatchLength = 'small' | 'medium' | 'full'

/**
 * Checks whether an arbitrary string is a valid match length.
 * @param value - The value to test.
 * @returns True if value is a valid match length.
 */
export function isMatchLength(value: unknown): value is MatchLength {
  return value === 'small' || value === 'medium' || value === 'full'
}
