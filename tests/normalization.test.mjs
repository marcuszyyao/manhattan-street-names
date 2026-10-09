import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { ordinal, standardizeStreetText, streetExactKeys, streetInputKeys, stripStreetSuffix } from '../src/normalization.js'

test('formats numeric ordinals correctly', () => {
  assert.equal(ordinal(1), '1ST')
  assert.equal(ordinal(2), '2ND')
  assert.equal(ordinal(3), '3RD')
  assert.equal(ordinal(11), '11TH')
  assert.equal(ordinal(42), '42ND')
})

test('accepts common Manhattan street spellings', () => {
  assert.equal(standardizeStreetText('West 42nd Street'), 'W 42ND ST')
  assert.equal(standardizeStreetText('forty second street'), '42ND ST')
  assert.equal(standardizeStreetText('Fifth Avenue'), '5TH AVE')
  assert.equal(stripStreetSuffix('West End Avenue'), 'W END')
  assert.ok(streetInputKeys('Avenue A').includes('A'))
  assert.ok(streetInputKeys('Sixth Avenue').includes('AVEOFTHEAMERICAS'))
  assert.ok(streetInputKeys('FDR Drive').includes('FRANKLINDROOSEVELTDR'))
})

test('generated game data has valid scoring and core Manhattan streets', async () => {
  const data = JSON.parse(await readFile(new URL('../public/data-manhattan-all.json', import.meta.url)))
  assert.ok(data.totalLength > 500)
  assert.ok(data.streets.length > 1000)
  assert.equal(new Set(data.streets.map((street) => street.id)).size, data.streets.length)
  assert.ok(data.streets.some((street) => street.properties.display === 'BROADWAY'))
  assert.ok(data.streets.some((street) => street.properties.display === '42ND ST'))
  assert.ok(data.streets.some((street) => street.properties.display === '5TH AVE'))
  const houstonStreets = data.streets.filter((street) => street.properties.display === 'HOUSTON ST')
  assert.equal(houstonStreets.length, 1)
  assert.deepEqual(houstonStreets[0].properties.fullNames, ['E  HOUSTON ST', 'W  HOUSTON ST'])
  assert.ok(houstonStreets[0].properties.exactAliases.includes('HOUSTONST'))
  assert.ok(houstonStreets[0].properties.exactAliases.includes('EHOUSTONST'))
  assert.ok(houstonStreets[0].properties.exactAliases.includes('WHOUSTONST'))
  assert.ok(streetExactKeys('Houston Street').some((key) => houstonStreets[0].properties.exactAliases.includes(key)))
  assert.ok(houstonStreets[0].properties.miles > 3.1)
  assert.deepEqual(
    data.streets.filter((street) => street.properties.exactAliases.includes(streetExactKeys('Broadway')[0])).map((street) => street.properties.display),
    ['BROADWAY'],
  )
  const totalPercent = data.streets.reduce((sum, street) => sum + street.properties.percent, 0)
  assert.ok(totalPercent > 99 && totalPercent < 101)
})
