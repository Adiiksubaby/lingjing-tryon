import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { ensureSession } from './api';
import { router } from './router';
import { useFittingStore } from './stores/fitting';
import { useProfileStore } from './stores/profile';
import '@lingjing/shared/tokens.css';
import './styles.css';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);

const bootError = { message: '' };
try {
  await ensureSession();
  await useProfileStore().load();
  await useFittingStore().load();
} catch (error) {
  bootError.message = error instanceof Error ? error.message : '无法连接试衣服务';
}
app.provide('bootError', bootError.message);
app.mount('#app');
