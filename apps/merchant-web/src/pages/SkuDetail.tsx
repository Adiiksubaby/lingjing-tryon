import {
  ANGLE_LABEL,
  CATEGORY_LABEL,
  FIT_LABEL,
  LENGTH_LABEL,
  REBUILD_STAGES,
  REBUILD_STATE_LABEL,
  SILHOUETTE_LABEL,
  formatDateTime,
  type Angle,
  type ShopCategoryDto,
  type SkuDto,
} from '@lingjing/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { ViewerPane } from '../components/ViewerPane';
import { BASE_MEASUREMENTS } from '@lingjing/shared';

const SLOTS: { angle: Angle; required: boolean }[] = [
  { angle: 'front', required: true },
  { angle: 'side', required: true },
  { angle: 'back', required: true },
  { angle: 'detail', required: false },
];

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

export function SkuDetailPage() {
  const { id = '' } = useParams();
  const [sku, setSku] = useState<SkuDto | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [categories, setCategories] = useState<ShopCategoryDto[]>([]);

  async function load() {
    try {
      const next = await api<SkuDto>(`/api/skus/${id}`);
      setSku((current) => {
        if (
          current &&
          (current.rebuildState === 'queued' || current.rebuildState === 'running') &&
          next.rebuildState !== 'queued' &&
          next.rebuildState !== 'running'
        ) {
          setNotice('');
        }
        return next;
      });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '商品加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    void load();
    void api<ShopCategoryDto[]>('/api/shop-categories')
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [id]);

  useEffect(() => {
    if (!sku || (sku.rebuildState !== 'queued' && sku.rebuildState !== 'running')) return;
    const timer = window.setInterval(() => void load(), 800);
    return () => window.clearInterval(timer);
  }, [sku?.rebuildState, id]);

  async function upload(angle: Angle, file: File | null) {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      setError(`${file.name} 不是 JPG、PNG 或 WEBP`);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError(`${file.name} 超过 8MB`);
      return;
    }
    const form = new FormData();
    form.set(`image_${angle}`, file);
    setBusy(true);
    setError('');
    try {
      setSku(await api<SkuDto>(`/api/skus/${id}/images`, { method: 'POST', body: form }));
      setNotice(angle === 'detail' ? '已补上一张细节图' : `已更新${ANGLE_LABEL[angle]}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setBusy(false);
    }
  }

  async function removeImage(imageId: string) {
    if (!window.confirm('删除这张照片？已发布的样衣不会被一起删掉。')) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/skus/${id}/images/${imageId}`, { method: 'DELETE' });
      await load();
      setNotice('已删除照片');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setBusy(false);
    }
  }

  async function assignCategory(shopCategoryId: string) {
    setBusy(true);
    setError('');
    try {
      setSku(await api<SkuDto>(`/api/skus/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ shopCategoryId: shopCategoryId || null }),
      }));
      setNotice(shopCategoryId ? '已归入这个分类' : '已移出分类');
    } catch (err) {
      setError(err instanceof Error ? err.message : '分类没有改成');
    } finally {
      setBusy(false);
    }
  }

  async function startJob() {
    setBusy(true);
    setError('');
    try {
      await api(`/api/skus/${id}/jobs`, {
        method: 'POST',
        body: JSON.stringify({ simulateFailure }),
      });
      setNotice(simulateFailure ? '已排队，这条任务会在生成网格阶段失败' : '已发起重建');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法发起重建');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="muted">正在打开商品…</p>;
  if (!sku) return <p className="banner">{error || '没有找到商品'}</p>;

  const locked = sku.rebuildState === 'queued' || sku.rebuildState === 'running';
  const job = sku.latestJob;
  const garments = sku.asset
    ? [{ id: sku.id, slot: sku.category, url: sku.asset.url, color: sku.color, name: sku.name, params: sku.params }]
    : [];
  const details = sku.images.filter((image) => image.angle === 'detail');

  return (
    <section className="stack wide">
      <header className="page-head">
        <div>
          <p className="tag">{CATEGORY_LABEL[sku.category]} · {sku.origin === 'seed' ? '示例商品' : '商户上传'}</p>
          <h1>{sku.name}</h1>
          <p className="muted lede">照片齐全后发起重建。成功的样衣会进入消费者试衣目录，可以和另一件叠穿。</p>
        </div>
        <Link className="btn ghost" to="/">返回列表</Link>
      </header>
      {error ? <p className="banner">{error}</p> : null}
      {notice ? <p className="banner ok">{notice}</p> : null}

      <div className="split">
        <div className="stack">
          <section className="panel stack">
            <div className="row-actions">
              <span className={`pill ${sku.rebuildState}`}>{REBUILD_STATE_LABEL[sku.rebuildState]}</span>
              {job ? <span className="tag">{job.progress}%</span> : null}
            </div>
            <div className="progress" aria-hidden="true"><span style={{ width: `${job?.progress ?? 0}%` }} /></div>
            {sku.missingAngles.length > 0 ? (
              <p className="muted">还缺 {sku.missingAngles.map((angle) => ANGLE_LABEL[angle]).join('、')}。补齐后才能发起重建。</p>
            ) : null}
            {sku.status === 'ready' && sku.missingAngles.length > 0 ? (
              <p className="muted">上次成功的样衣仍在试穿目录。这次要重建的话，请先补齐照片。</p>
            ) : null}
            {sku.rebuildState === 'failed' && job?.error ? <p className="banner">{job.error}</p> : null}
            {sku.rebuildState === 'failed' && sku.asset ? <p className="muted">上一件已发布的样衣还在试穿目录里，这次失败没有替换它。</p> : null}
            <label className="check">
              <input type="checkbox" checked={simulateFailure} onChange={(event) => setSimulateFailure(event.target.checked)} disabled={locked} />
              模拟失败（用来看失败原因和重试）
            </label>
            <div className="row-actions">
              <button className="btn primary" type="button" disabled={busy || locked || sku.missingAngles.length > 0} onClick={() => void startJob()}>
                {locked ? '重建进行中…' : sku.rebuildState === 'failed' ? '重试重建' : sku.status === 'ready' ? '重新重建' : '发起重建'}
              </button>
              <Link className="btn ghost" to="/jobs">查看队列</Link>
            </div>
          </section>

          <section className="panel">
            <h2>多角度照片</h2>
            <p className="muted">正面、侧面、背面是重建必填。细节图可选，最多 3 张。支持 JPG、PNG、WEBP，单张不超过 8MB。</p>
            <div className="angles">
              {SLOTS.filter((slot) => slot.angle !== 'detail').map((slot) => {
                const image = sku.images.find((item) => item.angle === slot.angle);
                return (
                  <PhotoSlot
                    key={slot.angle}
                    label={`${ANGLE_LABEL[slot.angle]} · 必填`}
                    imageUrl={image?.url}
                    disabled={busy || locked}
                    onFile={(file) => void upload(slot.angle, file)}
                    onDelete={image ? () => void removeImage(image.id) : undefined}
                  />
                );
              })}
              {details.map((image) => (
                <PhotoSlot
                  key={image.id}
                  label="细节 · 可选"
                  imageUrl={image.url}
                  disabled={busy || locked}
                  onFile={(file) => void upload('detail', file)}
                  onDelete={() => void removeImage(image.id)}
                />
              ))}
              {details.length < 3 ? (
                <PhotoSlot
                  label="细节 · 可选"
                  disabled={busy || locked}
                  onFile={(file) => void upload('detail', file)}
                />
              ) : null}
            </div>
          </section>

          <section className="panel">
            <h2>重建时间线</h2>
            {!job ? <p className="muted">还没有任务。照片齐全后点「发起重建」。</p> : null}
            <ol className="timeline">
              {REBUILD_STAGES.map((stage) => {
                const matched = job?.logs.filter((log) => log.stage === stage.key) ?? [];
                const failedHere = job?.status === 'failed' && job.stage === stage.key;
                const current = job?.status === 'running' && job.stage === stage.key;
                const done = matched.length > 0 && !current && !failedHere;
                return (
                  <li key={stage.key}>
                    <span className={`dot-step ${failedHere ? 'failed' : current ? 'on' : done ? 'done' : ''}`} />
                    <div>
                      <strong>{stage.label}</strong>
                      {matched.length === 0 ? <p className="muted">未开始</p> : matched.map((log) => (
                        <p key={`${log.at}-${log.message}`} className="muted">{formatDateTime(log.at)} · {log.message}</p>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <aside className="stack">
          {sku.asset ? (
            <ViewerPane measurements={BASE_MEASUREMENTS} garments={garments} />
          ) : (
            <p className="empty">{sku.rebuildState === 'failed' ? '这次没有生成样衣。' : '重建完成后，这里会出现标准码人台和这件衣服。'}</p>
          )}
          <section className="panel stack">
            <h2>试穿目录</h2>
            <label>
              店铺分类
              <select
                value={sku.shopCategoryId ?? ''}
                disabled={busy}
                onChange={(event) => void assignCategory(event.target.value)}
              >
                <option value="">未分类</option>
                {categories
                  .filter((category) => category.slot === sku.category)
                  .map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
              </select>
            </label>
            {sku.status === 'ready' && sku.asset ? (
              <p>这件衣服已经是「可试穿」。打开<a href="http://127.0.0.1:4313" target="_blank" rel="noreferrer">消费者商城</a>，加入试衣间后再选人叠穿。</p>
            ) : (
              <p className="muted">成功之前不会出现在试衣目录。失败重试不会影响上一件已经发布的样衣。</p>
            )}
            <dl className="facts">
              <dt>版型</dt><dd>{SILHOUETTE_LABEL[sku.params.silhouette]}</dd>
              <dt>松紧</dt><dd>{FIT_LABEL[sku.params.fit]}</dd>
              <dt>松量</dt><dd>{sku.params.easeCm} cm</dd>
              <dt>衣长</dt><dd>{LENGTH_LABEL[sku.params.length]}</dd>
              <dt>面料</dt><dd>{sku.params.fabric}</dd>
              <dt>管道</dt><dd>{String(sku.asset?.meta.pipeline ?? '尚未生成')}</dd>
            </dl>
          </section>
        </aside>
      </div>
    </section>
  );
}

function PhotoSlot({
  label,
  imageUrl,
  disabled,
  onFile,
  onDelete,
}: {
  label: string;
  imageUrl?: string;
  disabled: boolean;
  onFile: (file: File | null) => void;
  onDelete?: () => void;
}) {
  return (
    <div className="angle">
      <span className="tag">{label}</span>
      {imageUrl ? <img src={imageUrl} alt="" /> : <div className="angle-empty">还没有照片</div>}
      <label className="btn ghost file-btn">
        {imageUrl ? '替换' : '上传'}
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
      </label>
      {onDelete ? <button className="btn danger" type="button" disabled={disabled} onClick={onDelete}>删除</button> : null}
    </div>
  );
}
