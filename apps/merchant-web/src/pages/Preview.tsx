import {
  ANGLE_LABEL,
  BASE_MEASUREMENTS,
  CATEGORY_LABEL,
  FIT_LABEL,
  LENGTH_LABEL,
  SILHOUETTE_LABEL,
  type SkuDto,
} from '@lingjing/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { StatusPill } from '../components/StatusPill';
import { ViewerPane } from '../components/ViewerPane';

export function PreviewPage() {
  const { id = '' } = useParams();
  const [sku, setSku] = useState<SkuDto | null>(null);
  const [name, setName] = useState('');
  const [priceYuan, setPriceYuan] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const next = await api<SkuDto>(`/api/skus/${id}`);
      setSku(next);
      setName(next.name);
      setPriceYuan(String(next.priceCents / 100));
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
  }, [id]);

  useEffect(() => {
    if (!sku || sku.status === 'ready' || sku.status === 'failed') return;
    const timer = window.setInterval(() => void load(), 1200);
    return () => window.clearInterval(timer);
  }, [sku?.status, id]);

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      const next = await api<SkuDto>(`/api/skus/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, priceYuan: Number(priceYuan) }),
      });
      setSku(next);
      setNotice('已保存名称和价格');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  }

  async function rebuild() {
    try {
      await api(`/api/skus/${id}/jobs`, { method: 'POST' });
      setNotice('已重新排队');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法重新排队');
    }
  }

  if (loading) return <p className="muted">正在准备预览…</p>;
  if (!sku) return <p className="banner">{error || '没有找到商品'}</p>;

  const garments = sku.asset
    ? [{
        id: sku.id,
        slot: sku.category,
        url: sku.asset.url,
        color: sku.color,
        name: sku.name,
        params: sku.params,
      }]
    : [];

  return (
    <section className="stack">
      <header className="page-head">
        <div>
          <h1>{sku.name}</h1>
          <p className="muted lede">预览使用标准码人台（170cm）。消费者试穿时会按自己的身材缩放这件 GLB。</p>
        </div>
        <Link className="btn ghost" to="/jobs">返回任务</Link>
      </header>
      {error ? <p className="banner">{error}</p> : null}
      {notice ? <p className="banner" style={{ background: '#ecfdf3', color: 'var(--moss)' }}>{notice}</p> : null}
      <div className="split">
        <div>
          {sku.asset ? (
            <ViewerPane measurements={BASE_MEASUREMENTS} garments={garments} />
          ) : (
            <p className="empty">{sku.status === 'failed' ? '重建失败，可以重新排队。' : '样衣还在重建，完成后这里会出现人台。'}</p>
          )}
        </div>
        <aside className="panel stack">
          <div className="row-actions"><StatusPill kind="sku" status={sku.status} /> <span className="tag">{CATEGORY_LABEL[sku.category]}</span></div>
          <dl className="facts">
            <dt>版型</dt><dd>{SILHOUETTE_LABEL[sku.params.silhouette]}</dd>
            <dt>松紧</dt><dd>{FIT_LABEL[sku.params.fit]}</dd>
            <dt>松量</dt><dd>{sku.params.easeCm} cm</dd>
            <dt>衣长</dt><dd>{LENGTH_LABEL[sku.params.length]}</dd>
            <dt>面料</dt><dd>{sku.params.fabric}</dd>
            <dt>管道</dt><dd>{String(sku.asset?.meta.pipeline ?? '等待中')}</dd>
          </dl>
          <form className="stack" onSubmit={(event) => void save(event)}>
            <label>名称<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
            <label>价格（元）<input value={priceYuan} onChange={(event) => setPriceYuan(event.target.value)} required type="number" min="1" step="1" /></label>
            <div className="row-actions">
              <button className="btn primary" type="submit">保存资料</button>
              <button className="btn ghost" type="button" onClick={() => void rebuild()} disabled={sku.status === 'processing'}>重新重建</button>
            </div>
          </form>
          <div className="thumbs">
            {sku.images.map((image) => (
              <figure key={image.id}>
                <img src={image.url} alt={ANGLE_LABEL[image.angle]} />
                <figcaption>{ANGLE_LABEL[image.angle]}</figcaption>
              </figure>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
