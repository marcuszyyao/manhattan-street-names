import { computed, ref } from 'vue'
import {
  compactStreetKey,
  isNumberedStreetName,
  standardizeStreetText,
  streetExactKeys,
  streetInputKeys,
  stripDirectionalSuffix,
  stripStreetSuffix,
} from './normalization.js'

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

function streetMiles(street) {
  return Number(street?.properties?.miles) || 0
}

function isNumberedStreet(street) {
  return isNumberedStreetName(street?.properties?.display)
}

export function useStreetGame() {
  const allStreets = ref([])
  const fullTotalLength = ref(0)
  const loaded = ref(false)
  const guessedKeys = ref([])
  const allGuessedStreets = ref([])
  const gaveUp = ref(false)
  const skipNumberedStreets = ref(false)
  const sortKey = ref('found')
  const exactIndex = new Map()
  const directionlessIndex = new Map()
  const fallbackIndex = new Map()
  const streetsByKey = new Map()

  const numberedStreetCount = computed(() => allStreets.value.filter(isNumberedStreet).length)
  const streets = computed(() => skipNumberedStreets.value
    ? allStreets.value.filter((street) => !isNumberedStreet(street))
    : allStreets.value)
  const activeStreetKeys = computed(() => new Set(streets.value.map((street) => street.properties.clean)))
  const totalLength = computed(() => skipNumberedStreets.value
    ? streets.value.reduce((sum, street) => sum + streetMiles(street), 0)
    : fullTotalLength.value)

  function withCurrentPercent(street) {
    const percent = totalLength.value > 0
      ? Math.round((streetMiles(street) / totalLength.value) * 10000) / 100
      : 0
    return {
      ...street,
      properties: { ...street.properties, percent },
    }
  }

  const guessedStreets = computed(() => allGuessedStreets.value
    .filter((street) => activeStreetKeys.value.has(street.properties.clean))
    .map(withCurrentPercent))
  const guessedMiles = computed(() => guessedStreets.value.reduce((sum, street) => sum + streetMiles(street), 0))
  const percentMilesGuessed = computed(() => {
    if (totalLength.value <= 0) return 0
    return Math.min(100, Math.round((guessedMiles.value / totalLength.value) * 10000) / 100)
  })
  const isEmpty = computed(() => guessedStreets.value.length === 0)
  const isOver = computed(() => gaveUp.value || percentMilesGuessed.value >= 100)
  const hasResults = computed(() => !isEmpty.value || gaveUp.value)
  const missedStreets = computed(() => {
    if (!gaveUp.value) return []
    const guessed = new Set(guessedKeys.value)
    return streets.value
      .filter((street) => !guessed.has(street.properties.clean))
      .map((street, index) => withCurrentPercent(cloneMissedFeature(street, index)))
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
    allStreets.value = data.streets ?? []
    fullTotalLength.value = data.totalLength ?? 0
    exactIndex.clear()
    directionlessIndex.clear()
    fallbackIndex.clear()
    streetsByKey.clear()

    for (const street of allStreets.value) {
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

      const exactDisplayKey = compactStreetKey(street.properties.display)
      const directionlessKey = compactStreetKey(stripDirectionalSuffix(street.properties.display))
      if (directionlessKey && directionlessKey !== exactDisplayKey) {
        if (!directionlessIndex.has(directionlessKey)) directionlessIndex.set(directionlessKey, new Set())
        directionlessIndex.get(directionlessKey).add(street.properties.clean)
      }

      const fallbackAliases = new Set(street.properties.fallbackAliases ?? [])
      const derivedFallback = compactStreetKey(stripStreetSuffix(street.properties.display))
      if (derivedFallback && derivedFallback !== exactDisplayKey) fallbackAliases.add(derivedFallback)
      for (const alias of fallbackAliases) {
        if (!fallbackIndex.has(alias)) fallbackIndex.set(alias, new Set())
        fallbackIndex.get(alias).add(street.properties.clean)
      }
    }
    loaded.value = true
  }

  function addKeys(keys, latest = true, includeInactive = false) {
    const existing = new Set(guessedKeys.value)
    const additions = keys.filter((key) => (
      streetsByKey.has(key)
      && !existing.has(key)
      && (includeInactive || activeStreetKeys.value.has(key))
    ))
    if (!additions.length) return false

    allGuessedStreets.value = allGuessedStreets.value.map((feature) => ({
      ...feature,
      properties: { ...feature.properties, latest: undefined },
    }))

    const newFeatures = additions.map((key, offset) => {
      const feature = streetsByKey.get(key)
      return cloneFeature(feature, latest, allGuessedStreets.value.length + offset)
    })
    guessedKeys.value = [...guessedKeys.value, ...additions]
    allGuessedStreets.value = [...allGuessedStreets.value, ...newFeatures]
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
    if (matches.size) return submitMatches(matches)

    for (const inputKey of streetExactKeys(standardizedInput)) {
      for (const streetKey of directionlessIndex.get(inputKey) ?? []) matches.add(streetKey)
    }
    if (matches.size) return submitMatches(matches)

    const hasExplicitEnding = stripStreetSuffix(standardizedInput) !== standardizedInput
    if (hasExplicitEnding) return { valid: false, added: false }

    for (const inputKey of streetInputKeys(standardizedInput)) {
      for (const streetKey of fallbackIndex.get(inputKey) ?? []) matches.add(streetKey)
    }
    if (!matches.size) return { valid: false, added: false }
    return submitMatches(matches)
  }

  function submitMatches(matches) {
    const activeMatches = [...matches].filter((key) => activeStreetKeys.value.has(key))
    if (!activeMatches.length) return { valid: false, added: false }
    return { valid: true, added: addKeys(activeMatches, true) }
  }

  function giveUp() {
    if (gaveUp.value || percentMilesGuessed.value >= 100) return false
    gaveUp.value = true
    sortKey.value = 'found'
    return true
  }

  function setSkipNumberedStreets(value) {
    const nextValue = Boolean(value)
    if (isOver.value && nextValue !== skipNumberedStreets.value) return false
    skipNumberedStreets.value = nextValue
    return true
  }

  function restore(keys = [], wasGivenUp = false, shouldSkipNumbered = false) {
    reset(false)
    skipNumberedStreets.value = Boolean(shouldSkipNumbered)
    addKeys(keys, false, true)
    gaveUp.value = Boolean(wasGivenUp) && percentMilesGuessed.value < 100
  }

  function reset(clear = true) {
    guessedKeys.value = []
    allGuessedStreets.value = []
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
    skipNumberedStreets,
    numberedStreetCount,
    isEmpty,
    isOver,
    hasResults,
    sortKey,
    load,
    submitName,
    giveUp,
    setSkipNumberedStreets,
    restore,
    reset,
  }
}
