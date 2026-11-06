import type { Measurements, ProfileDto, ProfileInput } from '@lingjing/shared';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../api';

const ACTIVE_KEY = 'lingjing-profile-id';

export function measurementsFromProfile(profile: ProfileDto): Measurements {
  return {
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    shoulderCm: profile.shoulderCm,
    chestCm: profile.chestCm,
    waistCm: profile.waistCm,
    hipCm: profile.hipCm,
    inseamCm: profile.inseamCm ?? Math.round(profile.heightCm * 0.46),
    armLengthCm: profile.armLengthCm ?? Math.round(profile.heightCm * 0.33),
  };
}

export const useProfileStore = defineStore('profile', () => {
  const profiles = ref<ProfileDto[]>([]);
  const activeId = ref<string | null>(localStorage.getItem(ACTIVE_KEY));
  const error = ref('');
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const profile = computed(
    () => profiles.value.find((item) => item.id === activeId.value) ?? profiles.value[0] ?? null,
  );
  const measurements = computed<Measurements | null>(() => (profile.value ? measurementsFromProfile(profile.value) : null));

  function remember(id: string | null) {
    activeId.value = id;
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  }

  function upsert(saved: ProfileDto) {
    const index = profiles.value.findIndex((item) => item.id === saved.id);
    if (index >= 0) profiles.value[index] = saved;
    else profiles.value = [saved, ...profiles.value];
  }

  async function load() {
    error.value = '';
    profiles.value = await api<ProfileDto[]>('/api/profiles');
    if (!profiles.value.some((item) => item.id === activeId.value)) remember(profiles.value[0]?.id ?? null);
  }

  function select(id: string) {
    remember(id);
  }

  async function persist(input: Partial<ProfileInput>, id: string, ticket: number) {
    error.value = '';
    try {
      const saved = await api<ProfileDto>(`/api/profiles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
      if (ticket === revision) upsert(saved);
      return saved;
    } catch (err) {
      if (ticket === revision) error.value = err instanceof Error ? err.message : '保存失败';
      throw err;
    }
  }

  async function create(input: ProfileInput) {
    if (timer) clearTimeout(timer);
    revision += 1;
    error.value = '';
    const saved = await api<ProfileDto>('/api/profiles', { method: 'POST', body: JSON.stringify(input) });
    upsert(saved);
    remember(saved.id);
    return saved;
  }

  async function save(input: ProfileInput, id = profile.value?.id) {
    if (!id) return create(input);
    if (timer) clearTimeout(timer);
    revision += 1;
    const saved = await persist(input, id, revision);
    remember(saved.id);
    return saved;
  }

  function scheduleSave(input: ProfileInput) {
    const current = profile.value;
    if (!current) return;
    revision += 1;
    const ticket = revision;
    upsert({
      ...current,
      nickname: input.nickname,
      heightCm: input.heightCm,
      weightKg: input.weightKg,
      shoulderCm: input.shoulderCm,
      chestCm: input.chestCm,
      waistCm: input.waistCm,
      hipCm: input.hipCm,
      inseamCm: input.inseamCm ?? null,
      armLengthCm: input.armLengthCm ?? null,
    });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void persist(input, current.id, ticket);
    }, 350);
  }

  return { profiles, profile, error, measurements, load, create, save, scheduleSave, select };
});
