import { SLOT_LABEL, type ShopCategoryDto, type Slot, type StorefrontDto } from '@lingjing/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';

export function ShopPage() {
  const [store, setStore] = useState<StorefrontDto | null>(null);
  const [categories, setCategories] = useState<ShopCategoryDto[]>([]);
  const [shopName, setShopName] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [name, setName] = useState('');
  const [slot, setSlot] = useState<Slot>('top');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);

  async function load() {
    const [nextStore, nextCategories] = await Promise.all([
      api<StorefrontDto>('/api/storefront'),
      api<ShopCategoryDto[]>('/api/shop-categories'),
    ]);
    setStore(nextStore);
    setShopName(nextStore.shopName);
    setAnnouncement(nextStore.announcement);
    setCategories(nextCategories);
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : '店铺加载失败'));
  }, []);

  async function saveStore(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const saved = await api<StorefrontDto>('/api/storefront', {
        method: 'PATCH',
        body: JSON.stringify({ shopName, announcement }),
      });
      setStore(saved);
      setNotice('店铺装修已保存，消费者商城顶部会换成这句。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setPending(false);
    }
  }

  async function addCategory(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await api('/api/shop-categories', { method: 'POST', body: JSON.stringify({ name, slot }) });
      setName('');
      setNotice('已加上分类。把商品归到这一类后，消费者侧栏就能看到。');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '分类没有保存');
    } finally {
      setPending(false);
    }
  }

  async function removeCategory(id: string) {
    if (!window.confirm('删除这个分类？里面的商品会变成未分类。')) return;
    setError('');
    try {
      await api(`/api/shop-categories/${id}`, { method: 'DELETE' });
      setNotice('分类已删除');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  }

  return (
    <section className="stack">
      <div className="page-head">
        <div>
          <h1>店铺</h1>
          <p className="lede muted">这里改的是消费者商城顶部的店名、公告，以及左侧分类。分类按上装或下装，试衣间会按这个部位叠穿。</p>
        </div>
      </div>
      {error ? <div className="banner">{error}</div> : null}
      {notice ? <div className="banner ok">{notice}</div> : null}
      <form className="panel stack" onSubmit={(event) => void saveStore(event)}>
        <h2>装修</h2>
        <label>
          店铺名字
          <input value={shopName} onChange={(event) => setShopName(event.target.value)} maxLength={40} required />
        </label>
        <label>
          公告
          <textarea value={announcement} onChange={(event) => setAnnouncement(event.target.value)} maxLength={120} rows={3} />
        </label>
        <button className="btn primary" disabled={pending || !store} type="submit">保存装修</button>
      </form>
      <section className="panel stack">
        <h2>分类</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>名称</th><th>部位</th><th></th></tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id}>
                  <td>{category.name}</td>
                  <td>{SLOT_LABEL[category.slot]}</td>
                  <td><button className="btn danger" type="button" onClick={() => void removeCategory(category.id)}>删除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="inline-form" onSubmit={(event) => void addCategory(event)}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="新分类，例如外套" maxLength={20} required />
          <select value={slot} onChange={(event) => setSlot(event.target.value as Slot)}>
            <option value="top">上装</option>
            <option value="bottom">下装</option>
          </select>
          <button className="btn primary" disabled={pending} type="submit">添加</button>
        </form>
      </section>
    </section>
  );
}
