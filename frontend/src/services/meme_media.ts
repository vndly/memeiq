/**
 * Built URLs of the self-hosted meme media downloaded by `scripts/download_media.sh`, keyed by meme ID.
 * The files are never inlined, so the bundle does not carry them and each one is fetched only when needed.
 */

const audioModules = import.meta.glob<string>('@/assets/memes/audio/*.mp3', {
  eager: true,
  query: '?url&no-inline',
  import: 'default',
})

const thumbnailModules = import.meta.glob<string>('@/assets/memes/thumbnails/*.jpg', {
  eager: true,
  query: '?url&no-inline',
  import: 'default',
})

/**
 * Re-keys glob-imported media URLs by the meme ID in each file name.
 * @param modules - Built URLs keyed by source path.
 * @returns Built URLs keyed by meme ID.
 */
function indexByMemeId(modules: Record<string, string>): Map<string, string> {
  const urlsByMemeId = new Map<string, string>()
  for (const [
    path,
    url,
  ] of Object.entries(modules)) {
    const memeId = /([^/]+)\.[^./]+$/.exec(path)?.[1]
    if (memeId !== undefined) {
      urlsByMemeId.set(memeId, url)
    }
  }
  return urlsByMemeId
}

const audioUrls = indexByMemeId(audioModules)
const thumbnailUrls = indexByMemeId(thumbnailModules)

/**
 * Looks up the audio clip of a meme.
 * @param memeId - ID of the meme.
 * @returns URL of the MP3 file, or null if the meme has none.
 */
export function getMemeAudioUrl(memeId: string): string | null {
  return audioUrls.get(memeId) ?? null
}

/**
 * Looks up the thumbnail of a meme.
 * @param memeId - ID of the meme.
 * @returns URL of the JPEG file, or null if the meme has none.
 */
export function getMemeThumbnailUrl(memeId: string): string | null {
  return thumbnailUrls.get(memeId) ?? null
}
