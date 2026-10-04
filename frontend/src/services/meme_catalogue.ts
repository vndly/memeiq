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

/**
 * Returns a shuffled copy of the given memes.
 * @param memes - The memes to shuffle.
 * @returns A new array with the memes in random order.
 */
export function shuffleMemes(memes: readonly Meme[]): Meme[] {
  const shuffledMemes = [...memes]

  for (let i = shuffledMemes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const itemAtI = shuffledMemes[i]
    const itemAtJ = shuffledMemes[j]
    if (itemAtI !== undefined && itemAtJ !== undefined) {
      shuffledMemes[i] = itemAtJ
      shuffledMemes[j] = itemAtI
    }
  }

  return shuffledMemes
}

/**
 * Picks the memes shown in a stage: the target meme plus random distinct decoys from the catalogue.
 * Decoys avoid the targets of previous stages, which are used only when too few other memes remain.
 * @param targetMeme - The meme whose audio plays in the stage.
 * @param count - The total number of memes to pick.
 * @param pastTargetMemes - The target memes of the match's previous stages.
 * @returns The target meme and its decoys in random order.
 */
export function pickStageMemes(targetMeme: Meme, count: number, pastTargetMemes: readonly Meme[]): Meme[] {
  const pastTargetIds = new Set(pastTargetMemes.map((meme) => meme.id))
  const decoyPool = memeCatalogue.value.filter((meme) => meme.id !== targetMeme.id)
  const freshDecoys = decoyPool.filter((meme) => !pastTargetIds.has(meme.id))
  const pastTargetDecoys = decoyPool.filter((meme) => pastTargetIds.has(meme.id))
  const decoys = [
    ...shuffleMemes(freshDecoys),
    ...shuffleMemes(pastTargetDecoys),
  ].slice(0, count - 1)
  return shuffleMemes([
    targetMeme,
    ...decoys,
  ])
}
