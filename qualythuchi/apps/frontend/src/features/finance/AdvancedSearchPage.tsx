import { usePageLoader } from '@/hooks/use-page-loader';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, ChevronLeft, ChevronRight, Filter, Search, SlidersHorizontal } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { adminApi } from '../../infrastructure/api/admin';
import { financeApi, type ApiCategory, type ApiWallet, type TransactionSearchQuery, type TransactionSearchResult } from '../../infrastructure/api/finance';
import type { TransactionType } from './transactions-data';
import { formatVnd, parseVndInteger } from './finance-data';
import { VndInput } from './VndInput';
import './advanced-search.css';

interface SearchDraft {
  from: string; to: string; type: '' | TransactionType; categoryId: string; walletId: string;
  minAmount: string; maxAmount: string; tag: string; keyword: string; sort: NonNullable<TransactionSearchQuery['sort']>;
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function monthStart() { return `${todayKey().slice(0, 7)}-01`; }
function initialDraft(params: URLSearchParams): SearchDraft {
  const type = params.get('type');
  const sort = params.get('sort');
  return {
    from: params.get('from') ?? monthStart(), to: params.get('to') ?? todayKey(),
    type: type === 'INCOME' || type === 'EXPENSE' ? type : '',
    categoryId: params.get('categoryId') ?? '', walletId: params.get('walletId') ?? '',
    minAmount: params.get('minAmount') ?? '', maxAmount: params.get('maxAmount') ?? '',
    tag: params.get('tag') ?? '', keyword: params.get('keyword') ?? '',
    sort: sort === 'oldest' || sort === 'amount-desc' || sort === 'amount-asc' ? sort : 'newest'
  };
}

function queryFromDraft(draft: SearchDraft, page: number): TransactionSearchQuery {
  const minAmount = draft.minAmount ? parseVndInteger(draft.minAmount) : undefined;
  const maxAmount = draft.maxAmount ? parseVndInteger(draft.maxAmount) : undefined;
  return {
    from: draft.from || undefined, to: draft.to || undefined,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    type: draft.type || undefined, categoryId: draft.categoryId || undefined, walletId: draft.walletId || undefined,
    minAmount, maxAmount, tag: draft.tag.trim() || undefined, keyword: draft.keyword.trim() || undefined,
    sort: draft.sort, page, limit: 25
  };
}

function toParams(query: TransactionSearchQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value));
  return params;
}

function dayLabel(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
}

export function AdvancedSearchPage() {
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft] = useState(() => initialDraft(searchParams));
  const [applied, setApplied] = useState<SearchDraft>(() => initialDraft(searchParams));
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<TransactionSearchResult | null>(null);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [wallets, setWallets] = useState<ApiWallet[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; username: string; displayName: string; role: 'USER' | 'SUPER_ADMIN' }>>([]);
  const [ownerId, setOwnerId] = useState(session?.user.role === 'SUPER_ADMIN' ? searchParams.get('ownerUserId') ?? '' : session?.user.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(true);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const userId = session?.user.id ?? '';
  const isAdmin = session?.user.role === 'SUPER_ADMIN';

  useEffect(() => {
    if (!isAdmin) { setOwnerId(userId); return; }
    let active = true;
    void adminApi.listUsers().then((items) => {
      if (!active) return;
      const usersOnly = items.filter((item) => item.role === 'USER');
      setUsers(usersOnly);
      setOwnerId((current) => usersOnly.some((item) => item.id === current) ? current : usersOnly[0]?.id ?? '');
    }).catch(() => setError('Không tải được danh sách tài khoản.'));
    return () => { active = false; };
  }, [isAdmin, userId]);

  usePageLoader(async (controller, refreshing) => {
    if (!ownerId) return;
    await Promise.all([financeApi.listCategories(ownerId, controller.signal), financeApi.listWallets(ownerId, controller.signal)])
      .then(([nextCategories, nextWallets]) => { if (controller.signal.aborted) return; setCategories(nextCategories); setWallets(nextWallets); })
      .catch((error: unknown) => { if (controller.signal.aborted) return; if (refreshing) throw error; if (!controller.signal.aborted) setError('Không tải được danh mục và ví.'); });
  }, `options:${ownerId}`);

  usePageLoader(async (controller, refreshing) => {
    if (!ownerId || !session) return;
    const query = queryFromDraft(applied, page);
    if (!refreshing) { setBusy(true); setError(''); }
    await financeApi.searchTransactions(ownerId, query, controller.signal)
      .then((value) => { if (!controller.signal.aborted) { setResult(value); setError(''); } }).catch((error: unknown) => { if (controller.signal.aborted) return; if (refreshing) throw error; if (!controller.signal.aborted) setError('Không tìm được giao dịch. Hãy kiểm tra bộ lọc và thử lại.'); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    if (!controller.signal.aborted && !refreshing) {
      const params = toParams(query);
      if (isAdmin) params.set('ownerUserId', ownerId);
      setSearchParams(params, { replace: true });
    }
  }, JSON.stringify([ownerId, applied, page, isAdmin]));

  const categoriesById = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);
  const walletsById = useMemo(() => new Map(wallets.map((item) => [item.id, item])), [wallets]);
  const grouped = useMemo(() => {
    const groups = new Map<string, NonNullable<TransactionSearchResult['transactions']>>();
    for (const transaction of result?.transactions ?? []) {
      const key = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(transaction.occurredAt));
      groups.set(key, [...(groups.get(key) ?? []), transaction]);
    }
    return [...groups.entries()];
  }, [result, timezone]);
  const pages = Math.max(1, Math.ceil((result?.total ?? 0) / (result?.limit ?? 25)));

  if (!session) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.minAmount && parseVndInteger(draft.minAmount) === undefined) { setError('Số tiền từ cần là số nguyên VND hợp lệ.'); return; }
    if (draft.maxAmount && parseVndInteger(draft.maxAmount) === undefined) { setError('Số tiền đến cần là số nguyên VND hợp lệ.'); return; }
    if (draft.from && draft.to && draft.from > draft.to) { setError('Ngày bắt đầu phải trước hoặc trùng ngày kết thúc.'); return; }
    setApplied({ ...draft }); setPage(1);
  }

  function reset() {
    const fresh = { ...initialDraft(new URLSearchParams()), type: '' as const, categoryId: '', walletId: '', minAmount: '', maxAmount: '', tag: '', keyword: '' };
    setDraft(fresh); setApplied(fresh); setPage(1); setError('');
  }

  return <div className="advanced-search-page">
    <header className="advanced-search-heading">
      <Link to="/transactions" aria-label="Quay lại giao dịch"><ChevronLeft /></Link>
      <div><h1>Tìm kiếm nâng cao</h1><p>Tìm và lọc giao dịch theo nhiều tiêu chí</p></div>
      <span className="advanced-search-heading-icon"><Search aria-hidden="true" /></span>
    </header>
    {isAdmin && <label className="advanced-owner-select"><span>Tài khoản đích</span><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}><option value="">Chọn User</option>{users.map((item) => <option key={item.id} value={item.id}>{item.displayName} · @{item.username}</option>)}</select></label>}
    <form className="advanced-search-form" onSubmit={submit}>
      <label className="advanced-keyword"><Search aria-hidden="true" /><input value={draft.keyword} onChange={(event) => setDraft({ ...draft, keyword: event.target.value })} placeholder="Tìm ghi chú, danh mục, ví, nhãn…" aria-label="Từ khóa" /><button type="submit" aria-label="Tìm kiếm"><Search /></button></label>
      <div className="advanced-filter-title"><div><Filter aria-hidden="true" /><h2>Bộ lọc</h2></div><button type="button" onClick={() => setExpanded((current) => !current)}>{expanded ? 'Thu gọn' : 'Mở rộng'} <SlidersHorizontal aria-hidden="true" /></button></div>
      {expanded && <div className="advanced-filter-grid">
        <label className="advanced-field"><span>Ngày bắt đầu</span><span className="advanced-date-input"><CalendarDays aria-hidden="true" /><input type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></span></label>
        <label className="advanced-field"><span>Ngày kết thúc</span><span className="advanced-date-input"><CalendarDays aria-hidden="true" /><input type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></span></label>
        <label className="advanced-field"><span>Loại giao dịch</span><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as SearchDraft['type'] })}><option value="">Tất cả</option><option value="INCOME">Thu</option><option value="EXPENSE">Chi</option></select></label>
        <label className="advanced-field"><span>Danh mục</span><select value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}><option value="">Tất cả danh mục</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.type === 'INCOME' ? 'Thu · ' : 'Chi · '}{item.name}</option>)}</select></label>
        <label className="advanced-field"><span>Ví / tài khoản</span><select value={draft.walletId} onChange={(event) => setDraft({ ...draft, walletId: event.target.value })}><option value="">Tất cả ví</option>{wallets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="advanced-field"><span>Nhãn</span><input value={draft.tag} maxLength={32} onChange={(event) => setDraft({ ...draft, tag: event.target.value })} placeholder="Ví dụ: ăn trưa" /></label>
        <div className="advanced-amount-range"><span>Khoảng tiền</span><div><VndInput value={draft.minAmount} onChange={(minAmount) => setDraft({ ...draft, minAmount })} placeholder="Từ" /><span>đến</span><VndInput value={draft.maxAmount} onChange={(maxAmount) => setDraft({ ...draft, maxAmount })} placeholder="Đến" /></div></div>
        <label className="advanced-field"><span>Sắp xếp</span><select value={draft.sort} onChange={(event) => setDraft({ ...draft, sort: event.target.value as SearchDraft['sort'] })}><option value="newest">Ngày mới nhất</option><option value="oldest">Ngày cũ nhất</option><option value="amount-desc">Số tiền cao nhất</option><option value="amount-asc">Số tiền thấp nhất</option></select></label>
      </div>}
      <div className="advanced-form-actions"><button type="button" className="account-secondary-button" onClick={reset}>Đặt lại</button><button type="submit" className="account-primary-button"><Search aria-hidden="true" />Tìm kiếm</button></div>
    </form>
    {error && <p className="advanced-message" role="alert">{error}</p>}
    <section className="advanced-results">
      <header><div><h2>Kết quả tìm kiếm</h2><p>{busy ? 'Đang tìm…' : `${result?.total ?? 0} giao dịch`}</p></div><span>{page}/{pages} trang</span></header>
      {!busy && result?.transactions.length === 0 && <div className="account-empty"><span className="account-empty-icon"><Search /></span><h3>Không tìm thấy giao dịch</h3><p>Thử đổi khoảng thời gian hoặc bộ lọc.</p></div>}
      {grouped.map(([day, items]) => <section className="advanced-day-group" key={day}>
        <header><h3>{dayLabel(`${day}T12:00:00`)}</h3><span>{items.length} giao dịch</span></header>
        <div>{items.map((item) => {
          const category = categoriesById.get(item.categoryId)?.name ?? 'Danh mục';
          const wallet = walletsById.get(item.walletId)?.name ?? 'Ví';
          const label = item.note.trim() || category;
          const amount = item.type === 'INCOME' ? `+${formatVnd(item.amount)}` : `−${formatVnd(item.amount)}`;
          const params = new URLSearchParams({ transactionId: item.id });
          const target = isAdmin ? `/admin/finance?${new URLSearchParams({ ownerUserId: ownerId, tab: 'transactions', transactionId: item.id })}` : `/transactions?${params.toString()}`;
          return <Link className="advanced-result-row" to={target} key={item.id}>
            <span className={`advanced-result-icon ${item.type === 'INCOME' ? 'advanced-result-income' : 'advanced-result-expense'}`}>{item.type === 'INCOME' ? <ArrowDown /> : <ArrowUp />}</span>
            <span className="advanced-result-copy"><strong>{label}</strong><small>{category} · {wallet}{item.tags.length ? ` · ${item.tags.map((tag) => `#${tag}`).join(' ')}` : ''}</small></span>
            <span className={`advanced-result-amount ${item.type === 'INCOME' ? 'is-income' : 'is-expense'}`}>{amount}</span><ChevronRight aria-hidden="true" />
          </Link>;
        })}</div>
      </section>)}
      <footer className="advanced-pagination"><button type="button" disabled={page <= 1 || busy} onClick={() => setPage((value) => value - 1)}><ChevronLeft /> Trước</button><span>{result?.total ?? 0} kết quả</span><button type="button" disabled={page >= pages || busy} onClick={() => setPage((value) => value + 1)}>Tiếp <ChevronRight /></button></footer>
    </section>
  </div>;
}
