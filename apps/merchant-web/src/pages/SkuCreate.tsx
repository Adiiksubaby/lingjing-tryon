import {
  CATEGORY_LABEL,
  FIT_LABEL,
  LENGTH_LABEL,
  SILHOUETTE_LABEL,
  type Category,
  type Fit,
  type GarmentLength,
  type Silhouette,
} from '@lingjing/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { SkuDto } from '@lingjing/shared';

const TOP: Silhouette[] = ['tee', 'shirt'];
const BOTTOM: Silhouette[] = ['pants', 'skirt'];

export function SkuCreatePage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('top');
  const [priceYuan, setPriceYuan] = useState('129');
  const [color, setColor] = useState('#f4f0e8');
  const [sizes, setSizes] = useState('S / M / L');
  const [description, setDescription] = useState('');
  const [silhouette, setSilhouette] = useState<Silhouette>('tee');
  const [fit, setFit] = useState<Fit>('regular');
  const [easeCm, setEaseCm] = useState('4');
  const [length, setLength] = useState<GarmentLength>('short');
  const [fabric, setFabric] = useState('精梳棉');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<Record<'front' | 'side' | 'back', File | null>>({
    front: null,
    side: null,
    back: null,
  });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const silhouettes = category === 'top' ? TOP : BOTTOM;

  const previews = useMemo(() => {
    return {
      front: files.front ? URL.createObjectURL(files.front) : '',
      side: files.side ? URL.createObjectURL(files.side) : '',
      back: files.back ? URL.createObjectURL(files.back) : '',
    };
  }, [files]);

  function changeCategory(next: Category) {
    setCategory(next);
    setSilhouette(next === 'top' ? 'tee' : 'pants');
    setLength(next === 'top' ? 'short' : 'regular');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    for (const file of [files.front, files.side, files.back]) {
      if (!file) continue;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setError(`${file.name} 不是 JPG、PNG 或 WEBP`);
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        setError(`${file.name} 超过 8MB`);
        return;
      }
    }
    const missing = (['front', 'side', 'back'] as const).filter((angle) => !files[angle]);
    setPending(true);
    setError('');
    const form = new FormData();
    form.set('name', name);
    form.set('category', category);
    form.set('priceYuan', priceYuan);
    form.set('color', color);
    form.set('sizes', sizes);
    form.set('description', description);
    form.set('silhouette', silhouette);
    form.set('fit', fit);
    form.set('easeCm', easeCm);
    form.set('length', length);
    form.set('fabric', fabric);
    form.set('notes', notes);
    if (files.front) form.set('image_front', files.front);
    if (files.side) form.set('image_side', files.side);
    if (files.back) form.set('image_back', files.back);
    try {
      const created = await api<{ sku: SkuDto }>('/api/skus', { method: 'POST', body: form });
      if (missing.length > 0) setError('');
      navigate(`/skus/${created.sku.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>新建商品</h1>
          <p className="muted lede">可以先保存商品再补照片。正面、侧面、背面齐了，到详情页点「发起重建」。支持 JPG、PNG、WEBP，单张不超过 8MB。</p>
        </div>
      </header>
      <form className="stack" onSubmit={(event) => void submit(event)}>
        {error ? <p className="banner">{error}</p> : null}
        <section className="panel">
          <h2>商品信息</h2>
          <div className="grid-2">
            <label>名称<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={40} placeholder="例如：云白圆领短袖" /></label>
            <label>价格（元）<input value={priceYuan} onChange={(event) => setPriceYuan(event.target.value)} required type="number" min="1" step="1" /></label>
            <label>类目
              <select value={category} onChange={(event) => changeCategory(event.target.value as Category)}>
                {Object.entries(CATEGORY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>尺码<input value={sizes} onChange={(event) => setSizes(event.target.value)} required maxLength={40} /></label>
            <label>颜色
              <input value={color} onChange={(event) => setColor(event.target.value)} type="color" />
            </label>
            <label>描述<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={200} rows={3} /></label>
          </div>
        </section>
        <section className="panel">
          <h2>重建参数</h2>
          <p className="muted">这些参数会写进占位网格。真实重建服务也应接收同一组字段。</p>
          <div className="grid-2">
            <label>版型
              <select value={silhouette} onChange={(event) => setSilhouette(event.target.value as Silhouette)}>
                {silhouettes.map((value) => <option key={value} value={value}>{SILHOUETTE_LABEL[value]}</option>)}
              </select>
            </label>
            <label>松紧
              <select value={fit} onChange={(event) => setFit(event.target.value as Fit)}>
                {Object.entries(FIT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>松量（厘米）<input value={easeCm} onChange={(event) => setEaseCm(event.target.value)} required type="number" min="0" max="20" step="0.5" /></label>
            <label>衣长
              <select value={length} onChange={(event) => setLength(event.target.value as GarmentLength)}>
                {Object.entries(LENGTH_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>面料<input value={fabric} onChange={(event) => setFabric(event.target.value)} required maxLength={40} placeholder="精梳棉、牛仔、醋酸" /></label>
            <label>备注<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={200} rows={3} /></label>
          </div>
        </section>
        <section className="panel">
          <h2>多角度照片</h2>
          <div className="photos">
            {([
              ['front', '正面'],
              ['side', '侧面'],
              ['back', '背面'],
            ] as const).map(([angle, label]) => (
              <label className="photo" key={angle}>
                {label}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setFiles((current) => ({ ...current, [angle]: event.target.files?.[0] ?? null }))}
                />
                {previews[angle] ? <img src={previews[angle]} alt="" /> : null}
              </label>
            ))}
          </div>
        </section>
        <p className="muted">
          {( ['front', 'side', 'back'] as const).filter((angle) => !files[angle]).length === 0
            ? '三个必填角度都已选择。保存后到详情页发起重建。'
            : `还没选：${(['front', 'side', 'back'] as const).filter((angle) => !files[angle]).map((angle) => ({ front: '正面', side: '侧面', back: '背面' }[angle])).join('、')}。仍可先保存。`}
        </p>
        <button className="btn primary" type="submit" disabled={pending}>{pending ? '正在保存…' : '保存商品'}</button>
      </form>
    </section>
  );
}
