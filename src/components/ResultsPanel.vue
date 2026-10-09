<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  percent: { type: Number, default: 0 },
  streets: { type: Array, default: () => [] },
  sortKey: { type: String, default: 'found' },
})
const emit = defineEmits(['sort', 'hoverStreet', 'centerStreet'])
const popup = ref(false)
const sortOpen = ref(false)
const sidebarContent = ref(null)
const progressSteps = Array.from({ length: 20 }, (_, index) => index * 500)
const count = computed(() => props.streets.length)

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
  emit('centerStreet', street.id)
}

defineExpose({ showPopup })
</script>

<template>
  <div id="sidebar" :class="{ sidebarpopup: popup }">
    <div ref="sidebarContent" class="sidebar-content">
      <div class="big-number">
        <div class="number">{{ percent }}%</div>
        <div class="title">of miles of street named</div>
      </div>

      <ul class="progress">
        <li v-for="step in progressSteps" :key="step" :class="{ enabled: percent * 100 >= step }" />
      </ul>

      <h3>{{ count }} Street{{ count === 1 ? '' : 's' }} Found</h3>

      <div v-if="count" class="menu-wrap sort-button" data-scope="sort">
        <div class="menu-outer" data-scope="sort" :class="{ open: sortOpen }">
          <a href="#" class="menu-button" data-scope="sort" aria-label="Sort streets" @click.prevent="sortOpen = !sortOpen">
            <img src="../assets/sort.svg" data-scope="sort" alt="" />
          </a>
          <div class="menu-block" data-scope="sort" @click="sortOpen = false" />
          <ul class="menu-options" data-scope="sort">
            <li data-scope="sort" @click="selectSort('found')">Order Found</li>
            <li data-scope="sort" @click="selectSort('alphabetical')">Alphabetical</li>
            <li data-scope="sort" @click="selectSort('length')">Length</li>
          </ul>
        </div>
      </div>

      <div class="fakeheight" :style="{ height: `${40 * count}px` }" />
      <ul
        class="found-streets"
        :style="{ transform: `translate3d(0, ${40 * count}px, 0)` }"
        @mouseout="emit('hoverStreet', -1)"
      >
        <li v-for="(street, index) in streets" :key="street.id">
          <div
            class="street-entry"
            :style="{ transform: `translate3d(0, ${-40 * index}px, 0)` }"
            @click="selectStreet(street)"
            @mouseover="emit('hoverStreet', street.id)"
          >
            <span class="street-name">{{ street.properties.display }}</span>
            <span class="percent-added">+{{ street.properties.percent }}%</span>
          </div>
        </li>
      </ul>
    </div>
    <a href="#" class="popup-close" aria-label="Close results" @click.prevent="popup = false">
      <img src="../assets/close.svg" alt="" />
    </a>
  </div>
</template>
