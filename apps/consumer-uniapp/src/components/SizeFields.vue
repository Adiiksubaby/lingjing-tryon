<script setup lang="ts">
import type { ProfileInput } from '@lingjing/shared';

const props = defineProps<{ model: ProfileInput }>();
const emit = defineEmits<{ change: [] }>();

const fields = [
  { key: 'heightCm', label: '身高', unit: 'cm', min: 145, max: 195 },
  { key: 'weightKg', label: '体重', unit: 'kg', min: 40, max: 120 },
  { key: 'shoulderCm', label: '肩宽', unit: 'cm', min: 32, max: 55 },
  { key: 'chestCm', label: '胸围', unit: 'cm', min: 70, max: 120 },
  { key: 'waistCm', label: '腰围', unit: 'cm', min: 55, max: 110 },
  { key: 'hipCm', label: '臀围', unit: 'cm', min: 70, max: 125 },
  { key: 'inseamCm', label: '裤内长', unit: 'cm', min: 60, max: 95 },
  { key: 'armLengthCm', label: '臂长', unit: 'cm', min: 45, max: 75 },
] as const;

type FieldKey = (typeof fields)[number]['key'];

function onInput(key: FieldKey, event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  props.model[key] = value;
  emit('change');
}
</script>

<template>
  <label v-for="field in fields" :key="field.key" class="field">
    <div class="field-row">
      <span>{{ field.label }}</span>
      <input :value="model[field.key]" type="number" :min="field.min" :max="field.max" @input="onInput(field.key, $event)" />
      <span>{{ field.unit }}</span>
    </div>
    <input :value="model[field.key]" type="range" :min="field.min" :max="field.max" @input="onInput(field.key, $event)" />
  </label>
</template>
