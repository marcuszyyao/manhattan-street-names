import { computed, ref } from 'vue'
import { standardizeStreetText, streetExactKeys, streetInputKeys, stripStreetSuffix } from './normalization.js'

function cloneFeature(feature, latest = false, index = 0) {
  return {
    ...feature,
    properties: {
      ...feature.properties,
      guessed: true,
      index,
      ...(latest ? { latest: true } : {}),
    },
  }
}

function cloneMissedFeature(feature, index = 0) {
  return {
    ...feature,
    properties: {
      ...feature.properties,
      guessed: false,
      index,
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
  const gaveUp = ref(false)
  const sortKey = ref('found')
  const exactIndex = new Map()
  const fallbackIndex = new Map()
  const streetsByKey = new Map()

  const percentMilesGuessed = computed(() => {
    if (totalLength.value <= 0) return 0
    return Math.min(100, Math.round((guessedMiles.value / totalLength.value) * 10000) / 100)
  })
  const isEmpty = computed(() => guessedKeys.value.length === 0)
  const isOver = computed(() => gaveUp.value || percentMilesGuessed.value >= 100)
  const hasResults = computed(() => !isEmpty.value || gaveUp.value)
  const missedStreets = computed(() => {
    if (!gaveUp.value) return []
    const guessed = new Set(guessedKeys.value)
    return streets.value
      .filter((street) => !guessed.has(street.properties.clean))
      .map((street, index) => cloneMissedFeature(street, index))
  })
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
  const revealedStreetsSorted = computed(() => {
    const copy = [...guessedStreets.value, ...missedStreets.value]
    if (sortKey.value === 'alphabetical') {
      return copy.sort((a, b) => a.properties.display.localeCompare(b.properties.display))
    }
    if (sortKey.value === 'length') {
      return copy.sort((a, b) => Number(b.properties.miles) - Number(a.properties.miles))
    }
    return copy.sort((a, b) => {
      if (a.properties.guessed !== b.properties.guessed) return a.properties.guessed ? -1 : 1
      if (a.properties.guessed) return b.properties.index - a.properties.index
      return a.properties.display.localeCompare(b.properties.display)
    })
  })

  async function load() {
    const baseUrl = import.meta.env?.BASE_URL ?? './'
    const response = await fetch(`${baseUrl}data-manhattan-all.json`)
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
    if (gaveUp.value) return { valid: false, added: false }
    const standardizedInput = standardizeStreetText(input)
    if (!standardizedInput) return { valid: false, added: false }

    const matches = new Set()
    for (const inputKey of streetExactKeys(standardizedInput)) {
      for (const streetKey of exactIndex.get(inputKey) ?? []) matches.add(streetKey)
    }
    if (matches.size) return { valid: true, added: addKeys([...matches], true) }

    const hasExplicitEnding = stripStreetSuffix(standardizedInput) !== standardizedInput
    if (hasExplicitEnding) return { valid: false, added: false }

    for (const inputKey of streetInputKeys(standardizedInput)) {
      for (const streetKey of fallbackIndex.get(inputKey) ?? []) matches.add(streetKey)
    }
    if (!matches.size) return { valid: false, added: false }
    return { valid: true, added: addKeys([...matches], true) }
  }

  function giveUp() {
    if (gaveUp.value || percentMilesGuessed.value >= 100) return false
    gaveUp.value = true
    sortKey.value = 'found'
    return true
  }

  function restore(keys = [], wasGivenUp = false) {
    reset(false)
    addKeys(keys, false)
    gaveUp.value = Boolean(wasGivenUp) && percentMilesGuessed.value < 100
  }

  function reset(clear = true) {
    guessedKeys.value = []
    guessedStreets.value = []
    guessedMiles.value = 0
    gaveUp.value = false
    if (clear) sortKey.value = 'found'
  }

  return {
    streets,
    totalLength,
    loaded,
    guessedKeys,
    guessedStreets,
    guessedStreetsSorted,
    revealedStreetsSorted,
    missedStreets,
    guessedMiles,
    percentMilesGuessed,
    gaveUp,
    isEmpty,
    isOver,
    hasResults,
    sortKey,
    load,
    submitName,
    giveUp,
    restore,
    reset,
  }
}
