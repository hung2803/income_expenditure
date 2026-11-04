import { useLayoutEffect, useRef, useState } from 'react';
import { LoaderCircle, Trash2, X } from 'lucide-react';
import { useModalDialog } from '@/hooks/use-modal-dialog';
import { formatVnd } from './finance-data';
import type { Transaction } from './transactions-data';

export function DeleteTransactionDialog({ transaction, onClose, onConfirm }: { transaction: Transaction; onClose: () => void; onConfirm: () => Promise<void> }) {
  const dialog = useModalDialog();
  const cancel = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const kind = transaction.type === 'EXPENSE' ? 'khoản chi' : 'khoản thu';
  useLayoutEffect(() => { cancel.current?.focus({ preventScroll: true }); }, []);

  async function confirm() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try { await onConfirm(); onClose(); }
    catch { setError('Không xóa được giao dịch. Hãy thử lại.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  function close() { if (!submitting.current) onClose(); }

  return <dialog ref={dialog} className="account-dialog transaction-delete-dialog" aria-labelledby="transaction-delete-title" aria-describedby="transaction-delete-description" onCancel={event => { event.preventDefault(); close(); }}>
    <button type="button" className="account-dialog-close" aria-label="Đóng" disabled={busy} onClick={close}><X aria-hidden="true" /></button>
    <span className="account-empty-icon transaction-delete-icon"><Trash2 aria-hidden="true" /></span>
    <h2 id="transaction-delete-title">Xóa {kind}?</h2>
    <p id="transaction-delete-description">Bạn có chắc muốn xóa {kind} này?</p>
    <div className="transaction-delete-summary"><strong>{formatVnd(transaction.amount)}</strong><span>{transaction.note.trim() || (transaction.type === 'EXPENSE' ? 'Khoản chi' : 'Khoản thu')}</span><small>{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(transaction.occurredAt))}</small></div>
    {error && <p className="finance-form-error" role="alert">{error}</p>}
    <div className="account-dialog-actions"><button type="button" className="account-secondary-button" ref={cancel} onClick={close} disabled={busy}>Hủy</button><button type="button" className="account-danger-button" onClick={() => void confirm()} disabled={busy}>{busy && <LoaderCircle className="auth-spinner" aria-hidden="true" />}{busy ? 'Đang xóa…' : `Xóa ${kind}`}</button></div>
  </dialog>;
}
