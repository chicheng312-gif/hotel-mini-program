const cloud = require("wx-server-sdk");

// 线上部署时 DYNAMIC_CURRENT_ENV 有效；本地单独调试 Node 时无效，须回落到具体 envId（与 miniprogram/app.js 一致）
const CLOUD_ENV_ID =
  process.env.WX_CLOUD_ENV || process.env.TCB_ENV || "sense3-d9gwdv4w5af2e8624";
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV || CLOUD_ENV_ID });

const db = cloud.database();
const _ = db.command;

function isProductOnShelf(p) {
  if (!p) return false;
  if (p.status === "off") return false;
  if (p.isActive === false) return false;
  return true;
}

function productTitle(p) {
  return p.name || p.title || "";
}

function productCover(p) {
  return p.coverUrl || (p.images && p.images[0]) || "";
}

function productPriceFen(p) {
  if (p.priceFen != null && p.priceFen !== "") return Number(p.priceFen);
  const yuan = Number(p.price);
  if (Number.isNaN(yuan)) return 0;
  return Math.round(yuan * 100);
}

function discountRate(points) {
  const p = Number(points) || 0;
  if (p >= 800) return 0.95;
  if (p >= 200) return 0.98;
  return 1;
}

async function getMemberPoints(openid) {
  const { data } = await db
    .collection("members")
    .where({ _openid: _.eq(openid) })
    .limit(1)
    .get();
  return (data[0] && data[0].points) || 0;
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

async function getCartDocForUser(openid) {
  const { doc } = await getCartDocAndCol(openid);
  return doc;
}

/** 返回用户购物车所在集合与文档（无文档则 doc 为 null） */
async function getCartDocAndCol(openid) {
  try {
    const { data } = await db
      .collection("cart")
      .where({ _openid: _.eq(openid) })
      .limit(1)
      .get();
    if (data[0]) return { col: "cart", doc: data[0] };
  } catch (e) {
    if (!isCollectionMissingError(e)) throw e;
  }
  const { data } = await db
    .collection("carts")
    .where({ _openid: _.eq(openid) })
    .limit(1)
    .get();
  return { col: "carts", doc: data[0] || null };
}

/** 无文档时创建一条空购物车（云函数侧不受客户端库规则限制） */
async function ensureCartDocServer(openid) {
  const got = await getCartDocAndCol(openid);
  if (got.doc) return got;
  let useCol = "cart";
  try {
    await db.collection("cart").limit(1).get();
  } catch (e) {
    if (isCollectionMissingError(e)) useCol = "carts";
    else throw e;
  }
  const res = await db.collection(useCol).add({
    data: { items: [], updatedAt: Date.now() },
  });
  return { col: useCol, doc: { _id: res._id, items: [] } };
}

function normalizeLineKeyFromItem(it) {
  const spec = (it.specText && String(it.specText).trim()) || "";
  return `${it.productId}@@${spec}`;
}

async function fulfillOrder(orderId) {
  const orderRef = db.collection("orders").doc(orderId);
  const { data: order } = await orderRef.get();
  if (!order || order.status !== "pending_payment") {
    return { ok: true, skipped: true };
  }
  const paidAt = Date.now();
  await orderRef.update({
    data: { status: "paid", paidAt, updatedAt: paidAt },
  });
  for (const line of order.lines || []) {
    await db
      .collection("products")
      .doc(line.productId)
      .update({
        data: {
          stock: _.inc(-line.count),
          sales: _.inc(line.count),
        },
      });
  }
  const gain = Math.max(1, Math.floor((order.payFen || 0) / 100));
  const { data: mems } = await db
    .collection("members")
    .where({ _openid: _.eq(order.openId) })
    .limit(1)
    .get();
  if (mems[0]) {
    await db
      .collection("members")
      .doc(mems[0]._id)
      .update({
        data: {
          points: _.inc(gain),
          totalSpent: _.inc(order.payFen || 0),
        },
      });
  }
  return { ok: true };
}

const BATCH_DELETE_SIZE = 100;

/** 分批删除集合内全部文档（云函数管理员权限） */
async function deleteAllInCollection(colName) {
  let removed = 0;
  while (true) {
    const { data } = await db
      .collection(colName)
      .limit(BATCH_DELETE_SIZE)
      .field({ _id: true })
      .get();
    if (!data.length) break;
    const ids = data.map((d) => d._id);
    const res = await db
      .collection(colName)
      .where({ _id: _.in(ids) })
      .remove();
    removed += res.stats.removed || ids.length;
    if (data.length < BATCH_DELETE_SIZE) break;
  }
  return removed;
}

/**
 * 商城演示分类与商品定义（美食/菌类/药材/茶叶）
 * @returns {{ categories: object[], productGroups: object[][] }}
 */
function getCatalogSeedDefinition(now) {
  const categories = [
    { name: "美食饮料类", sort: 1, isActive: true, imageUrl: "", createdAt: now },
    { name: "菌类", sort: 2, isActive: true, imageUrl: "", createdAt: now },
    { name: "药材类", sort: 3, isActive: true, imageUrl: "", createdAt: now },
    { name: "茶叶类", sort: 4, isActive: true, imageUrl: "", createdAt: now },
  ];
  const productGroups = [
    [
      {
        title: "天然矿泉水",
        subtitle: "山泉灌装",
        priceFen: 2990,
        originalPriceFen: 3990,
        stock: 200,
        sales: 186,
        desc: "天然弱碱性山泉水，便携装，日常饮用。",
        tags: ["热销"],
      },
      {
        title: "鲜榨橙汁",
        subtitle: "无添加",
        priceFen: 1890,
        stock: 150,
        sales: 92,
        desc: "当季鲜橙冷榨，冷藏更佳，演示商品。",
        tags: ["新品"],
      },
      {
        title: "高山绿茶饮料",
        subtitle: "清爽低糖",
        priceFen: 5900,
        originalPriceFen: 6900,
        stock: 120,
        sales: 64,
        desc: "高山绿茶萃取，微甜不腻，户外补水。",
        tags: [],
      },
      {
        title: "有机苹果汁",
        subtitle: "100%果汁",
        priceFen: 3290,
        stock: 80,
        sales: 41,
        desc: "有机苹果冷压榨汁，无浓缩还原。",
        tags: [],
      },
    ],
    [
      {
        title: "牛肝菌",
        subtitle: "云南干货",
        priceFen: 12800,
        originalPriceFen: 15800,
        stock: 90,
        sales: 156,
        desc: "精选牛肝菌干片，菌香浓郁，炖汤佳品。",
        tags: ["招牌", "包邮"],
      },
      {
        title: "松茸",
        subtitle: "特级片",
        priceFen: 29800,
        stock: 50,
        sales: 78,
        desc: "高海拔松茸干片，香气醇厚。",
        tags: ["精选"],
      },
      {
        title: "羊肚菌",
        subtitle: "头茬",
        priceFen: 18900,
        stock: 70,
        sales: 103,
        desc: "头茬羊肚菌，口感脆嫩，煲汤提鲜。",
        tags: [],
      },
      {
        title: "香菇干货",
        subtitle: "厚肉",
        priceFen: 4900,
        stock: 180,
        sales: 220,
        desc: "厚肉香菇，日晒干燥，家常烹饪常备。",
        tags: ["热销"],
      },
    ],
    [
      {
        title: "鸡血藤",
        subtitle: "切段",
        priceFen: 6800,
        stock: 100,
        sales: 67,
        desc: "鸡血藤切段，可煲汤或泡饮，演示药材。",
        tags: [],
      },
      {
        title: "蜂蜜",
        subtitle: "百花蜜",
        priceFen: 8900,
        originalPriceFen: 9900,
        stock: 120,
        sales: 198,
        desc: "天然百花蜜，口感清甜，冲饮拌食皆宜。",
        tags: ["热销", "包邮"],
      },
      {
        title: "枸杞",
        subtitle: "宁夏特级",
        priceFen: 4500,
        stock: 160,
        sales: 134,
        desc: "宁夏特级枸杞，颗粒饱满，泡茶煲汤。",
        tags: [],
      },
      {
        title: "黄芪片",
        subtitle: "切片",
        priceFen: 5600,
        stock: 85,
        sales: 52,
        desc: "黄芪切片，汤色清亮，日常养生演示。",
        tags: [],
      },
    ],
    [
      {
        title: "古树茶叶",
        subtitle: "春茶",
        priceFen: 16800,
        originalPriceFen: 19800,
        stock: 60,
        sales: 89,
        desc: "云南古树春茶，条索肥壮，回甘持久。",
        tags: ["招牌"],
      },
      {
        title: "云南生普",
        subtitle: "饼茶",
        priceFen: 25800,
        stock: 55,
        sales: 112,
        desc: "云南大叶种生普，陈化潜力好，演示商品。",
        tags: ["热销"],
      },
      {
        title: "云南熟普",
        subtitle: "醇和",
        priceFen: 19900,
        stock: 70,
        sales: 95,
        desc: "渥堆熟普，汤色红浓，口感醇滑。",
        tags: [],
      },
      {
        title: "滇红工夫",
        subtitle: "红茶",
        priceFen: 7800,
        stock: 100,
        sales: 73,
        desc: "滇红工夫红茶，蜜香明显，适合日常品饮。",
        tags: [],
      },
    ],
  ];
  return { categories, productGroups };
}

/** 写入 getCatalogSeedDefinition 定义的分类与商品 */
async function insertCatalogSeed(now) {
  const { categories, productGroups } = getCatalogSeedDefinition(now);
  const categoryIds = [];
  for (const row of categories) {
    const { _id } = await db.collection("categories").add({ data: row });
    categoryIds.push(_id);
  }
  let productCount = 0;
  for (let i = 0; i < productGroups.length; i++) {
    const catId = categoryIds[i];
    for (const p of productGroups[i]) {
      await db.collection("products").add({
        data: {
          title: p.title,
          subtitle: p.subtitle || "",
          images: p.images || [],
          coverUrl: p.coverUrl || "",
          videoUrl: p.videoUrl || "",
          videoPoster: p.videoPoster || "",
          categoryId: catId,
          priceFen: p.priceFen,
          originalPriceFen: p.originalPriceFen,
          stock: p.stock,
          sales: p.sales,
          status: "on",
          desc: p.desc || "",
          tags: p.tags || [],
          createdAt: now,
        },
      });
      productCount += 1;
    }
  }
  return { categoryIds, productCount };
}

/**
 * 清空并重建商城分类/商品（管理用）
 * 部署 commerce 后，在云开发控制台 → 云函数 → commerce → 测试，传入：
 *   { "action": "resetCatalog" }
 */
async function resetCatalog() {
  const removedProducts = await deleteAllInCollection("products");
  const removedCategories = await deleteAllInCollection("categories");
  const now = Date.now();
  const { categoryIds, productCount } = await insertCatalogSeed(now);
  return {
    ok: true,
    message: "已重置商城分类与商品",
    removedProducts,
    removedCategories,
    categoryIds,
    productCount,
  };
}

async function seedIfEmpty() {
  const countRes = await db.collection("categories").count();
  const total = countRes.total;
  if (total > 0) {
    return { ok: true, skipped: true, message: "已有分类数据" };
  }
  const now = Date.now();
  const { categoryIds, productCount } = await insertCatalogSeed(now);
  return {
    ok: true,
    message: "已写入演示分类与商品",
    categoryIds,
    productCount,
  };
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const OPENID = wxContext.OPENID;
  const action = event.action;

  try {
    if (action === "seed") {
      const r = await seedIfEmpty();
      return r;
    }

    if (action === "resetCatalog") {
      return await resetCatalog();
    }

    if (action === "ensureMember") {
      const { data } = await db
        .collection("members")
        .where({ _openid: _.eq(OPENID) })
        .limit(1)
        .get();
      if (!data.length) {
        await db.collection("members").add({
          data: { points: 0, totalSpent: 0, createdAt: Date.now() },
        });
      }
      return { ok: true };
    }

    /**
     * 购物车同步（小程序端库权限未配置好时的兜底：用云函数身份读写）
     * - 仅 cartSync：拉取/确保文档，返回 docId、items、total
     * - 带 items 数组：整单覆盖写入并返回 total
     */
    if (action === "cartSync") {
      const hasItemsKey = Object.prototype.hasOwnProperty.call(event, "items");
      const { col, doc } = await ensureCartDocServer(OPENID);
      if (!hasItemsKey) {
        const items = doc.items || [];
        const total = items.reduce((s, x) => s + (Number(x.count) || 0), 0);
        return { ok: true, docId: doc._id, items, total };
      }
      const items = event.items;
      if (!Array.isArray(items)) {
        return { ok: false, error: "items 须为数组" };
      }
      await db.collection(col).doc(doc._id).update({
        data: { items, updatedAt: Date.now() },
      });
      const total = items.reduce((s, x) => s + (Number(x.count) || 0), 0);
      return { ok: true, docId: doc._id, items, total };
    }

    if (action === "createOrder") {
      const { receiverName, receiverPhone, address, lineKeys } = event;
      if (!receiverName || !receiverPhone || !address) {
        return { ok: false, error: "请填写完整收货信息" };
      }
      const cartDoc = await getCartDocForUser(OPENID);
      if (!cartDoc || !cartDoc.items || !cartDoc.items.length) {
        return { ok: false, error: "购物车为空" };
      }
      const keySet =
        Array.isArray(lineKeys) && lineKeys.length
          ? new Set(lineKeys.map((k) => String(k)))
          : null;
      let sourceItems = cartDoc.items;
      if (keySet) {
        sourceItems = cartDoc.items.filter((it) =>
          keySet.has(normalizeLineKeyFromItem(it))
        );
      }
      if (!sourceItems.length) {
        return { ok: false, error: "请选择要结算的商品" };
      }
      const points = await getMemberPoints(OPENID);
      const rate = discountRate(points);
      const lines = [];
      let goodsFen = 0;
      for (const it of sourceItems) {
        const { data: p } = await db.collection("products").doc(it.productId).get();
        if (!isProductOnShelf(p)) {
          return { ok: false, error: `商品已下架：${it.productId}` };
        }
        if (p.stock < it.count) {
          return { ok: false, error: `库存不足：${productTitle(p)}` };
        }
        const unitFen = productPriceFen(p);
        const subtotalFen = unitFen * it.count;
        goodsFen += subtotalFen;
        const spec = (it.specText && String(it.specText).trim()) || "";
        lines.push({
          productId: it.productId,
          title: spec ? `${productTitle(p)}（${spec}）` : productTitle(p),
          specText: spec,
          cover: productCover(p),
          count: it.count,
          priceFen: unitFen,
          subtotalFen,
        });
      }
      const discountFen = Math.floor(goodsFen * (1 - rate));
      const payFen = Math.max(1, goodsFen - discountFen);
      const outTradeNo = `od_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 10)}`;
      const now = Date.now();
      await db
        .collection("orders")
        .doc(outTradeNo)
        .set({
          data: {
            openId: OPENID,
            openid: OPENID,
            orderNo: outTradeNo,
            receiverName,
            receiverPhone,
            address,
            lines,
            goodsFen,
            discountFen,
            payFen,
            status: "pending_payment",
            createdAt: now,
            updatedAt: now,
          },
        });
      for (const line of lines) {
        await db.collection("order_items").add({
          data: {
            openId: OPENID,
            openid: OPENID,
            orderId: outTradeNo,
            orderNo: outTradeNo,
            productId: line.productId,
            title: line.title,
            specText: line.specText || "",
            cover: line.cover || "",
            count: line.count,
            priceFen: line.priceFen,
            subtotalFen: line.subtotalFen,
            createdAt: now,
          },
        });
      }
      return { ok: true, orderId: outTradeNo };
    }

    if (action === "cancelOrder") {
      const { orderId } = event;
      if (!orderId) return { ok: false, error: "缺少订单" };
      const { data: order } = await db.collection("orders").doc(orderId).get();
      if (!order || order.openId !== OPENID) {
        return { ok: false, error: "订单不存在" };
      }
      if (order.status !== "pending_payment") {
        return { ok: false, error: "当前状态不可取消" };
      }
      await db
        .collection("orders")
        .doc(orderId)
        .update({
          data: { status: "cancelled", updatedAt: Date.now(), cancelAt: Date.now() },
        });
      return { ok: true };
    }

    if (action === "requestRefund") {
      const { orderId, reason } = event;
      if (!orderId) return { ok: false, error: "缺少订单" };
      const { data: order } = await db.collection("orders").doc(orderId).get();
      if (!order || order.openId !== OPENID) {
        return { ok: false, error: "订单不存在" };
      }
      const allow = ["paid", "shipped"];
      if (!allow.includes(order.status)) {
        return { ok: false, error: "当前状态不可申请退款" };
      }
      await db
        .collection("orders")
        .doc(orderId)
        .update({
          data: {
            status: "refunding",
            updatedAt: Date.now(),
            refundReason: String(reason || "").slice(0, 200),
            refundApplyAt: Date.now(),
          },
        });
      return { ok: true };
    }

    if (action === "confirmReceive") {
      const { orderId } = event;
      if (!orderId) return { ok: false, error: "缺少订单" };
      const { data: order } = await db.collection("orders").doc(orderId).get();
      if (!order || order.openId !== OPENID) {
        return { ok: false, error: "订单不存在" };
      }
      if (order.status !== "shipped") {
        return { ok: false, error: "只有待收货订单可确认收货" };
      }
      await db
        .collection("orders")
        .doc(orderId)
        .update({
          data: {
            status: "completed",
            updatedAt: Date.now(),
            finishTime: Date.now(),
          },
        });
      return { ok: true };
    }

    if (action === "submitReview") {
      const { orderId, productId, rating, content } = event;
      if (!orderId || !productId) {
        return { ok: false, error: "缺少订单或商品" };
      }
      const { data: order } = await db.collection("orders").doc(orderId).get();
      if (!order || order.openId !== OPENID) {
        return { ok: false, error: "订单不存在" };
      }
      if (order.status !== "completed") {
        return { ok: false, error: "完成后才可评价" };
      }
      const inOrder = (order.lines || []).some((l) => l.productId === productId);
      if (!inOrder) {
        return { ok: false, error: "订单内无该商品" };
      }
      const { total } = await db
        .collection("reviews")
        .where({
          openid: OPENID,
          orderId,
          productId,
        })
        .count();
      if (total > 0) {
        return { ok: false, error: "该商品已评价" };
      }
      const stars = Math.min(5, Math.max(1, Number(rating) || 5));
      await db.collection("reviews").add({
        data: {
          openid: OPENID,
          orderId,
          productId,
          rating: stars,
          content: String(content || "").slice(0, 500),
          createTime: Date.now(),
        },
      });
      return { ok: true };
    }

    /** 演示：待发货 → 待收货（正式环境应由商家后台发货后更新） */
    if (action === "demoMarkShipped") {
      const { orderId } = event;
      if (!orderId) return { ok: false, error: "缺少订单" };
      const { data: order } = await db.collection("orders").doc(orderId).get();
      if (!order || order.openId !== OPENID) {
        return { ok: false, error: "订单不存在" };
      }
      if (order.status !== "paid") {
        return { ok: false, error: "仅待发货订单可演示发货" };
      }
      await db
        .collection("orders")
        .doc(orderId)
        .update({
          data: {
            status: "shipped",
            updatedAt: Date.now(),
            shipTime: Date.now(),
          },
        });
      return { ok: true };
    }

    if (action === "prepay") {
      const { orderId } = event;
      if (!orderId) return { ok: false, error: "缺少订单" };
      const { data: order } = await db.collection("orders").doc(orderId).get();
      if (!order || order.openId !== OPENID) {
        return { ok: false, error: "订单不存在" };
      }
      if (order.status !== "pending_payment") {
        return { ok: false, error: "订单状态不可支付" };
      }
      try {
        const res = await cloud.cloudPay.unifiedOrder({
          body: "云选商城订单",
          outTradeNo: orderId,
          spbillCreateIp: "127.0.0.1",
          totalFee: order.payFen,
          envId: cloud.DYNAMIC_CURRENT_ENV,
          functionName: "payNotify",
          subMchId: process.env.WX_PAY_SUB_MCH_ID || "",
        });
        const returnCode = res.returnCode || res.return_code;
        const resultCode = res.resultCode || res.result_code;
        if (returnCode !== "SUCCESS" || resultCode !== "SUCCESS") {
          throw new Error(
            res.errCodeDes || res.err_code_des || res.returnMsg || "统一下单失败"
          );
        }
        const payment =
          res.payment || (res.result && res.result.payment) || res.Payment;
        if (!payment) {
          throw new Error("未返回 payment 参数");
        }
        return { ok: true, payment };
      } catch (err) {
        console.error("unifiedOrder", err);
        return {
          ok: false,
          mockPay: true,
          message:
            err.message ||
            "微信支付未配置或子商户号无效。可在开发者工具配置云函数环境变量 WX_PAY_SUB_MCH_ID，或使用「模拟支付」完成联调。",
        };
      }
    }

    if (action === "mockPay") {
      const { orderId } = event;
      if (!orderId) return { ok: false, error: "缺少订单" };
      const { data: order } = await db.collection("orders").doc(orderId).get();
      if (!order || order.openId !== OPENID) {
        return { ok: false, error: "订单不存在" };
      }
      if (order.status !== "pending_payment") {
        return { ok: false, error: "订单状态不可支付" };
      }
      await fulfillOrder(orderId);
      return { ok: true };
    }

    return { ok: false, error: "未知 action" };
  } catch (e) {
    console.error(e);
    return { ok: false, error: e.message || "服务器错误" };
  }
};
