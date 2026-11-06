<script setup lang="ts">
import type { ProfileInput, SkuDto } from '@lingjing/shared';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../api';
import SizeFields from '../../components/SizeFields.vue';
import TryOnStage from '../../components/TryOnStage.vue';
import { tryOnWebViewUrl, useNativeWebView } from '../../platform/webview';
import { useOutfitStore } from '../../stores/outfit';
import { useProfileStore } from '../../stores/profile';
import { useSessionStore } from '../../stores/session';

const route = useRoute();
const router = useRouter();
const outfit = useOutfitStore();
const profile = useProfileStore();
const session = useSessionStore();
const error = ref('');
const cart = ref('');
const posting = ref(false);
const viewerUrl = computed(() => tryOnWebViewUrl(outfit.top?.id ?? '', outfit.bottom?.id ?? ''));
const form = reactive<ProfileInput>({
  nickname: '林夏',
  heightCm: 168,
  weightKg: 56,
  shoulderCm: 38,
  chestCm: 84,
  waistCm: 66,
  hipCm: 90,
  inseamCm: 76,
  armLengthCm: 55,
});
const sizesTouched = ref(false);
const garments = computed(() =>
  [outfit.top, outfit.bottom]
    .filter((sku): sku is SkuDto => Boolean(sku?.asset))
    .map((sku) => ({
      id: sku.id,
      slot: sku.category,
      url: sku.asset?.url,
      color: sku.color,
      name: sku.name,
      params: sku.params,
    })),
);

watch(
  () => profile.profile,
  (value) => {
    if (!value || sizesTouched.value) return;
    form.nickname = value.nickname;
    form.heightCm = value.heightCm;
    form.weightKg = value.weightKg;
    form.shoulderCm = value.shoulderCm;
    form.chestCm = value.chestCm;
    form.waistCm = value.waistCm;
    form.hipCm = value.hipCm;
    form.inseamCm = value.inseamCm ?? Math.round(value.heightCm * 0.46);
    form.armLengthCm = value.armLengthCm ?? Math.round(value.heightCm * 0.33);
  },
  { immediate: true },
);

function onSizes() {
  if (!profile.profile) return;
  sizesTouched.value = true;
  profile.scheduleSave({ ...form, nickname: profile.profile.nickname });
}

onMounted(async () => {
  try {
    const topId = typeof route.query.top === 'string' ? route.query.top : '';
    const bottomId = typeof route.query.bottom === 'string' ? route.query.bottom : '';
    if (topId && bottomId && (!outfit.top || !outfit.bottom)) {
      const [top, bottom] = await Promise.all([api<SkuDto>(`/api/skus/${topId}`), api<SkuDto>(`/api/skus/${bottomId}`)]);
      outfit.setSku(top);
      outfit.setSku(bottom);
    }
    if (!profile.profile) await profile.load();
    if (!outfit.ready || !profile.profile || useNativeWebView) return;
    const sessionId = await session.ensure(profile.profile.id);
    const key = `${outfit.top?.id}:${outfit.bottom?.id}`;
    if (sessionStorage.getItem('lingjing-outfit-posted') === key) return;
    await api('/api/outfits', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        name: `${outfit.top?.name} + ${outfit.bottom?.name}`,
        items: [
          { skuId: outfit.top?.id, slot: 'top' },
          { skuId: outfit.bottom?.id, slot: 'bottom' },
        ],
      }),
    });
    await api('/api/events', { method: 'POST', body: JSON.stringify({ type: 'try_on', sessionId, skuId: outfit.top?.id }) });
    sessionStorage.setItem('lingjing-outfit-posted', key);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '试衣间准备失败';
  }
});

async function addToCart() {
  if (!profile.profile || !outfit.top) return;
  posting.value = true;
  try {
    const sessionId = await session.ensure(profile.profile.id);
    await api('/api/events', {
      method: 'POST',
      body: JSON.stringify({ type: 'add_to_cart', sessionId, skuId: outfit.top.id }),
    });
    cart.value = '已加入购物车。结算和支付还没接，这一步只记入转化。';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '没能加入购物车';
  } finally {
    posting.value = false;
  }
}
</script>

<template>
  <!-- uni-app 原生应使用 <web-view :src="viewerUrl" />。H5 在旗标打开时用 iframe 充当这个宿主。 -->
  <iframe v-if="useNativeWebView" class="webview" :src="viewerUrl" title="试衣 WebView" />
  <div v-else class="tryon">
    <div class="tryon-bar">
      <button class="back" type="button" @click="router.push('/fitting')">返回试衣间</button>
      <strong>试衣间</strong>
    </div>
    <div v-if="error" class="banner">{{ error }}</div>
    <TryOnStage v-if="profile.measurements && garments.length" :measurements="profile.measurements" :garments="garments" />
    <div v-else class="page">
      <div class="empty">请先在搭配里选好一件上装和一件下装。</div>
      <button class="btn primary" type="button" @click="router.push('/')">去选衣服</button>
    </div>
    <div v-if="outfit.ready" class="sheet">
      <details class="fit-panel">
        <summary>调整身材</summary>
        <p class="muted">拖动后人台马上变，尺寸会写回档案。</p>
        <SizeFields :model="form" @change="onSizes" />
      </details>
      <div class="layers">
        <span><i class="dot" :style="{ background: outfit.top?.color }" />{{ outfit.top?.name }}</span>
        <span><i class="dot" :style="{ background: outfit.bottom?.color }" />{{ outfit.bottom?.name }}</span>
      </div>
      <button class="btn primary" type="button" :disabled="posting" @click="addToCart">{{ posting ? '正在加入…' : '加入购物车' }}</button>
      <span v-if="cart" class="muted">{{ cart }}</span>
    </div>
  </div>
</template>
