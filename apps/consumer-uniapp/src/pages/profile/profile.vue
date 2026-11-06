<script setup lang="ts">
import { ageFromBirthday, GENDER_LABEL, type Gender, type ProfileDto, type ProfileInput } from '@lingjing/shared';
import { reactive, ref, watch } from 'vue';
import { api } from '../../api';
import SizeFields from '../../components/SizeFields.vue';
import { useProfileStore } from '../../stores/profile';

const profile = useProfileStore();
const notice = ref('');
const saving = ref(false);
const creating = ref(false);
const editingId = ref<string | null>(null);
const avatarFile = ref<File | null>(null);
const photoFile = ref<File | null>(null);
const avatarPreview = ref('');
const photoPreview = ref('');
const form = reactive<ProfileInput>({
  nickname: '',
  heightCm: 168,
  weightKg: 56,
  shoulderCm: 38,
  chestCm: 84,
  waistCm: 66,
  hipCm: 90,
  inseamCm: 76,
  armLengthCm: 55,
  birthday: '',
  age: null,
  gender: 'unspecified',
  phone: '',
});

watch(
  () => profile.profile?.id,
  () => {
    if (creating.value) return;
    const current = profile.profile;
    if (current) fill(current);
  },
  { immediate: true },
);

function fill(person: ProfileDto) {
  editingId.value = person.id;
  form.nickname = person.nickname;
  form.heightCm = person.heightCm;
  form.weightKg = person.weightKg;
  form.shoulderCm = person.shoulderCm;
  form.chestCm = person.chestCm;
  form.waistCm = person.waistCm;
  form.hipCm = person.hipCm;
  form.inseamCm = person.inseamCm ?? Math.round(person.heightCm * 0.46);
  form.armLengthCm = person.armLengthCm ?? Math.round(person.heightCm * 0.33);
  form.birthday = person.birthday ?? '';
  form.age = person.age;
  form.gender = person.gender;
  form.phone = person.phone;
  avatarPreview.value = person.avatarUrl ?? '';
  photoPreview.value = person.photoUrl ?? '';
  avatarFile.value = null;
  photoFile.value = null;
}

function startNew() {
  creating.value = true;
  editingId.value = null;
  notice.value = '';
  form.nickname = '';
  form.birthday = '';
  form.age = null;
  form.gender = 'unspecified';
  form.phone = '';
  avatarPreview.value = '';
  photoPreview.value = '';
  avatarFile.value = null;
  photoFile.value = null;
}

function openPerson(person: ProfileDto) {
  creating.value = false;
  notice.value = '';
  profile.select(person.id);
  fill(person);
}

function onBirthday(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  form.birthday = value;
  form.age = value ? ageFromBirthday(value) : null;
}

function pick(event: Event, kind: 'avatar' | 'photo') {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null;
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    profile.error = '请上传 JPG、PNG 或 WEBP';
    return;
  }
  const url = URL.createObjectURL(file);
  if (kind === 'avatar') {
    avatarFile.value = file;
    avatarPreview.value = url;
  } else {
    photoFile.value = file;
    photoPreview.value = url;
  }
}

async function save() {
  saving.value = true;
  notice.value = '';
  profile.error = '';
  try {
    const payload = { ...form, gender: form.gender as Gender };
    const saved = creating.value ? await profile.create(payload) : await profile.save(payload, editingId.value ?? undefined);
    if (avatarFile.value) {
      const body = new FormData();
      body.set('file', avatarFile.value);
      await api(`/api/profiles/${saved.id}/avatar`, { method: 'POST', body });
    }
    if (photoFile.value) {
      const body = new FormData();
      body.set('file', photoFile.value);
      await api(`/api/profiles/${saved.id}/photo`, { method: 'POST', body });
    }
    if (avatarFile.value || photoFile.value) await profile.load();
    creating.value = false;
    const current = profile.profiles.find((item) => item.id === saved.id);
    if (current) fill(current);
    notice.value = '已保存。试衣间里可以选这个人。照片先存着，人脸贴模以后再做。';
  } catch (err) {
    profile.error = err instanceof Error ? err.message : '保存失败';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="page me">
    <div>
      <h1>我的</h1>
      <p class="lede muted">每个人单独存身材和照片。这些参数以后用来生成形象，现在先记下来。</p>
    </div>
    <div v-if="profile.error" class="banner">{{ profile.error }}</div>
    <div v-if="notice" class="empty">{{ notice }}</div>
    <div class="person-row">
      <button
        v-for="person in profile.profiles"
        :key="person.id"
        type="button"
        :class="{ on: !creating && editingId === person.id }"
        @click="openPerson(person)"
      >
        {{ person.nickname }}
      </button>
      <button type="button" :class="{ on: creating }" @click="startNew">新建人员</button>
    </div>
    <label class="field">
      怎么称呼
      <input v-model="form.nickname" maxlength="20" />
    </label>
    <div class="photo-pair">
      <label>
        头像
        <img v-if="avatarPreview" :src="avatarPreview" alt="头像" />
        <input type="file" accept="image/jpeg,image/png,image/webp" @change="pick($event, 'avatar')" />
      </label>
      <label>
        自己的照片
        <img v-if="photoPreview" :src="photoPreview" alt="个人照片" />
        <input type="file" accept="image/jpeg,image/png,image/webp" @change="pick($event, 'photo')" />
        <span class="muted">和头像分开存。以后识别这张脸，再贴到人模上。本期不会识别。</span>
      </label>
    </div>
    <label class="field">
      生日
      <input v-model="form.birthday" type="date" @change="onBirthday" />
    </label>
    <label class="field">
      年龄
      <input v-model.number="form.age" type="number" min="1" max="120" />
    </label>
    <label class="field">
      性别
      <select v-model="form.gender">
        <option v-for="(label, key) in GENDER_LABEL" :key="key" :value="key">{{ label }}</option>
      </select>
    </label>
    <label class="field">
      手机号
      <input v-model="form.phone" inputmode="numeric" maxlength="11" placeholder="11 位，可留空" />
    </label>
    <SizeFields :model="form" />
    <button class="btn primary" type="button" :disabled="saving" @click="save">{{ saving ? '正在保存…' : creating ? '创建人员' : '保存' }}</button>
  </div>
</template>
