const db = wx.cloud.database();
const _ = db.command;
const { RECOMMEND_PAGE_SIZE } = require("./constants.js");

/** 正则搜索时在服务端最多拉取条数，其余在内存分页，避免 scan + skip 超时 */
const REGEXP_FETCH_CAP = 80;

function mergeDedupeProducts(a, b) {
  const map = new Map();
  [...a, ...b].forEach((p) => {
    if (p && p._id) map.set(p._id, p);
  });
  return Array.from(map.values());
}

function matchPrice(p, minPrice, maxPrice) {
  const price = p.price != null ? Number(p.price) : null;
  const pf = p.priceFen != null ? Number(p.priceFen) / 100 : null;
  const val = price != null && !Number.isNaN(price) ? price : pf;
  if (val == null || Number.isNaN(val)) return false;
  if (minPrice != null && minPrice !== "" && val < Number(minPrice)) return false;
  if (maxPrice != null && maxPrice !== "" && val > Number(maxPrice)) return false;
  return true;
}

function sortProducts(list, sortKind) {
  const arr = [...list];
  if (sortKind === "priceAsc") {
    arr.sort((a, b) => {
      const pa = a.price != null ? a.price : (a.priceFen || 0) / 100;
      const pb = b.price != null ? b.price : (b.priceFen || 0) / 100;
      return pa - pb;
    });
  } else if (sortKind === "priceDesc") {
    arr.sort((a, b) => {
      const pa = a.price != null ? a.price : (a.priceFen || 0) / 100;
      const pb = b.price != null ? b.price : (b.priceFen || 0) / 100;
      return pb - pa;
    });
  } else {
    arr.sort((a, b) => (b.sales || 0) - (a.sales || 0));
  }
  return arr;
}

/**
 * 关键词搜索：name / title 分两路 limit 拉取，内存合并、过滤、排序、分页（避免 or+正则 大查询超时）
 */
async function searchWithKeyword(kw, minPrice, maxPrice, sortKind, page, pageSize) {
  const safe = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rx = db.RegExp({ regexp: safe, options: "i" });
  const [rName, rTitle] = await Promise.all([
    db.collection("products").where({ name: rx }).limit(REGEXP_FETCH_CAP).get(),
    db.collection("products").where({ title: rx }).limit(REGEXP_FETCH_CAP).get(),
  ]);
  let merged = mergeDedupeProducts(rName.data || [], rTitle.data || []);
  merged = merged.filter((p) => matchPrice(p, minPrice, maxPrice));
  merged = sortProducts(merged, sortKind);
  const skip = Math.max(0, (page - 1) * pageSize);
  const list = merged.slice(skip, skip + pageSize);
  const hasMore = merged.length > skip + pageSize;
  return { list, hasMore };
}

/**
 * 无关键词：走索引排序 + skip（与云开发索引匹配时最快）
 */
async function searchWithoutKeyword(minPrice, maxPrice, sortKind, page, pageSize) {
  const clauses = [];
  if (minPrice != null && minPrice !== "") {
    const n = Number(minPrice);
    if (!Number.isNaN(n)) clauses.push({ price: _.gte(n) });
  }
  if (maxPrice != null && maxPrice !== "") {
    const n = Number(maxPrice);
    if (!Number.isNaN(n)) clauses.push({ price: _.lte(n) });
  }

  let query = db.collection("products");
  if (clauses.length) {
    query = query.where(_.and(clauses));
  }

  if (sortKind === "priceAsc") {
    query = query.orderBy("price", "asc");
  } else if (sortKind === "priceDesc") {
    query = query.orderBy("price", "desc");
  } else {
    query = query.orderBy("sales", "desc");
  }

  const skip = Math.max(0, (page - 1) * pageSize);
  const { data } = await query.skip(skip).limit(pageSize).get();
  return { list: data, hasMore: data.length === pageSize };
}

/**
 * 搜索商品：关键词走内存策略；无关键词走索引分页
 */
async function searchProducts(options = {}) {
  const {
    keyword = "",
    minPrice,
    maxPrice,
    sortKind = "default",
    page = 1,
    pageSize = RECOMMEND_PAGE_SIZE,
  } = options;

  const kw = String(keyword || "").trim();
  const sk = sortKind === "sales" ? "default" : sortKind;

  if (kw) {
    return searchWithKeyword(kw, minPrice, maxPrice, sk, page, pageSize);
  }
  return searchWithoutKeyword(minPrice, maxPrice, sk, page, pageSize);
}

module.exports = {
  searchProducts,
};
