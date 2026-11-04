import { useCallback, useEffect, useRef, useState } from 'react';

export type FinanceToastMessage = { message: string; type: 'error' | 'success' };

export function useFinanceToast() {
  const [toast, setToast] = useState<FinanceToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const showToast = useCallback((message: string, type: FinanceToastMessage['type'] = 'error', duration = 3000) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, type });
    timer.current = setTimeout(() => setToast(null), duration);
  }, []);

  return { toast, showToast };
}
