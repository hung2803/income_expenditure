import { useState } from 'react';
import { usePageLoader } from '@/hooks/use-page-loader';
import { financeApi } from '@/infrastructure/api/finance';
import { cacheRemoteList, listLocalRecords } from '@/infrastructure/sync/sync-storage';
import type { Category, Wallet } from './finance-data';
import type { Transaction } from './transactions-data';
import { ensureDefaultWallet } from './default-wallet';

const newestFirst = (a: Transaction, b: Transaction) => b.occurredAt.localeCompare(a.occurredAt);

/**
 * Danh mục, ví (ẩn) và giao dịch dùng chung cho danh sách Thu chi và màn hình thêm/sửa.
 * Lỗi API khi tải lần đầu thì dùng bản lưu cục bộ; lỗi khi kéo làm mới được ném lại cho PullToRefresh.
 */
export function useTransactionData(userId: string, csrfToken: string, onLoadError: () => void) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loaded, setLoaded] = useState(false);

  usePageLoader(async (controller, refreshing) => {
    try {
      const [nextCategories, nextWallets, nextTransactions] = await Promise.all([
        financeApi.listCategories(userId, controller.signal),
        financeApi.listWallets(userId, controller.signal),
        financeApi.listTransactions(userId, controller.signal)
      ]);
      const [localCategories, localWallets, localTransactions] = await Promise.all([
        cacheRemoteList(userId, 'categories', nextCategories, controller.signal),
        cacheRemoteList(userId, 'wallets', await ensureDefaultWallet(userId, nextWallets, csrfToken), controller.signal),
        cacheRemoteList(userId, 'transactions', nextTransactions, controller.signal)
      ]);
      if (controller.signal.aborted) return;
      setCategories(localCategories); setWallets(localWallets);
      setTransactions(localTransactions.sort(newestFirst));
    } catch (error) {
      if (controller.signal.aborted) return;
      if (refreshing) throw error;
      try {
        const [savedCategories, savedWallets, savedTransactions] = await Promise.all([
          listLocalRecords<Category>(userId, 'categories'), listLocalRecords<Wallet>(userId, 'wallets'), listLocalRecords<Transaction>(userId, 'transactions')
        ]);
        if (controller.signal.aborted) return;
        setCategories(savedCategories.map((item) => item.value));
        setWallets(savedWallets.map((item) => item.value));
        setTransactions(savedTransactions.filter((item) => !item.deleted).map((item) => item.value).sort(newestFirst));
      } catch { if (!controller.signal.aborted) onLoadError(); }
    } finally { if (!controller.signal.aborted) setLoaded(true); }
  }, userId);

  return { categories, wallets, transactions, setTransactions, loaded };
}
