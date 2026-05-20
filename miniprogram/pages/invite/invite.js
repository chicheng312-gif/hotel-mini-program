const { callUserCenter } = require("../../utils/cloudCall.js");

function formatTime(ts) {
  const n = Number(ts);
  if (!n) return "";
  const d = new Date(n);
  const p = (x) => (x < 10 ? `0${x}` : `${x}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

Page({
  data: {
    loading: true,
    inviteCode: "",
    invited: 0,
    rewardPts: 0,
    bindInput: "",
    list: [],
    rewards: [],
  },

  async onShow() {
    await this.reload();
  },

  async reload() {
    this.setData({ loading: true });
    try {
      const [p, l, rw] = await Promise.all([
        callUserCenter({ action: "getProfile" }),
        callUserCenter({ action: "getInviteList" }),
        callUserCenter({
          action: "getInviteRewards",
          page: 1,
          pageSize: 20,
        }),
      ]);
      const pr = p.result;
      const lr = l.result;
      const rr = rw.result;
      if (!pr || !pr.ok) throw new Error((pr && pr.error) || "加载失败");
      const rawList = (lr && lr.ok && lr.list) || [];
      const rawRw = (rr && rr.ok && rr.list) || [];
      this.setData({
        inviteCode: pr.user.inviteCode || "",
        invited: pr.inviteCount || 0,
        rewardPts: pr.inviteRewardPoints || 0,
        list: rawList.map((it) => ({ ...it, timeStr: formatTime(it.createTime) })),
        rewards: rawRw.map((it) => ({ ...it, timeStr: formatTime(it.createTime) })),
        loading: false,
      });
    } catch (e) {
      console.error(e);
      wx.showToast({ title: "加载失败", icon: "none" });
      this.setData({ loading: false });
    }
  },

  onInput(e) {
    this.setData({ bindInput: (e.detail.value || "").trim() });
  },

  async bind() {
    const code = (this.data.bindInput || "").trim();
    if (!code) {
      wx.showToast({ title: "请输入邀请码", icon: "none" });
      return;
    }
    try {
      const res = await callUserCenter({
        action: "inviteBind",
        inviteCode: code,
      });
      const r = res.result;
      if (!r || !r.ok) {
        throw new Error((r && r.error) || "绑定失败");
      }
      wx.showToast({ title: "绑定成功", icon: "success" });
      this.setData({ bindInput: "" });
      await this.reload();
    } catch (e) {
      wx.showToast({
        title: e instanceof Error ? e.message : "绑定失败",
        icon: "none",
      });
    }
  },

  copyCode() {
    if (!this.data.inviteCode) return;
    wx.setClipboardData({ data: this.data.inviteCode });
  },

  goSub(e) {
    const title = e.currentTarget.dataset.title || "";
    wx.navigateTo({
      url: `/pages/common-sub/common-sub?title=${encodeURIComponent(title)}`,
    });
  },
});
