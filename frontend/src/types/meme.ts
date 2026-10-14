/**
 * Item in the meme catalogue.
 */
export interface Meme {
  id: string
  name: string
  /** YouTube video the meme's audio and thumbnail are downloaded from by `scripts/download_media.sh`. */
  url: string
}
