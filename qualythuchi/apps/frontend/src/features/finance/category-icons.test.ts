import { describe, expect, it } from 'vitest';
import { BriefcaseBusiness, CircleEllipsis, Coffee, Tag, Utensils, Zap } from 'lucide-react';
import { categoryVisual, foldCategoryName } from './category-icons';

describe('category icons', () => {
  it('folds Vietnamese diacritics', () => {
    expect(foldCategoryName('Ăn uống')).toBe('an uong');
    expect(foldCategoryName('Đầu tư')).toBe('dau tu');
  });

  it('maps default and common category names by whole words', () => {
    expect(categoryVisual('Ăn uống').icon).toBe(Utensils);
    expect(categoryVisual('Cà phê sáng').icon).toBe(Coffee);
    expect(categoryVisual('Tiền điện').icon).toBe(Zap);
    expect(categoryVisual('Lương').icon).toBe(BriefcaseBusiness);
    expect(categoryVisual('Khác').icon).toBe(CircleEllipsis);
    expect(categoryVisual('Xem phim').icon).not.toBe(categoryVisual('Di chuyển').icon);
  });

  it('falls back to a stable tag icon for unknown names', () => {
    expect(categoryVisual('Zzz')).toEqual(categoryVisual('Zzz'));
    expect(categoryVisual('Zzz').icon).toBe(Tag);
  });
});
