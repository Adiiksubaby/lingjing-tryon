import { ANGLE_LABEL, CATEGORY_LABEL, REBUILD_STATE_LABEL, formatYuan, type SkuDto } from '@lingjing/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export function SkuListPage() {
  const [skus, setSkus] = useState<SkuDto[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load(initial = false) {
    if (initial) setLoading(true);
    try {
      setSkus(await api<SkuDto[]>('/api/skus'));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '商品加载失败');
    } finally {
      if (initial) setLoading(false);
    }
  }

  useEffect(() => {
    void load(true);
    const timer = window.setInterval(() => void load(false), 1500);
    return () => window.clearInterval(timer);
  }, []);

  async function remove(sku: SkuDto) {
    if (!window.confirm(`确定删除「${sku.name}」？照片和样衣文件会一起去掉。`)) return;
    try {
      await api(`/api/skus/${sku.id}`, { method: 'DELETE' });
      setSkus((current) => current.filter((item) => item.id !== sku.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>商品</h1>
          <p className="muted lede">先保存商品和多角度照片，再发起重建。成功后消费者试衣目录里就能选到。</p>
        </div>
        <Link className="btn primary" to="/new">新建商品</Link>
      </header>
      {error ? <p className="banner">{error}</p> : null}
      {loading ? <p className="muted">正在加载商品…</p> : null}
      {!loading && skus.length === 0 ? <p className="empty">还没有商品。先建一件上装或下装。</p> : null}
      {skus.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>商品</th>
                <th>类目</th>
                <th>价格</th>
                <th>状态</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {skus.map((sku) => (
                <tr key={sku.id}>
                  <td>
                    <div className="name-cell">
                      <span className="swatch" style={{ background: sku.color }} />
                      <div>
                        <strong>{sku.name}</strong>
                        {sku.origin === 'seed' ? <div className="tag">示例</div> : null}
                        <div className="tag">{sku.missingAngles.length === 0 ? '角度齐全' : `缺${sku.missingAngles.map((angle) => ANGLE_LABEL[angle]).join('、')}`}</div>
                      </div>
                    </div>
                  </td>
                  <td>{CATEGORY_LABEL[sku.category]}</td>
                  <td>{formatYuan(sku.priceCents)}</td>
                  <td><span className={`pill ${sku.rebuildState}`}>{REBUILD_STATE_LABEL[sku.rebuildState]}</span></td>
                  <td>
                    <div className="row-actions">
                      <Link className="btn-link" to={`/skus/${sku.id}`}>详情</Link>
                      <button className="btn danger" type="button" onClick={() => void remove(sku)}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
