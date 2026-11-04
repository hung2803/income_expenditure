import { usePageLoader } from '@/hooks/use-page-loader';
import { useEffect, useRef, useState } from 'react';
import { useModalDialog } from '@/hooks/use-modal-dialog';
import type { FormEvent } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, Pencil, Plus, Tag, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { Button } from '@/components/ui/button';
import { isDuplicateName } from './finance-data';
import type { Category, CategoryType } from './finance-data';
import { FinanceToast } from './FinanceToast';
import { useFinanceToast } from './use-finance-toast';
import { financeApi } from '@/infrastructure/api/finance';
import type { ApiCategory } from '@/infrastructure/api/finance';
import { cacheRemoteList, listLocalRecords } from '@/infrastructure/sync/sync-storage';
import './finance.css';

const categoryIconColors = ['category-icon-orange', 'category-icon-blue', 'category-icon-violet', 'category-icon-teal', 'category-icon-pink', 'category-icon-cyan', 'category-icon-amber', 'category-icon-gray'];

export function CategoriesPage() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [allCategories, setAllCategories] = useState<ApiCategory[]>([]);
  const [type, setType] = useState<CategoryType>('EXPENSE');
  const [editing, setEditing] = useState<Category | null>(null);
  const { toast, showToast } = useFinanceToast();
  usePageLoader(async (controller, refreshing) => {
    await financeApi.listCategories(userId, controller.signal).then(async (items) => {
      const local = await cacheRemoteList(userId, 'categories', items, controller.signal);
      if (!controller.signal.aborted) setAllCategories(local);
    }).catch(async (error: unknown) => {
      if (controller.signal.aborted) return;
      if (refreshing) throw error;
      try { const records = await listLocalRecords<ApiCategory>(userId, 'categories'); if (!controller.signal.aborted) setAllCategories(records.map((item) => item.value)); }
      catch { showToast('Không tải được danh mục. Hãy thử kết nối lại.'); }
    });
  }, userId);
  if (!session) return null;
  const categories = allCategories.filter((category) => category.type === type);
  const isExpense = type === 'EXPENSE';

  async function saveCategory(category: Category) {
    const saved = editing?.id
      ? await financeApi.updateCategory(userId, editing.id, { name: category.name, type: category.type }, session!.csrfToken)
      : await financeApi.createCategory(userId, { name: category.name, type: category.type }, session!.csrfToken);
    setAllCategories((current) => editing?.id ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
  }

  async function removeCategory(category: Category) {
    if (category.isDefault) return;
    if (!window.confirm(`Xóa danh mục “${category.name}”?`)) return;
    try {
      await financeApi.deleteCategory(userId, category.id, session!.csrfToken);
      setAllCategories((current) => current.filter((item) => item.id !== category.id));
      showToast('Đã xóa danh mục.', 'success');
    } catch { showToast('Không xóa được danh mục đang được giao dịch sử dụng.'); }
  }

  return <>
    <div className="category-page-heading"><Link to="/wallets" className="wallet-back" aria-label="Quay lại ví"><ChevronLeft /></Link><div><h1>Quản lý danh mục</h1><p>Tạo và quản lý danh mục thu chi của bạn</p></div></div>
    <FinanceToast toast={toast} />
    <div className="category-type-tabs" role="tablist" aria-label="Loại danh mục">
      <button type="button" role="tab" aria-selected={isExpense} className={isExpense ? 'category-type-tab category-type-active expense' : 'category-type-tab'} onClick={() => setType('EXPENSE')}><ArrowUp aria-hidden="true" />Danh mục chi</button>
      <button type="button" role="tab" aria-selected={!isExpense} className={!isExpense ? 'category-type-tab category-type-active income' : 'category-type-tab'} onClick={() => setType('INCOME')}><ArrowDown aria-hidden="true" />Danh mục thu</button>
    </div>
    <section className={`category-panel ${isExpense ? 'category-expense-panel' : 'category-income-panel'}`}>
      <header className="category-panel-heading"><span className={`category-panel-icon ${isExpense ? 'category-panel-expense-icon' : 'category-panel-income-icon'}`}>{isExpense ? <ArrowDown /> : <ArrowUp />}</span><div><h2>Danh mục {isExpense ? 'chi' : 'thu'}</h2><p>{categories.length} danh mục</p></div><Button variant="outline" size="sm" onClick={() => setEditing({ id: '', name: '', type, isDefault: false })}><Plus />Thêm danh mục</Button></header>
      {categories.length === 0 ? <div className="category-empty"><Tag /><p>Chưa có danh mục. Thêm danh mục đầu tiên của bạn.</p></div> : <div className="category-list">
        {categories.map((category, index) => <article className="category-row" key={category.id}><span className="category-order" aria-hidden="true">⠿</span><span className={`category-item-icon ${categoryIconColors[index % categoryIconColors.length]}`}><Tag aria-hidden="true" /></span><div className="category-item-name"><strong>{category.name}</strong>{category.isDefault && <small>Mặc định</small>}</div><button type="button" className="category-action-edit" aria-label={`Sửa danh mục ${category.name}`} onClick={() => setEditing(category)}><Pencil /></button><button type="button" className="category-action-delete" aria-label={`Xóa danh mục ${category.name}`} title={category.isDefault ? 'Danh mục mặc định được giữ lại' : undefined} disabled={category.isDefault} onClick={() => removeCategory(category)}><Trash2 /></button></article>)}
      </div>}
    </section>
    <aside className="category-note"><span className="category-note-icon">i</span><div><strong>Lưu ý</strong><p>Danh mục mặc định luôn được giữ lại. Danh mục có giao dịch liên quan sẽ được bảo vệ khi tính năng giao dịch được kết nối.</p></div></aside>
    {editing && <CategoryDialog key={editing.id || `new-${type}`} category={editing.id ? editing : null} type={type} categories={categories} onClose={() => setEditing(null)} onSave={saveCategory} />}
  </>;
}

function CategoryDialog({ category, type, categories, onClose, onSave }: { category: Category | null; type: CategoryType; categories: Category[]; onClose: () => void; onSave: (category: Category) => Promise<void> }) {
  const [name, setName] = useState(category?.name ?? '');
  const { toast, showToast } = useFinanceToast();
  const dialog = useModalDialog();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 32) { showToast('Tên danh mục cần từ 1 đến 32 ký tự.'); return; }
    if (isDuplicateName(cleanName, categories, category?.id)) { showToast('Tên này đã có trong nhóm danh mục.'); return; }
    try {
      await onSave({ id: category?.id ?? '', name: cleanName, type, isDefault: category?.isDefault ?? false });
      showToast('Danh mục đã được lưu.', 'success', 1000);
      closeTimer.current = setTimeout(onClose, 1000);
    } catch { showToast('Không lưu được danh mục. Có thể tên này đã được sử dụng.'); }
  }

  return <dialog ref={dialog} className="account-dialog finance-dialog" onCancel={onClose} aria-labelledby="category-dialog-title">
    <button className="account-dialog-close" type="button" aria-label="Đóng" onClick={onClose}><X /></button>
    <div className="finance-dialog-heading"><span className="account-empty-icon"><Tag /></span><h2 id="category-dialog-title">{category ? 'Chỉnh sửa danh mục' : 'Thêm danh mục'}</h2><p>Danh mục {type === 'EXPENSE' ? 'chi tiêu' : 'thu nhập'}.</p></div>
    <FinanceToast toast={toast} />
    <form onSubmit={submit} className="finance-form"><label className="finance-field"><span>Tên danh mục</span><input autoFocus maxLength={32} value={name} onChange={(event) => setName(event.target.value)} placeholder={type === 'EXPENSE' ? 'Ví dụ: Ăn uống' : 'Ví dụ: Lương'} /></label><div className="finance-dialog-actions"><button type="button" className="account-secondary-button" onClick={onClose}>Hủy</button><button type="submit" className="account-primary-button" disabled={toast?.type === 'success'}>Lưu danh mục</button></div></form>
  </dialog>;
}
