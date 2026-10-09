<script setup>
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const MANHATTAN_BOUNDS = [-74.0479, 40.6793, -73.9062, 40.8822]
const props = defineProps({
  streets: { type: Array, default: () => [] },
  guessedStreets: { type: Array, default: () => [] },
  missedStreets: { type: Array, default: () => [] },
  gaveUp: { type: Boolean, default: false },
  labelsShown: { type: Boolean, default: true },
})
const emit = defineEmits(['load', 'error'])
const mapContainer = ref(null)
let map
let hoveredTarget = null
let popup
let popupTarget = null
let popupCloseButton = false
let mapReady = false
let resizeObserver
let resizeFrame

const featureCollection = (features) => ({ type: 'FeatureCollection', features: JSON.parse(JSON.stringify(features ?? [])) })
const asset = (name) => `${import.meta.env.BASE_URL}${name}`
const emptyFeatureCollection = () => featureCollection([])

const missedLayerIds = ['missed-streets', 'missed-streets-hitbox']

function sameId(left, right) {
  return String(left) === String(right)
}

function resolveStreetTarget(target) {
  if (target === undefined || target === null || target === -1) return null

  const isObject = typeof target === 'object'
  const id = isObject ? target.id : target
  if (id === undefined || id === null || id === -1) return null

  const hasExplicitStatus = isObject && typeof target.guessed === 'boolean'
  let guessed = hasExplicitStatus ? target.guessed : true
  let feature = (guessed ? props.guessedStreets : props.missedStreets).find((street) => sameId(street.id, id))

  // Preserve support for the old id-only API while callers migrate to
  // { id, guessed } targets.
  if (!feature && !hasExplicitStatus) {
    feature = props.missedStreets.find((street) => sameId(street.id, id))
    guessed = false
  }

  if (!feature || (!guessed && !props.gaveUp)) return null
  return { id: feature.id, guessed, feature }
}

function contributionLabel(feature, approximate = false) {
  const percent = Number(feature?.properties?.percent) || 0
  const miles = Number(feature?.properties?.miles) || 0
  if (percent > 0) return `${approximate ? '≈' : ''}${percent}%`
  if (miles > 0) return '<0.01%'
  return '0%'
}

function addLayers() {
  map.addSource('land', { type: 'geojson', data: asset('land.geojson') })
  map.addSource('parks', { type: 'geojson', data: asset('parks.geojson') })
  map.addSource('all-streets', { type: 'geojson', data: featureCollection(props.streets) })
  map.addSource('guessed-streets', { type: 'geojson', data: featureCollection(props.guessedStreets) })
  map.addSource('missed-streets', { type: 'geojson', data: featureCollection(props.missedStreets) })
  map.addSource('hovered-street', { type: 'geojson', data: emptyFeatureCollection() })

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
    id: 'missed-streets', type: 'line', source: 'missed-streets',
    layout: {
      'visibility': props.gaveUp ? 'visible' : 'none',
      'line-join': 'round',
      'line-cap': 'round',
    },
    paint: {
      'line-color': '#716B9C',
      'line-opacity': 0.82,
      'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 5, 0.45, 13, 2.15, 18, 12, 22, 14],
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
    id: 'street-hover-case', type: 'line', source: 'hovered-street',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#51432D',
      'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 5, 3.45, 13, 18, 18, 108, 22, 120],
    },
  })
  map.addLayer({
    id: 'street-hover', type: 'line', source: 'hovered-street',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#EAB600',
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
  map.addLayer({
    id: 'missed-streets-hitbox', type: 'line', source: 'missed-streets',
    layout: {
      'visibility': props.gaveUp ? 'visible' : 'none',
      'line-join': 'round',
      'line-cap': 'round',
    },
    paint: {
      'line-color': '#000000',
      'line-opacity': 0.001,
      'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 5, 8, 13, 20, 18, 48, 22, 60],
    },
  })
  map.addLayer({
    id: 'found-streets-hitbox', type: 'line', source: 'guessed-streets',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#000000',
      'line-opacity': 0.001,
      'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 5, 8, 13, 20, 18, 48, 22, 60],
    },
  })

  map.on('mousemove', onMapMove)
  map.on('click', onMapClick)
  map.getCanvas().addEventListener('mouseleave', clearMapHover)
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

function showStreetPopup(target, lngLat, closeButton = false) {
  const resolved = resolveStreetTarget(target)
  if (!resolved || !map) return
  const samePopup = popup?.isOpen()
    && popupTarget?.guessed === resolved.guessed
    && sameId(popupTarget.id, resolved.id)
    && popupCloseButton === closeButton
  if (samePopup) {
    popup.setLngLat(lngLat)
    return
  }
  const content = document.createElement('div')
  content.className = 'map-popup'
  const name = document.createTextNode(`${resolved.feature.properties.display} `)
  const details = document.createElement('span')
  details.className = 'subtle'
  details.textContent = resolved.guessed
    ? `Found · Added ${contributionLabel(resolved.feature)}`
    : `Missed · Would add ${contributionLabel(resolved.feature, true)}`
  content.append(name, details)
  popup?.remove()
  popupTarget = { id: resolved.id, guessed: resolved.guessed }
  popupCloseButton = closeButton
  const nextPopup = new maplibregl.Popup({ closeButton, closeOnClick: false, offset: [0, -4] })
    .setLngLat(lngLat)
    .setDOMContent(content)
    .addTo(map)
  nextPopup.on('close', () => {
    if (popup !== nextPopup) return
    popup = undefined
    popupTarget = null
    popupCloseButton = false
  })
  popup = nextPopup
}

function interactiveFeatureAt(point) {
  if (!mapReady || !map) return null
  const layerIds = ['found-streets-hitbox']
  if (props.gaveUp) layerIds.push('missed-streets-hitbox')
  const feature = map.queryRenderedFeatures(point, { layers: layerIds })[0]
  if (!feature) return null
  return {
    id: feature.id,
    guessed: feature.layer.id === 'found-streets-hitbox',
  }
}

function onMapMove(event) {
  if (event.originalEvent?.buttons) return
  const target = interactiveFeatureAt(event.point)
  if (!target) {
    clearMapHover()
    return
  }
  map.getCanvas().style.cursor = 'pointer'
  hoverStreet(target)
  showStreetPopup(target, event.lngLat)
}

function onMapClick(event) {
  const target = interactiveFeatureAt(event.point)
  if (!target) {
    clearMapHover()
    return
  }
  hoverStreet(target)
  showStreetPopup(target, event.lngLat, true)
}

function clearMapHover() {
  if (map) map.getCanvas().style.cursor = 'grab'
  hoverStreet(-1)
  popup?.remove()
  popup = undefined
  popupTarget = null
  popupCloseButton = false
}

function hoverStreet(target = -1, force = false) {
  const source = map?.getSource('hovered-street')
  if (!source) return
  const resolved = resolveStreetTarget(target)
  const unchanged = resolved
    ? hoveredTarget?.guessed === resolved.guessed && sameId(hoveredTarget.id, resolved.id)
    : hoveredTarget === null
  if (unchanged && !force) return
  hoveredTarget = resolved ? { id: resolved.id, guessed: resolved.guessed } : null
  source.setData(resolved ? featureCollection([resolved.feature]) : emptyFeatureCollection())
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

function centerStreet(target) {
  const resolved = resolveStreetTarget(target)
  if (!resolved || !map) return
  const mobile = usesPhoneLayout()
  const width = map.getContainer().clientWidth
  const height = map.getContainer().clientHeight
  const horizontalPadding = Math.max(20, Math.min(40, Math.floor(width * 0.1)))
  const topPadding = Math.max(64, Math.min(140, Math.floor(height * 0.18)))
  const bottomPadding = Math.max(72, Math.min(120, Math.floor(height * 0.15)))
  map.fitBounds(boundsFor(resolved.feature), {
    maxZoom: Math.max(map.getZoom(), 15),
    padding: mobile
      ? { top: topPadding, left: horizontalPadding, bottom: bottomPadding, right: horizontalPadding }
      : { top: 120, left: 270, bottom: 120, right: 270 },
  })
  hoverStreet({ id: resolved.id, guessed: resolved.guessed })
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

function setMissedVisibility(shown) {
  const visibility = shown ? 'visible' : 'none'
  for (const layerId of missedLayerIds) {
    if (map?.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visibility)
  }
  if (!shown && hoveredTarget && !hoveredTarget.guessed) clearMapHover()
}

function refreshHoveredStreet(guessed) {
  if (hoveredTarget?.guessed !== guessed) return
  if (!resolveStreetTarget(hoveredTarget)) {
    clearMapHover()
    return
  }
  hoverStreet(hoveredTarget, true)
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
  popup?.remove()
  if (map) {
    map.off('mousemove', onMapMove)
    map.off('click', onMapClick)
    map.getCanvas().removeEventListener('mouseleave', clearMapHover)
  }
  map?.remove()
  map = undefined
})
watch(() => props.streets, (value) => map?.getSource('all-streets')?.setData(featureCollection(value)), { deep: true })
watch(() => props.guessedStreets, (value) => {
  map?.getSource('guessed-streets')?.setData(featureCollection(value))
  refreshHoveredStreet(true)
}, { deep: true })
watch(() => props.missedStreets, (value) => {
  map?.getSource('missed-streets')?.setData(featureCollection(value))
  refreshHoveredStreet(false)
}, { deep: true })
watch(() => props.gaveUp, setMissedVisibility)
watch(() => props.labelsShown, (shown) => {
  if (map?.getLayer('guessed-streets-text')) map.setLayoutProperty('guessed-streets-text', 'visibility', shown ? 'visible' : 'none')
})

defineExpose({ centerStreet, hoverStreet, recenter, resize })
</script>

<template>
  <div id="map" ref="mapContainer" />
</template>
