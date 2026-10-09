<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Enter a Street' },
  paused: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'submit'])
const shaking = ref(false)
const field = ref(null)
const isTouch = computed(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0)
let shakeTimeout

function submit() {
  if (!props.paused) emit('submit', props.modelValue)
}

function onDocumentKeydown(event) {
  if (props.paused || isTouch.value || event.metaKey || event.ctrlKey || event.altKey) return
  if (event.key === 'Enter') return submit()
  if (event.key === 'Backspace') {
    event.preventDefault()
    emit('update:modelValue', props.modelValue.slice(0, -1))
    return
  }
  if (event.key.length === 1 && /^[A-Za-z0-9 '\-/]$/.test(event.key)) {
    if (event.key === ' ') event.preventDefault()
    emit('update:modelValue', `${props.modelValue}${event.key.toUpperCase()}`)
  }
}

function onMobileInput(event) {
  emit('update:modelValue', event.target.value.replace(/[@.]/g, ' ').toUpperCase())
}

function startShaking() {
  shaking.value = true
  clearTimeout(shakeTimeout)
  shakeTimeout = window.setTimeout(() => { shaking.value = false }, 800)
}

function stopShaking() {
  shaking.value = false
}

function showKeyboard() {
  if (isTouch.value) field.value?.focus()
}

function hideKeyboard() {
  if (isTouch.value) field.value?.blur()
}

onMounted(() => document.addEventListener('keydown', onDocumentKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onDocumentKeydown))
defineExpose({ startShaking, stopShaking, showKeyboard, hideKeyboard })
</script>

<template>
  <div id="input-wrap" @click="showKeyboard">
    <div id="input-shake" :class="{ shaking }">
      <div id="input" :class="{ placeholder: !modelValue }">
        <span v-if="!modelValue" class="cursor" />
        <span>{{ modelValue || placeholder }}</span>
        <span v-if="modelValue" class="cursor" />
      </div>
    </div>
    <form class="fake-form" action="./" novalidate @submit.prevent="submit">
      <input
        id="input-field"
        ref="field"
        type="text"
        aria-label="Enter a Manhattan street"
        :value="modelValue"
        :disabled="paused"
        enterkeyhint="enter"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        @input="onMobileInput"
      />
    </form>
  </div>
</template>
