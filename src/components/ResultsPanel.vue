<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  percent: { type: Number, default: 0 },
  streets: { type: Array, default: () => [] },
  sortKey: { type: String, default: 'found' },
  gaveUp: { type: Boolean, default: false },
  guessedCount: { type: Number, default: 0 },
  missedCount: { type: Number, default: 0 },
})
const emit = defineEmits(['sort', 'hoverStreet', 'centerStreet'])
const popup = ref(false)
const sortOpen = ref(false)
const sidebarContent = ref(null)
const revealFilter = ref('all')
const progressSteps = Array.from({ length: 20 }, (_, index) => index * 500)
const count = computed(() => props.streets.length)
const filteredStreets = computed(() => {
  if (!props.gaveUp || revealFilter.value === 'all') return props.streets
  const guessed = revealFilter.value === 'found'
  return props.streets.filter((street) => Boolean(street.properties.guessed) === guessed)
})

watch(() => props.gaveUp, () => { revealFilter.value = 'all' })

function showPopup() {
  popup.value = true
  requestAnimationFrame(() => { if (sidebarContent.value) sidebarContent.value.scrollTop = 0 })
}

function selectSort(value) {
  sortOpen.value = false
  emit('sort', value)
}

function selectStreet(street) {
  popup.value = false
  emit('centerStreet', streetTarget(street))
}

function streetTarget(street) {
  return { id: street.id, guessed: street.properties.guessed !== false }
}

function scoreLabel(street) {
  const percent = Number(street.properties.percent) || 0
  const tiny = percent === 0 && Number(street.properties.miles) > 0
  const value = tiny ? '<0.01%' : `${percent}%`
  return street.properties.guessed === false ? `≈+${value}` : `+${value}`
}

function streetAriaLabel(street) {
  const status = street.properties.guessed === false ? 'Missed' : 'Found'
  const contribution = scoreLabel(street).replace('≈', 'approximately ')
  return `${street.properties.display}, ${status}, ${contribution}`
}

defineExpose({ showPopup })
</script>

<template>
  <div id="sidebar" :class="{ sidebarpopup: popup }">
    <div ref="sidebarContent" class="sidebar-content">
      <div class="big-number">
        <div class="number">{{ percent }}%</div>
        <div class="title">{{ gaveUp ? 'final score — miles of street named' : 'of miles of street named' }}</div>
      </div>

      <ul class="progress">
        <li v-for="step in progressSteps" :key="step" :class="{ enabled: percent * 100 >= step }" />
      </ul>

      <h3 v-if="gaveUp">{{ guessedCount }} found · {{ missedCount }} missed</h3>
      <h3 v-else>{{ count }} Street{{ count === 1 ? '' : 's' }} Found</h3>

      <div v-if="count" class="menu-wrap sort-button" data-scope="sort">
        <div class="menu-outer" data-scope="sort" :class="{ open: sortOpen }">
          <a href="#" class="menu-button" data-scope="sort" aria-label="Sort streets" @click.prevent="sortOpen = !sortOpen">
            <img src="../assets/sort.svg" data-scope="sort" alt="" />
          </a>
          <div class="menu-block" data-scope="sort" @click="sortOpen = false" />
          <ul class="menu-options" data-scope="sort">
            <li data-scope="sort" @click="selectSort('found')">{{ gaveUp ? 'Status' : 'Order Found' }}</li>
            <li data-scope="sort" @click="selectSort('alphabetical')">Alphabetical</li>
            <li data-scope="sort" @click="selectSort('length')">Length</li>
          </ul>
        </div>
      </div>

      <template v-if="gaveUp">
        <div class="reveal-filters" role="group" aria-label="Filter revealed streets">
          <button type="button" :class="{ selected: revealFilter === 'all' }" @click="revealFilter = 'all'">All <span>{{ count }}</span></button>
          <button type="button" :class="{ selected: revealFilter === 'found' }" @click="revealFilter = 'found'">Found <span>{{ guessedCount }}</span></button>
          <button type="button" :class="{ selected: revealFilter === 'missed' }" @click="revealFilter = 'missed'">Missed <span>{{ missedCount }}</span></button>
        </div>
        <ul class="revealed-streets" @mouseleave="emit('hoverStreet', null)">
          <li v-for="street in filteredStreets" :key="street.id">
            <button
              type="button"
              class="street-entry revealed-entry"
              :class="street.properties.guessed ? 'street-found' : 'street-missed'"
              :aria-label="streetAriaLabel(street)"
              @click="selectStreet(street)"
              @mouseenter="emit('hoverStreet', streetTarget(street))"
              @focus="emit('hoverStreet', streetTarget(street))"
              @blur="emit('hoverStreet', null)"
            >
              <span class="street-status-mark" aria-hidden="true">{{ street.properties.guessed ? '✓' : '•' }}</span>
              <span class="street-name">{{ street.properties.display }}</span>
              <span class="street-status">{{ street.properties.guessed ? 'FOUND' : 'MISSED' }}</span>
              <span class="percent-added">{{ scoreLabel(street) }}</span>
            </button>
          </li>
        </ul>
      </template>
      <template v-else>
        <div class="fakeheight" :style="{ height: `${40 * count}px` }" />
        <ul
          class="found-streets"
          :style="{ transform: `translate3d(0, ${40 * count}px, 0)` }"
          @mouseleave="emit('hoverStreet', null)"
        >
          <li v-for="(street, index) in streets" :key="street.id">
            <button
              type="button"
              class="street-entry"
              :style="{ transform: `translate3d(0, ${-40 * index}px, 0)` }"
              :aria-label="streetAriaLabel(street)"
              @click="selectStreet(street)"
              @mouseenter="emit('hoverStreet', streetTarget(street))"
              @focus="emit('hoverStreet', streetTarget(street))"
              @blur="emit('hoverStreet', null)"
            >
              <span class="street-name">{{ street.properties.display }}</span>
              <span class="percent-added">{{ scoreLabel(street) }}</span>
            </button>
          </li>
        </ul>
      </template>
    </div>
    <a href="#" class="popup-close" aria-label="Close results" @click.prevent="popup = false">
      <img src="../assets/close.svg" alt="" />
    </a>
  </div>
</template>
