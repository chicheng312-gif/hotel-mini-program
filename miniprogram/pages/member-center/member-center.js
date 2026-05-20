const { callUserCenter } = require("../../utils/cloudCall.js");

Page({
  data: {
    loading: true,
    user: {},
    nextLevel: { need: 0, target: null },
    rights: [
      { level: "Lv0 普通会员", discount: "95 折", need: "成长值 0+" },
      { level: "Lv1 银卡会员", discount: "9 折", need: "成长值 ≥ 500" },
      { level: "Lv2 金卡会员", discount: "85 折", need: "成长值 ≥ 2000" },
      { level: "Lv3 黑金会员", discount: "8 折", need: "成长值 ≥ 10000" },
    ],
  },

  async onShow() {
    this.setData({ loading: true });
    try {
      const res = await callUserCenter({ action: "getProfile" });
      const r = res.result;
      if (!r || !r.ok) {
        throw new Error((r && r.error) || "加载失败");
      }
      this.setData({
        user: r.user,
        nextLevel: r.nextLevel || { need: 0, target: null },
        loading: false,
      });
    } catch (e) {
      console.error(e);
      wx.showToast({ title: "加载失败", icon: "none" });
      this.setData({ loading: false });
    }
  },
});
