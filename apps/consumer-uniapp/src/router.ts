import { createRouter, createWebHistory } from 'vue-router';

/** 与 src/pages.json 保持一致。H5 用 vue-router，原生打包后改为 uni 页面栈。 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./pages/index/index.vue') },
    { path: '/fitting', component: () => import('./pages/fitting/fitting.vue') },
    { path: '/profile', component: () => import('./pages/profile/profile.vue') },
    { path: '/outfit', redirect: '/fitting' },
    { path: '/tryon', component: () => import('./pages/tryon/tryon.vue') },
  ],
});
