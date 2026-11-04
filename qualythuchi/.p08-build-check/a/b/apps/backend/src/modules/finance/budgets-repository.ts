export interface BudgetSummaryRow {
  id: string;
  owner_user_id: string;
  category_id: string | null;
  category_name: string | null;
  period: string;
  amount: number;
  revision: number;
  created_at: number;
  updated_at: number;
  spent: number;
}

export class BudgetsRepository {
  private db: D1DatabaseSession;

  constructor(database: D1Database) { this.db = database.withSession('first-primary'); }

  async getSummary(ownerUserId: string, period: string) {
    const result = await this.db.prepare(`SELECT b.id,b.owner_user_id,b.category_id,c.name AS category_name,b.period,
      b.amount,b.revision,b.created_at,b.updated_at,
      COALESCE(SUM(t.amount),0) AS spent
      FROM budgets b
      LEFT JOIN categories c ON c.owner_user_id=b.owner_user_id AND c.id=b.category_id
      LEFT JOIN transactions t ON t.owner_user_id=b.owner_user_id AND t.type='EXPENSE' AND t.deleted_at IS NULL
        AND t.occurred_at >= CAST(strftime('%s',b.period||'-01') AS INTEGER)*1000
        AND t.occurred_at < CAST(strftime('%s',date(b.period||'-01','+1 month')) AS INTEGER)*1000
        AND (b.category_id IS NULL OR t.category_id=b.category_id)
      WHERE b.owner_user_id=? AND b.period=?
      GROUP BY b.id ORDER BY b.category_id,b.id`).bind(ownerUserId, period).all<BudgetSummaryRow>();
    const budgets = result.results.map((row) => ({
      id: row.id,
      ownerUserId: row.owner_user_id,
      categoryId: row.category_id,
      categoryName: row.category_name,
      period: row.period,
      amount: row.amount,
      spent: row.spent,
      remaining: row.amount - row.spent,
      percentUsed: row.amount === 0 ? 0 : row.spent / row.amount * 100,
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    const totalBudget = budgets.find((budget) => budget.categoryId === null);
    const trackedBudgets = totalBudget ? budgets : budgets.filter((budget) => budget.categoryId !== null);
    const budgetAmount = totalBudget?.amount ?? trackedBudgets.reduce((total, budget) => total + budget.amount, 0);
    const spent = totalBudget?.spent ?? trackedBudgets.reduce((total, budget) => total + budget.spent, 0);
    const thresholdRows = await this.db.prepare(`SELECT id,owner_user_id,budget_id,period,milestone,spent_amount,budget_amount,created_at
      FROM budget_threshold_events WHERE owner_user_id=? AND period=? ORDER BY created_at DESC,id`)
      .bind(ownerUserId, period).all<{
        id: string; owner_user_id: string; budget_id: string; period: string; milestone: number;
        spent_amount: number; budget_amount: number; created_at: number;
      }>();
    return {
      period,
      budgetAmount,
      spent,
      remaining: budgetAmount - spent,
      percentUsed: budgetAmount === 0 ? 0 : spent / budgetAmount * 100,
      budgets,
      thresholdEvents: thresholdRows.results.map((row) => ({
        id: row.id,
        ownerUserId: row.owner_user_id,
        budgetId: row.budget_id,
        period: row.period,
        milestone: row.milestone,
        spentAmount: row.spent_amount,
        budgetAmount: row.budget_amount,
        createdAt: row.created_at
      }))
    };
  }
}
