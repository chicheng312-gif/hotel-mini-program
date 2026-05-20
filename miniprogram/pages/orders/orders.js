const { formatDate } = require("../../utils/format.js");
const { db, whereMineOrders } = require("../../utils/ordersQuery.js");

const statusText = {
  pending_payment: "待付款",
  paid: "待发货",
  shipped: "待收货",
  completed: "已完成",
  cancelled: "已取消",
  refund: "售后/退款",
  refunding: "退款中",
  refunded: "已退款",
  after_sale: "售后处理",
};

Page({
  data: {
    list: [],
    loading: true,
    loadError: "",
    statusText,
    tabs: [
      { key: "", label: "全部" },
      { key: "pending_payment", label: "待付款" },
      { key: "paid", label: "待发货" },
      { key: "shipped", label: "待收货" },
      { key: "completed", label: "已完成" },
    ],
    activeTab: "",
    keyword: "",
  },

  onLoad(query) {
    const raw = query && query.status ? query.status : "";
    const tab = raw ? decodeURIComponent(raw) : "";
    this.setData({ activeTab: tab });
    const titleMap = {
      "": "我的订单",
      pending_payment: "待付款订单",
      paid: "待发货订单",
      shipped: "待收货订单",
      completed: "已完成订单",
      refund: "售后/退款",
    };
    wx.setNavigationBarTitle({ title: titleMap[tab] || "我的订单" });
  },

  onShow() {
    this.load();
    if (this._poll) clearInterval(this._poll);
    this._poll = setInterval(() => this.load(), 30000);
  },

  onHide() {
    if (this._poll) clearInterval(this._poll);
    this._poll = null;
  },

  onUnload() {
    if (this._poll) clearInterval(this._poll);
    this._poll = null;
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  onTabTap(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ activeTab: key });
    this.applyFilter();
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value || "" });
    this.applyFilter();
  },

  applyFilter() {
    const kw = (this.data.keyword || "").trim().toLowerCase();
    const f = this.data.activeTab;
    let rows = this._raw || [];
    if (f === "refund") {
      rows = rows.filter((o) =>
        ["refund", "refunding", "refunded", "after_sale"].includes(o.status)
      );
    } else if (f) {
      rows = rows.filter((o) => o.status === f);
    }
    if (kw) {
      rows = rows.filter((o) => String(o._id).toLowerCase().includes(kw));
    }
    const list = rows.map((o) => ({
      ...o,
      createdAtStr: formatDate(o.createdAt || Date.now()),
    }));
    this.setData({ list });
  },

  async load() {
    this.setData({ loading: true, loadError: "" });
    let data = [];
    try {
      const res = await db
        .collection("orders")
        .where(whereMineOrders())
        .orderBy("createdAt", "desc")
        .limit(100)
        .get();
      data = res.data || [];
    } catch (e) {
      console.warn("orders orderBy", e);
      try {
        const res = await db
          .collection("orders")
          .where(whereMineOrders())
          .limit(100)
          .get();
        data = (res.data || []).sort(
          (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
        );
      } catch (e2) {
        console.error(e2);
        const msg = (e2 && (e2.errMsg || e2.message)) || "订单加载失败";
        this.setData({ loading: false, loadError: msg });
        wx.showToast({ title: msg, icon: "none" });
        return;
      }
    }
    this._raw = data;
    this.applyFilter();
    this.setData({ loading: false, loadError: "" });
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${id}` });
  },
});
