const { getIds } = require("../../utils/favorites.js");
const { callUserCenter } = require("../../utils/cloudCall.js");

Page({
  data: {
    merged: [],
    loading: true,
    empty: true,
    cloudCount: 0,
  },

  async onShow() {
    const localIds = getIds();
    this.setData({ loading: true });
    try {
      const res = await callUserCenter({ action: "getFavoritesList" });
      const r = res.result;
      const raw = r && r.ok ? r.list || [] : [];
      const cloudIds = raw
        .map((x) => String(x.productId || ""))
        .filter(Boolean);
      const set = new Set([...cloudIds, ...localIds]);
      const merged = Array.from(set);
      this.setData({
        merged,
        cloudCount: cloudIds.length,
        empty: merged.length === 0,
        loading: false,
      });
    } catch (e) {
      console.error(e);
      const merged = localIds;
      this.setData({
        merged,
        cloudCount: 0,
        empty: merged.length === 0,
        loading: false,
      });
    }
  },

  openProduct(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/product-detail/product-detail?id=${id}` });
  },
});
