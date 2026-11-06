import type { DemoSessionDto } from '@lingjing/shared';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

export function Shell({ session, children }: { session: DemoSessionDto; children: ReactNode }) {
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <div className="seal">绫</div>
          <div>
            <strong>商户工作台</strong>
            <span>{session.name}</span>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/" end>商品</NavLink>
          <NavLink to="/shop">店铺</NavLink>
          <NavLink to="/new">新建商品</NavLink>
          <NavLink to="/jobs">重建任务</NavLink>
        </nav>
        <p className="side-foot">演示令牌 demo-merchant。鉴权是占位的，不要当成生产登录。</p>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

export function FullScreen({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  return (
    <div className="full">
      <div className="full-card">
        <h1>{title}</h1>
        <p className="muted">{body}</p>
        {onRetry ? <button className="btn primary" onClick={onRetry}>重试</button> : null}
      </div>
    </div>
  );
}
