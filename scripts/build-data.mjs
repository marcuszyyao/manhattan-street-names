import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { compactStreetKey, ordinal, standardizeStreetText, streetExactKeys, stripStreetSuffix } from '../src/normalization.js'

const outputDir = fileURLToPath(new URL('../public/', import.meta.url))

function socrataUrl(dataset, extension, params) {
  const url = new URL(`https://data.cityofnewyork.us/resource/${dataset}.${extension}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'name-manhattan-streets-data-builder/1.0' } })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`)
  return response.json()
}

const centerlineUrl = socrataUrl('inkn-q76z', 'geojson', {
  '$select': 'the_geom,physicalid,status,rw_type,pre_type,post_type,full_street_name,street_name,stname_label,segmentlength',
  '$where': 'boroughcode="1" AND full_street_name IS NOT NULL AND status="2"',
  '$limit': '50000',
})
const parksUrl = socrataUrl('enfh-gkve', 'geojson', {
  '$select': 'multipolygon,gispropnum,name311,typecategory',
  '$where': 'borough="M" AND multipolygon IS NOT NULL',
  '$limit': '5000',
})
const boundaryUrl = socrataUrl('gthc-hcne', 'geojson', {
  '$where': 'borocode="1"',
  '$limit': '5',
})

function canonicalDisplay(rawName) {
  let value = String(rawName ?? '').toUpperCase().replace(/\s+/g, ' ').trim()
  if (!value) return ''

  const numberedStreet = value.match(/^[EW]\s+(\d{1,3})\s+ST$/)
  if (numberedStreet) value = `${numberedStreet[1]} ST`
  if (value === 'AVE OF THE AMERICAS') value = '6 AVE'
  if (value === 'FRANKLIN D ROOSEVELT DR') value = 'FDR DR'

  value = value.replace(/\b(\d{1,3})\s+(ST|AVE|DR|PL)\b/g, (_, number, type) => `${ordinal(number)} ${type}`)
  return standardizeStreetText(value)
}

function geometryMiles(geometry) {
  const lines = geometry?.type === 'LineString' ? [geometry.coordinates] : geometry?.coordinates ?? []
  const radians = (degrees) => (degrees * Math.PI) / 180
  let miles = 0
  for (const line of lines) {
    for (let index = 1; index < line.length; index += 1) {
      const [lon1, lat1] = line[index - 1]
      const [lon2, lat2] = line[index]
      const dLat = radians(lat2 - lat1)
      const dLon = radians(lon2 - lon1)
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2
      miles += 3958.7613 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }
  }
  return miles
}

function coordinatesFor(geometry) {
  if (!geometry) return []
  if (geometry.type === 'LineString') return [geometry.coordinates]
  if (geometry.type === 'MultiLineString') return geometry.coordinates
  return []
}

function processStreets(source) {
  const excludedNames = new Set(['ALLEY', 'BIKE PATH', 'CONNECTOR', 'DRIVEWAY', 'PEDESTRIAN OPAS', 'PEDESTRIAN UPAS', 'UNNAMED ST'])
  const groups = new Map()
  const seenPhysicalIds = new Set()

  for (const feature of source.features ?? []) {
    const properties = feature.properties ?? {}
    if (properties.rw_type === '14' || excludedNames.has(properties.full_street_name)) continue
    if (!feature.geometry || seenPhysicalIds.has(properties.physicalid)) continue
    seenPhysicalIds.add(properties.physicalid)

    const display = canonicalDisplay(properties.full_street_name)
    if (!display) continue
    const clean = compactStreetKey(display)
    if (!groups.has(clean)) {
      groups.set(clean, {
        clean,
        display,
        fullNames: new Set(),
        exactAliases: new Set(),
        fallbackAliases: new Set(),
        miles: 0,
        coordinates: [],
      })
    }
    const group = groups.get(clean)
    group.fullNames.add(properties.full_street_name)
    group.coordinates.push(...coordinatesFor(feature.geometry))
    const measuredFeet = Number(properties.segmentlength)
    group.miles += Number.isFinite(measuredFeet) && measuredFeet > 0 ? measuredFeet / 5280 : geometryMiles(feature.geometry)

    for (const candidate of [properties.full_street_name, properties.stname_label, display]) {
      for (const alias of streetExactKeys(candidate)) group.exactAliases.add(alias)
      const exact = compactStreetKey(candidate)
      const fallback = compactStreetKey(stripStreetSuffix(candidate))
      if (fallback && fallback !== exact) group.fallbackAliases.add(fallback)
    }
  }

  const sorted = [...groups.values()].sort((a, b) => a.display.localeCompare(b.display))
  const totalLength = sorted.reduce((sum, street) => sum + street.miles, 0)
  const streets = sorted.map((street, index) => ({
    type: 'Feature',
    id: index + 1,
    properties: {
      clean: street.clean,
      cleanWithSpace: stripStreetSuffix(street.display),
      display: street.display,
      fullNames: [...street.fullNames].sort(),
      exactAliases: [...street.exactAliases].sort(),
      fallbackAliases: [...street.fallbackAliases].sort(),
      miles: street.miles,
      percent: Math.round((street.miles / totalLength) * 10000) / 100,
    },
    geometry: { type: 'MultiLineString', coordinates: street.coordinates },
  }))

  return {
    totalLength: Math.round(totalLength * 100) / 100,
    streets,
    source: {
      title: 'NYC Street Centerline (CSCL)',
      url: 'https://data.cityofnewyork.us/d/inkn-q76z',
      retrieved: new Date().toISOString().slice(0, 10),
    },
  }
}

function stripProperties(collection) {
  return {
    type: 'FeatureCollection',
    features: (collection.features ?? []).filter((feature) => feature.geometry).map((feature) => ({
      type: 'Feature',
      properties: {},
      geometry: feature.geometry,
    })),
  }
}

await mkdir(outputDir, { recursive: true })
console.log('Downloading current NYC Open Data…')
const [centerline, parks, boundary] = await Promise.all([
  fetchJson(centerlineUrl),
  fetchJson(parksUrl),
  fetchJson(boundaryUrl),
])

const gameData = processStreets(centerline)
await Promise.all([
  writeFile(`${outputDir}/data-manhattan-all.json`, JSON.stringify(gameData)),
  writeFile(`${outputDir}/land.geojson`, JSON.stringify(stripProperties(boundary))),
  writeFile(`${outputDir}/parks.geojson`, JSON.stringify(stripProperties(parks))),
])

console.log(`Wrote ${gameData.streets.length} named streets covering ${gameData.totalLength.toFixed(2)} miles.`)
