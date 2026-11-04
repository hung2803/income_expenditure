import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeftRight, ArrowUpRight, ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { createId, formatVnd } from './finance-data';
import { parseTransactionAmount } from './transactions-data';
import { VndInput } from './VndInput';
import { FinanceToast } from './FinanceToast';
import { useFinanceToast } from './use-finance-toast';
import { financeApi } from '@/infrastructure/api/finance';
import type { ApiTransfer, ApiWallet } from '@/infrastructure/api/finance';
import { syncOutbox } from '@/infrastructure/sync/sync-engine';
import { enqueueLocalMutation, listLocalRecords, putLocalRecord } from '@/infrastructure/sync/sync-storage';
import './finance.css';

export function TransferPage() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const csrfToken = session?.csrfToken ?? '';
  const [wallets, setWallets] = useState<ApiWallet[]>([]);
  const [transfers, setTransfers] = useState<ApiTransfer[]>([]);
  const [sourceWalletId, setSourceWalletId] = useState('');
  const [destinationWalletId, setDestinationWalletId] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { toast, showToast } = useFinanceToast();
  const balances = useMemo(() => new Map(wallets.map((wallet) => [wallet.id, wallet.currentBalance])), [wallets]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!userId) return;
    const [nextWallets, nextTransfers] = await Promise.all([
      financeApi.listWallets(userId, signal), financeApi.listTransfers(userId, signal)
    ]);
    setWallets(nextWallets);
    setTransfers(nextTransfers);
    await Promise.all([
      ...nextWallets.map((wallet) => putLocalRecord({ key: `wallets:${wallet.id}`, ownerUserId: userId, entity: 'wallets', id: wallet.id, value: wallet, updatedAt: Date.now() })),
      ...nextTransfers.map((transfer) => putLocalRecord({ key: `transfers:${transfer.id}`, ownerUserId: userId, entity: 'transfers', id: transfer.id, value: transfer, updatedAt: Date.now() }))
    ]);
  }, [userId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void refresh(controller.signal).catch(async () => {
      if (controller.signal.aborted) return;
      try {
        const [walletRecords, transferRecords] = await Promise.all([
          listLocalRecords<ApiWallet>(userId, 'wallets'), listLocalRecords<ApiTransfer>(userId, 'transfers')
        ]);
        setWallets(walletRecords.map((record) => record.value));
        setTransfers(transferRecords.filter((record) => !record.deleted).map((record) => record.value));
      } catch { showToast('Không tải được ví và lịch sử chuyển tiền. Hãy thử kết nối lại.'); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh, showToast, userId]);

  useEffect(() => {
    if (!wallets.some((wallet) => wallet.id === sourceWalletId)) setSourceWalletId(wallets[0]?.id ?? '');
    if (!wallets.some((wallet) => wallet.id === destinationWalletId) || destinationWalletId === sourceWalletId) {
      setDestinationWalletId(wallets.find((wallet) => wallet.id !== sourceWalletId)?.id ?? '');
    }
  }, [wallets, sourceWalletId, destinationWalletId]);

  if (!session) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = parseTransactionAmount(amount);
    if (wallets.length < 2) { showToast('Bạn cần có ít nhất hai ví để chuyển tiền.'); return; }
    if (!sourceWalletId || !destinationWalletId) { showToast('Hãy chọn ví nguồn và ví nhận.'); return; }
    if (sourceWalletId === destinationWalletId) { showToast('Ví nguồn và ví nhận phải khác nhau.'); return; }
    if (parsedAmount === undefined) { showToast('Số tiền phải là số nguyên VND lớn hơn 0.'); return; }

    const sourceBalance = balances.get(sourceWalletId) ?? 0;
    const destinationBalance = balances.get(destinationWalletId) ?? 0;
    if (!Number.isSafeInteger(sourceBalance - parsedAmount) || !Number.isSafeInteger(destinationBalance + parsedAmount)) {
      showToast('Số dư sau khi chuyển vượt giới hạn số nguyên VND an toàn.');
      return;
    }

    setSubmitting(true);
    try {
      const created = { id: createId(), sourceWalletId, destinationWalletId, amount: parsedAmount, occurredAt: new Date().toISOString(), createdAt: new Date().toISOString() };
      await enqueueLocalMutation({ ownerUserId: userId, entity: 'transfers', operation: 'create', recordId: created.id, payload: created, value: created });
      setTransfers((current) => [created as ApiTransfer, ...current.filter((item) => item.id !== created.id)]);
      setWallets((current) => current.map((wallet) => wallet.id === sourceWalletId ? { ...wallet, currentBalance: wallet.currentBalance - parsedAmount } : wallet.id === destinationWalletId ? { ...wallet, currentBalance: wallet.currentBalance + parsedAmount } : wallet));
      setAmount('');
      void syncOutbox(userId, csrfToken);
      showToast(navigator.onLine ? 'Đã lưu chuyển tiền. Đang đồng bộ…' : 'Đã lưu trên thiết bị, sẽ đồng bộ khi có mạng.', 'success');
    } catch {
      showToast('Không chuyển được tiền. Hãy kiểm tra kết nối và thử lại.');
    } finally { setSubmitting(false); }
  }

  return <>
    <div className="transfer-page-heading">
      <Link to="/dashboard" className="wallet-back" aria-label="Quay lại trang chủ"><ChevronLeft /></Link>
      <div><h1>Chuyển tiền</h1><p>Chuyển số dư giữa các ví của bạn</p></div>
    </div>
    <section className="transfer-panel">
      <div className="transfer-panel-heading"><span className="transfer-panel-icon"><ArrowLeftRight /></span><div><h2>Chuyển giữa các ví</h2><p>Khoản chuyển không tính vào thu hoặc chi.</p></div></div>
      <FinanceToast toast={toast} />
      <form className="finance-form" onSubmit={submit}>
        <label className="finance-field"><span>Ví nguồn</span><select value={sourceWalletId} onChange={(event) => setSourceWalletId(event.target.value)}><option value="">Chọn ví nguồn</option>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name} · {formatVnd(wallet.currentBalance)}</option>)}</select></label>
        <label className="finance-field"><span>Ví nhận</span><select value={destinationWalletId} onChange={(event) => setDestinationWalletId(event.target.value)}><option value="">Chọn ví nhận</option>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id} disabled={wallet.id === sourceWalletId}>{wallet.name} · {formatVnd(wallet.currentBalance)}</option>)}</select></label>
        <label className="finance-field"><span>Số tiền</span><VndInput value={amount} onChange={setAmount} placeholder="Ví dụ: 500.000" /></label>
        {wallets.length < 2 && <p className="transfer-hint">Bạn cần tạo thêm ví để thực hiện chuyển tiền.</p>}
        <button type="submit" className="account-primary-button transfer-submit" disabled={loading || submitting || wallets.length < 2}><ArrowLeftRight aria-hidden="true" />{submitting ? 'Đang chuyển...' : 'Xác nhận chuyển'}</button>
      </form>
    </section>
    <section className="transfer-history">
      <div className="account-section-title"><h2>Chuyển tiền gần đây</h2></div>
      {loading ? <div className="account-empty"><p>Đang tải dữ liệu...</p></div> : transfers.length === 0 ? <div className="account-empty"><h3>Chưa có lần chuyển nào</h3><p>Các lần chuyển giữa ví sẽ hiện ở đây.</p></div> : <div className="transfer-history-list">{transfers.slice(0, 10).map((transfer) => <article className="transfer-history-row" key={transfer.id}><span><ArrowUpRight /></span><div><strong>{transfer.sourceWalletName ?? transfer.sourceWalletId} → {transfer.destinationWalletName ?? transfer.destinationWalletId}</strong><small>{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(transfer.occurredAt))}</small></div><b>{formatVnd(transfer.amount)}</b></article>)}</div>}
    </section>
  </>;
}
