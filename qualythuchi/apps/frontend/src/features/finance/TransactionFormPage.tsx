import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, CalendarClock, Check, ChevronLeft, Settings2, StickyNote } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useGoBack } from '@/hooks/use-go-back';
import { useAuth } from '../auth/auth-context';
import { createId } from './finance-data';
import type { Category, Wallet } from './finance-data';
import { FinanceToast } from './FinanceToast';
import { useFinanceToast } from './use-finance-toast';
import { parseTransactionAmount } from './transactions-data';
import type { Transaction, TransactionType } from './transactions-data';
import { formatVndInput } from './finance-rules';
import { VndInput } from './VndInput';
import { syncOutbox } from '@/infrastructure/sync/sync-engine';
import { enqueueLocalMutation } from '@/infrastructure/sync/sync-storage';
import { pickDefaultWallet } from './default-wallet';
import { useTransactionData } from './use-transaction-data';
import { categoryVisual } from './category-icons';
import './finance.css';

type Draft = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;
const successDelay = 900;

function localDateTime(value = new Date()): string {
  const date = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

/** State gắn khi điều hướng tới form: đường dẫn trang đã mở form. */
export interface TransactionFormState { from: string }

/** Màn hình riêng thêm (`/transactions/new`) hoặc sửa (`/transactions/:transactionId`) giao dịch. */
export function TransactionFormPage() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { transactionId } = useParams();
  const [searchParams] = useSearchParams();
  const { toast, showToast } = useFinanceToast();
  const { categories, wallets, transactions, loaded } = useTransactionData(userId, session?.csrfToken ?? '', () => showToast('Không tải được dữ liệu. Hãy kéo xuống để thử lại.'));
  const editing = transactionId ? transactions.find((item) => item.id === transactionId) : null;
  const initialType: TransactionType = searchParams.get('type') === 'INCOME' ? 'INCOME' : 'EXPENSE';

  // Về đúng trang đã mở form; mở trực tiếp thì về danh sách Thu chi. Hook chặn lùi hai lần
  // (bấm Quay lại nhanh liên tiếp hoặc bấm trong lúc đang tự quay về sau khi Lưu) làm nhảy sang tab khác.
  const goBack = useGoBack('/transactions');

  if (!session) return null;

  async function save(draft: Draft): Promise<string | null> {
    try {
      const now = new Date().toISOString();
      const id = editing?.id ?? createId();
      const revision = (editing?.revision ?? 0) + 1;
      const value: Transaction = { ...editing, ...draft, id, createdAt: editing?.createdAt ?? now, updatedAt: now, revision };
      const payload = editing ? { ...draft, revision: editing.revision ?? 1 } : { ...draft, id };
      await enqueueLocalMutation({ ownerUserId: userId, entity: 'transactions', operation: editing ? 'update' : 'create', recordId: id, payload, value });
      void syncOutbox(userId, session!.csrfToken);
      return null;
    } catch {
      return 'Không lưu được giao dịch. Hãy kiểm tra kết nối và thử lại.';
    }
  }

  const title = transactionId ? 'Sửa giao dịch' : 'Thêm giao dịch';
  return <div className="transaction-form-page">
    <header className="txf-header">
      <button type="button" className="txf-back" aria-label="Quay lại" onClick={goBack}><ChevronLeft /></button>
      <h1>{title}</h1>
      <span aria-hidden="true" />
    </header>
    <FinanceToast toast={toast} />
    {transactionId && !editing
      ? <div className="account-empty transaction-empty"><h2>{loaded ? 'Không tìm thấy giao dịch' : 'Đang tải giao dịch…'}</h2>{loaded && <p>Giao dịch có thể đã bị xóa hoặc chưa đồng bộ về thiết bị này.</p>}</div>
      : <TransactionForm key={editing?.id ?? 'new'} transaction={editing ?? null} initialType={initialType} categories={categories} wallets={wallets} loaded={loaded} onCancel={goBack} onSave={save} onSaved={goBack} />}
  </div>;
}

function TransactionForm({ transaction, initialType, categories, wallets, loaded, onCancel, onSave, onSaved }: {
  transaction: Transaction | null; initialType: TransactionType; categories: Category[]; wallets: Wallet[]; loaded: boolean;
  onCancel: () => void; onSave: (draft: Draft) => Promise<string | null>; onSaved: () => void;
}) {
  const [type, setType] = useState<TransactionType>(transaction?.type ?? initialType);
  const [amount, setAmount] = useState(transaction ? formatVndInput(String(transaction.amount)) : '');
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? '');
  // Ví ẩn khỏi form: giữ ví cũ khi sửa, giao dịch mới vào ví mặc định.
  const walletId = transaction?.walletId ?? pickDefaultWallet(wallets)?.id ?? '';
  const [occurredAt, setOccurredAt] = useState(transaction?.occurredAt ? localDateTime(new Date(transaction.occurredAt)) : localDateTime());
  const [note, setNote] = useState(transaction?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast, showToast } = useFinanceToast();
  const matchingCategories = categories.filter((item) => item.type === type);

  useEffect(() => () => { if (doneTimer.current) clearTimeout(doneTimer.current); }, []);
  useEffect(() => {
    const available = categories.filter((item) => item.type === type);
    if (!available.some((item) => item.id === categoryId)) setCategoryId(available[0]?.id ?? '');
  }, [type, categories, categoryId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || success) return;
    if (!walletId) { showToast(loaded ? 'Chưa chuẩn bị xong sổ thu chi. Hãy kết nối mạng rồi thử lại.' : 'Đang tải dữ liệu, hãy thử lại sau giây lát.'); return; }
    const parsedAmount = parseTransactionAmount(amount);
    if (parsedAmount === undefined) { showToast('Số tiền phải là số nguyên VND lớn hơn 0.'); return; }
    if (!categoryId || !matchingCategories.some((item) => item.id === categoryId)) { showToast('Hãy chọn danh mục phù hợp với loại giao dịch.'); return; }
    const date = new Date(occurredAt);
    if (!occurredAt || Number.isNaN(date.getTime())) { showToast('Ngày giờ giao dịch không hợp lệ.'); return; }
    if (note.length > 200) { showToast('Ghi chú tối đa 200 ký tự.'); return; }
    setSaving(true);
    const saveError = await onSave({ type, amount: parsedAmount, categoryId, walletId, occurredAt: date.toISOString(), note: note.trim(), tags: transaction?.tags ?? [] });
    setSaving(false);
    if (saveError) { showToast(saveError); return; }
    setSuccess(true);
    showToast('Giao dịch đã được lưu.', 'success', successDelay);
    doneTimer.current = setTimeout(onSaved, successDelay);
  }

  function setDay(offset: number) {
    const current = new Date(occurredAt);
    const base = Number.isNaN(current.getTime()) ? new Date() : current;
    const today = new Date();
    const next = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, base.getHours(), base.getMinutes());
    setOccurredAt(localDateTime(next));
  }
  const dayOffset = (() => {
    const date = new Date(occurredAt); if (Number.isNaN(date.getTime())) return null;
    const today = new Date(); const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((day.getTime() - start.getTime()) / 86_400_000);
  })();
  const income = type === 'INCOME';

  return <>
    <FinanceToast toast={toast} />
    <form className="txf" onSubmit={(event) => void submit(event)}>
      <div className="txf-type" role="group" aria-label="Loại giao dịch">
        <button type="button" aria-pressed={!income} className={!income ? 'txf-type-active txf-type-expense' : ''} onClick={() => setType('EXPENSE')}><ArrowUp aria-hidden="true" />Khoản chi</button>
        <button type="button" aria-pressed={income} className={income ? 'txf-type-active txf-type-income' : ''} onClick={() => setType('INCOME')}><ArrowDown aria-hidden="true" />Khoản thu</button>
      </div>

      <label className={`txf-amount ${income ? 'txf-amount-income' : 'txf-amount-expense'}`}>
        <span>Số tiền</span>
        <VndInput value={amount} onChange={setAmount} placeholder="0" />
      </label>

      <section className="txf-card" aria-labelledby="txf-category-title">
        <div className="txf-card-head"><h2 id="txf-category-title">Danh mục</h2><Link to="/categories" className="txf-manage"><Settings2 aria-hidden="true" />Quản lý</Link></div>
        <div className="txf-categories" role="group" aria-label="Chọn danh mục">
          {matchingCategories.map((item) => {
            const { icon: Icon, tone } = categoryVisual(item.name);
            const selected = item.id === categoryId;
            return <button type="button" key={item.id} aria-pressed={selected} className={`txf-category${selected ? ' txf-category-selected' : ''}`} onClick={() => setCategoryId(item.id)}>
              <span className={`txf-category-icon txf-tone-${tone}`}><Icon aria-hidden="true" />{selected && <Check className="txf-category-check" aria-hidden="true" />}</span>
              <span className="txf-category-name">{item.name}</span>
            </button>;
          })}
          {!loaded && matchingCategories.length === 0 && Array.from({ length: 8 }, (_, index) => <span key={index} className="txf-category txf-category-skeleton" aria-hidden="true"><span className="txf-category-icon" /><span className="txf-category-name" /></span>)}
        </div>
        {loaded && matchingCategories.length === 0 && <p className="txf-empty">Chưa có danh mục {income ? 'thu' : 'chi'}. <Link to="/categories">Thêm danh mục</Link></p>}
      </section>

      <section className="txf-card txf-details" aria-label="Chi tiết giao dịch">
        <div className="txf-row">
          <div className="txf-row-label">
            <label htmlFor="txf-date"><CalendarClock aria-hidden="true" />Ngày và giờ</label>
            <span className="txf-day-chips">
              <button type="button" aria-pressed={dayOffset === 0} onClick={() => setDay(0)}>Hôm nay</button>
              <button type="button" aria-pressed={dayOffset === -1} onClick={() => setDay(-1)}>Hôm qua</button>
            </span>
          </div>
          <input id="txf-date" type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} />
        </div>
        <div className="txf-row txf-row-note">
          <div className="txf-row-label"><label htmlFor="txf-note"><StickyNote aria-hidden="true" />Ghi chú</label><small>{note.length}/200</small></div>
          <input id="txf-note" maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú (tùy chọn)" />
        </div>
      </section>

      <div className="txf-actions">
        <button type="button" className="account-secondary-button" onClick={onCancel}>Hủy</button>
        <button type="submit" className="account-primary-button" disabled={saving || success}>{saving ? 'Đang lưu…' : success ? 'Đã lưu' : 'Lưu giao dịch'}</button>
      </div>
    </form>
  </>;
}
