const { callUserCenter } = require("../../utils/cloudCall.js");

Page({
  data: {
    goods: [],
    loading: true,
    coupons: [
      { label: "5 元优惠券", pts: 500 },
      { label: "10 元优惠券", pts: 1000 },
      { label: "20 元优惠券", pts: 2000 },
    ],
  },

  async onShow() {
    this.setData({ loading: true });
    try {
      const res = await callUserCenter({
        action: "getExchangeGoods",
        page: 1,
        pageSize: 30,
      });
      const r = res.result;
      if (!r || !r.ok) {
        throw new Error((r && r.error) || "加载失败");
      }
      this.setData({ goods: r.list || [], loading: false });
    } catch (e) {
      console.error(e);
      wx.showToast({ title: "加载失败", icon: "none" });
      this.setData({ loading: false });
    }
  },

  goMyPoints() {
    wx.navigateTo({ url: "/pages/my-points/my-points" });
  },

  goExchangeOrders() {
    wx.navigateTo({ url: "/pages/exchange-orders/exchange-orders" });
  },

  goSub(e) {
    const title = e.currentTarget.dataset.title || "";
    wx.navigateTo({
      url: `/pages/common-sub/common-sub?title=${encodeURIComponent(title)}`,
    });
  },
});
