import { useEffect, useState } from 'react';
import { loadFinanceData, saveFinanceData } from './finance-data';
import type { FinanceData } from './finance-data';

export function useFinanceData(userId: string) {
  const [data, setData] = useState<FinanceData>(() => loadFinanceData(userId));
  useEffect(() => { saveFinanceData(userId, data); }, [data, userId]);
  return [data, setData] as const;
}
