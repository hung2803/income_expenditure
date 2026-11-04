import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, CirclePlus, Pencil, RotateCcw, Search, Trash2 } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { formatVnd } from './finance-data';
import type { Category } from './finance-data';
import { FinanceToast } from './FinanceToast';
import { useFinanceToast } from './use-finance-toast';
import type { Transaction, TransactionType } from './transactions-data';
import { syncOutbox } from '@/infrastructure/sync/sync-engine';
import { enqueueLocalMutation } from '@/infrastructure/sync/sync-storage';
import './finance.css';
import { localMonthKey } from './budgets-data';
import { DeleteTransactionDialog } from './DeleteTransactionDialog';
import { useTransactionData } from './use-transaction-data';
import type { TransactionFormState } from './TransactionFormPage';

type Filter = 'ALL' | TransactionType;
const undoDuration = 10_000;

function dateHeading(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const dayKey = (item: Date) => `${item.getFullYear()}-${item.getMonth()}-${item.getDate()}`;
  if (dayKey(date) === dayKey(today)) return 'Hôm nay';
  if (dayKey(date) === dayKey(yesterday)) return 'Hôm qua';
  return new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export function TransactionsPage() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCategoryId = searchParams.get('categoryId') ?? '';
  const selectedMonth = searchParams.get('month') ?? '';
  const selectedTransactionId = searchParams.get('transactionId') ?? '';
  const selectedType = searchParams.get('type') === 'INCOME' || searchParams.get('type') === 'EXPENSE' ? searchParams.get('type') : '';
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [pendingUndo, setPendingUndo] = useState<Transaction | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);
  const { toast, showToast } = useFinanceToast();
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  // Form quay lại đúng danh sách (giữ bộ lọc) nhờ state.from.
  const formState: TransactionFormState = { from: location.pathname + location.search };
  const { categories, wallets: walletList, transactions, setTransactions, loaded } = useTransactionData(userId, session?.csrfToken ?? '', () => showToast('Không tải được giao dịch. Hãy thử tải lại.'));

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  // Liên kết cũ `/transactions?transactionId=` chuyển sang màn hình sửa riêng.
  useEffect(() => {
    if (selectedTransactionId) navigate(`/transactions/${encodeURIComponent(selectedTransactionId)}`, { replace: true });
  }, [selectedTransactionId, navigate]);

  const categoriesById = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);
  const visibleTransactions = useMemo(() => transactions.filter((item) => {
    if (filter !== 'ALL' && item.type !== filter) return false;
    if (selectedType && item.type !== selectedType) return false;
    if (selectedCategoryId && item.categoryId !== selectedCategoryId) return false;
    if (selectedMonth && localMonthKey(new Date(item.occurredAt)) !== selectedMonth) return false;
    const query = search.trim().toLocaleLowerCase('vi');
    if (!query) return true;
    const category = categoriesById.get(item.categoryId)?.name ?? '';
    return [item.note, category, ...item.tags].some((value) => value.toLocaleLowerCase('vi').includes(query));
  }), [transactions, filter, search, categoriesById, selectedCategoryId, selectedMonth, selectedType]);

  const groups = useMemo(() => {
    const result: Array<{ heading: string; items: Transaction[] }> = [];
    for (const item of visibleTransactions) {
      const heading = dateHeading(item.occurredAt);
      const group = result.at(-1);
      if (group?.heading === heading) group.items.push(item);
      else result.push({ heading, items: [item] });
    }
    return result;
  }, [visibleTransactions]);

  if (!session) return null;

  async function removeTransaction(transaction: Transaction) {
    await enqueueLocalMutation({ ownerUserId: userId, entity: 'transactions', operation: 'delete', recordId: transaction.id, payload: { revision: transaction.revision ?? 1 }, value: transaction, deleted: true });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setTransactions((current) => current.filter((item) => item.id !== transaction.id));
    // Delete advances the server revision once. Undo must use that revision,
    // including when both operations are queued offline and sent in order.
    setPendingUndo({ ...transaction, revision: (transaction.revision ?? 1) + 1 });
    undoTimer.current = setTimeout(() => setPendingUndo(null), undoDuration);
    void syncOutbox(userId, session!.csrfToken).catch(() => showToast('Thao tác xóa được giữ trên thiết bị và sẽ thử đồng bộ lại.'));
  }

  async function undoDelete() {
    if (!pendingUndo) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    try {
      const restored = { ...pendingUndo, updatedAt: new Date().toISOString(), revision: (pendingUndo.revision ?? 0) + 1 };
      await enqueueLocalMutation({ ownerUserId: userId, entity: 'transactions', operation: 'undo', recordId: pendingUndo.id, payload: {
        revision: pendingUndo.revision ?? 1, type: restored.type, amount: restored.amount, categoryId: restored.categoryId,
        walletId: restored.walletId, occurredAt: restored.occurredAt, note: restored.note, tags: restored.tags
      }, value: restored });
      setTransactions((current) => [restored, ...current].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)));
      setPendingUndo(null);
      void syncOutbox(userId, session!.csrfToken);
    } catch { showToast('Không thể hoàn tác. Có thể đã quá 10 giây.'); setPendingUndo(null); }
  }

  return <>
    <div className="transaction-page-heading">
      <div><h1>Giao dịch</h1><p>Theo dõi các khoản thu chi của bạn</p></div>
      <Link to="/search" className="transaction-advanced-link" aria-label="Tìm kiếm nâng cao"><Search aria-hidden="true" /><span>Tìm kiếm</span></Link>
      <Link to="/transactions/new" state={formState} className="transaction-add-button"><CirclePlus aria-hidden="true" /><span>Thêm</span></Link>
    </div>
    <div className="transaction-filters" role="tablist" aria-label="Lọc giao dịch">
      {([['ALL', 'Tất cả'], ['INCOME', 'Thu'], ['EXPENSE', 'Chi']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={filter === value} className={filter === value ? 'transaction-filter transaction-filter-active' : 'transaction-filter'} onClick={() => setFilter(value)}>{label}</button>)}
    </div>
    {(selectedCategoryId || selectedMonth || selectedType) && <div className="transaction-budget-filter"><span>Giao dịch liên quan{selectedMonth ? ` · ${selectedMonth}` : ''}{selectedCategoryId ? ` · ${categoriesById.get(selectedCategoryId)?.name ?? 'Danh mục'}` : ''}{selectedType ? ' · Chi' : ''}</span><button type="button" onClick={() => setSearchParams({})}>Xóa bộ lọc</button></div>}
    <label className="transaction-search"><Search aria-hidden="true" /><span className="sr-only">Tìm giao dịch</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm ghi chú, danh mục hoặc nhãn" /></label>
    <FinanceToast toast={toast} />
    {loaded && walletList.length === 0 && <div className="transaction-notice" role="status">Cần kết nối mạng lần đầu để chuẩn bị sổ thu chi. Hãy kéo xuống để thử lại.</div>}
    {groups.length === 0 ? <div className="account-empty transaction-empty"><span className="account-empty-icon"><CalendarDays aria-hidden="true" /></span><h2>{transactions.length ? 'Không tìm thấy giao dịch' : 'Chưa có giao dịch nào'}</h2><p>{transactions.length ? 'Thử đổi bộ lọc hoặc từ khóa tìm kiếm.' : 'Ghi khoản thu hoặc chi đầu tiên để bắt đầu theo dõi tài chính.'}</p>{transactions.length === 0 && walletList.length > 0 && <Link to="/transactions/new" state={formState} className="account-primary-button"><CirclePlus aria-hidden="true" />Thêm giao dịch</Link>}</div> : groups.map((group) => <section className="transaction-group" key={group.heading}>
      <div className="transaction-group-heading"><h2>{group.heading}</h2><span>{group.items.length} giao dịch</span></div>
      <div className="transaction-list">{group.items.map((item) => <TransactionRow key={item.id} transaction={item} category={categoriesById.get(item.categoryId)} onEdit={() => navigate(`/transactions/${encodeURIComponent(item.id)}`, { state: formState })} onDelete={() => setPendingDelete(item)} />)}</div>
    </section>)}
    {pendingUndo && <div className="transaction-undo" role="status"><span>Đã xóa giao dịch.</span><button type="button" onClick={undoDelete}><RotateCcw aria-hidden="true" />Hoàn tác</button></div>}
    {pendingDelete && <DeleteTransactionDialog transaction={pendingDelete} onClose={() => setPendingDelete(null)} onConfirm={() => removeTransaction(pendingDelete)} />}
  </>;
}

function TransactionRow({ transaction, category, onEdit, onDelete }: { transaction: Transaction; category?: Category; onEdit: () => void; onDelete: () => void }) {
  const income = transaction.type === 'INCOME';
  const time = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date(transaction.occurredAt));
  return <article className="transaction-row">
    <span className={income ? 'transaction-kind transaction-kind-income' : 'transaction-kind transaction-kind-expense'}>{income ? <ArrowDown aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}</span>
    <div className="transaction-row-copy"><strong>{transaction.note.trim() || category?.name || (income ? 'Khoản thu' : 'Khoản chi')}</strong><span>{category?.name ?? 'Danh mục đã xóa'} <span aria-hidden="true">·</span> {time}</span>{transaction.tags.length > 0 && <small>{transaction.tags.map((tag) => `#${tag}`).join(' ')}</small>}</div>
    <div className="transaction-row-end"><strong className={income ? 'transaction-amount-income' : 'transaction-amount-expense'}>{income ? '+' : '−'}{formatVnd(transaction.amount)}</strong><div><button type="button" aria-label={`Sửa giao dịch ${transaction.note || category?.name || ''}`} onClick={onEdit}><Pencil aria-hidden="true" /></button><button type="button" aria-label={`Xóa giao dịch ${transaction.note || category?.name || ''}`} onClick={onDelete}><Trash2 aria-hidden="true" /></button></div></div>
  </article>;
}
