import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Banknote, Building2, ChevronDown, ChevronLeft, CirclePlus, Landmark, Pencil, Plus, Trash2, Wallet as WalletIcon, WalletCards, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { Button } from '@/components/ui/button';
import { createId, formatVnd, isDuplicateName, parseVndInteger } from './finance-data';
import { formatVndInput } from './finance-rules';
import { VndInput } from './VndInput';
import type { Wallet, WalletType } from './finance-data';
import { FinanceToast } from './FinanceToast';
import { useFinanceToast } from './use-finance-toast';
import { financeApi } from '@/infrastructure/api/finance';
import type { ApiWallet } from '@/infrastructure/api/finance';
import { listLocalRecords, putLocalRecord } from '@/infrastructure/sync/sync-storage';
import './finance.css';

const walletTypes: Array<{ value: WalletType; label: string; icon: typeof WalletIcon; tint: string }> = [
  { value: 'CASH', label: 'Tiền mặt', icon: Banknote, tint: 'wallet-tile-cash' },
  { value: 'BANK', label: 'Ngân hàng', icon: Landmark, tint: 'wallet-tile-bank' },
  { value: 'E_WALLET', label: 'Ví điện tử', icon: WalletCards, tint: 'wallet-tile-electronic' },
  { value: 'OTHER', label: 'Khác', icon: Building2, tint: 'wallet-tile-other' }
];

export function WalletsPage() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [wallets, setWallets] = useState<ApiWallet[]>([]);
  const { toast, showToast } = useFinanceToast();
  const [editing, setEditing] = useState<Wallet | null>(null);
  const balances = useMemo(() => new Map(wallets.map((wallet) => [wallet.id, wallet.currentBalance])), [wallets]);
  const total = useMemo(() => wallets.reduce((sum, wallet) => sum + wallet.currentBalance, 0), [wallets]);
  useEffect(() => {
    const controller = new AbortController();
    void financeApi.listWallets(userId, controller.signal).then(async (items) => {
      setWallets(items);
      await Promise.all(items.map((item) => putLocalRecord({ key: `wallets:${item.id}`, ownerUserId: userId, entity: 'wallets', id: item.id, value: item, updatedAt: Date.now() })));
    }).catch(async () => {
      if (controller.signal.aborted) return;
      try { setWallets((await listLocalRecords<ApiWallet>(userId, 'wallets')).map((item) => item.value)); }
      catch { showToast('Không tải được danh sách ví. Hãy thử kết nối lại.'); }
    });
    return () => controller.abort();
  }, [userId, showToast]);
  if (!session) return null;

  async function saveWallet(wallet: Wallet) {
    const input = { name: wallet.name, type: wallet.type, openingBalance: wallet.openingBalance, accountLabel: wallet.accountLabel, accountReference: wallet.accountReference };
    const saved = editing?.id
      ? await financeApi.updateWallet(userId, editing.id, input, session!.csrfToken)
      : await financeApi.createWallet(userId, input, session!.csrfToken);
    setWallets((current) => editing?.id ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
  }

  async function removeWallet(wallet: Wallet) {
    if (!window.confirm(`Xóa ví “${wallet.name}”?`)) return;
    try {
      await financeApi.deleteWallet(userId, wallet.id, session!.csrfToken);
      setWallets((current) => current.filter((item) => item.id !== wallet.id));
      showToast('Đã xóa ví.', 'success');
    } catch {
      showToast('Không xóa được ví. Ví có thể đang được giao dịch sử dụng.');
    }
  }

  return <>
    <div className="wallet-page-heading">
      <div className="wallet-heading-copy"><Link to="/dashboard" className="wallet-back" aria-label="Quay lại"><ChevronLeft /></Link><div><h1>Quản lý ví</h1><p>Quản lý các ví và tài khoản của bạn</p></div></div>
      <Button onClick={() => setEditing({ id: '', name: '', type: 'CASH', openingBalance: 0, accountLabel: '', accountReference: '' })}><Plus />Thêm ví</Button>
    </div>
    <FinanceToast toast={toast} />

    <section className="wallet-overview" aria-label="Tổng quan số dư">
      <div className="wallet-overview-top"><div><span>Tổng số dư</span><strong className="wallet-total">{formatVnd(total)}</strong></div><span className="wallet-count">{wallets.length} ví đang sử dụng</span></div>
      <div className="wallet-type-summary">
        {walletTypes.slice(0, 3).map(({ value, label, icon: Icon, tint }) => {
          const subtotal = wallets.filter((wallet) => wallet.type === value).reduce((sum, wallet) => sum + wallet.currentBalance, 0);
          const share = total > 0 ? Math.round((subtotal / total) * 100) : 0;
          return <div className="wallet-summary-item" key={value}><span className={`wallet-type-icon ${tint}`}><Icon /></span><span className="wallet-summary-text"><small>{label}</small><strong>{formatVnd(subtotal)}</strong><small>{share}%</small></span></div>;
        })}
      </div>
    </section>

    <section className="account-section wallet-list-section">
      <div className="account-section-title"><h2>Danh sách ví</h2><div className="wallet-section-links"><Link to="/transfers" className="wallet-category-link">Chuyển tiền</Link><Link to="/categories" className="wallet-category-link">Danh mục <span aria-hidden="true">›</span></Link></div></div>
      {wallets.length === 0 ? <div className="account-empty wallet-empty"><span className="account-empty-icon"><WalletIcon /></span><h2>Chưa có ví nào</h2><p>Thêm ví tiền mặt, tài khoản ngân hàng hoặc ví điện tử để bắt đầu quản lý số dư.</p><Button onClick={() => setEditing({ id: '', name: '', type: 'CASH', openingBalance: 0, accountLabel: '', accountReference: '' })} className="account-primary-button"><CirclePlus />Thêm ví đầu tiên</Button></div> : <div className="wallet-list">
        {wallets.map((wallet) => {
          const type = walletTypes.find((item) => item.value === wallet.type) ?? walletTypes[3];
          const Icon = type.icon;
          return <article className="wallet-row" key={wallet.id}><span className={`wallet-type-icon wallet-row-icon ${type.tint}`}><Icon /></span><div className="wallet-row-details"><div className="wallet-row-title"><strong>{wallet.name}</strong>{wallet.type === 'CASH' && <span className="wallet-default-tag">Tiền mặt</span>}</div><span>{type.label}</span>{wallet.accountReference && <small>{wallet.accountLabel || 'Số tài khoản'}: {wallet.accountReference}</small>}</div><strong className="wallet-row-balance">{formatVnd(balances.get(wallet.id) ?? wallet.openingBalance)}</strong><div className="wallet-row-actions"><button type="button" aria-label={`Sửa ví ${wallet.name}`} onClick={() => setEditing(wallet)}><Pencil /></button><button type="button" aria-label={`Xóa ví ${wallet.name}`} onClick={() => removeWallet(wallet)}><Trash2 /></button></div></article>;
        })}
        <button type="button" className="wallet-add-card" onClick={() => setEditing({ id: '', name: '', type: 'CASH', openingBalance: 0, accountLabel: '', accountReference: '' })}><CirclePlus /><span>Thêm ví mới</span><small>Tiền mặt, ngân hàng, ví điện tử…</small></button>
      </div>}
      <p className="finance-local-note">Số dư hiện tại được tính từ số dư ban đầu, giao dịch thu chi và chuyển giữa các ví.</p>
    </section>
    {editing && <WalletDialog key={editing.id || 'new'} wallet={editing.id ? editing : null} wallets={wallets} onClose={() => setEditing(null)} onSave={saveWallet} />}
  </>;
}

function WalletDialog({ wallet, wallets, onClose, onSave }: { wallet: Wallet | null; wallets: Wallet[]; onClose: () => void; onSave: (wallet: Wallet) => Promise<void> }) {
  const [name, setName] = useState(wallet?.name ?? '');
  const [type, setType] = useState<WalletType>(wallet?.type ?? 'CASH');
  const [balance, setBalance] = useState(formatVndInput(String(wallet?.openingBalance ?? 0), true));
  const [accountLabel, setAccountLabel] = useState(wallet?.accountLabel ?? '');
  const [accountReference, setAccountReference] = useState(wallet?.accountReference ?? '');
  const { toast, showToast } = useFinanceToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { if (closeTimer.current) clearTimeout(closeTimer.current); element?.close(); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    const openingBalance = parseVndInteger(balance);
    if (!cleanName || cleanName.length > 40) { showToast('Tên ví cần từ 1 đến 40 ký tự.'); return; }
    if (isDuplicateName(cleanName, wallets, wallet?.id)) { showToast('Tên ví này đã được sử dụng.'); return; }
    if (openingBalance === undefined) { showToast('Số dư phải là số nguyên VND trong giới hạn an toàn.'); return; }
    try {
      await onSave({ id: wallet?.id ?? createId(), name: cleanName, type, openingBalance, accountLabel: accountLabel.trim(), accountReference: accountReference.trim() });
      showToast('Ví đã được lưu.', 'success', 1000);
      closeTimer.current = setTimeout(onClose, 1000);
    } catch {
      showToast('Không lưu được ví. Hãy kiểm tra tên ví và kết nối rồi thử lại.');
    }
  }

  return <dialog ref={dialog} className="account-dialog finance-dialog" onCancel={onClose} aria-labelledby="wallet-dialog-title">
    <button className="account-dialog-close" type="button" aria-label="Đóng" onClick={onClose}><X /></button>
    <div className="finance-dialog-heading"><span className="account-empty-icon"><WalletIcon /></span><h2 id="wallet-dialog-title">{wallet ? 'Chỉnh sửa ví' : 'Thêm ví mới'}</h2><p>Nhập thông tin ví và số dư ban đầu.</p></div>
    <FinanceToast toast={toast} />
    <form onSubmit={submit} className="finance-form">
      <label className="finance-field"><span>Tên ví</span><input autoFocus maxLength={40} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ví dụ: Tiền mặt" /></label>
      <WalletTypeSelect value={type} onChange={setType} />
      <label className="finance-field"><span>Số dư ban đầu</span><VndInput value={balance} onChange={setBalance} allowNegative describedBy="wallet-balance-hint" /><small id="wallet-balance-hint">Nhập số nguyên; cho phép số dư âm.</small></label>
      {type !== 'CASH' && <div className="finance-optional-fields"><label className="finance-field"><span>Nhãn thông tin (không bắt buộc)</span><input maxLength={30} value={accountLabel} onChange={(event) => setAccountLabel(event.target.value)} placeholder={type === 'BANK' ? 'Số tài khoản' : 'Số điện thoại'} /></label><label className="finance-field"><span>Thông tin tài khoản (không bắt buộc)</span><input maxLength={40} value={accountReference} onChange={(event) => setAccountReference(event.target.value)} placeholder="Chỉ hiển thị trên thiết bị này" /></label></div>}
      <div className="finance-dialog-actions"><button type="button" className="account-secondary-button" onClick={onClose}>Hủy</button><button type="submit" className="account-primary-button" disabled={toast?.type === 'success'}>Lưu ví</button></div>
    </form>
  </dialog>;
}

function WalletTypeSelect({ value, onChange }: { value: WalletType; onChange: (value: WalletType) => void }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function closeOnOutside(event: PointerEvent) { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); }
    function closeOnEscape(event: KeyboardEvent) { if (event.key === 'Escape') setOpen(false); }
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOnOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, []);
  const selected = walletTypes.find((item) => item.value === value) ?? walletTypes[0];
  return <div className="finance-field" ref={wrapper}><span id="wallet-type-label">Loại ví</span><button type="button" className="finance-select-trigger" aria-haspopup="listbox" aria-expanded={open} aria-labelledby="wallet-type-label" onClick={() => setOpen((current) => !current)}>{selected.label}<ChevronDown aria-hidden="true" /></button>{open && <div className="finance-select-options" role="listbox" aria-labelledby="wallet-type-label">{walletTypes.map((item) => <button key={item.value} type="button" role="option" aria-selected={item.value === value} onClick={() => { onChange(item.value); setOpen(false); }}>{item.label}</button>)}</div>}</div>;
}
