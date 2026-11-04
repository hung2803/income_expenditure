import type { Wallet, Category } from '../../features/finance/finance-data';
import type { Transaction, TransactionType } from '../../features/finance/transactions-data';
import type { WalletTransfer } from '../../features/finance/finance-ledger';
import { createHttpClient } from './http';

export interface ApiWallet extends Wallet { ownerUserId: string; currentBalance: number; createdAt: string; updatedAt: string }
export interface ApiCategory extends Category { ownerUserId: string; createdAt: string; updatedAt: string }
export interface ApiBudget {
  id: string; ownerUserId: string; categoryId: string | null; categoryName: string | null;
  period: string; amount: number; revision: number; createdAt: number; updatedAt: number;
}
export interface ApiSavingsGoal { id:string; ownerUserId:string; name:string; description:string; targetAmount:number; dueDate:string|null; status:'ACTIVE'|'COMPLETED'|'PAUSED'; revision:number; createdAt:number; updatedAt:number; savedAmount:number; progressPercent:number }
export interface ApiSavingsContribution { id:string; ownerUserId:string; goalId:string; amount:number; contributedAt:number; note:string; createdAt:number }
export interface ApiRecurringSchedule { id:string; ownerUserId:string; name:string; type:TransactionType; amount:number; walletId:string; categoryId:string; categoryName:string; walletName:string; cadence:'DAILY'|'WEEKLY'|'MONTHLY'; intervalCount:number; dayOfMonth:number|null; startDate:string; nextDueDate:string; timezone:string; note:string; isActive:number; revision:number; createdAt:number; updatedAt:number }
export interface ApiTransaction extends Transaction { ownerUserId: string; deletedAt: string | null; revision: number }
export interface ApiTransfer extends WalletTransfer {
  ownerUserId: string;
  type: 'TRANSFER';
  revision: number;
  sourceWalletName?: string;
  destinationWalletName?: string;
}
export interface FinanceSummary {
  totalBalance: number;
  incomeThisMonth: number;
  expenseThisMonth: number;
  recent: Array<{
    id: string;
    type: TransactionType | 'TRANSFER';
    amount: number;
    occurredAt: string;
    note: string;
    walletName: string;
    destinationWalletName?: string;
  }>;
}

export interface FinanceReport {
  from: string;
  to: string;
  timezone: string;
  bucket: 'day' | 'week' | 'month';
  totals: { income: number; expense: number; net: number; count: number };
  series: Array<{ key: string; income: number; expense: number }>;
  categories: Array<{ categoryId: string; name: string; type: TransactionType; amount: number }>;
  wallets: Array<{ walletId: string; name: string; amount: number }>;
}

export interface TransactionSearchQuery {
  from?: string;
  to?: string;
  timezone?: string;
  categoryId?: string;
  walletId?: string;
  type?: TransactionType;
  minAmount?: number;
  maxAmount?: number;
  tag?: string;
  keyword?: string;
  sort?: 'newest' | 'oldest' | 'amount-desc' | 'amount-asc';
  page?: number;
  limit?: number;
}

export interface TransactionSearchResult {
  transactions: ApiTransaction[];
  total: number;
  page: number;
  limit: number;
}

export interface SyncChangeInput {
  entity: 'transaction' | 'transfer';
  operation: 'upsert' | 'delete';
  id: string;
  revision?: number;
  data?: Record<string, unknown>;
}

export interface SyncChangeOutput {
  cursor: number;
  entity: 'wallet' | 'category' | 'transaction' | 'transfer' | 'budget' | 'savings_goal' | 'savings_contribution' | 'recurring_schedule';
  recordId: string;
  revision: number;
  operation: 'UPSERT' | 'DELETE';
  payload: unknown;
  changedAt: number;
}

export function createFinanceApi(baseUrl = '', fetcher: typeof fetch = fetch) {
  const http = createHttpClient(baseUrl, fetcher);
  const ownerPath = (ownerUserId: string) => `/api/users/${encodeURIComponent(ownerUserId)}`;
  return {
    listWallets: async (ownerUserId: string, signal?: AbortSignal) =>
      (await http.get<{ wallets: ApiWallet[] }>(`${ownerPath(ownerUserId)}/wallets`, { signal })).wallets,
    createWallet: async (ownerUserId: string, input: Omit<Wallet, 'id'>, csrfToken: string) =>
      (await http.post<{ wallet: ApiWallet }>(`${ownerPath(ownerUserId)}/wallets`, input, { csrfToken })).wallet,
    updateWallet: async (ownerUserId: string, walletId: string, input: Omit<Wallet, 'id'>, csrfToken: string) =>
      (await http.put<{ wallet: ApiWallet }>(`${ownerPath(ownerUserId)}/wallets/${encodeURIComponent(walletId)}`, input, { csrfToken })).wallet,
    deleteWallet: async (ownerUserId: string, walletId: string, csrfToken: string) =>
      http.delete<void>(`${ownerPath(ownerUserId)}/wallets/${encodeURIComponent(walletId)}`, { csrfToken }),
    listCategories: async (ownerUserId: string, signal?: AbortSignal) =>
      (await http.get<{ categories: ApiCategory[] }>(`${ownerPath(ownerUserId)}/categories`, { signal })).categories,
    createCategory: async (ownerUserId: string, input: Pick<Category, 'name' | 'type'>, csrfToken: string) =>
      (await http.post<{ category: ApiCategory }>(`${ownerPath(ownerUserId)}/categories`, input, { csrfToken })).category,
    updateCategory: async (ownerUserId: string, categoryId: string, input: Pick<Category, 'name' | 'type'>, csrfToken: string) =>
      (await http.put<{ category: ApiCategory }>(`${ownerPath(ownerUserId)}/categories/${encodeURIComponent(categoryId)}`, input, { csrfToken })).category,
    deleteCategory: async (ownerUserId: string, categoryId: string, csrfToken: string) =>
      http.delete<void>(`${ownerPath(ownerUserId)}/categories/${encodeURIComponent(categoryId)}`, { csrfToken }),
    listBudgets: async (ownerUserId: string, signal?: AbortSignal) =>
      (await http.get<{ budgets: ApiBudget[] }>(`${ownerPath(ownerUserId)}/budgets`, { signal })).budgets,
    createBudget: async (ownerUserId: string, input: Pick<ApiBudget, 'categoryId' | 'period' | 'amount'>, csrfToken: string) =>
      (await http.post<{ budget: ApiBudget }>(`${ownerPath(ownerUserId)}/budgets`, input, { csrfToken })).budget,
    updateBudget: async (ownerUserId: string, budgetId: string, input: Pick<ApiBudget, 'categoryId' | 'period' | 'amount'>, csrfToken: string) =>
      (await http.put<{ budget: ApiBudget }>(`${ownerPath(ownerUserId)}/budgets/${encodeURIComponent(budgetId)}`, input, { csrfToken })).budget,
    deleteBudget: async (ownerUserId: string, budgetId: string, csrfToken: string) =>
      http.delete<void>(`${ownerPath(ownerUserId)}/budgets/${encodeURIComponent(budgetId)}`, { csrfToken }),
    listSavingsGoals: async (ownerUserId:string,signal?:AbortSignal) => (await http.get<{goals:ApiSavingsGoal[]}>(`${ownerPath(ownerUserId)}/savings-goals`,{signal})).goals,
    createSavingsGoal: async(ownerUserId:string,input:Pick<ApiSavingsGoal,'name'|'description'|'targetAmount'|'dueDate'>,csrfToken:string) => (await http.post<{goal:ApiSavingsGoal}>(`${ownerPath(ownerUserId)}/savings-goals`,input,{csrfToken})).goal,
    updateSavingsGoal: async(ownerUserId:string,id:string,input:Pick<ApiSavingsGoal,'name'|'description'|'targetAmount'|'dueDate'>,csrfToken:string) => (await http.put<{goal:ApiSavingsGoal}>(`${ownerPath(ownerUserId)}/savings-goals/${encodeURIComponent(id)}`,input,{csrfToken})).goal,
    deleteSavingsGoal: async(ownerUserId:string,id:string,csrfToken:string) => http.delete<void>(`${ownerPath(ownerUserId)}/savings-goals/${encodeURIComponent(id)}`,{csrfToken}),
    addSavingsContribution: async(ownerUserId:string,goalId:string,input:Pick<ApiSavingsContribution,'amount'|'note'>,csrfToken:string) => (await http.post<{contribution:ApiSavingsContribution}>(`${ownerPath(ownerUserId)}/savings-goals/${encodeURIComponent(goalId)}/contributions`,input,{csrfToken})).contribution,
    listRecurringSchedules: async(ownerUserId:string,signal?:AbortSignal) => (await http.get<{schedules:ApiRecurringSchedule[]}>(`${ownerPath(ownerUserId)}/recurring-schedules`,{signal})).schedules,
    createRecurringSchedule: async(ownerUserId:string,input:Record<string,unknown>,csrfToken:string) => (await http.post<{schedule:ApiRecurringSchedule}>(`${ownerPath(ownerUserId)}/recurring-schedules`,input,{csrfToken})).schedule,
    setRecurringActive: async(ownerUserId:string,id:string,isActive:boolean,csrfToken:string) => (await http.patch<{schedule:ApiRecurringSchedule}>(`${ownerPath(ownerUserId)}/recurring-schedules/${encodeURIComponent(id)}`,{isActive},{csrfToken})).schedule,
    deleteRecurringSchedule: async(ownerUserId:string,id:string,csrfToken:string) => http.delete<void>(`${ownerPath(ownerUserId)}/recurring-schedules/${encodeURIComponent(id)}`,{csrfToken}),
    confirmRecurringPayment: async(ownerUserId:string,id:string,dueDate:string,csrfToken:string) => http.post<{transaction:ApiTransaction;duplicate:boolean}>(`${ownerPath(ownerUserId)}/recurring-schedules/${encodeURIComponent(id)}/confirm`,{dueDate},{csrfToken}),
    listTransactions: async (ownerUserId: string, signal?: AbortSignal) =>
      (await http.get<{ transactions: ApiTransaction[] }>(`${ownerPath(ownerUserId)}/transactions`, { signal })).transactions,
    searchTransactions: async (ownerUserId: string, query: TransactionSearchQuery, signal?: AbortSignal) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value));
      return http.get<TransactionSearchResult>(`${ownerPath(ownerUserId)}/transactions/search?${params.toString()}`, { signal });
    },
    getReport: async (ownerUserId: string, query: Pick<FinanceReport, 'from' | 'to' | 'timezone' | 'bucket'> & Pick<TransactionSearchQuery, 'categoryId' | 'walletId'>, signal?: AbortSignal) => {
      const params = new URLSearchParams({ from: query.from, to: query.to, timezone: query.timezone, bucket: query.bucket });
      if (query.categoryId) params.set('categoryId', query.categoryId);
      if (query.walletId) params.set('walletId', query.walletId);
      return http.get<FinanceReport>(`${ownerPath(ownerUserId)}/reports/summary?${params.toString()}`, { signal });
    },
    createTransaction: async (ownerUserId: string, input: Omit<Transaction, 'createdAt' | 'updatedAt'>, csrfToken: string) =>
      (await http.post<{ transaction: ApiTransaction }>(`${ownerPath(ownerUserId)}/transactions`, input, { csrfToken })).transaction,
    updateTransaction: async (ownerUserId: string, transactionId: string, input: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> & { revision?: number }, csrfToken: string) =>
      (await http.put<{ transaction: ApiTransaction }>(`${ownerPath(ownerUserId)}/transactions/${encodeURIComponent(transactionId)}`, input, { csrfToken })).transaction,
    deleteTransaction: async (ownerUserId: string, transactionId: string, csrfToken: string) =>
      (await http.delete<{ transaction: ApiTransaction }>(`${ownerPath(ownerUserId)}/transactions/${encodeURIComponent(transactionId)}`, { csrfToken } )).transaction,
    undoDeleteTransaction: async (ownerUserId: string, transactionId: string, csrfToken: string) =>
      (await http.post<{ transaction: ApiTransaction }>(`${ownerPath(ownerUserId)}/transactions/${encodeURIComponent(transactionId)}/undo`, {}, { csrfToken })).transaction,
    listTransfers: async (ownerUserId: string, signal?: AbortSignal) =>
      (await http.get<{ transfers: ApiTransfer[] }>(`${ownerPath(ownerUserId)}/transfers`, { signal })).transfers,
    createTransfer: async (ownerUserId: string, input: Pick<WalletTransfer, 'id' | 'sourceWalletId' | 'destinationWalletId' | 'amount' | 'occurredAt'>, csrfToken: string) =>
      (await http.post<{ transfer: ApiTransfer }>(`${ownerPath(ownerUserId)}/transfers`, input, { csrfToken })).transfer,
    getSummary: async (ownerUserId: string, signal?: AbortSignal, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') =>
      http.get<FinanceSummary>(`${ownerPath(ownerUserId)}/summary?timezone=${encodeURIComponent(timeZone)}`, { signal }),
    pushSync: async (ownerUserId: string, idempotencyKey: string, changes: SyncChangeInput[], csrfToken: string) =>
      http.post<{ idempotencyKey: string; applied: Array<{ entity: string; operation: string; id: string }> }>(`${ownerPath(ownerUserId)}/sync/push`, { idempotencyKey, changes }, { csrfToken }),
    pullSync: async (ownerUserId: string, cursor: number, signal?: AbortSignal) =>
      http.get<{ changes: SyncChangeOutput[]; cursor: number; hasMore: boolean }>(`${ownerPath(ownerUserId)}/sync/pull?cursor=${cursor}&limit=200`, { signal })
  };
}

export const financeApi = createFinanceApi(import.meta.env.VITE_API_BASE_URL ?? '');

