import { formatDateTime, type JobDto } from '@lingjing/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { StatusPill } from '../components/StatusPill';

export function JobsPage() {
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setJobs(await api<JobDto[]>('/api/jobs'));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '任务加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 1200);
    return () => window.clearInterval(timer);
  }, []);

  async function rebuild(skuId: string) {
    try {
      await api(`/api/skus/${skuId}/jobs`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法重新排队');
    }
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>重建任务</h1>
          <p className="muted lede">演示重建会按「接收、核对、轮廓、网格、发布」往前走，大约几秒。失败原因写在任务上，可以重试。</p>
        </div>
      </header>
      {error ? <p className="banner">{error}</p> : null}
      {loading ? <p className="muted">正在读取队列…</p> : null}
      {!loading && jobs.length === 0 ? <p className="empty">还没有重建任务。去新建一个商品，系统会排队生成占位样衣。</p> : null}
      {jobs.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>商品</th>
                <th>状态</th>
                <th>阶段</th>
                <th>进度</th>
                <th>创建</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <strong>{job.skuName}</strong>
                    {job.error ? <div className="tag">{job.error}</div> : null}
                    {job.origin === 'seed' ? <div className="tag">示例</div> : null}
                  </td>
                  <td><StatusPill kind="job" status={job.status} /></td>
                  <td>{job.stageLabel ?? '—'}</td>
                  <td>
                    {job.progress}%
                    {job.logs.at(-1) ? <div className="tag">{job.logs.at(-1)?.message}</div> : null}
                  </td>
                  <td>{formatDateTime(job.createdAt)}</td>
                  <td>
                    <div className="row-actions">
                      <Link className="btn-link" to={`/skus/${job.skuId}`}>详情</Link>
                      <button className="btn ghost" type="button" onClick={() => void rebuild(job.skuId)} disabled={job.status === 'queued' || job.status === 'running'}>
                        重新重建
                      </button>
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
