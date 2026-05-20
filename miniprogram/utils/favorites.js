const STORAGE_KEY = "mall_favorite_product_ids_v1";

function getIds() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function isFavorite(productId) {
  if (!productId) return false;
  return getIds().includes(productId);
}

function toggleFavorite(productId) {
  if (!productId) return false;
  let ids = getIds();
  const idx = ids.indexOf(productId);
  if (idx >= 0) {
    ids.splice(idx, 1);
  } else {
    ids = [productId, ...ids].slice(0, 200);
  }
  wx.setStorageSync(STORAGE_KEY, ids);
  return idx < 0;
}

module.exports = {
  getIds,
  isFavorite,
  toggleFavorite,
};
