<script setup lang="ts">
import { formatYuan, type ShopCategoryDto, type SkuDto, type StorefrontDto } from '@lingjing/shared';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { api } from '../../api';
import { useFittingStore } from '../../stores/fitting';

type Section = { id: string; name: string; top: number; bottom: number };

const HOLD_MS = 420;
const fitting = useFittingStore();
const storefront = ref<StorefrontDto | null>(null);
const categories = ref<ShopCategoryDto[]>([]);
const skus = ref<SkuDto[]>([]);
const error = ref('');
const loading = ref(true);
const toast = ref('');
const holding = ref(false);
const activeId = ref('');
const scroller = ref<HTMLElement | null>(null);
const adding = ref('');
let programmatic = false;
let gate: { index: number; until: number; open: boolean } | null = null;

const sections = computed(() => {
  const groups = categories.value.map((category) => ({
    id: category.id,
    name: category.name,
    items: skus.value.filter((sku) => sku.shopCategoryId === category.id),
  }));
  const loose = skus.value.filter((sku) => !sku.shopCategoryId);
  if (loose.length) groups.push({ id: 'uncategorized', name: '未分类', items: loose });
  return groups;
});

onMounted(async () => {
  try {
    const [shop, cats, list] = await Promise.all([
      api<StorefrontDto>('/api/storefront'),
      api<ShopCategoryDto[]>('/api/shop-categories'),
      api<SkuDto[]>('/api/skus?ready=1'),
    ]);
    storefront.value = shop;
    categories.value = cats;
    skus.value = list;
    activeId.value = sections.value[0]?.id ?? '';
    if (!fitting.items.length) await fitting.load().catch(() => undefined);
    if (!sessionStorage.getItem('lingjing-browse')) {
      await api('/api/events', { method: 'POST', body: JSON.stringify({ type: 'browse' }) }).catch(() => undefined);
      sessionStorage.setItem('lingjing-browse', '1');
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '商城加载失败';
  } finally {
    loading.value = false;
  }
  await nextTick();
  scroller.value?.addEventListener('wheel', onWheel, { passive: false });
  scroller.value?.addEventListener('touchstart', onTouchStart, { passive: true });
  scroller.value?.addEventListener('touchmove', onTouchMove, { passive: false });
});

onBeforeUnmount(() => {
  scroller.value?.removeEventListener('wheel', onWheel);
  scroller.value?.removeEventListener('touchstart', onTouchStart);
  scroller.value?.removeEventListener('touchmove', onTouchMove);
});

function measure(): Section[] {
  const root = scroller.value;
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>('[data-cat]')].map((node) => ({
    id: node.dataset.cat || '',
    name: node.dataset.name || '',
    top: node.offsetTop,
    bottom: node.offsetTop + node.offsetHeight,
  }));
}

function indexAt(scrollTop: number, list: Section[]) {
  let index = 0;
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].top <= scrollTop + 28) index = i;
  }
  return index;
}

function blockCrossing(deltaY: number) {
  const root = scroller.value;
  if (!root || programmatic || Math.abs(deltaY) < 1) return false;
  const list = measure();
  if (list.length < 2) return false;
  const index = indexAt(root.scrollTop, list);
  const down = deltaY > 0;
  const next = index + (down ? 1 : -1);
  if (next < 0 || next >= list.length) return false;
  const pos = root.scrollTop;
  const viewBottom = pos + root.clientHeight;
  const atDownEdge = down && viewBottom >= list[index].bottom - 36;
  const atUpEdge = !down && pos <= list[index].top + 16 && index > 0;
  if (!atDownEdge && !atUpEdge) {
    gate = null;
    holding.value = false;
    return false;
  }
  const gateIndex = down ? next : index;
  const now = Date.now();
  if (gate?.index === gateIndex && now >= gate.until) {
    gate.open = true;
    holding.value = false;
    return false;
  }
  if (gate?.index === gateIndex && !gate.open) return true;
  gate = { index: gateIndex, until: now + HOLD_MS, open: false };
  holding.value = true;
  window.setTimeout(() => {
    if (gate?.index === gateIndex) holding.value = false;
  }, HOLD_MS);
  return true;
}

function onWheel(event: WheelEvent) {
  if (blockCrossing(event.deltaY)) event.preventDefault();
}

let lastY = 0;
function onTouchStart(event: TouchEvent) {
  lastY = event.touches[0]?.clientY ?? 0;
}
function onTouchMove(event: TouchEvent) {
  const y = event.touches[0]?.clientY ?? lastY;
  const delta = lastY - y;
  lastY = y;
  if (blockCrossing(delta)) event.preventDefault();
}

function onScroll() {
  if (programmatic || holding.value) return;
  const list = measure();
  if (!list.length || !scroller.value) return;
  activeId.value = list[indexAt(scroller.value.scrollTop, list)].id;
}

function jump(id: string) {
  const root = scroller.value;
  const node = root?.querySelector<HTMLElement>(`[data-cat="${id}"]`);
  if (!root || !node) return;
  programmatic = true;
  gate = null;
  holding.value = false;
  activeId.value = id;
  root.scrollTo({ top: node.offsetTop, behavior: 'smooth' });
  window.setTimeout(() => {
    programmatic = false;
  }, 480);
}

function cover(sku: SkuDto) {
  return sku.images.find((image) => image.angle === 'front')?.url ?? sku.images[0]?.url;
}

async function addToRoom(sku: SkuDto) {
  adding.value = sku.id;
  toast.value = '';
  try {
    const already = fitting.has(sku.id);
    await fitting.add(sku.id);
    toast.value = already ? `${sku.name} 已经在试衣间` : `已把${sku.name}放进试衣间`;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '没能加入试衣间';
  } finally {
    adding.value = '';
  }
}
</script>

<template>
  <div class="mall">
    <header class="shop-head">
      <div>
        <strong>{{ storefront?.shopName ?? '绫境' }}</strong>
        <p>{{ storefront?.announcement || '店铺公告会显示在这里' }}</p>
      </div>
    </header>
    <div v-if="error" class="banner">{{ error }}</div>
    <div v-else-if="loading" class="page"><p class="muted">正在打开店铺…</p></div>
    <div v-else-if="sections.length === 0" class="page"><div class="empty">还没有分类。商户可以在工作台里加上。</div></div>
    <div v-else class="mall-body">
      <aside class="rail">
        <button
          v-for="section in sections"
          :key="section.id"
          type="button"
          :class="{ on: activeId === section.id }"
          @click="jump(section.id)"
        >
          {{ section.name }}
        </button>
      </aside>
      <div ref="scroller" class="goods" @scroll="onScroll">
        <section v-for="section in sections" :key="section.id" :data-cat="section.id" :data-name="section.name">
          <h2>{{ section.name }}</h2>
          <p v-if="section.items.length === 0" class="muted">这一类还没有可试穿的衣服。</p>
          <article v-for="sku in section.items" :key="sku.id" class="sku-row">
            <img :src="cover(sku)" :alt="sku.name" />
            <div>
              <strong>{{ sku.name }}</strong>
              <span class="price">{{ formatYuan(sku.priceCents) }}</span>
              <button class="btn" type="button" :disabled="adding === sku.id" @click="addToRoom(sku)">
                {{ fitting.has(sku.id) ? '已在试衣间' : '加入试衣间' }}
              </button>
            </div>
          </article>
        </section>
        <p v-if="holding" class="hold">松一下，再滑就进入下一分类</p>
        <p v-if="toast" class="toast">{{ toast }}</p>
      </div>
    </div>
  </div>
</template>
