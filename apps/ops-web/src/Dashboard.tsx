import {
  JOB_STATUS_LABEL,
  formatDateTime,
  formatPercent,
  type DemoSessionDto,
  type JobStatus,
  type MetricsDto,
} from '@lingjing/shared';
import { useEffect, useState } from 'react';
import { api, ensureSession } from './api';

export function Dashboard() {
  const [session, setSession] = useState<DemoSessionDto | null>(null);
  const [metrics, setMetrics] = useState<MetricsDto | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function boot() {
    setError('');
    try {
      const nextSession = session ?? (await ensureSession());
      setSession(nextSession);
      setMetrics(await api<MetricsDto>('/api/metrics'));
    } catch (err) {
      setError(err instanceof Error ? err.message : '看板加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void boot();
    const timer = window.setInterval(() => void boot(), 4000);
    return () => window.clearInterval(timer);
  }, []);

  const max = Math.max(1, ...(metrics?.funnel.map((item) => item.count) ?? [1]));

  return (
    <main className="page">
      <header className="mast">
        <div className="brand">
          <div className="seal">绫</div>
          <div>
            <h1>运营看板</h1>
            <p className="muted">{session ? `${session.name} · 演示令牌 demo-ops` : '正在连接…'}</p>
          </div>
        </div>
        <button className="btn" type="button" onClick={() => void boot()}>刷新</button>
      </header>
      <p className="muted">上传成功率、重建队列、试穿会话和加购漏斗。历史数字是演示基线，商户台上新和消费者试穿会累加进来。</p>
      {error ? <p className="banner">{error} <button className="btn" type="button" onClick={() => void boot()}>重试</button></p> : null}
      {loading && !metrics ? <p className="muted">看板加载中…</p> : null}
      {metrics ? (
        <>
          <section className="kpis">
            <article className="kpi">
              <span>上传成功率</span>
              <strong>{formatPercent(metrics.uploadSuccessRate)}</strong>
              <em>{metrics.uploadSucceeded} 成功 / {metrics.uploadFailed} 失败</em>
            </article>
            <article className="kpi">
              <span>重建队列</span>
              <strong>{metrics.rebuildQueueDepth}</strong>
              <em>{metrics.rebuildRunning} 个正在重建</em>
            </article>
            <article className="kpi">
              <span>试穿会话</span>
              <strong>{metrics.tryOnSessions}</strong>
              <em>含历史基线，实时会话另计</em>
            </article>
            <article className="kpi">
              <span>身材档案</span>
              <strong>{metrics.profiles}</strong>
              <em>消费者保存的量体份数</em>
            </article>
            <article className="kpi">
              <span>加购</span>
              <strong>{metrics.funnel.at(-1)?.count ?? 0}</strong>
              <em>更新于 {formatDateTime(metrics.updatedAt)}</em>
            </article>
          </section>
          <section className="panels">
            <article className="panel">
              <h2>试穿漏斗</h2>
              <div className="funnel">
                {metrics.funnel.map((item, index) => {
                  const previous = index === 0 ? item.count : metrics.funnel[index - 1]?.count ?? item.count;
                  const rate = previous ? item.count / previous : 0;
                  return (
                    <div className="funnel-row" key={item.key}>
                      <span>{item.label}</span>
                      <div className="track"><span style={{ width: `${(item.count / max) * 100}%` }} /></div>
                      <strong>{item.count}</strong>
                      <em>{index === 0 ? '起点' : formatPercent(rate)}</em>
                    </div>
                  );
                })}
              </div>
            </article>
            <article className="panel">
              <h2>最近重建</h2>
              {metrics.recentJobs.length === 0 ? <p className="empty">队列是空的。</p> : (
                <table>
                  <thead><tr><th>商品</th><th>状态</th><th>时间</th></tr></thead>
                  <tbody>
                    {metrics.recentJobs.map((job) => (
                      <tr key={job.id}>
                        <td>{job.skuName}{job.origin === 'seed' ? <div className="tag">示例</div> : null}</td>
                        <td><span className={`pill ${job.status}`}>{JOB_STATUS_LABEL[job.status as JobStatus]}</span></td>
                        <td>{formatDateTime(job.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </article>
          </section>
          <section className="panel">
            <h2>最近试穿</h2>
            {metrics.recentSessions.length === 0 ? <p className="empty">还没有试穿会话。</p> : (
              <table>
                <thead><tr><th>用户</th><th>搭配</th><th>来源</th><th>时间</th></tr></thead>
                <tbody>
                  {metrics.recentSessions.map((sessionRow) => (
                    <tr key={sessionRow.id}>
                      <td>{sessionRow.nickname}</td>
                      <td>{sessionRow.outfitName ?? '尚未搭配'}</td>
                      <td>{sessionRow.origin === 'seed' ? '样例' : '实时'}</td>
                      <td>{formatDateTime(sessionRow.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
