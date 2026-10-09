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
