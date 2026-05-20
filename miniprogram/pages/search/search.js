const { searchProducts } = require("../../services/search.js");
const {
  RECOMMEND_PAGE_SIZE,
  SEARCH_HISTORY_KEY,
  SEARCH_HISTORY_LIMIT,
} = require("../../services/constants.js");

Page({
  data: {
    keyword: "",
    minPrice: "",
    maxPrice: "",
    sortKind: "default",
    history: [],
    list: [],
    page: 1,
    hasMore: false,
    loading: false,
    loadingMore: false,
    hasSearched: false,
  },

  onLoad(query) {
    this.loadHistory();
    const hint = query.hint || query.q;
    if (hint) {
      try {
        this.setData({ keyword: decodeURIComponent(hint) });
      } catch (e) {
        this.setData({ keyword: hint });
      }
    }
  },

  loadHistory() {
    try {
      const raw = wx.getStorageSync(SEARCH_HISTORY_KEY);
      const history = Array.isArray(raw) ? raw : [];
      this.setData({ history });
    } catch (e) {
      this.setData({ history: [] });
    }
  },

  saveHistory(kw) {
    const t = String(kw || "").trim();
    if (!t) return;
    let list = [...this.data.history];
    list = list.filter((x) => x !== t);
    list.unshift(t);
    if (list.length > SEARCH_HISTORY_LIMIT) list = list.slice(0, SEARCH_HISTORY_LIMIT);
    wx.setStorageSync(SEARCH_HISTORY_KEY, list);
    this.setData({ history: list });
  },

  clearHistory() {
    wx.removeStorageSync(SEARCH_HISTORY_KEY);
    this.setData({ history: [] });
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onMin(e) {
    this.setData({ minPrice: e.detail.value });
  },

  onMax(e) {
    this.setData({ maxPrice: e.detail.value });
  },

  onSort(e) {
    const kind = e.currentTarget.dataset.kind;
    if (!kind || kind === this.data.sortKind) return;
    this.setData({ sortKind: kind });
    if (this.data.hasSearched) {
      this.runSearch(true);
    }
  },

  onSearchConfirm() {
    this.runSearch(true);
  },

  tapHistory(e) {
    const kw = e.currentTarget.dataset.kw;
    this.setData({ keyword: kw });
    this.runSearch(true);
  },

  /** reset=true：新条件从第一页重查 */
  async runSearch(reset = false) {
    const { keyword, minPrice, maxPrice, sortKind, page, list } = this.data;
    const nextPage = reset ? 1 : page;
    if (reset) {
      this.setData({ loading: true, list: [], hasSearched: true, page: 1 });
      this.saveHistory(keyword);
    } else {
      this.setData({ loadingMore: true });
    }
    try {
      const { list: chunk, hasMore } = await searchProducts({
        keyword,
        minPrice: minPrice === "" ? undefined : minPrice,
        maxPrice: maxPrice === "" ? undefined : maxPrice,
        sortKind: sortKind === "sales" ? "default" : sortKind,
        page: nextPage,
        pageSize: RECOMMEND_PAGE_SIZE,
      });
      const merged = reset ? chunk : list.concat(chunk);
      this.setData({
        list: merged,
        page: nextPage,
        hasMore,
        loading: false,
        loadingMore: false,
      });
    } catch (e) {
      console.error(e);
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({ title: "查询失败", icon: "none" });
    }
  },

  async onPullDownRefresh() {
    if (this.data.hasSearched) {
      await this.runSearch(true);
    }
    wx.stopPullDownRefresh();
  },

  async onReachBottom() {
    if (!this.data.hasSearched || this.data.loadingMore || !this.data.hasMore) {
      return;
    }
    const { keyword, minPrice, maxPrice, sortKind, list, page } = this.data;
    const nextPage = page + 1;
    this.setData({ loadingMore: true });
    try {
      const { list: chunk, hasMore } = await searchProducts({
        keyword,
        minPrice: minPrice === "" ? undefined : minPrice,
        maxPrice: maxPrice === "" ? undefined : maxPrice,
        sortKind: sortKind === "sales" ? "default" : sortKind,
        page: nextPage,
        pageSize: RECOMMEND_PAGE_SIZE,
      });
      this.setData({
        list: list.concat(chunk),
        page: nextPage,
        hasMore,
        loadingMore: false,
      });
    } catch (e) {
      console.error(e);
      this.setData({ loadingMore: false });
    }
  },

  openProduct(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/product-detail/product-detail?id=${id}` });
  },
});
