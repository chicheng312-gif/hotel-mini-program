const db = wx.cloud.database();
const { fetchProductsByCategory } = require("../../services/categoryFeed.js");
const { RECOMMEND_PAGE_SIZE } = require("../../services/constants.js");

Page({
  data: {
    catId: "",
    categoryName: "",
    list: [],
    page: 1,
    hasMore: true,
    loading: true,
    loadingMore: false,
  },

  async onLoad(query) {
    const id = query.id;
    if (!id) {
      wx.showToast({ title: "缺少分类", icon: "none" });
      return;
    }
    this.catId = id;
    this.setData({ catId: id });
    await this.loadCategoryName(id);
    await this.reload();
  },

  /** 读取分类名称用于标题区展示 */
  async loadCategoryName(id) {
    try {
      const { data } = await db.collection("categories").doc(id).get();
      if (data && data.name) {
        this.setData({ categoryName: data.name });
        wx.setNavigationBarTitle({ title: data.name });
      }
    } catch (e) {
      console.warn(e);
    }
  },

  async reload() {
    this.setData({ loading: true, page: 1, hasMore: true, list: [] });
    try {
      const { list, hasMore } = await fetchProductsByCategory(
        this.catId,
        1,
        RECOMMEND_PAGE_SIZE
      );
      this.setData({ list, hasMore, page: 1, loading: false });
    } catch (e) {
      console.error(e);
      this.setData({ loading: false });
      wx.showToast({ title: "加载失败", icon: "none" });
    }
  },

  async onPullDownRefresh() {
    await this.reload();
    wx.stopPullDownRefresh();
  },

  async onReachBottom() {
    const { loadingMore, hasMore, page, list } = this.data;
    if (loadingMore || !hasMore) return;
    this.setData({ loadingMore: true });
    const next = page + 1;
    try {
      const { list: chunk, hasMore: more } = await fetchProductsByCategory(
        this.catId,
        next,
        RECOMMEND_PAGE_SIZE
      );
      this.setData({
        list: list.concat(chunk),
        page: next,
        hasMore: more,
        loadingMore: false,
      });
    } catch (e) {
      console.error(e);
      this.setData({ loadingMore: false });
    }
  },

  openProduct(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/product-detail/product-detail?id=${id}` });
  },
});
