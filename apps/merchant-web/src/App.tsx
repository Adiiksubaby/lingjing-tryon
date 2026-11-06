import type { DemoSessionDto } from '@lingjing/shared';
import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { ensureSession } from './api';
import { FullScreen, Shell } from './components/Shell';
import { JobsPage } from './pages/Jobs';
import { SkuCreatePage } from './pages/SkuCreate';
import { SkuDetailPage } from './pages/SkuDetail';
import { ShopPage } from './pages/Shop';
import { SkuListPage } from './pages/SkuList';

export function App() {
  const [session, setSession] = useState<DemoSessionDto | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function boot() {
    setLoading(true);
    setError('');
    try {
      setSession(await ensureSession());
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法连接商户服务');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void boot();
  }, []);

  if (loading) return <FullScreen title="绫境" body="正在连接商户服务…" />;
  if (error || !session) return <FullScreen title="暂时进不去" body={error || '没有拿到演示身份'} onRetry={() => void boot()} />;

  return (
    <BrowserRouter>
      <Shell session={session}>
        <Routes>
          <Route path="/" element={<SkuListPage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/new" element={<SkuCreatePage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/skus/:id" element={<SkuDetailPage />} />
          <Route path="/preview/:id" element={<PreviewRedirect />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}

function PreviewRedirect() {
  const { id } = useParams();
  return <Navigate to={`/skus/${id ?? ''}`} replace />;
}
