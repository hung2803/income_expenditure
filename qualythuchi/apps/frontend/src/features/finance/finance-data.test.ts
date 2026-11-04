import { describe, expect, it } from 'vitest';
import { formatVnd, formatVndInput, isDuplicateName, parseVndInteger } from './finance-rules';

describe('finance data helpers', () => {
  it('parses whole VND amounts, including a negative opening balance', () => {
    expect(parseVndInteger('2500000')).toBe(2_500_000);
    expect(parseVndInteger('2.500.000')).toBe(2_500_000);
    expect(parseVndInteger('-125000')).toBe(-125_000);
    expect(parseVndInteger('1.5')).toBeUndefined();
    expect(parseVndInteger('9007199254740992')).toBeUndefined();
  });

  it('groups digits in VND inputs while preserving a leading negative sign when allowed', () => {
    expect(formatVndInput('2500000')).toBe('2.500.000');
    expect(formatVndInput('-125000', true)).toBe('-125.000');
    expect(formatVndInput('-125000')).toBe('125.000');
    expect(parseVndInteger('-125.000')).toBe(-125_000);
    expect(parseVndInteger('1.5')).toBeUndefined();
  });

  it('formats VND without decimals', () => {
    expect(formatVnd(2_500_000)).toBe('2.500.000 ₫');
    expect(formatVnd(-125_000)).toBe('-125.000 ₫');
  });

  it('prevents duplicate names while allowing the record being edited', () => {
    const entries = [{ id: 'wallet-1', name: 'Tiền mặt' }, { id: 'wallet-2', name: 'Ngân hàng' }];
    expect(isDuplicateName(' tiền MẶT ', entries)).toBe(true);
    expect(isDuplicateName('Tiền mặt', entries, 'wallet-1')).toBe(false);
    expect(isDuplicateName('Ví mới', entries)).toBe(false);
  });
});
