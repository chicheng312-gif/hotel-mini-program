Page({
  data: {
    title: "功能",
    hint: "此页为占位，可替换为真实业务页面或接入云函数 / HTTP API。",
  },

  onLoad(query) {
    const title = query.title ? decodeURIComponent(query.title) : "功能";
    wx.setNavigationBarTitle({ title });
    this.setData({ title });
  },
});
