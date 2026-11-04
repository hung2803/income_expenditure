import type { FinanceToastMessage } from './use-finance-toast';

export function FinanceToast({ toast }: { toast: FinanceToastMessage | null }) {
  if (!toast) return null;
  return <p className={`finance-toast finance-toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>{toast.message}</p>;
}
