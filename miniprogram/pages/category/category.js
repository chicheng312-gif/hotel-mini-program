const db = wx.cloud.database();
const cart = require("../../utils/cart.js");
const {
  fetchProductsByCategoryList,
} = require("../../services/categoryFeed.js");

Page({
  data: {
    categories: [],
    catId: "",
    list: [],
    loading: true,
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    const pending = getApp().globalData.pendingCatId;
    if (pending) {
      getApp().globalData.pendingCatId = "";
      this._fromPending = true;
      this.setData({ catId: pending });
      this.fetchProducts(pending);
    }
  },

  async onLoad(query) {
    const { catId: qCat } = query;
    this.setData({ loading: true });
    try {
      const { data: categories } = await db
        .collection("categories")
        .orderBy("sort", "asc")
        .get();
      this.setData({ categories });
      if (this._fromPending) {
        this._fromPending = false;
        return;
      }
      const first = qCat || (categories[0] && categories[0]._id) || "";
      this.setData({ catId: first });
      await this.fetchProducts(first);
    } catch (e) {
      console.error(e);
      this.setData({ loading: false });
      wx.showToast({ title: "分类加载失败", icon: "none" });
    }
  },

  async fetchProducts(catId) {
    if (!catId) {
      this.setData({ list: [], loading: false });
      return;
    }
    this.setData({ loading: true });
    try {
      // 双路 limit 查询 + 内存合并，避免 _.or + 全表 get 导致云库超时
      const list = await fetchProductsByCategoryList(catId, 200);
      this.setData({ list, loading: false });
    } catch (e) {
      console.error(e);
      this.setData({ loading: false });
    }
  },

  onSelectCat(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ catId: id });
    this.fetchProducts(id);
  },

  openProduct(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/product-detail/product-detail?id=${id}` });
  },

  async quickAdd(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.list.find((x) => x._id === id);
    if (!item) return;
    try {
      const total = await cart.addToCart(item, 1);
      getApp().globalData.cartBadge = total;
      if (typeof this.getTabBar === "function" && this.getTabBar()) {
        this.getTabBar().setData({ badge: total });
      }
      wx.showToast({ title: "已加入购物车", icon: "success" });
    } catch (err) {
      console.error(err);
      wx.showToast({ title: "加入失败", icon: "none" });
    }
  },
});
