/** Highest channel value (0-255) for a pixel to count as black. */
const DARK_CHANNEL_THRESHOLD = 24

/** Share of black pixels for a row or column to count as part of a band. */
const DARK_LINE_RATIO = 0.97

/** Largest share of the image that may be trimmed from each side. */
const MAX_TRIM_RATIO = 0.4

/** Extra pixels trimmed past a detected band to drop its compression-blurred edge. */
const BAND_EDGE_MARGIN = 1

/** JPEG quality of the trimmed image. */
const TRIMMED_IMAGE_QUALITY = 0.92

/**
 * Pixel bounds of the area left after trimming the bands.
 */
interface ContentBounds {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Downloads a thumbnail and trims the black bands (letterbox or pillarbox) baked into it.
 * Falls back to the original URL when the image has no bands or its pixels cannot be read.
 * @param imageUrl - URL of the thumbnail image.
 * @returns Resolves with a data URL of the trimmed image, or the original URL.
 */
export function loadThumbnail(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = (): void => {
      resolve(trimDarkBands(image) ?? imageUrl)
    }
    image.onerror = (): void => {
      resolve(imageUrl)
    }
    image.src = imageUrl
  })
}

/**
 * Crops the black bands off a loaded image.
 * @param image - Fully loaded image with readable pixels.
 * @returns A data URL of the cropped image, or null when there is nothing to trim or the pixels cannot be read.
 */
function trimDarkBands(image: HTMLImageElement): string | null {
  const width = image.naturalWidth
  const height = image.naturalHeight
  if (width === 0 || height === 0) {
    return null
  }

  try {
    const sourceCanvas = document.createElement('canvas')
    sourceCanvas.width = width
    sourceCanvas.height = height
    const sourceContext = sourceCanvas.getContext('2d', {
      willReadFrequently: true,
    })
    if (sourceContext === null) {
      return null
    }
    sourceContext.drawImage(image, 0, 0)
    const pixels = sourceContext.getImageData(0, 0, width, height).data

    const bounds = findContentBounds(pixels, width, height)
    if (bounds === null) {
      return null
    }

    const croppedCanvas = document.createElement('canvas')
    croppedCanvas.width = bounds.width
    croppedCanvas.height = bounds.height
    const croppedContext = croppedCanvas.getContext('2d')
    if (croppedContext === null) {
      return null
    }
    croppedContext.drawImage(image, bounds.left, bounds.top, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height)
    return croppedCanvas.toDataURL('image/jpeg', TRIMMED_IMAGE_QUALITY)
  } catch {
    // Canvas tainted by a cross-origin image or unavailable
    return null
  }
}

/**
 * Finds the area inside the black bands along each edge of an image.
 * @param pixels - RGBA pixel data of the image.
 * @param width - Image width in pixels.
 * @param height - Image height in pixels.
 * @returns The content bounds, or null when no edge has a band.
 */
function findContentBounds(pixels: Uint8ClampedArray, width: number, height: number): ContentBounds | null {
  const isDarkPixel = (x: number, y: number): boolean => {
    const index = (y * width + x) * 4
    const red = pixels[index] ?? 0
    const green = pixels[index + 1] ?? 0
    const blue = pixels[index + 2] ?? 0
    return Math.max(red, green, blue) <= DARK_CHANNEL_THRESHOLD
  }

  const isDarkRow = (y: number): boolean => {
    let darkCount = 0
    for (let x = 0; x < width; x++) {
      if (isDarkPixel(x, y)) {
        darkCount++
      }
    }
    return darkCount >= width * DARK_LINE_RATIO
  }

  const isDarkColumn = (x: number, fromY: number, toY: number): boolean => {
    let darkCount = 0
    for (let y = fromY; y < toY; y++) {
      if (isDarkPixel(x, y)) {
        darkCount++
      }
    }
    return darkCount >= (toY - fromY) * DARK_LINE_RATIO
  }

  const maxTrimX = Math.floor(width * MAX_TRIM_RATIO)
  const maxTrimY = Math.floor(height * MAX_TRIM_RATIO)

  let top = 0
  while (top < maxTrimY && isDarkRow(top)) {
    top++
  }
  let bottom = 0
  while (bottom < maxTrimY && isDarkRow(height - 1 - bottom)) {
    bottom++
  }
  let left = 0
  while (left < maxTrimX && isDarkColumn(left, top, height - bottom)) {
    left++
  }
  let right = 0
  while (right < maxTrimX && isDarkColumn(width - 1 - right, top, height - bottom)) {
    right++
  }

  if (top === 0 && bottom === 0 && left === 0 && right === 0) {
    return null
  }

  const addEdgeMargin = (bandSize: number): number => {
    return bandSize > 0 ? bandSize + BAND_EDGE_MARGIN : 0
  }
  top = addEdgeMargin(top)
  bottom = addEdgeMargin(bottom)
  left = addEdgeMargin(left)
  right = addEdgeMargin(right)

  return {
    left: left,
    top: top,
    width: width - left - right,
    height: height - top - bottom,
  }
}
