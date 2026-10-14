/**
 * Downloads a thumbnail so its card shows it at once when revealed.
 * @param imageUrl - URL of the thumbnail image.
 * @returns Resolves with whether the image downloaded.
 */
export function loadThumbnail(imageUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = (): void => {
      resolve(true)
    }
    image.onerror = (): void => {
      resolve(false)
    }
    image.src = imageUrl
  })
}
