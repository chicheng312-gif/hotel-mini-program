const {

  fetchActiveSwipers,

  fetchHomeCategories,

  fetchRecommendPage,

  RECOMMEND_PAGE_SIZE,

} = require("../../services/home.js");
const { getProfile } = require("../../services/userCenter.js");

Page({

  data: {

    swipers: [],

    homeCategories: [],

    products: [],

    page: 1,

    hasMore: true,

    loading: true,

    loadingMore: false,

  },



  onShow() {

    if (typeof this.getTabBar === "function" && this.getTabBar()) {

      this.getTabBar().setData({ selected: 0 });

    }

    this.maybePromptBindPhone();

  },

  /** 未绑定手机号时引导去「我的」绑定（本会话成功拉取资料后只检测一次） */
  maybePromptBindPhone() {
    const app = getApp();
    if (app.globalData.phoneBindPromptChecked) return;
    getProfile()
      .then((res) => {
        app.globalData.phoneBindPromptChecked = true;
        if (!res || !res.ok || !res.user) return;
        const phone = res.user.phone;
        if (phone && String(phone).trim()) return;
        wx.showModal({
          title: "绑定手机号",
          content:
            "为方便订单通知与售后联系，建议在「我的」页点击「绑定」完成手机号授权。",
          confirmText: "去绑定",
          cancelText: "稍后",
          success: (r) => {
            if (r.confirm) {
              wx.switchTab({ url: "/pages/profile/profile" });
            }
          },
        });
      })
      .catch(() => {
        /* 网络失败时不标记，下次进首页再试 */
      });
  },



  onLoad() {

    this.bootstrap();

  },



  /** 首屏：轮播 + 分类 + 推荐第一页 */

  async bootstrap() {

    this.setData({ loading: true, page: 1, hasMore: true });

    try {

      // 分项 catch：避免单路慢查询拖死整页 Promise.all

      const [swipers, homeCategories, rec] = await Promise.all([

        fetchActiveSwipers().catch((err) => {

          console.warn("swipers", err);

          return [];

        }),

        fetchHomeCategories(8).catch((err) => {

          console.warn("categories", err);

          return [];

        }),

        fetchRecommendPage(1, RECOMMEND_PAGE_SIZE).catch((err) => {

          console.warn("recommend", err);

          return { list: [], hasMore: false };

        }),

      ]);

      this.setData({

        swipers,

        homeCategories,

        products: rec.list,

        hasMore: rec.hasMore,

        page: 1,

        loading: false,

      });

    } catch (e) {

      console.error(e);

      this.setData({ loading: false });

      wx.showToast({ title: "加载失败，请检查网络与数据库", icon: "none" });

    }

  },



  /** 下拉刷新：整页重新拉取 */

  async onPullDownRefresh() {

    await this.bootstrap();

    wx.stopPullDownRefresh();

  },



  /** 触底：分页追加推荐商品 */

  async onReachBottom() {

    const { loadingMore, hasMore, page, products } = this.data;

    if (loadingMore || !hasMore) return;

    this.setData({ loadingMore: true });

    try {

      const nextPage = page + 1;

      const { list, hasMore: more } = await fetchRecommendPage(

        nextPage,

        RECOMMEND_PAGE_SIZE

      );

      this.setData({

        products: products.concat(list),

        page: nextPage,

        hasMore: more,

        loadingMore: false,

      });

    } catch (e) {

      console.error(e);

      this.setData({ loadingMore: false });

    }

  },



  goSearch() {

    wx.navigateTo({ url: "/pages/search/search" });

  },



  /** 轮播点击：按 jumpPath 跳转（需在云库配置合法小程序路径） */

  onBannerTap(e) {

    const path = e.currentTarget.dataset.path;

    if (!path || typeof path !== "string") return;

    const p = path.trim();

    if (!p.startsWith("/")) {

      wx.showToast({ title: "轮播路径无效", icon: "none" });

      return;

    }

    if (p.indexOf("/pages/") !== 0) {

      wx.showToast({ title: "仅支持小程序内路径", icon: "none" });

      return;

    }

    const tabPaths = [

      "/pages/home/home",

      "/pages/category/category",

      "/pages/cart/cart",

      "/pages/profile/profile",

    ];

    const qIndex = p.indexOf("?");

    const pathOnly = qIndex >= 0 ? p.slice(0, qIndex) : p;

    const qs = qIndex >= 0 ? p.slice(qIndex + 1) : "";

    let finalPath = pathOnly;

    if (qs) {

      finalPath = `${pathOnly}?${qs

        .split("&")

        .map((pair) => {

          const eq = pair.indexOf("=");

          if (eq < 0) return encodeURIComponent(pair);

          const k = pair.slice(0, eq);

          const v = pair.slice(eq + 1);

          return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`;

        })

        .join("&")}`;

    }

    if (tabPaths.some((t) => pathOnly === t)) {

      wx.switchTab({ url: pathOnly });

      return;

    }

    wx.navigateTo({ url: finalPath });

  },



  /** 分类宫格 → 分类商品列表页 */

  onCategoryTap(e) {

    const id = e.currentTarget.dataset.id;

    if (!id) return;

    wx.navigateTo({

      url: `/pages/category-products/category-products?id=${id}`,

    });

  },



  openProduct(e) {

    const id = e.currentTarget.dataset.id;

    wx.navigateTo({ url: `/pages/product-detail/product-detail?id=${id}` });

  },

});

