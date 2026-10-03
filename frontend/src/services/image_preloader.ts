/**
 * Downloads an image into the browser cache so it renders instantly when displayed.
 * Resolves on failure too, so a broken image never blocks the caller.
 * @param imageUrl - URL of the image to load.
 * @returns Resolves once the image has loaded or failed.
 */
export function preloadImage(imageUrl: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = (): void => {
      resolve()
    }
    image.onerror = (): void => {
      resolve()
    }
    image.src = imageUrl
  })
}
