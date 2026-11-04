import { describe, expect, it } from 'vitest';
import { parseTransactionAmount, parseTransactionTags } from './transactions-data';

describe('transaction form data', () => {
  it('accepts only positive whole VND amounts within the safe integer range', () => {
    expect(parseTransactionAmount('120000')).toBe(120_000);
    expect(parseTransactionAmount('120.000')).toBe(120_000);
    expect(parseTransactionAmount('0')).toBeUndefined();
    expect(parseTransactionAmount('-1')).toBeUndefined();
    expect(parseTransactionAmount('1.5')).toBeUndefined();
    expect(parseTransactionAmount('9007199254740992')).toBeUndefined();
  });

  it('trims, removes empty and duplicate labels, and limits the count', () => {
    expect(parseTransactionTags(' ăn trưa, công việc, ăn trưa, , nhà ')).toEqual(['ăn trưa', 'công việc', 'nhà']);
    expect(parseTransactionTags(Array.from({ length: 10 }, (_, index) => `tag${index}`).join(','))).toHaveLength(8);
  });
});
