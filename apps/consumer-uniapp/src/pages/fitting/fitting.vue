<script setup lang="ts">
import { FACE_APPLY_LATER, SLOT_LABEL, type FittingItemDto, type ProfileInput, type SkuDto } from '@lingjing/shared';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { api } from '../../api';
import SizeFields from '../../components/SizeFields.vue';
import TryOnStage from '../../components/TryOnStage.vue';
import { useFittingStore } from '../../stores/fitting';
import { useOutfitStore } from '../../stores/outfit';
import { useProfileStore } from '../../stores/profile';
import { useSessionStore } from '../../stores/session';

/**
 * 人脸贴模本期不做。
 * 后续实现：若 photoUrl 有图，做人脸检测，再把纹理贴到参数化人模头部。
 * 不要在这里接入真实识别服务。
 */
const fitting = useFittingStore();
const outfit = useOutfitStore();
const profile = useProfileStore();
const session = useSessionStore();
const error = ref('');
const cart = ref('');
const posting = ref(false);
const sizesTouched = ref(false);
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

const tops = computed(() => fitting.items.filter((item) => item.slot === 'top'));
const bottoms = computed(() => fitting.items.filter((item) => item.slot === 'bottom'));
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

onMounted(async () => {
  try {
    if (!profile.profiles.length) await profile.load();
    if (!fitting.items.length) await fitting.load();
    if (!outfit.top) {
      const first = tops.value[0];
      if (first) await wear(first, false);
    }
    if (!outfit.bottom) {
      const first = bottoms.value[0];
      if (first) await wear(first, false);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '试衣间加载失败';
  }
});

function choosePerson(id: string) {
  sizesTouched.value = false;
  cart.value = '';
  profile.select(id);
}

function onSizes() {
  if (!profile.profile) return;
  sizesTouched.value = true;
  profile.scheduleSave({ ...form, nickname: profile.profile.nickname });
}

async function wear(item: FittingItemDto, record = true) {
  error.value = '';
  const sku = await api<SkuDto>(`/api/skus/${item.skuId}`);
  const previous = item.slot === 'top' ? outfit.top?.id : outfit.bottom?.id;
  outfit.setSku(sku);
  if (!record || !profile.profile || previous === sku.id) return;
  const sessionId = await session.ensure(profile.profile.id);
  await api('/api/events', {
    method: 'POST',
    body: JSON.stringify({ type: 'try_on', sessionId, skuId: sku.id }),
  }).catch(() => undefined);
}

async function addToCart() {
  const worn = outfit.top ?? outfit.bottom;
  if (!profile.profile || !worn) return;
  posting.value = true;
  try {
    const sessionId = await session.ensure(profile.profile.id);
    await api('/api/events', {
      method: 'POST',
      body: JSON.stringify({ type: 'add_to_cart', sessionId, skuId: worn.id }),
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
  <div class="fitting">
    <div class="fit-head">
      <strong>试衣间</strong>
      <span>同一部位会换掉身上那件</span>
    </div>
    <div v-if="error" class="banner">{{ error }}</div>
    <div class="person-row">
      <button
        v-for="person in profile.profiles"
        :key="person.id"
        type="button"
        :class="{ on: profile.profile?.id === person.id }"
        @click="choosePerson(person.id)"
      >
        <img v-if="person.avatarUrl" :src="person.avatarUrl" alt="" />
        <i v-else>{{ person.nickname.slice(0, 1) }}</i>
        {{ person.nickname }}
      </button>
    </div>
    <p v-if="profile.profile?.photoUrl" class="face-note">{{ FACE_APPLY_LATER }}</p>
    <div class="worn-picks">
      <div>
        <span>{{ SLOT_LABEL.top }}</span>
        <button
          v-for="item in tops"
          :key="item.id"
          type="button"
          :class="{ on: outfit.top?.id === item.skuId }"
          @click="wear(item)"
        >
          {{ item.skuName }}
        </button>
        <em v-if="tops.length === 0">去商城加一件上装</em>
      </div>
      <div>
        <span>{{ SLOT_LABEL.bottom }}</span>
        <button
          v-for="item in bottoms"
          :key="item.id"
          type="button"
          :class="{ on: outfit.bottom?.id === item.skuId }"
          @click="wear(item)"
        >
          {{ item.skuName }}
        </button>
        <em v-if="bottoms.length === 0">去商城加一件下装</em>
      </div>
    </div>
    <TryOnStage v-if="profile.measurements" :measurements="profile.measurements" :garments="garments" />
    <div v-else class="empty">先在「我的」里建一个人员，再回来试穿。</div>
    <div v-if="profile.profile" class="sheet">
      <details class="fit-panel">
        <summary>调整身材</summary>
        <p class="muted">拖动后人台马上变，尺寸写回这个人的档案。</p>
        <SizeFields :model="form" @change="onSizes" />
      </details>
      <button class="btn primary" type="button" :disabled="posting || garments.length === 0" @click="addToCart">
        {{ posting ? '正在加入…' : '加入购物车' }}
      </button>
      <span v-if="cart" class="muted">{{ cart }}</span>
    </div>
  </div>
</template>
