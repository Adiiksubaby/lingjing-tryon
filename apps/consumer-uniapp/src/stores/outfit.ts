import type { SkuDto } from '@lingjing/shared';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

const STORAGE_KEY = 'lingjing-outfit';

function readSaved() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { top: null, bottom: null };
    return JSON.parse(raw) as { top: SkuDto | null; bottom: SkuDto | null };
  } catch {
    return { top: null, bottom: null };
  }
}

export const useOutfitStore = defineStore('outfit', () => {
  const saved = readSaved();
  const top = ref<SkuDto | null>(saved.top);
  const bottom = ref<SkuDto | null>(saved.bottom);
  const ready = computed(() => Boolean(top.value?.asset && bottom.value?.asset));

  function persist() {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ top: top.value, bottom: bottom.value }));
  }

  function setSku(sku: SkuDto) {
    if (sku.category === 'top') top.value = sku;
    else bottom.value = sku;
    persist();
  }

  function clear(slot?: 'top' | 'bottom') {
    if (!slot || slot === 'top') top.value = null;
    if (!slot || slot === 'bottom') bottom.value = null;
    persist();
  }

  return { top, bottom, ready, setSku, clear };
});
