export function parseVndInteger(value: string): number | undefined {
  const normalized = value.trim();
  if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(normalized)) return undefined;
  const amount = Number(normalized.replaceAll('.', ''));
  return Number.isSafeInteger(amount) ? amount : undefined;
}

export function formatVndInput(value: string, allowNegative = false): string {
  const negative = allowNegative && value.trimStart().startsWith('-');
  const digits = value.replace(/\D/g, '');
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped}`;
}

export function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(amount)} ₫`;
}

export function isDuplicateName(name: string, entries: Array<{ id: string; name: string }>, exceptId?: string): boolean {
  const normalized = name.trim().toLocaleLowerCase('vi');
  return entries.some((entry) => entry.id !== exceptId && entry.name.toLocaleLowerCase('vi') === normalized);
}
