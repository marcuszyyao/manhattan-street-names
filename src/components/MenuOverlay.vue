<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  shown: { type: Boolean, default: false },
  labelsShown: { type: Boolean, default: true },
  games: { type: Array, default: () => [] },
  currentGameId: { type: String, default: '' },
  percent: { type: Number, default: 0 },
  canGiveUp: { type: Boolean, default: false },
  gaveUp: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'toggleLabels', 'reset', 'giveUp', 'newGame', 'loadGame'])
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

function confirmGiveUp() {
  emit('giveUp')
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
          <li data-scope="overlay" role="button" tabindex="0" @click="emit('toggleLabels'); close()" @keydown.enter="emit('toggleLabels'); close()" @keydown.space.prevent="emit('toggleLabels'); close()">{{ labelsShown ? 'Hide' : 'Show' }} {{ gaveUp ? 'Found ' : '' }}Street Names</li>
          <li data-scope="overlay" role="button" tabindex="0" @click="emit('reset')" @keydown.enter="emit('reset')" @keydown.space.prevent="emit('reset')">Reset</li>
          <li v-if="canGiveUp" data-scope="overlay" role="button" tabindex="0" @click="page = 'give-up'" @keydown.enter="page = 'give-up'" @keydown.space.prevent="page = 'give-up'">Give Up</li>
          <li data-scope="overlay" role="button" tabindex="0" @click="page = 'new'" @keydown.enter="page = 'new'" @keydown.space.prevent="page = 'new'">New Game</li>
          <li data-scope="overlay" role="button" tabindex="0" @click="page = 'load'" @keydown.enter="page = 'load'" @keydown.space.prevent="page = 'load'">Load Game</li>
        </ul>
        <div class="divider" data-scope="overlay" />
        <ul class="menu-options" data-scope="overlay">
          <li data-scope="overlay" role="button" tabindex="0" @click="page = 'about'" @keydown.enter="page = 'about'" @keydown.space.prevent="page = 'about'">About</li>
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

      <div class="menu-page give-up-page" data-scope="overlay" :class="{ open: page === 'give-up' }">
        <h2 data-scope="overlay">Give Up?</h2>
        <p>
          Your final score will stay at <strong>{{ percent }}%</strong>. We’ll reveal every mapped street so you can explore what you missed.
        </p>
        <p>You won’t be able to add more streets to this game, but you can reset it or start a new one.</p>
        <div class="give-up-actions">
          <button type="button" class="give-up-confirm" @click="confirmGiveUp">Give Up &amp; Reveal</button>
          <button type="button" class="give-up-cancel" @click="page = ''">Keep Playing</button>
        </div>
        <a href="#" class="icon-button back" data-scope="overlay" aria-label="Back" @click.prevent="page = ''" />
      </div>
    </div>
  </div>
</template>
