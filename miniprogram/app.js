App({
  globalData: {
    cartBadge: 0,
    pendingCatId: "",
    /** 本会话内是否已做过「是否弹绑定手机」检测（避免重复请求） */
    phoneBindPromptChecked: false,
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上基础库以使用云能力");
      return;
    }
    wx.cloud.init({
      traceUser: true,
      env: 'sense3-d9gwdv4w5af2e8624'
    });
  },
});
