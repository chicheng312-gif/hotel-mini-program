function fmt(ts) {
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
    loading: true,
    activity: null,
    lines: [
      "会员日玩法：在 member_day_activity 配置时间窗、折扣、双倍积分与适用等级。",
      "下单积分：1 元 = 1 积分；100 积分 = 1 元；单订单积分最高抵扣 20%（需在下单云函数实现）。",
    ],
  },

  async onShow() {
    this.setData({ loading: true });
    try {
      const res = await callUserCenter({ action: "getProfile" });
      const r = res.result;
      if (!r || !r.ok) throw new Error((r && r.error) || "加载失败");
      const raw = r.memberDay || null;
      let activity = raw;
      if (raw && (raw.startTime != null || raw.endTime != null)) {
        activity = {
          ...raw,
          startTime: fmt(raw.startTime),
          endTime: fmt(raw.endTime),
        };
      }
      this.setData({ activity, loading: false });
    } catch (e) {
      console.error(e);
      wx.showToast({ title: "加载失败", icon: "none" });
      this.setData({ loading: false });
    }
  },
});
