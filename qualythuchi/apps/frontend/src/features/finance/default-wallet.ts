import { financeApi, type ApiWallet } from '@/infrastructure/api/finance';
import type { Wallet } from './finance-data';

/**
 * Ví được ẩn khỏi giao diện cá nhân: mọi giao dịch tự gán vào một ví mặc định.
 * Dữ liệu ví vẫn giữ trong database để số dư, đồng bộ và lịch sử không đổi.
 */
export const DEFAULT_WALLET_NAME = 'Ví chính';

const pending = new Map<string, Promise<ApiWallet[]>>();

export function pickDefaultWallet<T extends Pick<Wallet, 'id' | 'name'>>(wallets: readonly T[]): T | undefined {
  return wallets.find((item) => item.name === DEFAULT_WALLET_NAME) ?? wallets[0];
}

/** Tạo ví mặc định khi tài khoản chưa có ví nào. Cần mạng; lỗi được ném lại cho màn hình xử lý. */
export async function ensureDefaultWallet(ownerUserId: string, wallets: ApiWallet[], csrfToken: string): Promise<ApiWallet[]> {
  if (wallets.length > 0) return wallets;
  const running = pending.get(ownerUserId);
  if (running) return running;
  const task = financeApi.createWallet(ownerUserId, { name: DEFAULT_WALLET_NAME, type: 'CASH', openingBalance: 0, accountLabel: '', accountReference: '' }, csrfToken)
    .then((wallet) => [wallet])
    // Một màn hình khác có thể vừa tạo xong (tên trùng): đọc lại danh sách.
    .catch(async () => financeApi.listWallets(ownerUserId))
    .finally(() => pending.delete(ownerUserId));
  pending.set(ownerUserId, task);
  return task;
}
