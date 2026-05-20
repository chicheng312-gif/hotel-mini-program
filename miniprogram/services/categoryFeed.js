const db = wx.cloud.database();
const { RECOMMEND_PAGE_SIZE } = require("./constants.js");

/** 单次分支拉取上限，避免 or + 排序触发全表扫描导致 timeout */
const BRANCH_LIMIT = 100;

/**
 * 合并两次查询结果（按销量降序），去重 _id
 */
function mergeProductsBySales(listA, listB) {
  const map = new Map();
  [...listA, ...listB].forEach((p) => {
    if (p && p._id) map.set(p._id, p);
  });
  return Array.from(map.values()).sort((a, b) => {
    const sa = a.sales != null ? a.sales : 0;
    const sb = b.sales != null ? b.sales : 0;
    return sb - sa;
  });
}

/**
 * 分类页「全部列表」：双路查询 + 内存合并，每路带 limit，避免 timeout
 */
async function fetchProductsByCategoryList(catId, maxTotal = 200) {
  if (!catId) return [];
  const lim = Math.min(BRANCH_LIMIT, maxTotal);
  const [r1, r2] = await Promise.all([
    db
      .collection("products")
      .where({ categoryId: catId })
      .orderBy("sales", "desc")
      .limit(lim)
      .get(),
    db
      .collection("products")
      .where({ categories: catId })
      .orderBy("sales", "desc")
      .limit(lim)
      .get(),
  ]);
  return mergeProductsBySales(r1.data || [], r2.data || []).slice(0, maxTotal);
}

/**
 * 分类商品分页（内存切片，数据量上限约 2*BRANCH_LIMIT）
 */
async function fetchProductsByCategory(catId, page = 1, pageSize = RECOMMEND_PAGE_SIZE) {
  if (!catId) return { list: [], hasMore: false };
  const merged = await fetchProductsByCategoryList(catId, BRANCH_LIMIT * 2);
  const skip = Math.max(0, (page - 1) * pageSize);
  const list = merged.slice(skip, skip + pageSize);
  const hasMore = merged.length > skip + pageSize;
  return { list, hasMore };
}

module.exports = {
  fetchProductsByCategory,
  fetchProductsByCategoryList,
};
