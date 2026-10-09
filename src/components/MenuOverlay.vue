<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  shown: { type: Boolean, default: false },
  labelsShown: { type: Boolean, default: true },
  games: { type: Array, default: () => [] },
  currentGameId: { type: String, default: '' },
})
const emit = defineEmits(['close', 'toggleLabels', 'reset', 'newGame', 'loadGame'])
const page = ref('')
const gameName = ref('')

watch(() => props.shown, (shown) => { if (!shown) window.setTimeout(() => { page.value = '' }, 420) })

function close() {
  emit('close')
}

function submitNewGame() {
  const name = gameName.value.trim() || 'My Manhattan Streets'
  emit('newGame', name)
  gameName.value = ''
  page.value = ''
}

function loadGame(id) {
  emit('loadGame', id)
  page.value = ''
}
</script>

<template>
  <div
    class="overlay-container menu-overlay"
    :class="{ shown }"
    :aria-hidden="!shown"
    :inert="!shown"
    role="dialog"
    aria-modal="true"
    aria-label="Game options"
  >
    <div class="overlay-block" @click="close" />
    <div class="overlay-main">
      <div class="main-menu" data-scope="overlay">
        <div class="logo-text" data-scope="overlay">Hello!</div>
        <h3 data-scope="overlay">Game Options</h3>
        <ul class="menu-options" data-scope="overlay">
          <li data-scope="overlay" @click="emit('toggleLabels'); close()">{{ labelsShown ? 'Hide' : 'Show' }} Street Names</li>
          <li data-scope="overlay" @click="emit('reset')">Reset</li>
          <li data-scope="overlay" @click="page = 'new'">New Game</li>
          <li data-scope="overlay" @click="page = 'load'">Load Game</li>
        </ul>
        <div class="divider" data-scope="overlay" />
        <ul class="menu-options" data-scope="overlay">
          <li data-scope="overlay" @click="page = 'about'">About</li>
        </ul>
        <a href="#" class="icon-button close" data-scope="overlay" aria-label="Close menu" @click.prevent="close" />
      </div>

      <div class="menu-page" data-scope="overlay" :class="{ open: page === 'about' }">
        <h2 data-scope="overlay">About</h2>
        <p>
          Manhattan adaptation of
          <a href="https://carvin.github.io/sf-street-names/" target="_blank" rel="noopener">Name SF Streets</a>,
          whose original concept and design were made with ♥ by
          <a href="https://github.com/carvin" target="_blank" rel="noopener">Chris Arvin</a>.
        </p>
        <p>
          Geometry comes from NYC Open Data’s
          <a href="https://data.cityofnewyork.us/d/inkn-q76z" target="_blank" rel="noopener">Street Centerline</a>,
          <a href="https://data.cityofnewyork.us/d/enfh-gkve" target="_blank" rel="noopener">Parks</a>, and
          <a href="https://data.cityofnewyork.us/d/gthc-hcne" target="_blank" rel="noopener">Borough Boundaries</a> datasets.
        </p>
        <p>Your games are saved only in this browser.</p>
        <a href="#" class="icon-button back" data-scope="overlay" aria-label="Back" @click.prevent="page = ''" />
      </div>

      <div class="menu-page" data-scope="overlay" :class="{ open: page === 'new' }">
        <h2 data-scope="overlay">New Game</h2>
        <div class="name-prompt">
          <p>To start a new game, enter a name below.</p>
          <form action="./" @submit.prevent="submitNewGame">
            <input v-model="gameName" class="name-field" type="text" placeholder="e.g., 'my manhattan streets'" />
            <a href="#" @click.prevent="submitNewGame">Create Game</a>
          </form>
        </div>
        <a href="#" class="icon-button back" data-scope="overlay" aria-label="Back" @click.prevent="page = ''" />
      </div>

      <div class="menu-page" data-scope="overlay" :class="{ open: page === 'load' }">
        <h2 data-scope="overlay">Load Game</h2>
        <ul class="game-list" data-scope="games">
          <li
            v-for="game in games"
            :key="game.id"
            data-scope="games"
            :class="{ current: game.id === currentGameId }"
            @click="loadGame(game.id)"
          >
            <span class="game-name" data-scope="games">{{ game.name }}</span>
            <span class="game-percent" data-scope="games">{{ game.percent ?? 0 }}%</span>
          </li>
        </ul>
        <p v-if="!games.length">No saved games yet.</p>
        <a href="#" class="icon-button back" data-scope="overlay" aria-label="Back" @click.prevent="page = ''" />
      </div>
    </div>
  </div>
</template>
