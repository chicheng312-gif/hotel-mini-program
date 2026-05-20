const {
  getProfile,
  updateUser,
  signDaily,
  bindPhoneByCode,
  getOrderStatistics,
} = require("../../services/userCenter.js");
const { callCommerce } = require("../../utils/cloudCall.js");
const {
  readProfileCache,
  writeProfileCache,
  clearProfileCache,
} = require("../../utils/userCache.js");

const ORDER_CHIPS = [
  { key: "pending_payment", label: "待付款" },
  { key: "paid", label: "待发货" },
  { key: "shipped", label: "待收货" },
  { key: "completed", label: "已完成" },
  { key: "refund", label: "售后退款" },
];

function subDoc(title) {
  return `/pages/common-sub/common-sub?title=${encodeURIComponent(title)}`;
}

const GRID = [
  { label: "我的收藏", url: "/pages/favorites/favorites" },
  { label: "优惠券", url: subDoc("优惠券") },
  { label: "收货地址", url: subDoc("收货地址") },
  { label: "客服咨询", url: "/pages/service/service" },
  { label: "浏览历史", url: subDoc("浏览历史") },
  { label: "我的积分", url: "/pages/my-points/my-points" },
  { label: "会员中心", url: "/pages/member-center/member-center" },
  { label: "邀请有礼", url: "/pages/invite/invite" },
  { label: "意见反馈", url: subDoc("意见反馈") },
];

const SETTINGS = [
  { label: "账号安全", action: "nav", url: subDoc("账号安全") },
  { label: "隐私设置", action: "nav", url: subDoc("隐私设置") },
  { label: "清除缓存", action: "clearCache" },
  { label: "关于我们", action: "nav", url: subDoc("关于我们") },
  { label: "用户协议", action: "nav", url: subDoc("用户协议") },
  { label: "隐私政策", action: "nav", url: subDoc("隐私政策") },
];

function statOf(stats, key) {
  if (!stats) return 0;
  const v = stats[key];
  return typeof v === "number" ? v : 0;
}

function buildOrderChips(stats) {
  return ORDER_CHIPS.map((c) => ({
    key: c.key,
    label: c.label,
    count: statOf(stats, c.key),
  }));
}

Page({
  data: {
    skeleton: true,
    themeClass: "",
    user: {},
    orderStats: {},
    orderChipsDisplay: buildOrderChips(undefined),
    grid: GRID,
    settings: SETTINGS,
    favoritesCount: 0,
    inviteCount: 0,
    inviteRewardPoints: 0,
    signedToday: false,
    nextNeedGrowth: 0,
    nextTargetGrowth: null,
    memberDayTitle: "",
    memberDaySub: "",
    exchangePreview: [],
    rightsLine: "普通会员 95 折 · 银卡 9 折 · 金卡 85 折 · 黑金 8 折",
  },

  _themeListener: null,
  _orderPoll: null,

  onLoad() {
    this.applyTheme();
    const fn = ({ theme }) => {
      this.setData({ themeClass: theme === "dark" ? "theme-dark" : "" });
      this.syncNavBar(theme === "dark");
    };
    this._themeListener = fn;
    wx.onThemeChange(fn);
    const cached = readProfileCache();
    if (cached) {
      this.hydrateFromPayload(cached);
      this.setData({ skeleton: false });
    }
    this.refreshAll(false);
  },

  onUnload() {
    if (this._themeListener) {
      wx.offThemeChange(this._themeListener);
      this._themeListener = null;
    }
    if (this._orderPoll) {
      clearInterval(this._orderPoll);
      this._orderPoll = null;
    }
  },

  onShow() {
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    this.applyTheme();
    this.refreshAll(false);
    if (this._orderPoll) clearInterval(this._orderPoll);
    this._orderPoll = setInterval(() => {
      this.pollOrderStats();
    }, 30000);
  },

  onHide() {
    if (this._orderPoll) {
      clearInterval(this._orderPoll);
      this._orderPoll = null;
    }
  },

  applyTheme() {
    let theme = "light";
    try {
      const base = wx.getAppBaseInfo && wx.getAppBaseInfo();
      theme = (base && base.theme) || wx.getSystemInfoSync().theme || "light";
    } catch {
      theme = wx.getSystemInfoSync().theme || "light";
    }
    const dark = theme === "dark";
    this.setData({ themeClass: dark ? "theme-dark" : "" });
    this.syncNavBar(dark);
  },

  syncNavBar(dark) {
    try {
      if (dark) {
        wx.setNavigationBarColor({
          frontColor: "#ffffff",
          backgroundColor: "#121520",
        });
      } else {
        wx.setNavigationBarColor({
          frontColor: "#000000",
          backgroundColor: "#FAFBFF",
        });
      }
    } catch {
      /* ignore */
    }
  },

  hydrateFromPayload(payload) {
    const user = payload.user || {};
    const orderStats = payload.orderStats || {};
    const next = payload.nextLevel || {};
    const memberDay = payload.memberDay || null;
    const preview = payload.exchangeGoodsPreview || [];
    this.setData({
      user,
      orderStats,
      orderChipsDisplay: buildOrderChips(orderStats),
      favoritesCount: Number(payload.favoritesCount) || 0,
      inviteCount: Number(payload.inviteCount) || 0,
      inviteRewardPoints: Number(payload.inviteRewardPoints) || 0,
      signedToday: Boolean(payload.signedToday),
      nextNeedGrowth: Number(next.need) || 0,
      nextTargetGrowth: next.target == null ? null : Number(next.target),
      exchangePreview: preview,
      memberDayTitle: memberDay ? String(memberDay.title || "会员日活动") : "",
      memberDaySub: memberDay
        ? `专属折扣 · ${memberDay.doublePoints ? "双倍积分" : "积分加速"} · 专属券`
        : "每月限时权益，敬请期待",
    });
  },

  async refreshAll(showLoading) {
    if (showLoading) wx.showNavigationBarLoading();
    try {
      await callCommerce({ action: "ensureMember" });
    } catch {
      /* ignore */
    }
    try {
      const res = await getProfile();
      if (!res.ok) {
        wx.showToast({ title: res.error || "加载失败", icon: "none" });
        this.setData({ skeleton: false });
        return;
      }
      writeProfileCache(res);
      this.hydrateFromPayload(res);
    } catch (e) {
      console.error(e);
      wx.showToast({ title: "网络异常", icon: "none" });
    } finally {
      this.setData({ skeleton: false });
      if (showLoading) wx.hideNavigationBarLoading();
      wx.stopPullDownRefresh();
    }
  },

  onPullDownRefresh() {
    clearProfileCache();
    this.refreshAll(true);
  },

  async pollOrderStats() {
    try {
      const res = await getOrderStatistics();
      if (res.ok && res.orderStats) {
        this.setData({
          orderStats: res.orderStats,
          orderChipsDisplay: buildOrderChips(res.orderStats),
        });
      }
    } catch {
      /* ignore */
    }
  },

  onTapAvatar() {
    wx.getUserProfile({
      desc: "用于展示会员头像昵称",
      success: async (r) => {
        const u = r.userInfo;
        try {
          const out = await updateUser({
            nickName: u.nickName,
            avatarUrl: u.avatarUrl,
            gender: u.gender,
          });
          if (!out.ok) {
            wx.showToast({ title: out.error || "更新失败", icon: "none" });
            return;
          }
          wx.showToast({ title: "已更新资料", icon: "success" });
          await this.refreshAll(false);
        } catch (e) {
          console.error(e);
          wx.showToast({ title: "更新失败", icon: "none" });
        }
      },
    });
  },

  async onGetPhoneNumber(e) {
    const detail = e.detail || {};
    const errMsg = String(detail.errMsg || "");
    if (errMsg !== "getPhoneNumber:ok") {
      console.warn("getPhoneNumber", detail);
      const lower = errMsg.toLowerCase();
      const userDenied = lower.includes("user deny");
      if (userDenied) {
        wx.showToast({ title: "已取消授权", icon: "none" });
        return;
      }
      wx.showModal({
        title: "暂无法获取手机号",
        content:
          "常见原因：\n\n" +
          "1）微信开发者工具对「手机号快速验证」支持不完整，请用真机扫码预览后再试；\n\n" +
          "2）小程序未完成微信认证，或主体类型不支持该能力；\n\n" +
          "3）需在公众平台为小程序开通/配置手机号相关接口权限。\n\n" +
          "返回信息：" +
          (errMsg || "未知"),
        showCancel: false,
        confirmText: "知道了",
      });
      return;
    }
    const code = detail.code;
    if (!code) {
      wx.showToast({ title: "未拿到授权码", icon: "none" });
      return;
    }
    wx.showLoading({ title: "绑定中" });
    try {
      const out = await bindPhoneByCode(code);
      wx.hideLoading();
      if (!out.ok) {
        wx.showToast({ title: out.error || "绑定失败", icon: "none" });
        return;
      }
      wx.showToast({ title: "绑定成功", icon: "success" });
      await this.refreshAll(false);
    } catch (err) {
      wx.hideLoading();
      console.error(err);
      wx.showToast({ title: "绑定失败", icon: "none" });
    }
  },

  async onSign() {
    if (this.data.signedToday) {
      wx.showToast({ title: "今日已签到", icon: "none" });
      return;
    }
    wx.showLoading({ title: "签到中" });
    try {
      const out = await signDaily();
      wx.hideLoading();
      if (!out.ok) {
        if (out.code === "SIGNED") {
          this.setData({ signedToday: true });
        }
        wx.showToast({ title: out.message || out.error || "签到失败", icon: "none" });
        return;
      }
      wx.showToast({
        title: `+${out.rewardPoints || 0} 积分`,
        icon: "success",
      });
      await this.refreshAll(false);
    } catch (e) {
      wx.hideLoading();
      console.error(e);
      wx.showToast({ title: "签到失败", icon: "none" });
    }
  },

  goMemberCard() {
    wx.navigateTo({ url: "/pages/member-center/member-center" });
  },

  goOrdersAll() {
    wx.navigateTo({ url: "/pages/orders/orders" });
  },

  goOrder(e) {
    const key = e.currentTarget.dataset.key;
    const enc = encodeURIComponent(key);
    wx.navigateTo({ url: `/pages/orders/orders?status=${enc}` });
  },

  goGrid(e) {
    const url = e.currentTarget.dataset.url;
    if (url) wx.navigateTo({ url });
  },

  goPointsMall() {
    wx.navigateTo({ url: "/pages/points-mall/points-mall" });
  },

  goInviteBlock() {
    wx.navigateTo({ url: "/pages/invite/invite" });
  },

  goMemberDay() {
    wx.navigateTo({ url: "/pages/member-day/member-day" });
  },

  onSettingTap(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const row = SETTINGS[idx];
    if (!row) return;
    if (row.action === "nav" && row.url) {
      wx.navigateTo({ url: row.url });
      return;
    }
    if (row.action === "clearCache") {
      try {
        wx.clearStorageSync();
      } catch {
        /* ignore */
      }
      clearProfileCache();
      wx.showToast({ title: "已清除本地缓存", icon: "none" });
      this.refreshAll(false);
    }
  },

  logout() {
    wx.showModal({
      title: "退出登录",
      content: "将清除本地缓存。云开发身份由微信会话维持，重新进入小程序即可恢复。",
      success: (r) => {
        if (!r.confirm) return;
        try {
          wx.clearStorageSync();
        } catch {
          /* ignore */
        }
        clearProfileCache();
        wx.showToast({ title: "已退出", icon: "none" });
        this.setData({
          user: {},
          orderStats: {},
          orderChipsDisplay: buildOrderChips(undefined),
          favoritesCount: 0,
          inviteCount: 0,
          inviteRewardPoints: 0,
          signedToday: false,
          exchangePreview: [],
        });
        this.refreshAll(false);
      },
    });
  },
});
