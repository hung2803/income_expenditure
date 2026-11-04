import type { ApiBudget, ApiTransaction } from '../../infrastructure/api/finance';

export interface BudgetCategoryUsage {
  budget: ApiBudget;
  spent: number;
  remaining: number;
  percentUsed: number;
}

export interface BudgetMonthSummary {
  month: string;
  budgetTotal: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  categories: BudgetCategoryUsage[];
  hasTotalBudget: boolean;
}

export function localMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function transactionMonth(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return localMonthKey(date);
}

export function summarizeBudgetMonth(month: string, budgets: ApiBudget[], transactions: ApiTransaction[]): BudgetMonthSummary {
  const monthlyBudgets = budgets.filter((budget) => budget.period === month);
  const expenses = transactions.filter((transaction) => transaction.type === 'EXPENSE' && transactionMonth(transaction.occurredAt) === month);
  const categoryBudgets = monthlyBudgets.filter((budget) => budget.categoryId !== null);
  const categories = categoryBudgets.map((budget) => {
    const spent = expenses.filter((transaction) => transaction.categoryId === budget.categoryId).reduce((sum, transaction) => sum + transaction.amount, 0);
    return { budget, spent, remaining: budget.amount - spent, percentUsed: budget.amount > 0 ? (spent / budget.amount) * 100 : 0 };
  });
  const totalBudget = monthlyBudgets.find((budget) => budget.categoryId === null);
  const hasTotalBudget = Boolean(totalBudget);
  const budgetTotal = totalBudget?.amount ?? categoryBudgets.reduce((sum, budget) => sum + budget.amount, 0);
  const spent = hasTotalBudget
    ? expenses.reduce((sum, transaction) => sum + transaction.amount, 0)
    : categories.reduce((sum, category) => sum + category.spent, 0);
  return { month, budgetTotal, spent, remaining: budgetTotal - spent, percentUsed: budgetTotal > 0 ? (spent / budgetTotal) * 100 : 0, categories, hasTotalBudget };
}
