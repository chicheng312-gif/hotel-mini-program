const db = wx.cloud.database();
const { callCommerce } = require("./cloudCall.js");
const {
  productTitle,
  productCover,
  productPriceFen,
  isProductOnShelf,
} = require("./productAdapter.js");

const LEGACY_COLLECTION = "carts";

/** 与自定义库规则配合：查询/更新须带 _openid 条件（服务端将 {openid} 替换为当前用户） */
const OPENID_TEMPLATE = "{openid}";

function cartOwnerWhere(extra = {}) {
  return { ...extra, _openid: OPENID_TEMPLATE };
}

function collectionByOwner(col) {
  return db.collection(col).where(cartOwnerWhere());
}

/** 首次探测：有 cart 用 cart，否则用 carts（避免未建集合报错） */
let _resolvedCol = null;

/** 客户端库 -502003 时改走 commerce.cartSync（云函数不受安全规则限制） */
let _useCloudCart = false;

function isPermissionDenied(e) {
  if (!e) return false;
  return e.errCode === -502003 || String(e.errMsg || "").includes("Permission denied");
}

function enableCloudCart() {
  _useCloudCart = true;
  if (!_resolvedCol) _resolvedCol = "cart";
}

async function cloudCartPull() {
  const { result } = await callCommerce({ action: "cartSync" });
  if (!result || !result.ok) {
    throw new Error((result && result.error) || "cartSync 拉取失败");
  }
  return {
    docId: result.docId,
    items: result.items || [],
    total: result.total,
  };
}

async function cloudCartPush(items) {
  const { result } = await callCommerce({ action: "cartSync", items });
  if (!result || !result.ok) {
    throw new Error((result && result.error) || "cartSync 写入失败");
  }
}

function isCollectionMissingError(e) {
  if (!e) return false;
  const code = e.errCode;
  const msg = String(e.errMsg || e.message || "");
  return (
    code === -502005 ||
    msg.includes("not exist") ||
    msg.includes("NOT_EXIST") ||
    msg.includes("CollectionNotFound")
  );
}

async function cartCollectionName() {
  if (_useCloudCart) return _resolvedCol || "cart";
  if (_resolvedCol) return _resolvedCol;
  try {
    await collectionByOwner("cart").limit(1).get();
    _resolvedCol = "cart";
  } catch (e) {
    if (isPermissionDenied(e)) {
      enableCloudCart();
      return _resolvedCol;
    }
    if (isCollectionMissingError(e)) {
      _resolvedCol = "carts";
    } else {
      throw e;
    }
  }
  return _resolvedCol;
}

/** 同一商品 + 不同规格 → 独立购物车行 */
function makeLineKey(productId, specText) {
  return `${productId}@@${specText || ""}`;
}

async function getCartDoc() {
  if (_useCloudCart) {
    const r = await cloudCartPull();
    return { _id: r.docId, items: r.items };
  }
  try {
    const col = await cartCollectionName();
    if (_useCloudCart) {
      const r = await cloudCartPull();
      return { _id: r.docId, items: r.items };
    }
    const { data } = await collectionByOwner(col).limit(1).get();
    if (data[0]) return data[0];

    if (col === "cart") {
      const { data: legacy } = await collectionByOwner(
        LEGACY_COLLECTION
      ).limit(1).get();
      if (!legacy[0]) return null;
      try {
        const res = await db.collection("cart").add({
          data: {
            items: legacy[0].items || [],
            updatedAt: Date.now(),
          },
        });
        return { _id: res._id, items: legacy[0].items || [] };
      } catch (e) {
        if (isPermissionDenied(e)) {
          enableCloudCart();
          await cloudCartPush(legacy[0].items || []);
          const r = await cloudCartPull();
          return { _id: r.docId, items: r.items };
        }
        throw e;
      }
    }
    return null;
  } catch (e) {
    if (isPermissionDenied(e)) {
      enableCloudCart();
      const r = await cloudCartPull();
      return { _id: r.docId, items: r.items };
    }
    throw e;
  }
}

async function ensureCartDoc() {
  let doc = await getCartDoc();
  if (doc) return doc;
  if (_useCloudCart) {
    await cloudCartPush([]);
    const r = await cloudCartPull();
    return { _id: r.docId, items: r.items };
  }
  try {
    const col = await cartCollectionName();
    const res = await db.collection(col).add({
      data: { items: [], updatedAt: Date.now() },
    });
    return { _id: res._id, items: [] };
  } catch (e) {
    if (isPermissionDenied(e)) {
      enableCloudCart();
      await cloudCartPush([]);
      const r = await cloudCartPull();
      return { _id: r.docId, items: r.items };
    }
    throw e;
  }
}

function normalizeLineKey(item) {
  return item.lineKey || makeLineKey(item.productId, item.specText);
}

function normalizeSelected(item) {
  return item.selected !== false;
}

function mergeItems(items, productId, delta, productSnapshot) {
  const specText = (productSnapshot && productSnapshot.specText) || "";
  const targetKey = makeLineKey(productId, specText);
  const list = (items || []).map((x) => ({ ...x }));
  const idx = list.findIndex((x) => normalizeLineKey(x) === targetKey);
  if (delta === 0) return list;
  if (idx >= 0) {
    const next = list[idx].count + delta;
    if (next <= 0) list.splice(idx, 1);
    else {
      list[idx] = { ...list[idx], count: next };
      if (list[idx].selected === undefined) list[idx].selected = true;
    }
  } else if (delta > 0) {
    list.push({
      lineKey: targetKey,
      productId,
      count: delta,
      specText,
      selected: true,
      title: productTitle(productSnapshot),
      cover: productCover(productSnapshot),
      priceFen: productPriceFen(productSnapshot),
    });
  }
  return list;
}

async function updateCartFields(col, docId, patch) {
  const { items } = patch;
  if (_useCloudCart) {
    await cloudCartPush(items);
    return;
  }
  try {
    await db
      .collection(col)
      .where(cartOwnerWhere({ _id: docId }))
      .update({ data: { ...patch, updatedAt: Date.now() } });
  } catch (e) {
    if (isPermissionDenied(e)) {
      enableCloudCart();
      await cloudCartPush(items);
      return;
    }
    throw e;
  }
}

async function setCartItems(items) {
  const doc = await ensureCartDoc();
  const col = await cartCollectionName();
  await updateCartFields(col, doc._id, { items });
}

async function addToCart(product, count = 1) {
  const doc = await ensureCartDoc();
  const col = await cartCollectionName();
  const items = mergeItems(doc.items, product._id, count, product);
  await updateCartFields(col, doc._id, { items });
  return items.reduce((s, x) => s + x.count, 0);
}

async function updateLine(lineKey, count) {
  const doc = await ensureCartDoc();
  const col = await cartCollectionName();
  const items = (doc.items || [])
    .map((x) =>
      normalizeLineKey(x) === lineKey ? { ...x, count: Math.max(0, count) } : x
    )
    .filter((x) => x.count > 0);
  await updateCartFields(col, doc._id, { items });
  return items.reduce((s, x) => s + x.count, 0);
}

async function removeLine(lineKey) {
  const doc = await ensureCartDoc();
  const col = await cartCollectionName();
  const items = (doc.items || []).filter((x) => normalizeLineKey(x) !== lineKey);
  await updateCartFields(col, doc._id, { items });
  return items.reduce((s, x) => s + x.count, 0);
}

/** 批量删除 */
async function removeLines(lineKeys) {
  const set = new Set(lineKeys || []);
  if (!set.size) return 0;
  const doc = await ensureCartDoc();
  const col = await cartCollectionName();
  const items = (doc.items || []).filter((x) => !set.has(normalizeLineKey(x)));
  await updateCartFields(col, doc._id, { items });
  return items.reduce((s, x) => s + x.count, 0);
}

async function setLineSelected(lineKey, selected) {
  const doc = await ensureCartDoc();
  const col = await cartCollectionName();
  const items = (doc.items || []).map((x) =>
    normalizeLineKey(x) === lineKey ? { ...x, selected: !!selected } : x
  );
  await updateCartFields(col, doc._id, { items });
}

async function setAllSelected(selected) {
  const doc = await ensureCartDoc();
  const col = await cartCollectionName();
  const items = (doc.items || []).map((x) => ({ ...x, selected: !!selected }));
  await updateCartFields(col, doc._id, { items });
}

async function clearCart() {
  const doc = await getCartDoc();
  if (!doc) return;
  const col = await cartCollectionName();
  await updateCartFields(col, doc._id, { items: [] });
}

function summarizeLines(lines) {
  const selectedLines = lines.filter((x) => normalizeSelected(x));
  const totalFen = selectedLines.reduce((s, x) => s + x.subtotalFen, 0);
  const count = selectedLines.reduce((s, x) => s + x.count, 0);
  const allSelected =
    lines.length > 0 && lines.every((x) => normalizeSelected(x));
  const someSelected = selectedLines.length > 0;
  return { totalFen, count, allSelected, someSelected, selectedLines };
}

async function loadCartWithProducts() {
  const doc = await getCartDoc();
  if (!doc || !doc.items || !doc.items.length) {
    return {
      items: [],
      totalFen: 0,
      count: 0,
      allSelected: false,
      someSelected: false,
    };
  }
  const ids = [...new Set(doc.items.map((x) => x.productId))];
  const _ = db.command;
  const { data: products } = await db
    .collection("products")
    .where({ _id: _.in(ids) })
    .get();
  const map = {};
  products.forEach((p) => {
    map[p._id] = p;
  });
  const lines = doc.items
    .map((line) => {
      const p = map[line.productId];
      if (!p || !isProductOnShelf(p)) return null;
      const priceFen = productPriceFen(p);
      const lk = normalizeLineKey(line);
      const stock = Number(p.stock) || 0;
      const cnt = line.count;
      return {
        ...line,
        lineKey: lk,
        selected: normalizeSelected(line),
        title: productTitle(p),
        cover: productCover(p) || line.cover,
        priceFen,
        stock,
        subtotalFen: priceFen * cnt,
        stockShort: cnt > stock,
      };
    })
    .filter(Boolean);
  const sum = summarizeLines(lines);
  return {
    items: lines,
    totalFen: sum.totalFen,
    count: sum.count,
    allSelected: sum.allSelected,
    someSelected: sum.someSelected,
  };
}

const CHECKOUT_KEYS = "mall_checkout_line_keys_v1";

function saveCheckoutLineKeys(keys) {
  try {
    wx.setStorageSync(CHECKOUT_KEYS, keys || []);
  } catch (e) {
    console.warn(e);
  }
}

function readCheckoutLineKeys() {
  try {
    const raw = wx.getStorageSync(CHECKOUT_KEYS);
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function clearCheckoutLineKeys() {
  try {
    wx.removeStorageSync(CHECKOUT_KEYS);
  } catch (e) {
    /* ignore */
  }
}

module.exports = {
  getCartDoc,
  addToCart,
  updateLine,
  removeLine,
  removeLines,
  setLineSelected,
  setAllSelected,
  clearCart,
  loadCartWithProducts,
  makeLineKey,
  saveCheckoutLineKeys,
  readCheckoutLineKeys,
  clearCheckoutLineKeys,
  summarizeLines,
};
