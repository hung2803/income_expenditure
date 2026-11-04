import { userDataPrefix } from '../../infrastructure/auth/user-data';
export { formatVnd, isDuplicateName, parseVndInteger } from './finance-rules';

export type WalletType = 'CASH' | 'BANK' | 'E_WALLET' | 'OTHER';
export type CategoryType = 'EXPENSE' | 'INCOME';

export interface Wallet {
  id: string;
  name: string;
  type: WalletType;
  openingBalance: number;
  accountLabel: string;
  accountReference: string;
}

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  isDefault: boolean;
}

export interface FinanceData {
  wallets: Wallet[];
  categories: Category[];
}

const storageSuffix = 'finance-v1';

const defaultCategories: Category[] = [
  ['expense-food', 'Ăn uống', 'EXPENSE'],
  ['expense-shopping', 'Mua sắm', 'EXPENSE'],
  ['expense-housing', 'Tiền nhà', 'EXPENSE'],
  ['expense-transport', 'Di chuyển', 'EXPENSE'],
  ['expense-health', 'Sức khỏe', 'EXPENSE'],
  ['expense-learning', 'Học tập', 'EXPENSE'],
  ['expense-entertainment', 'Giải trí', 'EXPENSE'],
  ['expense-other', 'Khác', 'EXPENSE'],
  ['income-salary', 'Lương', 'INCOME'],
  ['income-bonus', 'Thưởng', 'INCOME'],
  ['income-investment', 'Đầu tư', 'INCOME'],
  ['income-other', 'Khác', 'INCOME']
].map(([id, name, type]) => ({ id, name, type: type as CategoryType, isDefault: true }));

const emptyData = (): FinanceData => ({ wallets: [], categories: defaultCategories.map((category) => ({ ...category })) });

export function financeStorageKey(userId: string): string {
  return `${userDataPrefix(userId)}${storageSuffix}`;
}

export function loadFinanceData(userId: string): FinanceData {
  try {
    const serialized = localStorage.getItem(financeStorageKey(userId));
    if (!serialized) return emptyData();
    const value: unknown = JSON.parse(serialized);
    if (!value || typeof value !== 'object') return emptyData();
    const data = value as Partial<FinanceData>;
    if (!Array.isArray(data.wallets) || !Array.isArray(data.categories)) return emptyData();
    return { wallets: data.wallets, categories: data.categories } as FinanceData;
  } catch {
    return emptyData();
  }
}

export function saveFinanceData(userId: string, data: FinanceData): void {
  localStorage.setItem(financeStorageKey(userId), JSON.stringify(data));
}

export function createId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

