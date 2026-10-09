/**
 * Item in the meme catalogue.
 */
export interface Meme {
  id: number
  name: string
  url: string
  /** Player volume (1-100) that evens out loudness across memes, measured by `scripts/measure_volumes.sh`. */
  volume: number
}
