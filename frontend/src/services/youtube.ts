/**
 * Utility functions for YouTube URLs and resources.
 */

/**
 * Extracts the YouTube video ID from a given URL.
 * @param videoUrl - Full URL to a YouTube video.
 * @returns Extracted video ID or null if not recognized.
 */
export function extractYouTubeVideoId(videoUrl: string): string | null {
  try {
    const parsedUrl = new URL(videoUrl)

    if (parsedUrl.hostname === 'youtu.be') {
      const pathnamePart = parsedUrl.pathname.slice(1).split('/')[0]
      return pathnamePart !== undefined && pathnamePart.length > 0 ? pathnamePart : null
    }

    if (parsedUrl.hostname.includes('youtube.com')) {
      const videoQueryParam = parsedUrl.searchParams.get('v')
      if (videoQueryParam !== null && videoQueryParam.length > 0) {
        return videoQueryParam
      }

      const pathSegments = parsedUrl.pathname.split('/').filter(Boolean)
      const firstSegment = pathSegments[0]
      const secondSegment = pathSegments[1]
      if ((firstSegment === 'shorts' || firstSegment === 'embed' || firstSegment === 'v') && secondSegment !== undefined) {
        return secondSegment
      }
    }
  } catch {
    // Malformed URL; fallback to regex extraction.
  }

  const match = /(?:v=|\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})(?:[&?]|$)/.exec(videoUrl)
  return match?.[1] ?? null
}

/**
 * Constructs the thumbnail URL for a YouTube video.
 * @param videoUrl - Full URL of the YouTube video.
 * @returns Thumbnail image URL or null if video ID cannot be determined.
 */
export function getYouTubeThumbnailUrl(videoUrl: string): string | null {
  const videoId = extractYouTubeVideoId(videoUrl)
  if (videoId === null) {
    return null
  }

  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
}
