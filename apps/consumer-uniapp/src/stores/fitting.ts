import type { FittingItemDto } from '@lingjing/shared';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../api';

export const useFittingStore = defineStore('fitting', () => {
  const items = ref<FittingItemDto[]>([]);
  const error = ref('');
  const count = computed(() => items.value.length);

  async function load() {
    error.value = '';
    items.value = await api<FittingItemDto[]>('/api/fitting-room');
  }

  function has(skuId: string) {
    return items.value.some((item) => item.skuId === skuId);
  }

  async function add(skuId: string) {
    const saved = await api<FittingItemDto>('/api/fitting-room', {
      method: 'POST',
      body: JSON.stringify({ skuId }),
    });
    const index = items.value.findIndex((item) => item.skuId === saved.skuId);
    if (index >= 0) items.value[index] = saved;
    else items.value = [...items.value, saved];
    return saved;
  }

  async function remove(id: string) {
    await api(`/api/fitting-room/${id}`, { method: 'DELETE' });
    items.value = items.value.filter((item) => item.id !== id);
  }

  return { items, error, count, load, has, add, remove };
});
