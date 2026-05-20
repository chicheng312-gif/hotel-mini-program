const cart = require("../../utils/cart.js");
const { isProductOnShelf } = require("../../utils/productAdapter.js");
const {
  fetchProductById,
  fetchReviewsPage,
} = require("../../services/productDetail.js");
const favorites = require("../../utils/favorites.js");
const { formatDate } = require("../../utils/format.js");

/**
 * 详情顶栏媒体：可选首项视频 + 后续图片
 * 云库 products 字段：
 * - videoUrl（或 coverVideo）：云存储 fileID / https，建议 mp4
 * - videoPoster：视频封面（可选，默认可用 coverUrl）
 * - images / galleryUrls / coverUrl：真实商品图
 */
function buildGalleryMedia(p) {
  if (!p) return [];
  const media = [];
  const videoUrl = String(p.videoUrl || p.coverVideo || "").trim();
  if (videoUrl) {
    const poster = String(p.videoPoster || p.coverUrl || "").trim();
    media.push({
      type: "video",
      src: videoUrl,
      poster: poster || "",
    });
  }
  const urls = [];
  if (p.galleryUrls && p.galleryUrls.length) urls.push(...p.galleryUrls);
  if (p.images && p.images.length) urls.push(...p.images);
  if (p.coverUrl) urls.push(p.coverUrl);
  const seen = new Set();
  if (videoUrl) seen.add(videoUrl);
  for (const u of urls) {
    const s = String(u || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    media.push({ type: "image", src: s });
  }
  return media;
}

function defaultSelectedSpecs(specs) {
  if (!specs || !specs.length) return [];
  return specs.map((s) => (s.values && s.values[0]) || "");
}

Page({
  data: {
    productId: "",
    product: null,
    galleryMedia: [],
    galleryActive: 0,
    detailNodes: "",
    count: 1,
    currentStock: 0,
    showSpec: false,
    specs: [],
    selectedSpecs: [],
    specSummary: "默认规格",
    reviews: [],
    reviewPage: 1,
    reviewHasMore: false,
    loadingReviews: false,
    isFavorite: false,
    ratingDisplay: 0,
  },

  async onLoad(query) {
    const { id } = query;
    if (!id) return;
    this.productId = id;
    this.setData({
      productId: id,
      isFavorite: favorites.isFavorite(id),
    });
    await this.loadProduct();
    await this.loadReviews(true).catch((err) => {
      console.warn("reviews", err);
    });
    wx.showShareMenu({
      withShareTicket: true,
      menus: ["shareAppMessage", "shareTimeline"],
    });
  },

  /** 返回详情页时刷新库存与评分等（仍上架） */
  async onShow() {
    if (!this.productId || !this.data.product) return;
    try {
      const p = await fetchProductById(this.productId);
      if (!p || !isProductOnShelf(p)) return;
      this.setData({
        product: { ...this.data.product, ...p },
      });
      this.applyInventory(p, this.data.selectedSpecs);
      if (this.data.count > this.data.currentStock) {
        this.setData({ count: Math.max(1, this.data.currentStock || 1) });
      }
    } catch (e) {
      console.warn(e);
    }
  },

  computeSpecSummary(specs, selected) {
    if (!specs || !specs.length) return "默认规格";
    return specs.map((s, i) => `${s.name}·${selected[i]}`).join(" / ");
  },

  /** 与云库 skuStock 的 key 对齐：按 specs 顺序用 | 连接 */
  buildSkuKey(product, selectedSpecs) {
    if (!product || !product.specs || !product.specs.length) return "";
    return (selectedSpecs || []).join("|");
  },

  applyInventory(product, selectedSpecs) {
    const ss = selectedSpecs || this.data.selectedSpecs;
    let stock = product.stock != null ? product.stock : 0;
    const key = this.buildSkuKey(product, ss);
    if (product.skuStock && key && product.skuStock[key] != null) {
      stock = product.skuStock[key];
    }
    this.setData({ currentStock: stock });
  },

  async loadProduct() {
    const p = await fetchProductById(this.productId);
    if (!p || !isProductOnShelf(p)) {
      this.setData({ product: null });
      return;
    }
    const galleryMedia = buildGalleryMedia(p);
    const desc = p.description || p.desc || "";
    const detailNodes =
      p.detailHtml ||
      `<div style="font-size:15px;color:#333;line-height:1.6;"><p>${desc}</p></div>`;
    const specs = p.specs || [];
    const selectedSpecs = defaultSelectedSpecs(specs);
    const specSummary = this.computeSpecSummary(specs, selectedSpecs);
    const ratingDisplay = Number(p.ratingAvg) || 0;
    this.setData({
      product: p,
      galleryMedia,
      galleryActive: 0,
      detailNodes,
      specs,
      selectedSpecs,
      specSummary,
      ratingDisplay,
      count: 1,
    });
    this.applyInventory(p, selectedSpecs);
  },

  onGalleryChange(e) {
    const next = e.detail.current;
    const prev = this.data.galleryActive;
    if (prev !== next) {
      const ctx = wx.createVideoContext(`gallery-video-${prev}`, this);
      if (ctx && ctx.pause) ctx.pause();
    }
    this.setData({ galleryActive: next });
  },

  onHide() {
    const idx = this.data.galleryActive;
    const ctx = wx.createVideoContext(`gallery-video-${idx}`, this);
    if (ctx && ctx.pause) ctx.pause();
  },

  /** 图片项：原生预览；视频项使用组件自带播放控件 */
  onPreviewImage(e) {
    const i = Number(e.currentTarget.dataset.i) || 0;
    const { galleryMedia } = this.data;
    const item = galleryMedia[i];
    if (!item || item.type !== "image") return;
    const urls = galleryMedia
      .filter((x) => x.type === "image")
      .map((x) => x.src);
    wx.previewImage({
      current: item.src,
      urls,
    });
  },

  openSpec() {
    if (!this.data.specs.length) return;
    this.setData({ showSpec: true });
  },

  closeSpec() {
    this.setData({ showSpec: false });
  },

  tapSpecValue(e) {
    const sidx = Number(e.currentTarget.dataset.sidx);
    const val = e.currentTarget.dataset.val;
    const selected = [...this.data.selectedSpecs];
    selected[sidx] = val;
    const specSummary = this.computeSpecSummary(this.data.specs, selected);
    this.setData({ selectedSpecs: selected, specSummary });
    this.applyInventory(this.data.product, selected);
    if (this.data.count > this.data.currentStock) {
      this.setData({ count: Math.max(1, this.data.currentStock || 1) });
    }
  },

  confirmSpec() {
    this.closeSpec();
  },

  onStepChange(e) {
    const v = typeof e.detail === "number" ? e.detail : Number(e.detail) || 1;
    this.setData({ count: v });
  },

  toggleFavorite() {
    const on = favorites.toggleFavorite(this.productId);
    this.setData({ isFavorite: on });
    wx.showToast({ title: on ? "已收藏" : "已取消收藏", icon: "none" });
  },

  buildCartPayload() {
    const { product, specSummary } = this.data;
    return { ...product, specText: specSummary };
  },

  async addCart() {
    if (this.data.currentStock <= 0) {
      wx.showToast({ title: "库存不足", icon: "none" });
      return;
    }
    try {
      const total = await cart.addToCart(
        this.buildCartPayload(),
        this.data.count
      );
      getApp().globalData.cartBadge = total;
      const tab = this.getTabBar && this.getTabBar();
      if (tab) tab.setData({ badge: total });
      wx.showToast({ title: "已加入购物车", icon: "success" });
    } catch (e) {
      console.error(e);
      wx.showToast({ title: "操作失败", icon: "none" });
    }
  },

  async buyNow() {
    if (this.data.currentStock <= 0) {
      wx.showToast({ title: "库存不足", icon: "none" });
      return;
    }
    try {
      await cart.addToCart(this.buildCartPayload(), this.data.count);
      wx.navigateTo({ url: "/pages/checkout/checkout" });
    } catch (e) {
      console.error(e);
      wx.showToast({ title: "操作失败", icon: "none" });
    }
  },

  async loadReviews(reset) {
    const page = reset ? 1 : this.data.reviewPage + 1;
    this.setData({ loadingReviews: true });
    try {
      const { list, hasMore } = await fetchReviewsPage(
        this.productId,
        page,
        5
      );
      const mapped = list.map((r) => ({
        ...r,
        timeStr: formatDate(r.createdAt || Date.now()),
      }));
      const reviews = reset ? mapped : this.data.reviews.concat(mapped);
      this.setData({
        reviews,
        reviewPage: page,
        reviewHasMore: hasMore,
        loadingReviews: false,
      });
    } catch (e) {
      console.error(e);
      this.setData({ loadingReviews: false });
    }
  },

  loadMoreReviews() {
    if (!this.data.reviewHasMore || this.data.loadingReviews) return;
    this.loadReviews(false);
  },

  onShareAppMessage() {
    const { product, galleryMedia } = this.data;
    const title = product ? product.name || product.title : "商品详情";
    let imageUrl = "";
    for (const m of galleryMedia || []) {
      if (m.type === "image") {
        imageUrl = m.src;
        break;
      }
      if (m.type === "video" && m.poster) imageUrl = m.poster;
    }
    return {
      title,
      path: `/pages/product-detail/product-detail?id=${this.productId}`,
      imageUrl,
    };
  },

  onShareTimeline() {
    const { product } = this.data;
    const title = product ? product.name || product.title : "商品详情";
    return {
      title,
      query: `id=${this.productId}`,
    };
  },
});
