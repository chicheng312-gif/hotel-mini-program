const { formatDate } = require("../../utils/format.js");
const { callCommerce } = require("../../utils/cloudCall.js");
const {
  db,
  whereOrderById,
  whereMyReviewsForOrder,
} = require("../../utils/ordersQuery.js");



const statusText = {

  pending_payment: "待付款",

  paid: "待发货",

  shipped: "待收货",

  completed: "已完成",

  cancelled: "已取消",

  refunding: "退款处理中",

  refunded: "已退款",

  refund: "售后退款",

  after_sale: "售后处理",

};

function buildDemoGuide(status) {
  const m = {
    pending_payment:
      "① 点「模拟支付」完成演示付款。② 成功后本页会变为「待发货」；若跳转了，可在「我的订单」打开本单。③ 再按下面按钮「模拟发货」→「确认收货」→「评价」。",
    paid:
      "① 当前「待发货」。② 请下滑点击「模拟发货（演示）」。③ 然后点「确认收货」，最后在商品行点「评价」。",
    shipped: "① 当前「待收货」。② 点击「确认收货」。③ 完成后在每条商品右侧点「评价」。",
    completed: "在下方商品列表中，点击「评价」填写星级与文字并提交。",
    cancelled: "订单已取消。",
    refunding: "已标记退款处理（演示），正式环境需对接退款接口。",
  };
  return m[status] || m.pending_payment;
}

Page({

  data: {

    order: null,

    statusText,

    paying: false,

    timeline: [],

    actionLoading: false,

    demoGuide: "",

  },



  onLoad(query) {

    this.id = query.id;

    this.load();

  },



  onPullDownRefresh() {

    this.load().finally(() => wx.stopPullDownRefresh());

  },



  buildTimeline(order) {

    if (!order) return [];

    const rows = [];

    rows.push({

      t: "提交订单",

      d: formatDate(order.createdAt || Date.now()),

      on: true,

    });

    if (order.paidAt) {

      rows.push({ t: "支付成功", d: formatDate(order.paidAt), on: true });

    } else if (order.status !== "pending_payment" && order.status !== "cancelled") {

      rows.push({ t: "支付成功", d: "—", on: false });

    }

    if (order.shipTime) {

      rows.push({ t: "商家发货", d: formatDate(order.shipTime), on: true });

    } else if (["shipped", "completed"].includes(order.status)) {

      rows.push({ t: "商家发货", d: formatDate(order.updatedAt || Date.now()), on: true });

    }

    if (order.finishTime) {

      rows.push({ t: "交易完成", d: formatDate(order.finishTime), on: true });

    } else if (order.status === "completed") {

      rows.push({ t: "交易完成", d: formatDate(order.updatedAt || Date.now()), on: true });

    }

    if (order.refundApplyAt) {

      rows.push({

        t: "申请退款",

        d: formatDate(order.refundApplyAt),

        on: true,

      });

    }

    return rows;

  },



  async load() {

    if (!this.id) return;

    try {

      const { data: rows } = await db
        .collection("orders")
        .where(whereOrderById(this.id))
        .limit(1)
        .get();

      const order = rows && rows[0];

      if (!order) {

        this.setData({ order: null, timeline: [], demoGuide: "" });

        return;

      }

      order.createdAtStr = formatDate(order.createdAt || Date.now());

      const timeline = this.buildTimeline(order);

      let lines = order.lines || [];

      if (order.status === "completed") {

        try {

          const { data: revs } = await db

            .collection("reviews")

            .where(whereMyReviewsForOrder(this.id))

            .get();

          const map = {};

          (revs || []).forEach((r) => {

            map[r.productId] = true;

          });

          lines = lines.map((line) => ({

            ...line,

            reviewed: !!map[line.productId],

          }));

        } catch (e) {

          console.warn(e);

        }

      }

      order.lines = lines;

      this.setData({
        order,
        timeline,
        demoGuide: buildDemoGuide(order.status),
      });

    } catch (e) {

      console.error(e);

      this.setData({ order: null, timeline: [], demoGuide: "" });

    }

  },



  async payAgain() {

    const orderId = this.id;

    this.setData({ paying: true });

    try {

      const { result: pr } = await callCommerce({ action: "prepay", orderId });

      const prs = pr;

      if (prs && prs.mockPay) {

        wx.showModal({

          title: "支付未配置",

          content: prs.message || "可使用模拟支付完成联调",

          showCancel: false,

        });

        return;

      }

      if (!prs || !prs.ok || !prs.payment) {

        throw new Error((prs && prs.error) || "拉起支付失败");

      }

      const p = prs.payment;

      await new Promise((resolve, reject) => {

        wx.requestPayment({

          timeStamp: p.timeStamp,

          nonceStr: p.nonceStr,

          package: p.package,

          signType: p.signType || "RSA",

          paySign: p.paySign,

          success: resolve,

          fail: reject,

        });

      });

      wx.showToast({ title: "支付成功", icon: "success" });

      this.load();

    } catch (e) {

      console.error(e);

      wx.showToast({

        title: (e && e.message) || "支付失败",

        icon: "none",

      });

    } finally {

      this.setData({ paying: false });

    }

  },



  async mockPayHere() {

    const orderId = this.id;

    this.setData({ paying: true });

    try {

      const { result: r2 } = await callCommerce({ action: "mockPay", orderId });

      if (!r2 || !r2.ok) {

        throw new Error((r2 && r2.error) || "模拟支付失败");

      }

      wx.showToast({ title: "支付成功", icon: "success" });

      this.load();

    } catch (e) {

      console.error(e);

      wx.showToast({ title: (e && e.message) || "失败", icon: "none" });

    } finally {

      this.setData({ paying: false });

    }

  },



  async cancelOrder() {

    const ok = await new Promise((resolve) => {

      wx.showModal({

        title: "取消订单",

        content: "确定取消该待付款订单？",

        success: (r) => resolve(r.confirm),

      });

    });

    if (!ok) return;

    this.setData({ actionLoading: true });

    try {

      const { result } = await callCommerce({
        action: "cancelOrder",
        orderId: this.id,
      });

      if (!result || !result.ok) {

        throw new Error((result && result.error) || "取消失败");

      }

      wx.showToast({ title: "已取消", icon: "none" });

      this.load();

    } catch (e) {

      wx.showToast({ title: (e && e.message) || "失败", icon: "none" });

    } finally {

      this.setData({ actionLoading: false });

    }

  },



  async confirmReceive() {

    const ok = await new Promise((resolve) => {

      wx.showModal({

        title: "确认收货",

        content: "请确认已收到全部商品",

        success: (r) => resolve(r.confirm),

      });

    });

    if (!ok) return;

    this.setData({ actionLoading: true });

    try {

      const { result } = await callCommerce({
        action: "confirmReceive",
        orderId: this.id,
      });

      if (!result || !result.ok) {

        throw new Error((result && result.error) || "操作失败");

      }

      wx.showToast({ title: "已确认收货", icon: "success" });

      this.load();

    } catch (e) {

      wx.showToast({ title: (e && e.message) || "失败", icon: "none" });

    } finally {

      this.setData({ actionLoading: false });

    }

  },



  async requestRefund() {

    const ok = await new Promise((resolve) => {

      wx.showModal({

        title: "申请退款",

        content: "将标记为退款处理中（演示流程，实际需对接退款与库存回退）",

        success: (r) => resolve(r.confirm),

      });

    });

    if (!ok) return;

    this.setData({ actionLoading: true });

    try {

      const { result } = await callCommerce({
        action: "requestRefund",
        orderId: this.id,
        reason: "用户申请",
      });

      if (!result || !result.ok) {

        throw new Error((result && result.error) || "申请失败");

      }

      wx.showToast({ title: "已提交", icon: "none" });

      this.load();

    } catch (e) {

      wx.showToast({ title: (e && e.message) || "失败", icon: "none" });

    } finally {

      this.setData({ actionLoading: false });

    }

  },



  async demoShip() {

    this.setData({ actionLoading: true });

    try {

      const { result } = await callCommerce({
        action: "demoMarkShipped",
        orderId: this.id,
      });

      if (!result || !result.ok) {

        throw new Error((result && result.error) || "操作失败");

      }

      wx.showToast({ title: "已发货（演示）", icon: "none" });

      this.load();

    } catch (e) {

      wx.showToast({ title: (e && e.message) || "失败", icon: "none" });

    } finally {

      this.setData({ actionLoading: false });

    }

  },



  goReview(e) {

    const productId = e.currentTarget.dataset.pid;

    const title = e.currentTarget.dataset.title || "";

    wx.navigateTo({

      url: `/pages/order-review/order-review?orderId=${this.id}&productId=${productId}&title=${encodeURIComponent(

        title

      )}`,

    });

  },

});


