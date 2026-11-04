import {
  Baby, Banknote, BookOpen, BriefcaseBusiness, Car, CircleEllipsis, Clapperboard, Coffee, Droplets, Dumbbell, Fuel, Gift,
  GraduationCap, HandCoins, HeartPulse, House, PawPrint, PiggyBank, Plane, ReceiptText, Shirt, ShieldCheck, ShoppingBag,
  ShoppingCart, Smartphone, Sparkles, Tag, TrendingUp, Utensils, Wifi, Zap, type LucideIcon
} from 'lucide-react';

export type CategoryTone = 'orange' | 'blue' | 'violet' | 'teal' | 'pink' | 'cyan' | 'amber' | 'red' | 'green' | 'gray';
export interface CategoryVisual { icon: LucideIcon; tone: CategoryTone }

/** Bỏ dấu tiếng Việt để khớp từ khóa ổn định ("Ăn uống" -> "an uong"). */
export function foldCategoryName(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gu, 'd').replace(/Đ/gu, 'D').toLowerCase().trim();
}

// Khớp theo nguyên từ. Thứ tự quan trọng: từ khóa cụ thể đứng trước từ khóa chung.
const rules: Array<{ keywords: string[]; visual: CategoryVisual }> = [
  { keywords: ['ca phe', 'cafe', 'coffee', 'tra sua'], visual: { icon: Coffee, tone: 'amber' } },
  { keywords: ['an uong', 'an', 'com', 'do an', 'nha hang', 'an sang', 'an trua', 'an toi'], visual: { icon: Utensils, tone: 'orange' } },
  { keywords: ['di cho', 'sieu thi', 'thuc pham'], visual: { icon: ShoppingCart, tone: 'green' } },
  { keywords: ['quan ao', 'thoi trang', 'giay dep'], visual: { icon: Shirt, tone: 'pink' } },
  { keywords: ['mua sam', 'shopping'], visual: { icon: ShoppingBag, tone: 'pink' } },
  { keywords: ['tien nha', 'thue nha', 'nha o', 'nha cua'], visual: { icon: House, tone: 'blue' } },
  { keywords: ['xang', 'nhien lieu'], visual: { icon: Fuel, tone: 'red' } },
  { keywords: ['di chuyen', 'xe', 'grab', 'taxi', 'giao thong', 'gui xe'], visual: { icon: Car, tone: 'cyan' } },
  { keywords: ['du lich', 'may bay', 've tau'], visual: { icon: Plane, tone: 'cyan' } },
  { keywords: ['dien thoai', 'cuoc dien thoai'], visual: { icon: Smartphone, tone: 'violet' } },
  { keywords: ['internet', 'wifi', 'mang'], visual: { icon: Wifi, tone: 'violet' } },
  { keywords: ['tien dien', 'dien'], visual: { icon: Zap, tone: 'amber' } },
  { keywords: ['tien nuoc', 'nuoc'], visual: { icon: Droplets, tone: 'blue' } },
  { keywords: ['hoa don'], visual: { icon: ReceiptText, tone: 'gray' } },
  { keywords: ['bao hiem'], visual: { icon: ShieldCheck, tone: 'teal' } },
  { keywords: ['suc khoe', 'thuoc', 'benh vien', 'kham'], visual: { icon: HeartPulse, tone: 'red' } },
  { keywords: ['the thao', 'gym', 'tap'], visual: { icon: Dumbbell, tone: 'teal' } },
  { keywords: ['lam dep', 'my pham', 'spa', 'toc'], visual: { icon: Sparkles, tone: 'pink' } },
  { keywords: ['hoc tap', 'hoc phi', 'giao duc', 'khoa hoc'], visual: { icon: GraduationCap, tone: 'violet' } },
  { keywords: ['sach'], visual: { icon: BookOpen, tone: 'violet' } },
  { keywords: ['giai tri', 'phim', 'game'], visual: { icon: Clapperboard, tone: 'amber' } },
  { keywords: ['con cai', 'tre em', 'em be', 'con'], visual: { icon: Baby, tone: 'pink' } },
  { keywords: ['thu cung', 'cho meo'], visual: { icon: PawPrint, tone: 'orange' } },
  { keywords: ['qua', 'hieu hi', 'tang'], visual: { icon: Gift, tone: 'red' } },
  { keywords: ['luong'], visual: { icon: BriefcaseBusiness, tone: 'green' } },
  { keywords: ['thuong'], visual: { icon: Gift, tone: 'amber' } },
  { keywords: ['dau tu', 'co phieu', 'lai'], visual: { icon: TrendingUp, tone: 'teal' } },
  { keywords: ['tiet kiem'], visual: { icon: PiggyBank, tone: 'pink' } },
  { keywords: ['ban hang', 'kinh doanh', 'thu nhap'], visual: { icon: HandCoins, tone: 'green' } },
  { keywords: ['tien mat', 'tien'], visual: { icon: Banknote, tone: 'green' } },
  { keywords: ['khac'], visual: { icon: CircleEllipsis, tone: 'gray' } }
];

const fallbackTones: CategoryTone[] = ['blue', 'violet', 'teal', 'orange', 'pink', 'cyan', 'amber'];

/** Icon + màu suy ra từ tên danh mục (chưa lưu icon trong database). Không khớp thì dùng Tag với màu ổn định theo tên. */
export function categoryVisual(name: string): CategoryVisual {
  const folded = ` ${foldCategoryName(name).replace(/[^a-z0-9]+/gu, ' ')} `;
  for (const rule of rules) if (rule.keywords.some((keyword) => folded.includes(` ${keyword} `))) return rule.visual;
  let hash = 0;
  for (const char of folded) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return { icon: Tag, tone: fallbackTones[hash % fallbackTones.length]! };
}
