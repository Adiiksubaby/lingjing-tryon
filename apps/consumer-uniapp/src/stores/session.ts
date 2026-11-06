import type { SessionDto } from '@lingjing/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api';

const KEY = 'lingjing-session-id';

export const useSessionStore = defineStore('session', () => {
  const id = ref<string | null>(sessionStorage.getItem(KEY));

  async function ensure(profileId: string) {
    if (id.value) {
      try {
        const existing = await api<SessionDto>(`/api/sessions/${id.value}`);
        if (existing.profileId === profileId) return id.value;
      } catch {
        /* 换成当前这个人，重新开会话 */
      }
      id.value = null;
      sessionStorage.removeItem(KEY);
    }
    const created = await api<SessionDto>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ profileId }),
    });
    id.value = created.id;
    sessionStorage.setItem(KEY, created.id);
    return created.id;
  }

  return { id, ensure };
});
