const { callCommerce } = require("../../utils/cloudCall.js");

Page({
  data: {
    orderId: "",
    productId: "",
    title: "",
    rating: 5,
    content: "",
    submitting: false,
  },

  onLoad(query) {
    const orderId = query.orderId || "";
    const productId = query.productId || "";
    const title = query.title ? decodeURIComponent(query.title) : "";
    this.setData({ orderId, productId, title });
    if (!orderId || !productId) {
      wx.showToast({ title: "参数错误", icon: "none" });
    }
  },

  onPickStar(e) {
    const n = Number(e.currentTarget.dataset.n) || 5;
    this.setData({ rating: n });
  },

  onContent(e) {
    this.setData({ content: e.detail.value || "" });
  },

  async submit() {
    const { orderId, productId, rating, content } = this.data;
    if (!orderId || !productId) return;
    this.setData({ submitting: true });
    try {
      const { result } = await callCommerce({
        action: "submitReview",
        orderId,
        productId,
        rating,
        content,
      });
      if (!result || !result.ok) {
        throw new Error((result && result.error) || "提交失败");
      }
      wx.showToast({ title: "感谢评价", icon: "success" });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (e) {
      wx.showToast({
        title: (e && e.message) || "失败",
        icon: "none",
      });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
