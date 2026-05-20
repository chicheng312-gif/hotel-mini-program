const { formatDate } = require("../../utils/format.js");
const { callUserCenter } = require("../../utils/cloudCall.js");

Page({
  data: {
    list: [],
    loading: true,
    page: 1,
    finished: false,
  },

  async onShow() {
    this.setData({ page: 1, finished: false, list: [] });
    await this.loadPage(1, true);
  },

  async onPullDownRefresh() {
    this.setData({ page: 1, finished: false, list: [] });
    await this.loadPage(1, true);
    wx.stopPullDownRefresh();
  },

  async loadPage(page, reset) {
    if (this.data.finished && !reset) return;
    this.setData({ loading: true });
    try {
      const res = await callUserCenter({
        action: "getExchangeOrders",
        page,
        pageSize: 20,
      });
      const r = res.result;
      if (!r || !r.ok) throw new Error((r && r.error) || "加载失败");
      const rows = (r.list || []).map((it) => ({
        ...it,
        timeStr: formatDate(Number(it.createTime) || Date.now()),
      }));
      const merged = reset ? rows : this.data.list.concat(rows);
      this.setData({
        list: merged,
        page,
        finished: rows.length < 20,
        loading: false,
      });
    } catch (e) {
      console.error(e);
      wx.showToast({ title: "加载失败", icon: "none" });
      this.setData({ loading: false });
    }
  },

  onReachBottom() {
    if (this.data.finished || this.data.loading) return;
    const next = this.data.page + 1;
    void this.loadPage(next, false);
  },
});
