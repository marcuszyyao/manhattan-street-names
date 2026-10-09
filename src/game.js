import { computed, ref } from 'vue'
import { streetExactKeys, streetInputKeys } from './normalization.js'

function cloneFeature(feature, latest = false, index = 0) {
  return {
    ...feature,
    properties: {
      ...feature.properties,
      index,
      ...(latest ? { latest: true } : {}),
    },
  }
}

export function useStreetGame() {
  const streets = ref([])
  const totalLength = ref(0)
  const loaded = ref(false)
  const guessedKeys = ref([])
  const guessedStreets = ref([])
  const guessedMiles = ref(0)
  const sortKey = ref('found')
  const exactIndex = new Map()
  const fallbackIndex = new Map()
  const streetsByKey = new Map()

  const percentMilesGuessed = computed(() => {
    if (totalLength.value <= 0) return 0
    return Math.min(100, Math.round((guessedMiles.value / totalLength.value) * 10000) / 100)
  })
  const isEmpty = computed(() => guessedKeys.value.length === 0)
  const guessedStreetsSorted = computed(() => {
    const copy = [...guessedStreets.value]
    if (sortKey.value === 'alphabetical') {
      return copy.sort((a, b) => b.properties.display.localeCompare(a.properties.display))
    }
    if (sortKey.value === 'length') {
      return copy.sort((a, b) => a.properties.percent - b.properties.percent)
    }
    return copy.sort((a, b) => a.properties.index - b.properties.index)
  })

  async function load() {
    const response = await fetch(`${import.meta.env.BASE_URL}data-manhattan-all.json`)
    if (!response.ok) throw new Error(`Unable to load Manhattan street data (${response.status})`)
    const data = await response.json()
    streets.value = data.streets ?? []
    totalLength.value = data.totalLength ?? 0
    exactIndex.clear()
    fallbackIndex.clear()
    streetsByKey.clear()

    for (const street of streets.value) {
      streetsByKey.set(street.properties.clean, street)
      const exactAliases = new Set([
        street.properties.clean,
        ...(street.properties.exactAliases ?? []),
        ...streetExactKeys(street.properties.display),
      ])
      for (const alias of exactAliases) {
        if (!exactIndex.has(alias)) exactIndex.set(alias, new Set())
        exactIndex.get(alias).add(street.properties.clean)
      }
      for (const alias of street.properties.fallbackAliases ?? []) {
        if (!fallbackIndex.has(alias)) fallbackIndex.set(alias, new Set())
        fallbackIndex.get(alias).add(street.properties.clean)
      }
    }
    loaded.value = true
  }

  function addKeys(keys, latest = true) {
    const existing = new Set(guessedKeys.value)
    const additions = keys.filter((key) => streetsByKey.has(key) && !existing.has(key))
    if (!additions.length) return false

    guessedStreets.value = guessedStreets.value.map((feature) => ({
      ...feature,
      properties: { ...feature.properties, latest: undefined },
    }))

    const newFeatures = additions.map((key, offset) => {
      const feature = streetsByKey.get(key)
      guessedMiles.value += Number(feature.properties.miles) || 0
      return cloneFeature(feature, latest, guessedStreets.value.length + offset)
    })
    guessedKeys.value = [...guessedKeys.value, ...additions]
    guessedStreets.value = [...guessedStreets.value, ...newFeatures]
    return true
  }

  function submitName(input) {
    if (!String(input ?? '').trim()) return { valid: false, added: false }
    const exactMatches = new Set()
    for (const inputKey of streetExactKeys(input)) {
      for (const streetKey of exactIndex.get(inputKey) ?? []) exactMatches.add(streetKey)
    }
    if (exactMatches.size) return { valid: true, added: addKeys([...exactMatches], true) }

    const fallbackMatches = new Set()
    for (const inputKey of streetInputKeys(input)) {
      const canonical = exactIndex.get(inputKey)
      if (canonical?.size) {
        for (const streetKey of canonical) fallbackMatches.add(streetKey)
        continue
      }
      const fallback = fallbackIndex.get(inputKey)
      if (fallback?.size === 1) {
        for (const streetKey of fallback) fallbackMatches.add(streetKey)
      }
    }
    if (!fallbackMatches.size) return { valid: false, added: false }
    return { valid: true, added: addKeys([...fallbackMatches], true) }
  }

  function restore(keys = []) {
    reset(false)
    addKeys(keys, false)
  }

  function reset(clear = true) {
    guessedKeys.value = []
    guessedStreets.value = []
    guessedMiles.value = 0
    if (clear) sortKey.value = 'found'
  }

  return {
    streets,
    totalLength,
    loaded,
    guessedKeys,
    guessedStreets,
    guessedStreetsSorted,
    guessedMiles,
    percentMilesGuessed,
    isEmpty,
    sortKey,
    load,
    submitName,
    restore,
    reset,
  }
}
