/**
 * Supported match difficulty levels.
 */
export type Difficulty = 'easy' | 'medium' | 'hard'

/**
 * Checks whether an arbitrary string is a valid difficulty.
 * @param value - The value to test.
 * @returns True if value is a valid difficulty.
 */
export function isDifficulty(value: unknown): value is Difficulty {
  return value === 'easy' || value === 'medium' || value === 'hard'
}
