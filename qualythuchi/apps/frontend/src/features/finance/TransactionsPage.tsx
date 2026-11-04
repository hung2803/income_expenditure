import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, CirclePlus, Pencil, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { createId, formatVnd } from './finance-data';
import type { Category, Wallet } from './finance-data';
import { FinanceToast } from './FinanceToast';
import { useFinanceToast } from './use-finance-toast';
import { parseTransactionAmount, parseTransactionTags } from './transactions-data';
import { formatVndInput } from './finance-rules';
import { VndInput } from './VndInput';
import type { Transaction, TransactionType } from './transactions-data';
import { financeApi } from '@/infrastructure/api/finance';
import { syncOutbox } from '@/infrastructure/sync/sync-engine';
import { enqueueLocalMutation, listLocalRecords, putLocalRecord } from '@/infrastructure/sync/sync-storage';
import './finance.css';
import { localMonthKey } from './budgets-data';

type Filter = 'ALL' | TransactionType;
type Draft = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;
const undoDuration = 10_000;

function localDateTime(value = new Date()): string {
  const date = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

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
  const [categories, setCategories] = useState<Category[]>([]);
  const [walletList, setWalletList] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Transaction | null | undefined>(undefined);
  const [pendingUndo, setPendingUndo] = useState<Transaction | null>(null);
  const { toast, showToast } = useFinanceToast();
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      financeApi.listCategories(userId, controller.signal),
      financeApi.listWallets(userId, controller.signal),
      financeApi.listTransactions(userId, controller.signal)
    ]).then(([nextCategories, nextWallets, nextTransactions]) => {
      setCategories(nextCategories);
      setWalletList(nextWallets);
      setTransactions(nextTransactions);
      void Promise.all([
        ...nextCategories.map((item) => putLocalRecord({ key: `categories:${item.id}`, ownerUserId: userId, entity: 'categories', id: item.id, value: item, updatedAt: Date.now() })),
        ...nextWallets.map((item) => putLocalRecord({ key: `wallets:${item.id}`, ownerUserId: userId, entity: 'wallets', id: item.id, value: item, updatedAt: Date.now() })),
        ...nextTransactions.map((item) => putLocalRecord({ key: `transactions:${item.id}`, ownerUserId: userId, entity: 'transactions', id: item.id, value: item, updatedAt: Date.now() }))
      ]);
      void listLocalRecords<Transaction>(userId, 'transactions').then((records) => {
        if (controller.signal.aborted) return;
        setTransactions((remote) => records.reduce((items, record) => {
          const next = items.filter((item) => item.id !== record.id);
          return record.deleted ? next : [record.value, ...next];
        }, remote).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)));
      });
    }).catch(async () => {
      if (controller.signal.aborted) return;
      try {
        const [savedCategories, savedWallets, savedTransactions] = await Promise.all([
          listLocalRecords<Category>(userId, 'categories'), listLocalRecords<Wallet>(userId, 'wallets'), listLocalRecords<Transaction>(userId, 'transactions')
        ]);
        setCategories(savedCategories.map((item) => item.value));
        setWalletList(savedWallets.map((item) => item.value));
        setTransactions(savedTransactions.filter((item) => !item.deleted).map((item) => item.value));
      } catch { showToast('Không tải được giao dịch. Hãy thử tải lại.'); }
    });
    return () => { controller.abort(); if (undoTimer.current) clearTimeout(undoTimer.current); };
  }, [userId, showToast]);

  useEffect(() => {
    if (!selectedTransactionId) return;
    const transaction = transactions.find((item) => item.id === selectedTransactionId);
    if (transaction) setEditing(transaction);
  }, [selectedTransactionId, transactions]);

  const categoriesById = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);
  const wallets = useMemo(() => new Map(walletList.map((item) => [item.id, item])), [walletList]);
  const visibleTransactions = useMemo(() => transactions.filter((item) => {
    if (filter !== 'ALL' && item.type !== filter) return false;
    if (selectedType && item.type !== selectedType) return false;
    if (selectedCategoryId && item.categoryId !== selectedCategoryId) return false;
    if (selectedMonth && localMonthKey(new Date(item.occurredAt)) !== selectedMonth) return false;
    const query = search.trim().toLocaleLowerCase('vi');
    if (!query) return true;
    const category = categoriesById.get(item.categoryId)?.name ?? '';
    const wallet = wallets.get(item.walletId)?.name ?? '';
    return [item.note, category, wallet, ...item.tags].some((value) => value.toLocaleLowerCase('vi').includes(query));
  }), [transactions, filter, search, categoriesById, wallets, selectedCategoryId, selectedMonth, selectedType]);

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

  async function saveDraft(draft: Draft): Promise<string | null> {
    try {
      const now = new Date().toISOString();
      const id = editing?.id ?? createId();
      const revision = (editing?.revision ?? 0) + 1;
      const value: Transaction = { ...editing, ...draft, id, createdAt: editing?.createdAt ?? now, updatedAt: now, revision };
      const operation = editing ? 'update' : 'create';
      const payload = editing ? { ...draft, revision: editing.revision ?? 1 } : { ...draft, id };
      await enqueueLocalMutation({ ownerUserId: userId, entity: 'transactions', operation, recordId: id, payload, value });
      setTransactions((current) => [value, ...current.filter((item) => item.id !== id)].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)));
      void syncOutbox(userId, session!.csrfToken);
      return null;
    } catch {
      return 'Không lưu được giao dịch. Hãy kiểm tra kết nối và thử lại.';
    }
  }

  async function removeTransaction(transaction: Transaction) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    try {
      await enqueueLocalMutation({ ownerUserId: userId, entity: 'transactions', operation: 'delete', recordId: transaction.id, payload: { revision: transaction.revision ?? 1 }, value: transaction, deleted: true });
      setTransactions((current) => current.filter((item) => item.id !== transaction.id));
      setPendingUndo(transaction);
      undoTimer.current = setTimeout(() => setPendingUndo(null), undoDuration);
      void syncOutbox(userId, session!.csrfToken);
    } catch { showToast('Không xóa được giao dịch. Hãy thử lại.'); }
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
      <button type="button" className="transaction-add-button" onClick={() => setEditing(null)}><CirclePlus aria-hidden="true" /><span>Thêm</span></button>
    </div>
    <div className="transaction-filters" role="tablist" aria-label="Lọc giao dịch">
      {([['ALL', 'Tất cả'], ['INCOME', 'Thu'], ['EXPENSE', 'Chi']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={filter === value} className={filter === value ? 'transaction-filter transaction-filter-active' : 'transaction-filter'} onClick={() => setFilter(value)}>{label}</button>)}
    </div>
    {(selectedCategoryId || selectedMonth || selectedType) && <div className="transaction-budget-filter"><span>Giao dịch liên quan{selectedMonth ? ` · ${selectedMonth}` : ''}{selectedCategoryId ? ` · ${categoriesById.get(selectedCategoryId)?.name ?? 'Danh mục'}` : ''}{selectedType ? ' · Chi' : ''}</span><button type="button" onClick={() => setSearchParams({})}>Xóa bộ lọc</button></div>}
    <label className="transaction-search"><Search aria-hidden="true" /><span className="sr-only">Tìm giao dịch</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm ghi chú, danh mục, ví hoặc nhãn" /></label>
    <FinanceToast toast={toast} />
    {walletList.length === 0 && <div className="transaction-notice" role="status">Bạn cần tạo ví trước khi ghi giao dịch. <Link to="/wallets">Quản lý ví</Link></div>}
    {groups.length === 0 ? <div className="account-empty transaction-empty"><span className="account-empty-icon"><CalendarDays aria-hidden="true" /></span><h2>{transactions.length ? 'Không tìm thấy giao dịch' : 'Chưa có giao dịch nào'}</h2><p>{transactions.length ? 'Thử đổi bộ lọc hoặc từ khóa tìm kiếm.' : 'Ghi khoản thu hoặc chi đầu tiên để bắt đầu theo dõi tài chính.'}</p>{transactions.length === 0 && walletList.length > 0 && <button type="button" className="account-primary-button" onClick={() => setEditing(null)}><CirclePlus aria-hidden="true" />Thêm giao dịch</button>}</div> : groups.map((group) => <section className="transaction-group" key={group.heading}>
      <div className="transaction-group-heading"><h2>{group.heading}</h2><span>{group.items.length} giao dịch</span></div>
      <div className="transaction-list">{group.items.map((item) => <TransactionRow key={item.id} transaction={item} category={categoriesById.get(item.categoryId)} wallet={wallets.get(item.walletId)} onEdit={() => setEditing(item)} onDelete={() => removeTransaction(item)} />)}</div>
    </section>)}
    {pendingUndo && <div className="transaction-undo" role="status"><span>Đã xóa giao dịch.</span><button type="button" onClick={undoDelete}><RotateCcw aria-hidden="true" />Hoàn tác</button></div>}
    {editing !== undefined && <TransactionDialog key={editing?.id ?? 'new'} transaction={editing} categories={categories} wallets={walletList} onClose={() => { setEditing(undefined); if (selectedTransactionId) setSearchParams((current) => { current.delete('transactionId'); return current; }); }} onSave={saveDraft} />}
  </>;
}

function TransactionRow({ transaction, category, wallet, onEdit, onDelete }: { transaction: Transaction; category?: Category; wallet?: Wallet; onEdit: () => void; onDelete: () => void }) {
  const income = transaction.type === 'INCOME';
  const time = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date(transaction.occurredAt));
  return <article className="transaction-row">
    <span className={income ? 'transaction-kind transaction-kind-income' : 'transaction-kind transaction-kind-expense'}>{income ? <ArrowDown aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}</span>
    <div className="transaction-row-copy"><strong>{transaction.note.trim() || category?.name || (income ? 'Khoản thu' : 'Khoản chi')}</strong><span>{wallet?.name ?? 'Ví đã xóa'} <span aria-hidden="true">·</span> {category?.name ?? 'Danh mục đã xóa'} <span aria-hidden="true">·</span> {time}</span>{transaction.tags.length > 0 && <small>{transaction.tags.map((tag) => `#${tag}`).join(' ')}</small>}</div>
    <div className="transaction-row-end"><strong className={income ? 'transaction-amount-income' : 'transaction-amount-expense'}>{income ? '+' : '−'}{formatVnd(transaction.amount)}</strong><div><button type="button" aria-label={`Sửa giao dịch ${transaction.note || category?.name || ''}`} onClick={onEdit}><Pencil aria-hidden="true" /></button><button type="button" aria-label={`Xóa giao dịch ${transaction.note || category?.name || ''}`} onClick={onDelete}><Trash2 aria-hidden="true" /></button></div></div>
  </article>;
}

function TransactionDialog({ transaction, categories, wallets, onClose, onSave }: { transaction: Transaction | null; categories: Category[]; wallets: Wallet[]; onClose: () => void; onSave: (draft: Draft) => Promise<string | null> }) {
  const [type, setType] = useState<TransactionType>(transaction?.type ?? 'EXPENSE');
  const [amount, setAmount] = useState(transaction ? formatVndInput(String(transaction.amount)) : '');
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? '');
  const [walletId, setWalletId] = useState(transaction?.walletId ?? wallets[0]?.id ?? '');
  const [occurredAt, setOccurredAt] = useState(transaction?.occurredAt ? localDateTime(new Date(transaction.occurredAt)) : localDateTime());
  const [note, setNote] = useState(transaction?.note ?? '');
  const [tags, setTags] = useState(transaction?.tags.join(', ') ?? '');
  const [success, setSuccess] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast, showToast } = useFinanceToast();
  const matchingCategories = categories.filter((item) => item.type === type);

  useEffect(() => {
    const element = dialog.current;
    if (element) {
      element.setAttribute('autofocus', '');
      element.showModal();
    }
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      element?.close();
    };
  }, []);
  useEffect(() => {
    const available = categories.filter((item) => item.type === type);
    if (!available.some((item) => item.id === categoryId)) setCategoryId(available[0]?.id ?? '');
  }, [type, categories, categoryId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (wallets.length === 0) {
      showToast('Bạn cần tạo ví trước khi lưu giao dịch.');
      return;
    }
    const parsedAmount = parseTransactionAmount(amount);
    if (parsedAmount === undefined) { showToast('Số tiền phải là số nguyên VND lớn hơn 0.'); return; }
    if (!categoryId || !matchingCategories.some((item) => item.id === categoryId)) { showToast('Hãy chọn danh mục phù hợp với loại giao dịch.'); return; }
    if (!walletId || !wallets.some((item) => item.id === walletId)) { showToast('Hãy chọn ví đang hoạt động.'); return; }
    const date = new Date(occurredAt);
    if (!occurredAt || Number.isNaN(date.getTime())) { showToast('Ngày giờ giao dịch không hợp lệ.'); return; }
    if (note.length > 200) { showToast('Ghi chú tối đa 200 ký tự.'); return; }
    const saveError = await onSave({ type, amount: parsedAmount, categoryId, walletId, occurredAt: date.toISOString(), note: note.trim(), tags: parseTransactionTags(tags) });
    if (saveError) showToast(saveError);
    else {
      setSuccess(true);
      showToast('Giao dịch đã được lưu.', 'success', 1100);
      closeTimer.current = setTimeout(onClose, 1100);
    }
  }

  return <dialog ref={dialog} tabIndex={-1} className="account-dialog finance-dialog transaction-dialog" onCancel={onClose} aria-labelledby="transaction-dialog-title">
    <button className="account-dialog-close" type="button" aria-label="Đóng" onClick={onClose}><X aria-hidden="true" /></button>
    <div className="finance-dialog-heading"><span className="account-empty-icon"><CirclePlus aria-hidden="true" /></span><h2 id="transaction-dialog-title">{transaction ? 'Sửa giao dịch' : 'Thêm giao dịch'}</h2><p>Nhập thông tin thu chi của bạn.</p></div>
    <FinanceToast toast={toast} />
    <form className="finance-form" onSubmit={submit}>
      <div className="transaction-type-picker" role="group" aria-label="Loại giao dịch">
        <button type="button" aria-pressed={type === 'EXPENSE'} className={type === 'EXPENSE' ? 'transaction-type-active transaction-type-expense' : ''} onClick={() => setType('EXPENSE')}><ArrowUp aria-hidden="true" />Chi</button>
        <button type="button" aria-pressed={type === 'INCOME'} className={type === 'INCOME' ? 'transaction-type-active transaction-type-income' : ''} onClick={() => setType('INCOME')}><ArrowDown aria-hidden="true" />Thu</button>
      </div>
      <label className="finance-field"><span>Số tiền</span><VndInput value={amount} onChange={setAmount} placeholder="Ví dụ: 120.000" /></label>
      <label className="finance-field"><span>Danh mục</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Chọn danh mục</option>{matchingCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="finance-field"><span>Ví</span><select value={walletId} onChange={(event) => setWalletId(event.target.value)}><option value="">Chọn ví</option>{wallets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="finance-field"><span>Ngày và giờ</span><input type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></label>
      <label className="finance-field"><span>Ghi chú <small>(tùy chọn)</small></span><textarea maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Nhập nội dung giao dịch" /><small className="transaction-character-count">{note.length}/200</small></label>
      <label className="finance-field"><span>Nhãn <small>(tùy chọn, phân cách bằng dấu phẩy)</small></span><input maxLength={160} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Ví dụ: ăn trưa, công việc" /></label>
      <div className="finance-dialog-actions"><button type="button" className="account-secondary-button" onClick={onClose}>Hủy</button><button type="submit" className="account-primary-button" disabled={success}>Lưu giao dịch</button></div>
    </form>
  </dialog>;
}
