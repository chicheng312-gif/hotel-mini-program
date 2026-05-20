/**
 * 兼容新旧商品字段：云库新结构 name/price/coverUrl 与旧结构 title/priceFen/images
 * 供购物车、结算、云函数侧逻辑统一换算（price 单位：元，可为整数或小数）
 */
function productTitle(p) {
  if (!p) return "";
  return p.name || p.title || "";
}

function productCover(p) {
  if (!p) return "";
  return p.coverUrl || (p.images && p.images[0]) || "";
}

/** 以「分」为单位的单价，用于订单金额计算 */
function productPriceFen(p) {
  if (!p) return 0;
  if (p.priceFen != null && p.priceFen !== "") return Number(p.priceFen);
  const yuan = Number(p.price);
  if (Number.isNaN(yuan)) return 0;
  return Math.round(yuan * 100);
}

function productOriginalPriceFen(p) {
  if (!p) return 0;
  if (p.originalPriceFen != null) return Number(p.originalPriceFen);
  if (p.originalPrice != null) {
    return Math.round(Number(p.originalPrice) * 100);
  }
  return 0;
}

/** 是否可售：旧 status:on；新结构无 status 时默认上架 */
function isProductOnShelf(p) {
  if (!p) return false;
  if (p.status === "off") return false;
  if (p.isActive === false) return false;
  return true;
}

module.exports = {
  productTitle,
  productCover,
  productPriceFen,
  productOriginalPriceFen,
  isProductOnShelf,
};
