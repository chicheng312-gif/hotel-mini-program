const cart = require("../../utils/cart.js");
const { callCommerce } = require("../../utils/cloudCall.js");
const { getProfile } = require("../../services/userCenter.js");

const { discountForPoints } = require("../../utils/member.js");



Page({

  data: {

    items: [],

    goodsFen: 0,

    discountFen: 0,

    payFen: 0,

    receiverName: "",

    receiverPhone: "",

    address: "",

    paying: false,

    allowMock: true,

  },



  onLoad() {
    this._checkoutPhoneWarned = false;
    void this.loadCartAndMember();
  },

  onShow() {
    this.promptBindPhoneIfNeeded();
  },

  /** 未绑定微信授权手机号时提醒一次（本页每次进入 onLoad 会重置；已绑定则不弹） */
  promptBindPhoneIfNeeded() {
    if (this._checkoutPhoneWarned) return;
    const run = async () => {
      try {
        const res = await getProfile();
        if (!res || !res.ok || !res.user) return;
        if (res.user.phone && String(res.user.phone).trim()) return;
        this._checkoutPhoneWarned = true;
        wx.showModal({
          title: "绑定手机号",
          content:
            "下单前建议绑定手机号，便于接收订单通知与售后联系。您仍可点「继续结算」完成本单。",
          confirmText: "去绑定",
          cancelText: "继续结算",
          success: (r) => {
            if (r.confirm) {
              wx.switchTab({ url: "/pages/profile/profile" });
            }
          },
        });
      } catch (e) {
        console.warn("checkout bind prompt", e);
      }
    };
    void run();
  },



  async loadCartAndMember() {

    const keys = cart.readCheckoutLineKeys();

    const full = await cart.loadCartWithProducts();

    let rows = full.items;

    if (keys.length) {

      const set = new Set(keys);

      rows = full.items.filter((x) => set.has(x.lineKey));

    } else {

      rows = full.items.filter((x) => x.selected !== false);

    }

    if (!rows.length) {

      wx.showToast({ title: "请先选择结算商品", icon: "none" });

      setTimeout(() => wx.navigateBack(), 800);

      return;

    }

    this.checkoutLineKeys = rows.map((x) => x.lineKey);

    const db = wx.cloud.database();

    let points = 0;

    try {

      const { data } = await db.collection("members").limit(1).get();

      if (data[0]) points = data[0].points || 0;

    } catch (e) {

      console.warn(e);

    }

    const goodsFen = rows.reduce((s, x) => s + x.subtotalFen, 0);

    const rate = discountForPoints(points);

    const rawDiscount = Math.floor(goodsFen * (1 - rate));

    const payFen = Math.max(1, goodsFen - rawDiscount);

    this.setData({

      items: rows,

      goodsFen,

      discountFen: rawDiscount,

      payFen,

    });

  },



  onName(e) {

    this.setData({ receiverName: e.detail.value });

  },

  onPhone(e) {

    this.setData({ receiverPhone: e.detail.value });

  },

  onAddr(e) {

    this.setData({ address: e.detail.value });

  },



  validate() {

    const { receiverName, receiverPhone, address } = this.data;

    if (!receiverName.trim()) {

      wx.showToast({ title: "请填写收货人", icon: "none" });

      return false;

    }

    if (!/^1\d{10}$/.test(receiverPhone.trim())) {

      wx.showToast({ title: "请填写正确手机号", icon: "none" });

      return false;

    }

    if (!address.trim()) {

      wx.showToast({ title: "请填写地址", icon: "none" });

      return false;

    }

    return true;

  },



  async afterPaySuccess(orderId) {

    const keys = this.checkoutLineKeys || [];

    try {

      if (keys.length) {

        await cart.removeLines(keys);

      } else {

        await cart.clearCart();

      }

    } catch (e) {

      console.warn(e);

    }

    cart.clearCheckoutLineKeys();

    getApp().globalData.cartBadge = 0;

    const tab = this.getTabBar && this.getTabBar();

    if (tab) tab.setData({ badge: 0 });

    wx.redirectTo({

      url: `/pages/order-detail/order-detail?id=${orderId}`,

    });

  },



  async submitPay() {

    if (!this.validate()) return;

    this.setData({ paying: true });

    try {

      const { result } = await callCommerce({

        action: "createOrder",

        receiverName: this.data.receiverName.trim(),

        receiverPhone: this.data.receiverPhone.trim(),

        address: this.data.address.trim(),

        lineKeys: this.checkoutLineKeys || [],

      });

      if (!result || !result.ok) {

        throw new Error((result && result.error) || "下单失败");

      }

      const orderId = result.orderId;

      const prepay = await callCommerce({ action: "prepay", orderId });

      const pr = prepay.result;

      if (pr && pr.mockPay) {

        wx.showModal({

          title: "支付未配置",

          content: pr.message || "请使用模拟支付或配置商户号",

          showCancel: false,

        });

        this.setData({ paying: false });

        return;

      }

      if (!pr || !pr.ok || !pr.payment) {

        throw new Error((pr && pr.error) || "拉起支付失败");

      }

      const p = pr.payment;

      await new Promise((resolve, reject) => {

        wx.requestPayment({

          timeStamp: p.timeStamp,

          nonceStr: p.nonceStr,

          package: p.package,

          signType: p.signType || "RSA",

          paySign: p.paySign,

          success: resolve,

          fail: reject,

        });

      });

      wx.showToast({ title: "支付成功", icon: "success" });

      await this.afterPaySuccess(orderId);

    } catch (e) {

      console.error(e);

      if (e.errMsg && e.errMsg.indexOf("cancel") >= 0) {

        wx.showToast({ title: "已取消支付", icon: "none" });

      } else {

        wx.showToast({

          title: (e && e.message) || "支付失败",

          icon: "none",

        });

      }

    } finally {

      this.setData({ paying: false });

    }

  },



  async mockPay() {

    if (!this.validate()) return;

    this.setData({ paying: true });

    try {

      const { result } = await callCommerce({

        action: "createOrder",

        receiverName: this.data.receiverName.trim(),

        receiverPhone: this.data.receiverPhone.trim(),

        address: this.data.address.trim(),

        lineKeys: this.checkoutLineKeys || [],

      });

      if (!result || !result.ok) {

        throw new Error((result && result.error) || "下单失败");

      }

      const orderId = result.orderId;

      const { result: r2 } = await callCommerce({ action: "mockPay", orderId });

      if (!r2 || !r2.ok) {

        throw new Error((r2 && r2.error) || "模拟支付失败");

      }

      wx.showToast({ title: "模拟支付成功", icon: "success" });

      await this.afterPaySuccess(orderId);

    } catch (e) {

      console.error(e);

      wx.showToast({

        title: (e && e.message) || "失败",

        icon: "none",

      });

    } finally {

      this.setData({ paying: false });

    }

  },

});


