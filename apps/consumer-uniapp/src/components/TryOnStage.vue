<script setup lang="ts">
import type { Measurements } from '@lingjing/shared';
import { mountTryOnViewer, type TryOnGarmentInput, type TryOnViewerHandle } from '@lingjing/tryon-viewer';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{ measurements: Measurements; garments: TryOnGarmentInput[] }>();
const host = ref<HTMLDivElement | null>(null);
const hint = ref('正在准备试衣间…');
let handle: TryOnViewerHandle | null = null;

onMounted(() => {
  if (!host.value) return;
  handle = mountTryOnViewer(host.value, {
    measurements: props.measurements,
    garments: props.garments,
    onStatus: (status, detail) => {
      hint.value = detail || (status === 'loading' ? '正在加载样衣…' : '拖拽旋转，双指缩放');
    },
  });
});

watch(
  () => [props.measurements, props.garments] as const,
  () => handle?.update({ measurements: props.measurements, garments: props.garments }),
  { deep: true },
);

onBeforeUnmount(() => handle?.dispose());

function reset() {
  handle?.resetCamera();
}
</script>

<template>
  <div class="stage-wrap">
    <div ref="host" class="stage"></div>
    <div class="tryon-bar">
      <span>{{ hint }}</span>
      <button class="btn" type="button" @click="reset">复位</button>
    </div>
  </div>
</template>
