const SUFFIX_REPLACEMENTS = [
  ['BOULEVARD', 'BLVD'],
  ['STREET', 'ST'],
  ['AVENUE', 'AVE'],
  ['HIGHWAY', 'HWY'],
  ['TERRACE', 'TER'],
  ['TUNNEL', 'TUNL'],
  ['FREEWAY', 'FWY'],
  ['CIRCLE', 'CIR'],
  ['ALLEY', 'ALY'],
  ['ROAD', 'RD'],
  ['LANE', 'LN'],
  ['STAIRWAY', 'STAIRWAY'],
  ['STAIRS', 'STAIRWAY'],
  ['COURT', 'CT'],
  ['PLACE', 'PL'],
  ['PROMENADE', 'PROMENADE'],
  ['DRIVE', 'DR'],
]

export const DIRECTIONAL_SUFFIXES = new Set(['E', 'N', 'S', 'W'])

export const STREET_SUFFIXES = new Set([
  'HIGHWAY', 'HWY', 'BLVD', 'TERRACE', 'TER', 'ST', 'STREET', 'WAY',
  'BOULEVARD', 'TUNNEL', 'TUNL', 'AVE', 'AVENUE', 'FREEWAY', 'FWY',
  'CIR', 'CIRCLE', 'ALLEY', 'ALY', 'ROAD', 'RD', 'PARK', 'LOOP',
  'LANE', 'LN', 'STAIRWAY', 'STAIRS', 'COURT', 'CT', 'PLACE', 'PL',
  'PROMENADE', 'DRIVE', 'DR', 'BRIDGE', 'BRG', 'PLAZA', 'PKWY',
  'SQUARE', 'SQ', ...DIRECTIONAL_SUFFIXES,
])

const SMALL_ORDINALS = [
  '', 'FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH', 'SEVENTH',
  'EIGHTH', 'NINTH', 'TENTH', 'ELEVENTH', 'TWELFTH', 'THIRTEENTH',
  'FOURTEENTH', 'FIFTEENTH', 'SIXTEENTH', 'SEVENTEENTH', 'EIGHTEENTH',
  'NINETEENTH',
]
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY']
const TENS_ORDINAL = ['', '', 'TWENTIETH', 'THIRTIETH', 'FORTIETH', 'FIFTIETH', 'SIXTIETH', 'SEVENTIETH', 'EIGHTIETH', 'NINETIETH']

export function ordinal(number) {
  const value = Number(number)
  const mod100 = value % 100
  if (mod100 >= 11 && mod100 <= 13) return `${value}TH`
  return `${value}${value % 10 === 1 ? 'ST' : value % 10 === 2 ? 'ND' : value % 10 === 3 ? 'RD' : 'TH'}`
}

const ORDINAL_WORDS = new Map()
for (let number = 1; number <= 99; number += 1) {
  let words
  if (number < 20) words = SMALL_ORDINALS[number]
  else if (number % 10 === 0) words = TENS_ORDINAL[number / 10]
  else words = `${TENS[Math.floor(number / 10)]} ${SMALL_ORDINALS[number % 10]}`
  ORDINAL_WORDS.set(words, ordinal(number))
}

function replaceOrdinalWords(value) {
  let result = value
  const entries = [...ORDINAL_WORDS.entries()].sort((a, b) => b[0].length - a[0].length)
  for (const [words, numeric] of entries) {
    result = result.replace(new RegExp(`\\b${words}\\b`, 'g'), numeric)
  }
  return result
}

export function standardizeStreetText(input) {
  let value = String(input ?? '')
    .trim()
    .toUpperCase()
    .replace(/[‘’]/g, "'")
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')

  value = replaceOrdinalWords(value)
  value = value
    .replace(/^AVENUE\s+/, 'AVE ')
    .replace(/^AV\s+/, 'AVE ')
    .replace(/^ST\s+/, 'SAINT ')
    .replace(/^DOCTOR\s+/, 'DR ')
    .replace(/\bEAST\b/g, 'E')
    .replace(/\bWEST\b/g, 'W')
    .replace(/\bNORTH\b/g, 'N')
    .replace(/\bSOUTH\b/g, 'S')
    .replace(/\bJUNIOR\b/g, 'JR')

  for (const [long, short] of SUFFIX_REPLACEMENTS) {
    value = value.replace(new RegExp(`\\b${long}\\b`, 'g'), short)
  }

  value = value
    .replace(/\b(\d{1,3})(?:ST|ND|RD|TH)?\s+(ST|AVE|DR|PL)\b/g, (_, number, type) => `${ordinal(number)} ${type}`)
    .replace(/\s+/g, ' ')
    .trim()

  return value
}

export function compactStreetKey(input) {
  return standardizeStreetText(input).replace(/[^0-9A-Z]/g, '')
}

export function stripStreetSuffix(input) {
  const tokens = standardizeStreetText(input).split(' ')
  while (tokens.length > 1 && STREET_SUFFIXES.has(tokens.at(-1))) tokens.pop()
  return tokens.join(' ')
}

export function stripDirectionalSuffix(input) {
  const tokens = standardizeStreetText(input).split(' ')
  if (tokens.length > 1 && DIRECTIONAL_SUFFIXES.has(tokens.at(-1))) tokens.pop()
  return tokens.join(' ')
}

export function streetExactKeys(input) {
  const standardized = standardizeStreetText(input)
  const keys = new Set([standardized.replace(/[^0-9A-Z]/g, '')])

  for (const [long, short] of [['BRIDGE', 'BRG'], ['SQUARE', 'SQ']]) {
    if (new RegExp(`\\b${long}\\b`).test(standardized)) {
      keys.add(standardized.replace(new RegExp(`\\b${long}\\b`, 'g'), short).replace(/[^0-9A-Z]/g, ''))
    }
    if (new RegExp(`\\b${short}\\b`).test(standardized)) {
      keys.add(standardized.replace(new RegExp(`\\b${short}\\b`, 'g'), long).replace(/[^0-9A-Z]/g, ''))
    }
  }

  if (/^AVE [A-D]$/.test(standardized)) keys.add(standardized.slice(4))
  if (/^[A-D] AVE$/.test(standardized)) keys.add(standardized[0])
  if (standardized === 'SIXTH AVE' || standardized === '6TH AVE') keys.add('AVEOFTHEAMERICAS')
  if (standardized === 'AVE OF THE AMERICAS') keys.add('6THAVE')
  if (standardized === 'FDR' || standardized === 'FDR DR') keys.add('FRANKLINDROOSEVELTDR')
  if (/^ED KOCH QUEENSBORO (?:BRIDGE|BRG)$/.test(standardized)) {
    keys.add('QUEENSBORO')
    keys.add('QUEENSBOROBRG')
    keys.add('QUEENSBOROBRIDGE')
  }

  return [...keys].filter(Boolean)
}

export function streetInputKeys(input) {
  const standardized = standardizeStreetText(input)
  return [...new Set([
    ...streetExactKeys(standardized),
    stripStreetSuffix(standardized).replace(/[^0-9A-Z]/g, ''),
  ])].filter(Boolean)
}
