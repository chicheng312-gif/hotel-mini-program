const db = wx.cloud.database();

/**
 * 拉取商品详情（小程序端直读云库，onShow 可再次调用以刷新库存）
 */
async function fetchProductById(productId) {
  if (!productId) return null;
  const { data } = await db.collection("products").doc(productId).get();
  return data || null;
}

/**
 * 评价分页：按创建时间倒序
 */
async function fetchReviewsPage(productId, page = 1, pageSize = 5) {
  if (!productId) return { list: [], hasMore: false };
  const skip = Math.max(0, (page - 1) * pageSize);
  try {
    const { data } = await db
      .collection("product_reviews")
      .where({ productId })
      .orderBy("createdAt", "desc")
      .skip(skip)
      .limit(pageSize)
      .get();
    return { list: data, hasMore: data.length === pageSize };
  } catch (e) {
    console.warn("fetchReviewsPage", e);
    return { list: [], hasMore: false };
  }
}

module.exports = {
  fetchProductById,
  fetchReviewsPage,
};
