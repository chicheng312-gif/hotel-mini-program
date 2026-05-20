const LEVELS = [
  { id: 0, name: "普通会员", discount: 1, nextPoints: 200 },
  { id: 1, name: "银卡会员", discount: 0.98, nextPoints: 800 },
  { id: 2, name: "金卡会员", discount: 0.95, nextPoints: null },
];

function levelFromPoints(points) {
  const p = Number(points) || 0;
  if (p >= 800) return LEVELS[2];
  if (p >= 200) return LEVELS[1];
  return LEVELS[0];
}

function discountForPoints(points) {
  return levelFromPoints(points).discount;
}

module.exports = { LEVELS, levelFromPoints, discountForPoints };
