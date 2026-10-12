import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { useStreetGame } from '../src/game.js'
import { isNumberedStreetName } from '../src/normalization.js'

const data = JSON.parse(await readFile(new URL('../public/data-manhattan-all.json', import.meta.url)))
const originalFetch = globalThis.fetch
const numberedStreets = data.streets.filter((street) => isNumberedStreetName(street.properties.display))
const namedStreets = data.streets.filter((street) => !isNumberedStreetName(street.properties.display))

function loadedGame() {
  const game = useStreetGame()
  return game.load().then(() => game)
}

function displays(game) {
  return game.guessedStreets.value.map((street) => street.properties.display).sort()
}

test.before(() => {
  globalThis.fetch = async () => ({ ok: true, json: async () => data })
})

test.after(() => {
  globalThis.fetch = originalFetch
})

test('a suffixless guess reveals every matching street type', async () => {
  const game = await loadedGame()
  const result = game.submitName('first')
  const displays = game.guessedStreets.value.map((street) => street.properties.display)

  assert.deepEqual(result, { valid: true, added: true })
  assert.ok(displays.includes('1ST AVE'))
  assert.ok(displays.includes('1ST ST'))
  assert.deepEqual(
    displays,
    data.streets
      .filter((street) => street.properties.exactAliases.includes('1ST') || street.properties.fallbackAliases.includes('1ST'))
      .map((street) => street.properties.display),
  )
})

test('an explicit street ending reveals only the exact match', async () => {
  const game = await loadedGame()

  assert.deepEqual(game.submitName('first ave'), { valid: true, added: true })
  assert.deepEqual(game.guessedStreets.value.map((street) => street.properties.display), ['1ST AVE'])

  game.reset()
  assert.deepEqual(game.submitName('first st'), { valid: true, added: true })
  assert.deepEqual(game.guessedStreets.value.map((street) => street.properties.display), ['1ST ST'])

  game.reset()
  assert.deepEqual(game.submitName('first road'), { valid: false, added: false })
  assert.deepEqual(game.guessedStreets.value, [])
})

test('an existing exact name still wins over broader suffixless aliases', async () => {
  const game = await loadedGame()

  assert.deepEqual(game.submitName('Broadway'), { valid: true, added: true })
  assert.deepEqual(game.guessedStreets.value.map((street) => street.properties.display), ['BROADWAY'])
})

test('accepts Queensboro Bridge without the Ed Koch honorific', async () => {
  for (const input of ['Queensboro', 'Queensboro Bridge', 'Ed Koch Queensboro Bridge']) {
    const game = await loadedGame()
    assert.deepEqual(game.submitName(input), { valid: true, added: true })
    assert.deepEqual(displays(game), ['ED KOCH QUEENSBORO BRG'])
  }
})

test('preserves existing bridge spelling aliases', async () => {
  const game = await loadedGame()

  assert.deepEqual(game.submitName('Williamsburg Bridge Bike Pth'), { valid: true, added: true })
  assert.deepEqual(displays(game), ['WILLIAMSBURG BRIDGE BIKE PATH'])
})

test('directionless place names reveal every directional side', async () => {
  const cases = [
    ['Gramercy Park', ['GRAMERCY PARK E', 'GRAMERCY PARK N', 'GRAMERCY PARK S', 'GRAMERCY PARK W']],
    ['Union Square', ['UNION SQ E', 'UNION SQ W']],
    ['Washington Square', ['WASHINGTON SQ E', 'WASHINGTON SQ N', 'WASHINGTON SQ S', 'WASHINGTON SQ W']],
  ]

  for (const [input, expected] of cases) {
    const game = await loadedGame()
    assert.deepEqual(game.submitName(input), { valid: true, added: true })
    assert.deepEqual(displays(game), expected)
  }
})

test('a suffixless guess includes streets with terminal directions', async () => {
  const game = await loadedGame()

  assert.deepEqual(game.submitName('Park'), { valid: true, added: true })
  assert.ok(displays(game).includes('PARK AVE'))
  assert.ok(displays(game).includes('PARK AVE S'))
})

test('explicit suffixes and directions still narrow the match', async () => {
  const cases = [
    ['Park Avenue', ['PARK AVE']],
    ['Park Avenue South', ['PARK AVE S']],
    ['Gramercy Park East', ['GRAMERCY PARK E']],
    ['Union Square West', ['UNION SQ W']],
    ['Washington Square North', ['WASHINGTON SQ N']],
  ]

  for (const [input, expected] of cases) {
    const game = await loadedGame()
    assert.deepEqual(game.submitName(input), { valid: true, added: true })
    assert.deepEqual(displays(game), expected)
  }
})

test('a nonexistent explicit direction does not broaden to the whole group', async () => {
  const game = await loadedGame()

  assert.deepEqual(game.submitName('Union Square South'), { valid: false, added: false })
  assert.deepEqual(displays(game), [])
})

test('skip-numbered mode keeps numbered streets as map-only references and rebases scoring', async () => {
  const game = await loadedGame()
  const expectedLength = namedStreets.reduce((sum, street) => sum + street.properties.miles, 0)

  assert.equal(game.numberedStreetCount.value, numberedStreets.length)
  assert.equal(game.streets.value.length, data.streets.length)
  assert.equal(game.numberedStreetReferences.value.length, 0)
  assert.equal(game.setSkipNumberedStreets(true), true)
  assert.equal(game.skipNumberedStreets.value, true)
  assert.equal(game.streets.value.length, namedStreets.length)
  assert.ok(game.streets.value.every((street) => !isNumberedStreetName(street.properties.display)))
  assert.equal(game.numberedStreetReferences.value.length, numberedStreets.length)
  assert.ok(game.numberedStreetReferences.value.every((street) => isNumberedStreetName(street.properties.display)))
  const activeKeys = new Set(game.streets.value.map((street) => street.properties.clean))
  const referenceKeys = new Set(game.numberedStreetReferences.value.map((street) => street.properties.clean))
  assert.equal([...referenceKeys].some((key) => activeKeys.has(key)), false)
  assert.equal(new Set([...activeKeys, ...referenceKeys]).size, data.streets.length)
  assert.ok(Math.abs(game.totalLength.value - expectedLength) < 0.000001)

  assert.deepEqual(game.submitName('42nd Street'), { valid: false, added: false })
  assert.deepEqual(game.submitName('Broadway'), { valid: true, added: true })
  const broadway = namedStreets.find((street) => street.properties.display === 'BROADWAY')
  const expectedContribution = Math.round((broadway.properties.miles / expectedLength) * 10000) / 100
  assert.equal(game.guessedStreets.value[0].properties.percent, expectedContribution)
  assert.equal(game.percentMilesGuessed.value, expectedContribution)
})

test('toggling numbered streets preserves existing progress without scoring it', async () => {
  const game = await loadedGame()

  game.submitName('First Street')
  game.submitName('Broadway')
  const fullScore = game.percentMilesGuessed.value
  const savedKeys = [...game.guessedKeys.value]
  assert.deepEqual(displays(game), ['1ST ST', 'BROADWAY'])

  game.setSkipNumberedStreets(true)
  assert.deepEqual(game.guessedKeys.value, savedKeys)
  assert.deepEqual(displays(game), ['BROADWAY'])
  assert.ok(game.numberedStreetReferences.value.some((street) => street.properties.display === '1ST ST'))
  assert.ok(game.percentMilesGuessed.value > fullScore)

  game.setSkipNumberedStreets(false)
  assert.deepEqual(game.guessedKeys.value, savedKeys)
  assert.deepEqual(displays(game), ['1ST ST', 'BROADWAY'])
  assert.equal(game.numberedStreetReferences.value.length, 0)
  assert.equal(game.percentMilesGuessed.value, fullScore)
})

test('give up and completion only use eligible streets in skip-numbered mode', async () => {
  const game = await loadedGame()
  game.setSkipNumberedStreets(true)
  game.submitName('Broadway')

  assert.equal(game.giveUp(), true)
  assert.equal(game.guessedStreets.value.length + game.missedStreets.value.length, namedStreets.length)
  assert.equal(game.revealedStreetsSorted.value.length, namedStreets.length)
  assert.ok(game.revealedStreetsSorted.value.every((street) => !isNumberedStreetName(street.properties.display)))
  assert.equal(game.numberedStreetReferences.value.length, numberedStreets.length)
  assert.ok(game.numberedStreetReferences.value.every((street) => isNumberedStreetName(street.properties.display)))

  const completed = await loadedGame()
  completed.restore(namedStreets.map((street) => street.properties.clean), false, true)
  assert.equal(completed.percentMilesGuessed.value, 100)
  assert.equal(completed.isOver.value, true)
  assert.equal(completed.setSkipNumberedStreets(false), false)
})

test('restore round-trips skip-numbered mode while reset preserves it', async () => {
  const game = await loadedGame()
  const firstStreet = data.streets.find((street) => street.properties.display === '1ST ST')
  const broadway = data.streets.find((street) => street.properties.display === 'BROADWAY')
  const keys = [firstStreet.properties.clean, broadway.properties.clean]

  game.restore(keys, false, true)
  assert.equal(game.skipNumberedStreets.value, true)
  assert.deepEqual(game.guessedKeys.value, keys)
  assert.deepEqual(displays(game), ['BROADWAY'])
  assert.equal(game.numberedStreetReferences.value.length, numberedStreets.length)

  game.reset()
  assert.equal(game.skipNumberedStreets.value, true)
  assert.deepEqual(game.guessedKeys.value, [])

  game.restore(keys)
  assert.equal(game.skipNumberedStreets.value, false)
  assert.deepEqual(displays(game), ['1ST ST', 'BROADWAY'])
})

test('giving up preserves the earned score and separates found from missed streets', async () => {
  const game = await loadedGame()
  game.submitName('Broadway')
  const score = game.percentMilesGuessed.value
  const keys = [...game.guessedKeys.value]

  assert.equal(game.giveUp(), true)
  assert.equal(game.gaveUp.value, true)
  assert.equal(game.isOver.value, true)
  assert.equal(game.hasResults.value, true)
  assert.equal(game.percentMilesGuessed.value, score)
  assert.deepEqual(game.guessedKeys.value, keys)
  assert.equal(game.missedStreets.value.length, data.streets.length - 1)
  assert.equal(game.missedStreets.value.some((street) => street.properties.display === 'BROADWAY'), false)
  assert.equal(game.revealedStreetsSorted.value.length, data.streets.length)
})

test('giving up freezes guesses and is idempotent', async () => {
  const game = await loadedGame()

  assert.equal(game.giveUp(), true)
  assert.equal(game.giveUp(), false)
  assert.deepEqual(game.submitName('Fifth Avenue'), { valid: false, added: false })
  assert.equal(game.guessedKeys.value.length, 0)
  assert.equal(game.percentMilesGuessed.value, 0)
  assert.equal(game.missedStreets.value.length, data.streets.length)
})

test('a surrendered game restores and reset returns it to active play', async () => {
  const game = await loadedGame()
  const broadway = data.streets.find((street) => street.properties.display === 'BROADWAY')

  game.restore([broadway.properties.clean], true)
  assert.equal(game.gaveUp.value, true)
  assert.deepEqual(game.guessedKeys.value, [broadway.properties.clean])

  game.reset()
  assert.equal(game.gaveUp.value, false)
  assert.equal(game.isOver.value, false)
  assert.equal(game.hasResults.value, false)
  assert.equal(game.missedStreets.value.length, 0)
})

test('a naturally completed game remains a win instead of a surrender', async () => {
  const game = await loadedGame()
  game.restore(data.streets.map((street) => street.properties.clean), true)

  assert.equal(game.percentMilesGuessed.value, 100)
  assert.equal(game.gaveUp.value, false)
  assert.equal(game.giveUp(), false)
})
