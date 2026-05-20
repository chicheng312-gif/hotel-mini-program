export const MEMBER_LEVEL_NAMES = [
  "普通会员",
  "银卡会员",
  "金卡会员",
  "黑金会员",
] as const;

export const MEMBER_DISCOUNT_LABELS = ["95折", "9折", "85折", "8折"] as const;

export const GROWTH_THRESHOLDS = [0, 500, 2000, 10000] as const;

export function memberLevelFromGrowth(growth: number): number {
  const g = Number(growth) || 0;
  if (g >= GROWTH_THRESHOLDS[3]) return 3;
  if (g >= GROWTH_THRESHOLDS[2]) return 2;
  if (g >= GROWTH_THRESHOLDS[1]) return 1;
  return 0;
}

export function levelName(level: number): string {
  const lv = Math.min(3, Math.max(0, Number(level) || 0));
  return MEMBER_LEVEL_NAMES[lv];
}
