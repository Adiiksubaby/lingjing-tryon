<script setup lang="ts">
import { formatYuan } from '@lingjing/shared';
import { useRouter } from 'vue-router';
import { useOutfitStore } from '../../stores/outfit';

const outfit = useOutfitStore();
const router = useRouter();
</script>

<template>
  <div class="page">
    <div>
      <h1>搭配</h1>
      <p class="lede muted">上装压在下装外面。两件都选好才能进试衣间。</p>
    </div>
    <div class="slots">
      <div class="slot">
        <span>上装</span>
        <template v-if="outfit.top">
          <strong>{{ outfit.top.name }}</strong>
          <span class="price">{{ formatYuan(outfit.top.priceCents) }}</span>
          <button type="button" @click="outfit.clear('top')">拿下</button>
        </template>
        <span v-else class="muted">还没选上装</span>
      </div>
      <div class="slot">
        <span>下装</span>
        <template v-if="outfit.bottom">
          <strong>{{ outfit.bottom.name }}</strong>
          <span class="price">{{ formatYuan(outfit.bottom.priceCents) }}</span>
          <button type="button" @click="outfit.clear('bottom')">拿下</button>
        </template>
        <span v-else class="muted">还没选下装</span>
      </div>
    </div>
    <button class="btn primary" type="button" :disabled="!outfit.ready" @click="router.push('/tryon')">去试穿</button>
    <button class="btn" type="button" @click="outfit.clear()">清空</button>
    <button class="btn" type="button" @click="router.push('/')">回商品列表</button>
  </div>
</template>
