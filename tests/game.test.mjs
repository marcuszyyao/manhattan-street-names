import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { useStreetGame } from '../src/game.js'

const data = JSON.parse(await readFile(new URL('../public/data-manhattan-all.json', import.meta.url)))
const originalFetch = globalThis.fetch

function loadedGame() {
  const game = useStreetGame()
  return game.load().then(() => game)
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
