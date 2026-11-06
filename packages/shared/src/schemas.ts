import { z } from 'zod';

const enumError = (message: string) => ({ errorMap: () => ({ message }) });

export const roleSchema = z.enum(['merchant', 'consumer', 'ops'], enumError('未知角色'));
export const categorySchema = z.enum(['top', 'bottom'], enumError('类目应为上装或下装'));
export const silhouetteSchema = z.enum(['tee', 'shirt', 'pants', 'skirt'], enumError('版型不正确'));
export const fitSchema = z.enum(['slim', 'regular', 'relaxed'], enumError('松紧不正确'));
export const lengthSchema = z.enum(['short', 'regular', 'long'], enumError('衣长不正确'));
export const angleSchema = z.enum(['front', 'side', 'back', 'detail'], enumError('照片角度不正确'));
export const jobStatusSchema = z.enum(
  ['queued', 'running', 'ready', 'failed'],
  enumError('任务状态不正确'),
);
export const skuStatusSchema = z.enum(['draft', 'processing', 'ready', 'failed'], enumError('商品状态不正确'));
export const sessionStatusSchema = z.enum(['open', 'closed'], enumError('会话状态不正确'));
export const slotSchema = z.enum(['top', 'bottom'], enumError('穿戴位置不正确'));
export const genderSchema = z.enum(['female', 'male', 'unspecified'], enumError('性别不正确'));
export const eventTypeSchema = z.enum(
  ['browse', 'try_on', 'add_to_cart'],
  enumError('事件类型不正确'),
);
export const originSchema = z.enum(['seed', 'live']);

const requiredText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `请填写${label}`)
    .max(max, `${label}过长`);

export const garmentParamsSchema = z.object({
  silhouette: silhouetteSchema,
  fit: fitSchema,
  easeCm: z
    .number({ invalid_type_error: '松量需要是数字' })
    .min(0, '松量不能为负')
    .max(20, '松量过大'),
  length: lengthSchema,
  fabric: requiredText('面料', 40),
  notes: z.string().trim().max(200, '备注过长').optional(),
});

export const measurementsSchema = z.object({
  heightCm: z
    .number({ invalid_type_error: '身高需要是数字' })
    .min(140, '身高需在 140–210 cm')
    .max(210, '身高需在 140–210 cm'),
  weightKg: z
    .number({ invalid_type_error: '体重需要是数字' })
    .min(35, '体重需在 35–160 kg')
    .max(160, '体重需在 35–160 kg'),
  shoulderCm: z
    .number({ invalid_type_error: '肩宽需要是数字' })
    .min(30, '肩宽超出可试穿范围')
    .max(60, '肩宽超出可试穿范围'),
  chestCm: z
    .number({ invalid_type_error: '胸围需要是数字' })
    .min(60, '胸围超出可试穿范围')
    .max(140, '胸围超出可试穿范围'),
  waistCm: z
    .number({ invalid_type_error: '腰围需要是数字' })
    .min(50, '腰围超出可试穿范围')
    .max(140, '腰围超出可试穿范围'),
  hipCm: z
    .number({ invalid_type_error: '臀围需要是数字' })
    .min(60, '臀围超出可试穿范围')
    .max(150, '臀围超出可试穿范围'),
  inseamCm: z
    .number({ invalid_type_error: '裤内长需要是数字' })
    .min(50, '裤内长超出可试穿范围')
    .max(100, '裤内长超出可试穿范围')
    .optional(),
  armLengthCm: z
    .number({ invalid_type_error: '臂长需要是数字' })
    .min(40, '臂长超出可试穿范围')
    .max(90, '臂长超出可试穿范围')
    .optional(),
});

const birthdaySchema = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), '生日格式应为 YYYY-MM-DD');

const phoneSchema = z
  .string()
  .trim()
  .max(20, '手机号过长')
  .refine((value) => value === '' || /^1\d{10}$/.test(value), '手机号应为 11 位数字');

export const profileInputSchema = measurementsSchema.extend({
  nickname: requiredText('称呼', 20),
  birthday: birthdaySchema.optional(),
  age: z.number({ invalid_type_error: '年龄需要是数字' }).int().min(1, '年龄超出范围').max(120, '年龄超出范围').nullable().optional(),
  gender: genderSchema.optional(),
  phone: phoneSchema.optional(),
});

export const profilePatchSchema = profileInputSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: '没有可更新的字段',
});

export function silhouetteMatches(category: 'top' | 'bottom', silhouette: 'tee' | 'shirt' | 'pants' | 'skirt') {
  return category === 'top'
    ? silhouette === 'tee' || silhouette === 'shirt'
    : silhouette === 'pants' || silhouette === 'skirt';
}

export const skuCreateSchema = z
  .object({
    name: requiredText('商品名称', 40),
    category: categorySchema,
    shopCategoryId: z.string().trim().min(1).optional(),
    priceYuan: z
      .number({ invalid_type_error: '价格需要是数字' })
      .positive('价格需大于 0')
      .max(99999, '价格过大'),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '颜色格式应为 #RRGGBB'),
    sizes: requiredText('尺码', 40),
    description: z.string().trim().max(200, '描述过长').optional(),
    params: garmentParamsSchema,
  })
  .superRefine((value, ctx) => {
    if (!silhouetteMatches(value.category, value.params.silhouette)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['params', 'silhouette'],
        message: '版型与类目不匹配',
      });
    }
  });

export const skuPatchSchema = z
  .object({
    name: requiredText('商品名称', 40).optional(),
    shopCategoryId: z.string().trim().min(1).nullable().optional(),
    priceYuan: z.number().positive('价格需大于 0').max(99999).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '颜色格式应为 #RRGGBB').optional(),
    sizes: requiredText('尺码', 40).optional(),
    description: z.string().trim().max(200).optional(),
    params: garmentParamsSchema.optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: '没有可更新的字段',
  });

export const demoAuthSchema = z.object({
  role: roleSchema,
});

export const jobCreateSchema = z.object({
  simulateFailure: z.boolean().optional(),
});

export const sessionCreateSchema = z.object({
  profileId: z.string().min(1, '缺少身材档案'),
});

export const sessionPatchSchema = z.object({
  status: sessionStatusSchema,
});

export const outfitItemSchema = z.object({
  skuId: z.string().min(1),
  slot: slotSchema,
});

export const outfitCreateSchema = z.object({
  sessionId: z.string().min(1, '缺少试穿会话'),
  name: z.string().trim().min(1).max(80).optional(),
  items: z.array(outfitItemSchema).min(1, '搭配至少包含一件衣服').max(2, '当前仅支持上装和下装'),
});

export const outfitPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    items: z.array(outfitItemSchema).min(1).max(2).optional(),
  })
  .refine((value) => value.name !== undefined || value.items !== undefined, {
    message: '没有可更新的字段',
  });

export const eventInputSchema = z.object({
  type: eventTypeSchema,
  sessionId: z.string().min(1).optional(),
  skuId: z.string().min(1).optional(),
});

export const storefrontPatchSchema = z.object({
  shopName: requiredText('店铺名', 40),
  announcement: z.string().trim().max(120, '公告过长'),
});

export const shopCategoryInputSchema = z.object({
  name: requiredText('分类名称', 20),
  slot: slotSchema,
  sort: z.number().int().min(0).max(999).optional(),
});

export const shopCategoryPatchSchema = shopCategoryInputSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: '没有可更新的字段',
});

export const fittingAddSchema = z.object({
  skuId: z.string().min(1, '缺少商品'),
});

export type Role = z.infer<typeof roleSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Silhouette = z.infer<typeof silhouetteSchema>;
export type Fit = z.infer<typeof fitSchema>;
export type GarmentLength = z.infer<typeof lengthSchema>;
export type Angle = z.infer<typeof angleSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type SkuStatus = z.infer<typeof skuStatusSchema>;
export type SessionStatus = z.infer<typeof sessionStatusSchema>;
export type Slot = z.infer<typeof slotSchema>;
export type EventType = z.infer<typeof eventTypeSchema>;
export type Origin = z.infer<typeof originSchema>;
export type GarmentParams = z.infer<typeof garmentParamsSchema>;
export type Measurements = z.infer<typeof measurementsSchema>;
export type Gender = z.infer<typeof genderSchema>;
export type ProfileInput = z.infer<typeof profileInputSchema>;
export type ProfilePatchInput = z.infer<typeof profilePatchSchema>;
export type StorefrontPatchInput = z.infer<typeof storefrontPatchSchema>;
export type ShopCategoryInput = z.infer<typeof shopCategoryInputSchema>;
export type SkuCreateInput = z.infer<typeof skuCreateSchema>;
export type SkuPatchInput = z.infer<typeof skuPatchSchema>;
export type OutfitCreateInput = z.infer<typeof outfitCreateSchema>;
export type OutfitPatchInput = z.infer<typeof outfitPatchSchema>;
export type EventInput = z.infer<typeof eventInputSchema>;
