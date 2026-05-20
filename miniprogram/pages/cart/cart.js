const cart = require("../../utils/cart.js");



Page({

  data: {

    items: [],

    totalFen: 0,

    count: 0,

    allSelected: false,

    loading: true,

    hasStockIssue: false,

  },



  onShow() {

    if (typeof this.getTabBar === "function" && this.getTabBar()) {

      this.getTabBar().setData({ selected: 2 });

    }

    this.refresh();

  },



  async refresh() {

    this.setData({ loading: true });

    try {

      const res = await cart.loadCartWithProducts();

      getApp().globalData.cartBadge = res.items.reduce((s, x) => s + x.count, 0);

      const tab = this.getTabBar && this.getTabBar();

      if (tab) tab.setData({ badge: getApp().globalData.cartBadge });

      const hasStockIssue = res.items.some((x) => x.stockShort);

      this.setData({

        items: res.items,

        totalFen: res.totalFen,

        count: res.count,

        allSelected: res.allSelected,

        hasStockIssue,

        loading: false,

      });

    } catch (e) {

      console.error(e);

      this.setData({ loading: false });

    }

  },



  goHome() {

    wx.switchTab({ url: "/pages/home/home" });

  },



  async toggleSelect(e) {

    const lineKey = e.currentTarget.dataset.lineKey;

    const line = this.data.items.find((x) => x.lineKey === lineKey);

    if (!line) return;

    try {

      await cart.setLineSelected(lineKey, !line.selected);

      await this.refresh();

    } catch (err) {

      console.error(err);

    }

  },



  async toggleAll() {

    const next = !this.data.allSelected;

    try {

      await cart.setAllSelected(next);

      await this.refresh();

    } catch (err) {

      console.error(err);

    }

  },



  async batchDelete() {

    const keys = this.data.items.filter((x) => x.selected).map((x) => x.lineKey);

    if (!keys.length) {

      wx.showToast({ title: "请选择商品", icon: "none" });

      return;

    }

    const ok = await new Promise((resolve) => {

      wx.showModal({

        title: "删除选中",

        content: `确定删除 ${keys.length} 件商品？`,

        success: (r) => resolve(r.confirm),

      });

    });

    if (!ok) return;

    try {

      const count = await cart.removeLines(keys);

      getApp().globalData.cartBadge = count;

      const tab = this.getTabBar && this.getTabBar();

      if (tab) tab.setData({ badge: count });

      await this.refresh();

    } catch (err) {

      console.error(err);

    }

  },



  async change(e) {

    const lineKey = e.currentTarget.dataset.lineKey;

    const d = Number(e.currentTarget.dataset.d);

    const line = this.data.items.find((x) => x.lineKey === lineKey);

    if (!line) return;

    const next = line.count + d;

    if (next < 1) return;

    if (next > line.stock) {

      wx.showToast({ title: "库存不足", icon: "none" });

      return;

    }

    try {

      const count = await cart.updateLine(lineKey, next);

      getApp().globalData.cartBadge = count;

      const tab = this.getTabBar && this.getTabBar();

      if (tab) tab.setData({ badge: count });

      await this.refresh();

    } catch (err) {

      console.error(err);

    }

  },



  async remove(e) {

    const lineKey = e.currentTarget.dataset.lineKey;

    try {

      const count = await cart.removeLine(lineKey);

      getApp().globalData.cartBadge = count;

      const tab = this.getTabBar && this.getTabBar();

      if (tab) tab.setData({ badge: count });

      await this.refresh();

    } catch (err) {

      console.error(err);

    }

  },



  checkout() {

    const keys = this.data.items.filter((x) => x.selected).map((x) => x.lineKey);

    if (!keys.length) {

      wx.showToast({ title: "请选择结算商品", icon: "none" });

      return;

    }

    const bad = this.data.items.filter((x) => x.selected && x.stockShort);

    if (bad.length) {

      wx.showModal({

        title: "库存提示",

        content: "部分商品库存偏紧，提交订单时以服务端校验为准。是否继续去结算？",

        confirmText: "去结算",

        success: (r) => {

          if (r.confirm) this._goCheckout(keys);

        },

      });

      return;

    }

    this._goCheckout(keys);

  },

  _goCheckout(keys) {

    cart.saveCheckoutLineKeys(keys);

    wx.navigateTo({ url: "/pages/checkout/checkout" });

  },

});


