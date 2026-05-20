function formatTime(ts) {
  const n = Number(ts);
  if (!n) return "";
  const d = new Date(n);
  const p = (x) => (x < 10 ? `0${x}` : `${x}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

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

  async loadPage(page, reset) {
    if (this.data.finished && !reset) return;
    this.setData({ loading: true });
    try {
      const res = await callUserCenter({
        action: "getPointsLogs",
        page,
        pageSize: 20,
      });
      const r = res.result;
      if (!r || !r.ok) throw new Error((r && r.error) || "加载失败");
      const rows = (r.list || []).map((it) => ({
        ...it,
        timeStr: formatTime(it.createTime),
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
