import { usePageLoader } from '@/hooks/use-page-loader';
import { useEffect, useMemo, useState } from 'react';
import { useModalDialog } from '@/hooks/use-modal-dialog';
import { ArrowDown, ArrowUp, ChevronLeft, Pencil, Plus, Trash2, Wallet as WalletIcon } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { adminApi } from '../../infrastructure/api/admin';
import { financeApi, type ApiBudget, type ApiCategory, type ApiTransaction, type ApiWallet } from '../../infrastructure/api/finance';
import { createId, formatVnd, parseVndInteger } from '../finance/finance-data';
import { parseTransactionAmount, parseTransactionTags, type TransactionType } from '../finance/transactions-data';
import { VndInput } from '../finance/VndInput';
import { useAuth } from '../auth/auth-context';
import '../finance/finance.css';
import './admin.css';
import { BackLink } from '@/components/BackLink';

type Tab = 'overview' | 'transactions' | 'wallets' | 'budgets';
const tabNames: Record<Tab, string> = { overview: 'Tổng quan', transactions: 'Thu chi', wallets: 'Ví tiền', budgets: 'Ngân sách' };
const nowLocal = () => { const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000); return date.toISOString().slice(0, 16); };

export function AdminFinancePage() {
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState<Array<{ id: string; username: string; displayName: string; role: 'USER' | 'SUPER_ADMIN' }>>([]);
  const [ownerId, setOwnerId] = useState(searchParams.get('ownerUserId') ?? '');
  const [tab, setTab] = useState<Tab>(searchParams.get('tab') === 'transactions' || searchParams.get('tab') === 'wallets' || searchParams.get('tab') === 'budgets' ? searchParams.get('tab') as Tab : 'overview');
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [wallets, setWallets] = useState<ApiWallet[]>([]);
  const [budgets, setBudgets] = useState<ApiBudget[]>([]);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [totals, setTotals] = useState({ totalBalance: 0, incomeThisMonth: 0, expenseThisMonth: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [editingTransaction, setEditingTransaction] = useState<ApiTransaction | null | undefined>(undefined);
  const [editingWallet, setEditingWallet] = useState<ApiWallet | null | undefined>(undefined);
  const [editingBudget, setEditingBudget] = useState<ApiBudget | null | undefined>(undefined);
  const [toast, setToast] = useState('');
  const selectedUser = users.find((user) => user.id === ownerId);
  const selectedTransactionId = searchParams.get('transactionId') ?? '';

  useEffect(() => { void adminApi.listUsers().then((items) => { setUsers(items); const usersOnly = items.filter((item) => item.role === 'USER'); setOwnerId((current) => usersOnly.some((item) => item.id === current) ? current : usersOnly[0]?.id ?? ''); }).catch(() => setError('Không tải được danh sách User.')); }, []);
  const refresh = usePageLoader(async (controller, refreshing) => {
    if (!ownerId) return;
    if (!refreshing) { setLoading(true); setError(''); }
    await Promise.all([financeApi.listTransactions(ownerId, controller.signal), financeApi.listWallets(ownerId, controller.signal), financeApi.listCategories(ownerId, controller.signal), financeApi.getSummary(ownerId, controller.signal), financeApi.listBudgets(ownerId, controller.signal)])
      .then(([nextTransactions, nextWallets, nextCategories, summary, nextBudgets]) => {
        if (controller.signal.aborted) return;
        setError('');
        setTransactions(nextTransactions); setWallets(nextWallets); setCategories(nextCategories);
        setBudgets(nextBudgets);
        setTotals({ totalBalance: summary.totalBalance, incomeThisMonth: summary.incomeThisMonth, expenseThisMonth: summary.expenseThisMonth });
      }).catch((error: unknown) => { if (refreshing) throw error; if (!controller.signal.aborted) setError('Không tải được dữ liệu tài chính của User đã chọn.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  }, ownerId);

  useEffect(() => {
    if (!selectedTransactionId || !ownerId || loading) return;
    const transaction = transactions.find((item) => item.id === selectedTransactionId);
    if (transaction) { setTab('transactions'); setEditingTransaction(transaction); }
  }, [loading, ownerId, selectedTransactionId, transactions]);

  const filteredTransactions = useMemo(() => transactions.filter((item) => `${item.note} ${item.type}`.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi'))), [transactions, query]);
  if (!session) return null;

  function closeTransactionEditor() {
    setEditingTransaction(undefined);
    if (selectedTransactionId) setSearchParams((current) => { current.delete('transactionId'); return current; }, { replace: true });
  }
  async function removeTransaction(item: ApiTransaction) {
    if (!window.confirm(`Xóa giao dịch “${item.note || formatVnd(item.amount)}” của ${selectedUser?.displayName}?`)) return;
    try { await financeApi.deleteTransaction(ownerId, item.id, session!.csrfToken); await refresh(); setToast('Đã xóa giao dịch.'); }
    catch { setToast('Không thể xóa giao dịch. Hãy tải lại và thử lại.'); }
  }
  async function removeWallet(item: ApiWallet) {
    if (!window.confirm(`Xóa ví “${item.name}” của ${selectedUser?.displayName}?`)) return;
    try { await financeApi.deleteWallet(ownerId, item.id, session!.csrfToken); await refresh(); setToast('Đã xóa ví.'); }
    catch { setToast('Không thể xóa ví đang được giao dịch sử dụng.'); }
  }
  async function removeBudget(item: ApiBudget) {
    if (!window.confirm(`Xóa ngân sách ${item.categoryName ?? 'tổng'} tháng ${item.period} của ${selectedUser?.displayName}?`)) return;
    try { await financeApi.deleteBudget(ownerId, item.id, session!.csrfToken); await refresh(); setToast('Đã xóa ngân sách.'); }
    catch { setToast('Không thể xóa ngân sách. Hãy tải lại và thử lại.'); }
  }

  return <div className="admin-page">
    <header className="admin-page-heading"><BackLink to="/more" aria-label="Quay lại"><ChevronLeft /></BackLink><div><h1>Tài chính theo User</h1><p>Xem và quản lý dữ liệu đã đồng bộ</p></div></header>
    <label className="admin-select-label"><span>Tài khoản đích</span><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}><option value="">Chọn User</option>{users.filter((user) => user.role === 'USER').map((user) => <option key={user.id} value={user.id}>{user.displayName} · @{user.username}</option>)}</select></label>
    {selectedUser && <div className="admin-target-card"><span className="admin-user-avatar">{selectedUser.displayName.trim().split(/\s+/).slice(-2).map((part) => part[0]).join('').toLocaleUpperCase()}</span><div><strong>{selectedUser.displayName}</strong><small>@{selectedUser.username} · Chủ sở hữu dữ liệu</small></div><span className="account-role account-role-user">User</span></div>}
    {ownerId && <div className="admin-finance-tabs" role="tablist" aria-label="Dữ liệu tài chính">{(Object.keys(tabNames) as Tab[]).map((key) => <button type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'admin-finance-tab-active' : ''} onClick={() => setTab(key)} key={key}>{tabNames[key]}</button>)}</div>}
    {error && <p className="admin-alert" role="alert">{error}</p>}
    {loading && <div className="admin-empty">Đang tải dữ liệu…</div>}
    {!loading && ownerId && tab === 'overview' && <><section className="admin-finance-summary"><article><WalletIcon /><small>Số dư tổng</small><strong>{formatVnd(totals.totalBalance)}</strong></article><article><ArrowUp /><small>Thu tháng này</small><strong>{formatVnd(totals.incomeThisMonth)}</strong></article><article><ArrowDown /><small>Chi tháng này</small><strong>{formatVnd(totals.expenseThisMonth)}</strong></article></section><section className="admin-list-section"><div className="account-section-title"><h2>Giao dịch gần đây</h2><button type="button" className="admin-text-button" onClick={() => setTab('transactions')}>Xem tất cả</button></div>{transactions.slice(0, 5).map((item) => <TransactionRow key={item.id} item={item} walletName={wallets.find((wallet) => wallet.id === item.walletId)?.name ?? 'Ví'} onEdit={() => setEditingTransaction(item)} onDelete={() => void removeTransaction(item)} />)}</section></>}
    {!loading && ownerId && tab === 'transactions' && <section className="admin-list-section"><div className="admin-toolbar"><label className="admin-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm giao dịch" /></label><button className="admin-primary-button" type="button" onClick={() => setEditingTransaction(null)}><Plus />Thêm</button></div>{filteredTransactions.length ? filteredTransactions.map((item) => <TransactionRow key={item.id} item={item} walletName={wallets.find((wallet) => wallet.id === item.walletId)?.name ?? 'Ví'} onEdit={() => setEditingTransaction(item)} onDelete={() => void removeTransaction(item)} />) : <div className="admin-empty">Chưa có giao dịch.</div>}</section>}
    {!loading && ownerId && tab === 'wallets' && <section className="admin-list-section"><div className="account-section-title"><h2>Ví của {selectedUser?.displayName}</h2><button className="admin-primary-button" type="button" onClick={() => setEditingWallet(null)}><Plus />Thêm ví</button></div>{wallets.length ? wallets.map((wallet) => <article className="admin-finance-row" key={wallet.id}><span className="admin-user-avatar"><WalletIcon /></span><div><strong>{wallet.name}</strong><small>{wallet.type} · Số dư ban đầu {formatVnd(wallet.openingBalance)}</small></div><b>{formatVnd(wallet.currentBalance)}</b><button type="button" aria-label={`Sửa ví ${wallet.name}`} onClick={() => setEditingWallet(wallet)}><Pencil /></button><button type="button" aria-label={`Xóa ví ${wallet.name}`} onClick={() => void removeWallet(wallet)}><Trash2 /></button></article>) : <div className="admin-empty">User chưa có ví.</div>}</section>}
    {!loading && ownerId && tab === 'budgets' && <section className="admin-list-section"><div className="account-section-title"><h2>Ngân sách của {selectedUser?.displayName}</h2><button className="admin-primary-button" type="button" onClick={() => setEditingBudget(null)}><Plus />Thêm</button></div>{budgets.length ? budgets.map((budget) => <article className="admin-finance-row" key={budget.id}><span className="admin-transaction-icon admin-expense"><WalletIcon /></span><div><strong>{budget.categoryName ?? 'Ngân sách tổng'}</strong><small>Tháng {budget.period} · {budget.categoryName ? 'Theo danh mục' : 'Toàn bộ chi tiêu'}</small></div><b>{formatVnd(budget.amount)}</b><button type="button" aria-label="Sửa ngân sách" onClick={() => setEditingBudget(budget)}><Pencil /></button><button type="button" aria-label="Xóa ngân sách" onClick={() => void removeBudget(budget)}><Trash2 /></button></article>) : <div className="admin-empty">User chưa có ngân sách.</div>}</section>}
    {toast && <div className="admin-toast" role="status">{toast}<button type="button" onClick={() => setToast('')}>Đóng</button></div>}
    {editingTransaction !== undefined && <TransactionDialog ownerId={ownerId} item={editingTransaction} wallets={wallets} categories={categories} csrf={session.csrfToken} onClose={closeTransactionEditor} onSaved={async () => { closeTransactionEditor(); await refresh(); setToast('Đã lưu giao dịch.'); }} />}
    {editingWallet !== undefined && <WalletDialog ownerId={ownerId} item={editingWallet} csrf={session.csrfToken} onClose={() => setEditingWallet(undefined)} onSaved={async () => { setEditingWallet(undefined); await refresh(); setToast('Đã lưu ví.'); }} />}
    {editingBudget !== undefined && <BudgetDialog ownerId={ownerId} item={editingBudget} categories={categories} csrf={session.csrfToken} onClose={() => setEditingBudget(undefined)} onSaved={async () => { setEditingBudget(undefined); await refresh(); setToast('Đã lưu ngân sách.'); }} />}
  </div>;
}

function TransactionRow({ item, walletName, onEdit, onDelete }: { item: ApiTransaction; walletName: string; onEdit: () => void; onDelete: () => void }) {
  return <article className="admin-finance-row"><span className={`admin-transaction-icon ${item.type === 'INCOME' ? 'admin-income' : 'admin-expense'}`}>{item.type === 'INCOME' ? <ArrowUp /> : <ArrowDown />}</span><div><strong>{item.note || (item.type === 'INCOME' ? 'Khoản thu' : 'Khoản chi')}</strong><small>{walletName} · {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(item.occurredAt))}</small></div><b className={item.type === 'INCOME' ? 'admin-income-text' : 'admin-expense-text'}>{item.type === 'INCOME' ? '+' : '−'}{formatVnd(item.amount)}</b><button type="button" aria-label="Sửa giao dịch" onClick={onEdit}><Pencil /></button><button type="button" aria-label="Xóa giao dịch" onClick={onDelete}><Trash2 /></button></article>;
}

function TransactionDialog({ ownerId, item, wallets, categories, csrf, onClose, onSaved }: { ownerId: string; item: ApiTransaction | null; wallets: ApiWallet[]; categories: ApiCategory[]; csrf: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const dialog = useModalDialog();
  const [type, setType] = useState<TransactionType>(item?.type ?? 'EXPENSE');
  const [amount, setAmount] = useState(item ? String(item.amount).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '');
  const [walletId, setWalletId] = useState(item?.walletId ?? wallets[0]?.id ?? '');
  const matching = categories.filter((category) => category.type === type);
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? matching[0]?.id ?? '');
  const [occurredAt, setOccurredAt] = useState(item ? new Date(new Date(item.occurredAt).getTime() - new Date(item.occurredAt).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : nowLocal());
  const [note, setNote] = useState(item?.note ?? '');
  const [tags, setTags] = useState(item?.tags.join(', ') ?? '');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!categories.some((category) => category.type === type && category.id === categoryId)) {
      setCategoryId(categories.find((category) => category.type === type)?.id ?? '');
    }
  }, [type, categories, categoryId]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const parsed = parseTransactionAmount(amount);
    if (!parsed || !walletId || !categoryId) { setError('Nhập số tiền hợp lệ và chọn ví, danh mục.'); return; }
    setBusy(true); setError('');
    const input = { type, amount: parsed, walletId, categoryId, occurredAt: new Date(occurredAt).toISOString(), note: note.trim(), tags: parseTransactionTags(tags) };
    try {
      if (item) await financeApi.updateTransaction(ownerId, item.id, { ...input, revision: item.revision }, csrf);
      else await financeApi.createTransaction(ownerId, { ...input, id: createId() }, csrf);
      await onSaved();
    } catch { setError('Không lưu được. Có thể bản ghi đã được sửa ở thiết bị khác.'); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="admin-dialog admin-finance-dialog" onCancel={onClose}><button className="admin-dialog-close" type="button" onClick={onClose} aria-label="Đóng">×</button><h2>{item ? 'Sửa giao dịch' : 'Thêm giao dịch'}</h2><form className="admin-form" onSubmit={(event) => void submit(event)}><label>Loại<select value={type} onChange={(event) => setType(event.target.value as TransactionType)}><option value="EXPENSE">Chi</option><option value="INCOME">Thu</option></select></label><label>Số tiền<VndInput value={amount} onChange={setAmount} placeholder="0" /></label><label>Ví<select value={walletId} onChange={(event) => setWalletId(event.target.value)}>{wallets.map((wallet) => <option value={wallet.id} key={wallet.id}>{wallet.name}</option>)}</select></label><label>Danh mục<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{matching.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label>Ngày giờ<input type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} /></label><label>Ghi chú<input value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} /></label><label>Nhãn<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Cách nhau bằng dấu phẩy" /></label>{error && <p className="admin-alert" role="alert">{error}</p>}<div className="admin-form-actions"><button type="button" className="admin-secondary-button" onClick={onClose}>Hủy</button><button className="admin-primary-button" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu giao dịch'}</button></div></form></dialog>;
}

function WalletDialog({ ownerId, item, csrf, onClose, onSaved }: { ownerId: string; item: ApiWallet | null; csrf: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const dialog = useModalDialog();
  const [name, setName] = useState(item?.name ?? ''); const [type, setType] = useState<ApiWallet['type']>(item?.type ?? 'CASH');
  const [openingBalance, setOpeningBalance] = useState(String(item?.openingBalance ?? 0)); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const amount = parseVndInteger(openingBalance);
    if (!name.trim() || amount === undefined) { setError('Tên ví và số dư ban đầu chưa hợp lệ.'); return; }
    setBusy(true); setError('');
    try {
      const input = { name: name.trim(), type, openingBalance: amount, accountLabel: item?.accountLabel ?? '', accountReference: item?.accountReference ?? '' };
      if (item) await financeApi.updateWallet(ownerId, item.id, input, csrf);
      else await financeApi.createWallet(ownerId, input, csrf);
      await onSaved();
    } catch { setError('Không lưu được ví. Hãy kiểm tra tên ví và thử lại.'); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="admin-dialog admin-finance-dialog" onCancel={onClose}><button className="admin-dialog-close" type="button" onClick={onClose} aria-label="Đóng">×</button><h2>{item ? 'Sửa ví' : 'Thêm ví'}</h2><form className="admin-form" onSubmit={(event) => void submit(event)}><label>Tên ví<input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} required /></label><label>Loại ví<select value={type} onChange={(event) => setType(event.target.value as ApiWallet['type'])}><option value="CASH">Tiền mặt</option><option value="BANK">Ngân hàng</option><option value="E_WALLET">Ví điện tử</option><option value="OTHER">Khác</option></select></label><label>Số dư ban đầu<VndInput value={openingBalance} onChange={setOpeningBalance} allowNegative /></label>{error && <p className="admin-alert" role="alert">{error}</p>}<div className="admin-form-actions"><button type="button" className="admin-secondary-button" onClick={onClose}>Hủy</button><button className="admin-primary-button" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu ví'}</button></div></form></dialog>;
}

function BudgetDialog({ ownerId, item, categories, csrf, onClose, onSaved }: { ownerId: string; item: ApiBudget | null; categories: ApiCategory[]; csrf: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const dialog = useModalDialog();
  const month = nowLocal().slice(0, 7);
  const [period, setPeriod] = useState(item?.period ?? month);
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? '');
  const [amount, setAmount] = useState(item ? String(item.amount).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const parsedAmount = parseVndInteger(amount);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(period) || !parsedAmount || parsedAmount <= 0) { setError('Chọn kỳ hợp lệ và nhập ngân sách lớn hơn 0.'); return; }
    setBusy(true); setError('');
    try {
      const input = { categoryId: categoryId || null, period, amount: parsedAmount };
      if (item) await financeApi.updateBudget(ownerId, item.id, input, csrf);
      else await financeApi.createBudget(ownerId, input, csrf);
      await onSaved();
    } catch { setError('Không lưu được. Có thể ngân sách cùng kỳ và phạm vi đã tồn tại.'); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="admin-dialog admin-finance-dialog" onCancel={onClose}><button className="admin-dialog-close" type="button" onClick={onClose} aria-label="Đóng">×</button><h2>{item ? 'Sửa ngân sách' : 'Thêm ngân sách'}</h2><form className="admin-form" onSubmit={(event) => void submit(event)}><label>Tháng<input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} required /></label><label>Phạm vi<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Tổng ngân sách</option>{categories.filter((category) => category.type === 'EXPENSE').map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Số tiền<VndInput value={amount} onChange={setAmount} placeholder="0" /></label>{error && <p className="admin-alert" role="alert">{error}</p>}<div className="admin-form-actions"><button type="button" className="admin-secondary-button" onClick={onClose}>Hủy</button><button className="admin-primary-button" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu ngân sách'}</button></div></form></dialog>;
}
