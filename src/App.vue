<script setup>
import confetti from 'canvas-confetti'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MenuOverlay from './components/MenuOverlay.vue'
import ResultsPanel from './components/ResultsPanel.vue'
import StreetInput from './components/StreetInput.vue'
import StreetMap from './components/StreetMap.vue'
import { useStreetGame } from './game.js'

const STORAGE_KEY = 'name-manhattan-streets-games-v1'
const CURRENT_KEY = 'name-manhattan-streets-current-game-v1'
const game = useStreetGame()
const streetMap = ref(null)
const streetInput = ref(null)
const resultsPanel = ref(null)
const query = ref('')
const mapLoaded = ref(false)
const loading = ref(true)
const loadError = ref('')
const mapError = ref('')
const labelsShown = ref(true)
const menuShown = ref(false)
const games = ref([])
const currentGameId = ref('')
const persistenceReady = ref(false)
let confettiTimer
let confettiStopTimer
let viewportFrame

const fatalError = computed(() => loadError.value || mapError.value)
const ready = computed(() => mapLoaded.value && game.loaded.value && !loading.value && !fatalError.value)
const loadingStatus = computed(() => `Loading Manhattan map (map: ${mapLoaded.value ? 'ready' : 'waiting'}, data: ${game.loaded.value ? 'ready' : 'waiting'})`)
const currentGame = computed(() => games.value.find((item) => item.id === currentGameId.value))

function readGames() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    games.value = Array.isArray(parsed) ? parsed : []
    currentGameId.value = localStorage.getItem(CURRENT_KEY) || ''
  } catch {
    games.value = []
    currentGameId.value = ''
  }
  if (!games.value.some((item) => item.id === currentGameId.value)) {
    const initial = {
      id: crypto.randomUUID(),
      name: 'My Manhattan Streets',
      guessed: [],
      percent: 0,
      gaveUp: false,
      createdAt: new Date().toISOString(),
    }
    games.value.unshift(initial)
    currentGameId.value = initial.id
    writeGames()
  }
}

function writeGames() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(games.value))
    localStorage.setItem(CURRENT_KEY, currentGameId.value)
  } catch {
    // Storage is best-effort; gameplay should still work in private browsing.
  }
}

function saveCurrent() {
  if (!persistenceReady.value) return
  const index = games.value.findIndex((item) => item.id === currentGameId.value)
  if (index === -1) return
  games.value[index] = {
    ...games.value[index],
    guessed: [...game.guessedKeys.value],
    percent: game.percentMilesGuessed.value,
    gaveUp: game.gaveUp.value,
    updatedAt: new Date().toISOString(),
  }
  writeGames()
}

function submitStreet(value) {
  const result = game.submitName(value)
  if (result.valid) {
    query.value = ''
    streetInput.value?.stopShaking()
  } else if (value) {
    streetInput.value?.startShaking()
  }
}

function resetGame() {
  if (!window.confirm("Are you sure? This will clear all streets you've named.")) return
  game.reset()
  query.value = ''
  saveCurrent()
  menuShown.value = false
  streetMap.value?.recenter()
}

function giveUpGame() {
  if (!game.giveUp()) return
  query.value = ''
  streetInput.value?.hideKeyboard()
  menuShown.value = false
  saveCurrent()
  nextTick(() => streetMap.value?.recenter())
}

function newGame(name) {
  const next = {
    id: crypto.randomUUID(),
    name,
    guessed: [],
    percent: 0,
    gaveUp: false,
    createdAt: new Date().toISOString(),
  }
  games.value.unshift(next)
  currentGameId.value = next.id
  game.reset()
  query.value = ''
  writeGames()
  menuShown.value = false
  streetMap.value?.recenter()
}

function loadSavedGame(id) {
  const selected = games.value.find((item) => item.id === id)
  if (!selected) return
  persistenceReady.value = false
  currentGameId.value = id
  game.restore(selected.guessed ?? [], selected.gaveUp ?? false)
  query.value = ''
  writeGames()
  persistenceReady.value = true
  menuShown.value = false
  streetMap.value?.recenter()
}

function centerStreet(id) {
  streetMap.value?.centerStreet(id)
  streetMap.value?.hoverStreet(id)
}

function showResults() {
  resultsPanel.value?.showPopup()
  streetInput.value?.hideKeyboard()
}

function confettiBurst() {
  confetti({
    particleCount: 8,
    angle: 90,
    spread: 120,
    startVelocity: 12,
    gravity: 0.7,
    ticks: 400,
    origin: { x: Math.random(), y: -0.1 },
    disableForReducedMotion: true,
  })
}

function startCelebration() {
  stopCelebration()
  confettiBurst()
  confettiTimer = window.setInterval(confettiBurst, 150)
  confettiStopTimer = window.setTimeout(stopCelebration, 5000)
}

function stopCelebration() {
  if (confettiTimer) window.clearInterval(confettiTimer)
  if (confettiStopTimer) window.clearTimeout(confettiStopTimer)
  confettiTimer = undefined
  confettiStopTimer = undefined
}

function retryLoad() {
  window.location.reload()
}

function syncVisualViewport() {
  const viewport = window.visualViewport
  const isPageZoomed = (viewport?.scale ?? 1) > 1.01
  const height = !isPageZoomed && viewport ? viewport.height : window.innerHeight
  const offsetTop = !isPageZoomed && viewport ? viewport.offsetTop : 0
  document.documentElement.style.setProperty('--game-viewport-height', `${Math.round(height)}px`)
  document.documentElement.style.setProperty('--game-viewport-top', `${Math.round(offsetTop)}px`)
  streetMap.value?.resize()
}

function scheduleViewportSync() {
  window.cancelAnimationFrame(viewportFrame)
  viewportFrame = window.requestAnimationFrame(syncVisualViewport)
}

watch(game.guessedKeys, saveCurrent, { deep: true })
watch(game.gaveUp, saveCurrent)
watch(game.percentMilesGuessed, (value, previous) => {
  if (value >= 100 && previous < 100) startCelebration()
})
watch(menuShown, (shown) => { if (shown) streetInput.value?.hideKeyboard() })

onMounted(async () => {
  syncVisualViewport()
  window.addEventListener('resize', scheduleViewportSync)
  window.addEventListener('orientationchange', scheduleViewportSync)
  window.visualViewport?.addEventListener('resize', scheduleViewportSync)
  window.visualViewport?.addEventListener('scroll', scheduleViewportSync)
  readGames()
  try {
    await game.load()
    game.restore(currentGame.value?.guessed ?? [], currentGame.value?.gaveUp ?? false)
    persistenceReady.value = true
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'The Manhattan street data could not be loaded.'
  } finally {
    loading.value = false
    await nextTick()
    streetMap.value?.resize()
  }
})

onBeforeUnmount(() => {
  stopCelebration()
  window.cancelAnimationFrame(viewportFrame)
  window.removeEventListener('resize', scheduleViewportSync)
  window.removeEventListener('orientationchange', scheduleViewportSync)
  window.visualViewport?.removeEventListener('resize', scheduleViewportSync)
  window.visualViewport?.removeEventListener('scroll', scheduleViewportSync)
  document.documentElement.style.removeProperty('--game-viewport-height')
  document.documentElement.style.removeProperty('--game-viewport-top')
})
</script>

<template>
  <div
    class="game-shell"
    :class="{
      streetsfound: game.hasResults.value,
      labelshidden: !labelsShown,
      customsort: game.sortKey.value !== 'found',
      waiting: !ready,
      loading,
      complete: game.percentMilesGuessed.value >= 100,
      'gave-up': game.gaveUp.value,
    }"
  >
    <StreetMap
      ref="streetMap"
      :streets="game.streets.value"
      :guessed-streets="game.guessedStreets.value"
      :missed-streets="game.missedStreets.value"
      :gave-up="game.gaveUp.value"
      :labels-shown="labelsShown"
      @load="mapLoaded = true"
      @error="mapError = $event"
    />

    <div v-if="fatalError" class="load-error" role="alert">
      <strong>We couldn’t load the Manhattan map.</strong>
      <span>{{ fatalError }}</span>
      <button type="button" @click="retryLoad">Try Again</button>
    </div>

    <div v-if="ready && !game.hasResults.value" id="instructions">
      Type the name of any Manhattan street
      <span class="mobile-only">in the input below </span>
      and press "return."
    </div>

    <StreetInput
      v-if="ready && !game.isOver.value"
      ref="streetInput"
      v-model="query"
      placeholder="Enter a Street"
      :paused="menuShown"
      @submit="submitStreet"
    />

    <div v-if="ready && game.percentMilesGuessed.value >= 100" class="complete-message">You Did It!</div>
    <div v-else-if="ready && game.gaveUp.value" class="gave-up-message">All Streets Revealed</div>

    <div
      v-if="ready"
      class="small-screen-percent"
      role="button"
      :tabindex="game.hasResults.value ? 0 : -1"
      aria-label="Open street results"
      @click="showResults"
      @keydown.enter="showResults"
      @keydown.space.prevent="showResults"
    >
      <span class="small-screen-percent-number">{{ game.percentMilesGuessed.value }}%</span>
      <span v-if="game.percentMilesGuessed.value >= 100" class="small-screen-complete-message">– YOU DID IT!</span>
      <span v-else-if="game.gaveUp.value" class="small-screen-complete-message">– GAVE UP</span>
      <br />
      <span class="small-screen-percent-title">{{ game.gaveUp.value ? 'final score · tap for streets' : 'mi. of street named' }}</span>
    </div>

    <ResultsPanel
      v-if="ready"
      ref="resultsPanel"
      :percent="game.percentMilesGuessed.value"
      :streets="game.gaveUp.value ? game.revealedStreetsSorted.value : game.guessedStreetsSorted.value"
      :sort-key="game.sortKey.value"
      :gave-up="game.gaveUp.value"
      :guessed-count="game.guessedStreets.value.length"
      :missed-count="game.missedStreets.value.length"
      @sort="game.sortKey.value = $event"
      @hover-street="streetMap?.hoverStreet($event)"
      @center-street="centerStreet"
    />

    <div v-if="ready" class="floating-btn-wrap more-menu" data-scope="floating">
      <div class="floating-btn-outer" data-scope="floating">
        <a href="#" class="floating-btn-button" data-scope="floating" aria-label="Open menu" @click.prevent="menuShown = true">
          <img src="./assets/menu-icon.svg" data-scope="floating" alt="" />
        </a>
      </div>
    </div>

    <div class="lds-ring-wrap" :class="{ enabled: !ready && !fatalError }" role="status" :aria-label="loadingStatus" :aria-hidden="ready || !!fatalError">
      <div class="lds-ring"><div /><div /><div /><div /></div>
    </div>

    <MenuOverlay
      :shown="menuShown"
      :labels-shown="labelsShown"
      :games="games"
      :current-game-id="currentGameId"
      :percent="game.percentMilesGuessed.value"
      :can-give-up="ready && !game.isOver.value"
      :gave-up="game.gaveUp.value"
      @close="menuShown = false"
      @toggle-labels="labelsShown = !labelsShown"
      @reset="resetGame"
      @give-up="giveUpGame"
      @new-game="newGame"
      @load-game="loadSavedGame"
    />
  </div>
</template>
