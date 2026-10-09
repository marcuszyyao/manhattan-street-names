<script setup>
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const MANHATTAN_BOUNDS = [-74.0479, 40.6793, -73.9062, 40.8822]
const props = defineProps({
  streets: { type: Array, default: () => [] },
  guessedStreets: { type: Array, default: () => [] },
  labelsShown: { type: Boolean, default: true },
})
const emit = defineEmits(['load', 'error'])
const mapContainer = ref(null)
let map
let hoveredId = -1
let popup
let mapReady = false
let resizeObserver
let resizeFrame

const featureCollection = (features) => ({ type: 'FeatureCollection', features: JSON.parse(JSON.stringify(features ?? [])) })
const asset = (name) => `${import.meta.env.BASE_URL}${name}`

function addLayers() {
  map.addSource('land', { type: 'geojson', data: asset('land.geojson') })
  map.addSource('parks', { type: 'geojson', data: asset('parks.geojson') })
  map.addSource('all-streets', { type: 'geojson', data: featureCollection(props.streets) })
  map.addSource('guessed-streets', { type: 'geojson', data: featureCollection(props.guessedStreets) })

  map.addLayer({ id: 'bg', type: 'background', paint: { 'background-color': '#35346c' } })
  map.addLayer({ id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#1a1946', 'fill-opacity': 1 } })
  map.addLayer({ id: 'parks', type: 'fill', source: 'parks', paint: { 'fill-color': '#284967', 'fill-opacity': 1 } })
  map.addLayer({
    id: 'streets', type: 'line', source: 'all-streets',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#35346C',
      'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 5, 0.2, 13, 1.5, 18, 9, 22, 11],
    },
  })
  map.addLayer({
    id: 'found-streets', type: 'line', source: 'guessed-streets',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-opacity': 1,
      'line-color': '#0F9CC9',
      'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 5, 0.575, 13, 3, 18, 18, 22, 20],
    },
  })
  map.addLayer({
    id: 'guessed-streets-hover-case', type: 'line', source: 'guessed-streets',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#51432D',
      'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0],
      'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 5, 3.45, 13, 18, 18, 108, 22, 120],
    },
  })
  map.addLayer({
    id: 'guessed-streets-hover', type: 'line', source: 'guessed-streets',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#EAB600',
      'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0],
      'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 5, 1.15, 13, 6, 18, 36, 22, 40],
    },
  })
  map.addLayer({
    id: 'guessed-streets-text', type: 'symbol', source: 'guessed-streets',
    layout: {
      'visibility': props.labelsShown ? 'visible' : 'none',
      'text-size': 13,
      'text-optional': false,
      'text-field': ['get', 'display'],
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'symbol-placement': 'line',
      'symbol-spacing': 300,
      'text-padding': 2,
      'text-allow-overlap': false,
    },
    paint: { 'text-halo-color': '#000000', 'text-halo-width': 1.5, 'text-halo-blur': 0, 'text-color': '#BAF6FC' },
  })

  map.on('mousemove', 'found-streets', onStreetMove)
  map.on('mouseleave', 'found-streets', clearMapHover)
}

function initializeLayers() {
  try {
    addLayers()
    mapReady = true
    emit('load')
  } catch (error) {
    emit('error', error instanceof Error ? error.message : 'The Manhattan map could not be initialized.')
  }
}

function onStreetMove(event) {
  const feature = event.features?.[0]
  if (!feature) return
  map.getCanvas().style.cursor = 'pointer'
  hoverStreet(feature.id)

  const content = document.createElement('div')
  content.className = 'map-popup'
  const name = document.createTextNode(`${feature.properties.display} `)
  const percent = document.createElement('span')
  percent.className = 'subtle'
  percent.textContent = `+${feature.properties.percent}%`
  content.append(name, percent)
  popup?.remove()
  popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: [0, -4] })
    .setLngLat(event.lngLat)
    .setDOMContent(content)
    .addTo(map)
}

function clearMapHover() {
  if (map) map.getCanvas().style.cursor = 'grab'
  hoverStreet(-1)
  popup?.remove()
}

function hoverStreet(id = -1) {
  if (!map?.getSource('guessed-streets')) return
  if (hoveredId !== -1) map.removeFeatureState({ source: 'guessed-streets', id: hoveredId }, 'hover')
  if (id !== -1) map.setFeatureState({ source: 'guessed-streets', id }, { hover: true })
  hoveredId = id
}

function boundsFor(feature) {
  const lines = feature.geometry.type === 'LineString' ? [feature.geometry.coordinates] : feature.geometry.coordinates
  const bounds = new maplibregl.LngLatBounds()
  for (const line of lines) for (const coordinate of line) bounds.extend(coordinate)
  return bounds
}

function usesPhoneLayout() {
  const container = map?.getContainer()
  const width = container?.clientWidth ?? window.innerWidth
  const height = container?.clientHeight ?? window.innerHeight
  return width <= 580 || (height <= 580 && window.matchMedia('(pointer: coarse)').matches)
}

function centerStreet(id) {
  const feature = props.guessedStreets.find((street) => street.id === id)
  if (!feature || !map) return
  const mobile = usesPhoneLayout()
  const width = map.getContainer().clientWidth
  const height = map.getContainer().clientHeight
  const horizontalPadding = Math.max(20, Math.min(40, Math.floor(width * 0.1)))
  const topPadding = Math.max(64, Math.min(140, Math.floor(height * 0.18)))
  const bottomPadding = Math.max(72, Math.min(120, Math.floor(height * 0.15)))
  map.fitBounds(boundsFor(feature), {
    maxZoom: Math.max(map.getZoom(), 15),
    padding: mobile
      ? { top: topPadding, left: horizontalPadding, bottom: bottomPadding, right: horizontalPadding }
      : { top: 120, left: 270, bottom: 120, right: 270 },
  })
  hoverStreet(id)
}

function recenter() {
  map?.fitBounds(MANHATTAN_BOUNDS, { padding: 24 })
}

function resize() {
  map?.resize()
}

function scheduleResize() {
  window.cancelAnimationFrame(resizeFrame)
  resizeFrame = window.requestAnimationFrame(resize)
}

onMounted(() => {
  const pageBase = window.location.href.replace(/[^/]*$/, '')
  maplibregl.setWorkerUrl(maplibreWorkerUrl)
  map = new maplibregl.Map({
    container: mapContainer.value,
    style: { version: 8, sources: {}, layers: [], glyphs: `${pageBase}fonts/{fontstack}/{range}.pbf` },
    bounds: MANHATTAN_BOUNDS,
    fitBoundsOptions: { padding: 24 },
    dragRotate: false,
    maxPitch: 0,
    minZoom: 10,
    attributionControl: false,
  })
  map.addControl(new maplibregl.AttributionControl({
    compact: usesPhoneLayout(),
    customAttribution: '<a href="https://data.cityofnewyork.us/d/inkn-q76z" target="_blank" rel="noopener">NYC streets</a> · <a href="https://data.cityofnewyork.us/d/enfh-gkve" target="_blank" rel="noopener">parks</a> · <a href="https://data.cityofnewyork.us/d/gthc-hcne" target="_blank" rel="noopener">boundary</a>',
  }), 'bottom-right')
  map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), 'top-right')
  map.on('error', (event) => {
    const message = event?.error?.message || 'The Manhattan map could not be loaded.'
    if (!mapReady) emit('error', message)
    else console.error('MapLibre runtime error:', event?.error ?? event)
  })
  map.on('load', initializeLayers)

  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(scheduleResize)
    resizeObserver.observe(mapContainer.value)
  }
  window.addEventListener('orientationchange', scheduleResize)
})

onBeforeUnmount(() => {
  window.cancelAnimationFrame(resizeFrame)
  window.removeEventListener('orientationchange', scheduleResize)
  resizeObserver?.disconnect()
  map?.remove()
})
watch(() => props.streets, (value) => map?.getSource('all-streets')?.setData(featureCollection(value)), { deep: true })
watch(() => props.guessedStreets, (value) => map?.getSource('guessed-streets')?.setData(featureCollection(value)), { deep: true })
watch(() => props.labelsShown, (shown) => {
  if (map?.getLayer('guessed-streets-text')) map.setLayoutProperty('guessed-streets-text', 'visibility', shown ? 'visible' : 'none')
})

defineExpose({ centerStreet, hoverStreet, recenter, resize })
</script>

<template>
  <div id="map" ref="mapContainer" />
</template>
