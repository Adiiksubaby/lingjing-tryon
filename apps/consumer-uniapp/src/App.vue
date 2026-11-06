<script setup lang="ts">
import { computed, inject } from 'vue';
import { useRoute } from 'vue-router';
import { useFittingStore } from './stores/fitting';

const route = useRoute();
const fitting = useFittingStore();
const bootError = inject<string>('bootError', '');
const bare = computed(() => route.path === '/tryon' || route.query.host === 'webview');
</script>

<template>
  <div class="desktop">
    <div class="phone">
      <div v-if="bootError" class="banner">{{ bootError }}</div>
      <router-view />
      <nav v-if="!bare" class="tabbar">
        <router-link to="/">商城</router-link>
        <router-link to="/fitting">试衣间<span v-if="fitting.count"> {{ fitting.count }}</span></router-link>
        <router-link to="/profile">我的</router-link>
      </nav>
    </div>
  </div>
</template>
