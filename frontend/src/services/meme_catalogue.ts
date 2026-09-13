import {ref} from 'vue'
import {MEME_CATALOGUE_URL} from '@/constants'
import type {Meme} from '@/types/meme'

/**
 * In-memory meme catalogue loaded at startup.
 */
export const memeCatalogue = ref<Meme[]>([])

/**
 * Whether the meme catalogue is currently being loaded.
 */
export const isCatalogueLoading = ref(true)

/**
 * Error message if fetching the catalogue fails.
 */
export const catalogueError = ref<string | null>(null)

/**
 * Fetches the meme catalogue from the remote endpoint.
 * @returns Resolves with the loaded meme catalogue items.
 */
export async function fetchMemeCatalogue(): Promise<Meme[]> {
  isCatalogueLoading.value = true
  catalogueError.value = null

  try {
    const response = await fetch(MEME_CATALOGUE_URL, {
      redirect: 'follow',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch meme catalogue: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as unknown

    if (!Array.isArray(data)) {
      throw new Error('Unexpected response format: expected an array of memes')
    }

    memeCatalogue.value = data as Meme[]
    isCatalogueLoading.value = false
    return memeCatalogue.value
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load meme catalogue'
    catalogueError.value = message
    isCatalogueLoading.value = false
    return []
  }
}
