const db = wx.cloud.database();
const { RECOMMEND_PAGE_SIZE } = require("./constants.js");

/**
 * 首页轮播：仅展示启用项，按 sort 升序
 */
async function fetchActiveSwipers() {
  const { data } = await db
    .collection("swipers")
    .where({ isActive: true })
    .orderBy("sort", "asc")
    .get();
  return data;
}

/**
 * 首页分类宫格：4x2 → 取前 8 条启用分类
 */
async function fetchHomeCategories(limit = 8) {
  const { data } = await db
    .collection("categories")
    .where({ isActive: true })
    .orderBy("sort", "asc")
    .limit(limit)
    .get();
  return data;
}

/**
 * 推荐商品流分页（按销量降序，触底追加）
 * @param {number} page 从 1 开始
 */
async function fetchRecommendPage(page = 1, pageSize = RECOMMEND_PAGE_SIZE) {
  const skip = Math.max(0, (page - 1) * pageSize);
  const { data } = await db
    .collection("products")
    .orderBy("sales", "desc")
    .skip(skip)
    .limit(pageSize)
    .get();
  const hasMore = data.length === pageSize;
  return { list: data, hasMore };
}

module.exports = {
  fetchActiveSwipers,
  fetchHomeCategories,
  fetchRecommendPage,
  RECOMMEND_PAGE_SIZE,
};
