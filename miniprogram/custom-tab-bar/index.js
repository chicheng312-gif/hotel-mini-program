const TAB_LIST = [
  { pagePath: "/pages/home/home", text: "首页" },
  { pagePath: "/pages/category/category", text: "分类" },
  { pagePath: "/pages/cart/cart", text: "购物车" },
  { pagePath: "/pages/profile/profile", text: "我的" },
];

Component({
  data: {
    selected: 0,
    list: TAB_LIST,
    badge: 0,
  },

  lifetimes: {
    attached() {
      const app = getApp();
      this.setData({ badge: app.globalData.cartBadge || 0 });
    },
  },

  pageLifetimes: {
    show() {
      const app = getApp();
      this.setData({ badge: app.globalData.cartBadge || 0 });
    },
  },

  methods: {
    switchTab(e) {
      const index = Number(e.currentTarget.dataset.index);
      const path = TAB_LIST[index].pagePath;
      wx.switchTab({ url: path });
    },
  },
});
