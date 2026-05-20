const cloud = require("wx-server-sdk");

const CLOUD_ENV_ID =
  process.env.WX_CLOUD_ENV || process.env.TCB_ENV || "sense3-d9gwdv4w5af2e8624";
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV || CLOUD_ENV_ID });

const db = cloud.database();
const _ = db.command;

/** 订单状态统计内存缓存 30s（多实例下为最终一致；生产可换 Redis） */
const orderStatCache = new Map();
const ORDER_STAT_TTL_MS = 30_000;

const LEVEL_NAMES = ["普通会员", "银卡会员", "金卡会员", "黑金会员"];

/** 成长值门槛：达到该值即升入对应等级（Lv1/Lv2/Lv3） */
const GROWTH_THRESHOLDS = [0, 500, 2000, 10000];

function memberLevelFromGrowth(growth) {
  const g = Number(growth) || 0;
  if (g >= GROWTH_THRESHOLDS[3]) return 3;
  if (g >= GROWTH_THRESHOLDS[2]) return 2;
  if (g >= GROWTH_THRESHOLDS[1]) return 1;
  return 0;
}

function nextLevelNeedGrowth(level, growth) {
  const lv = Math.min(3, Math.max(0, level));
  if (lv >= 3) return { need: 0, target: null };
  const target = GROWTH_THRESHOLDS[lv + 1];
  const need = Math.max(0, target - (Number(growth) || 0));
  return { need, target };
}

function shanghaiYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function ymdMinusOne(ymd) {
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

async function uniqueInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let n = 0; n < 10; n += 1) {
    let code = "";
    for (let i = 0; i < 8; i += 1) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    const { total } = await db.collection("users").where({ inviteCode: code }).count();
    if (!total) return code;
  }
  return `U${Date.now().toString(36).toUpperCase()}`.slice(0, 10);
}

async function ensureUser(openid) {
  const col = db.collection("users");
  const { data } = await col.where({ openid }).limit(1).get();
  if (data.length) {
    const u = data[0];
    const lv = memberLevelFromGrowth(u.growth);
    if (u.memberLevel !== lv) {
      await col.doc(u._id).update({ data: { memberLevel: lv } });
      return { ...u, memberLevel: lv };
    }
    return u;
  }

  let points = 0;
  let growth = 0;
  try {
    const { data: mems } = await db
      .collection("members")
      .where({ _openid: _.eq(openid) })
      .limit(1)
      .get();
    if (mems[0]) {
      points = Number(mems[0].points) || 0;
      const spentFen = Number(mems[0].totalSpent) || 0;
      growth = Math.floor(spentFen / 100);
    }
  } catch (_) {
    /* ignore */
  }

  const inviteCode = await uniqueInviteCode();
  const now = Date.now();
  const doc = {
    openid,
    nickName: "",
    avatarUrl: "",
    phone: "",
    gender: 0,
    points,
    growth,
    memberLevel: memberLevelFromGrowth(growth),
    continuousSignDays: 0,
    lastSignDate: "",
    inviteCode,
    inviterOpenid: "",
    lastLogin: now,
    createTime: now,
  };
  await col.add({ data: doc });
  const { data: created } = await col.where({ openid }).limit(1).get();
  return created[0];
}

function orderOwnerWhere(openid) {
  return _.or([{ openId: openid }, { openid: openid }]);
}

async function orderStatistics(openid) {
  const cacheKey = `os:${openid}`;
  const now = Date.now();
  const hit = orderStatCache.get(cacheKey);
  if (hit && now - hit.t < ORDER_STAT_TTL_MS) {
    return hit.v;
  }

  const statuses = [
    "pending_payment",
    "paid",
    "shipped",
    "completed",
    "refund",
  ];
  const stats = {};
  for (const st of statuses) {
    const w = _.and([orderOwnerWhere(openid), { status: st }]);
    const { total } = await db.collection("orders").where(w).count();
    stats[st] = total;
  }

  try {
    const w = _.and([
      orderOwnerWhere(openid),
      { status: _.in(["refunding", "refunded", "after_sale"]) },
    ]);
    const { total } = await db.collection("orders").where(w).count();
    stats.refund = (stats.refund || 0) + (total || 0);
  } catch (_) {
    /* ignore */
  }

  orderStatCache.set(cacheKey, { t: now, v: stats });
  return stats;
}

async function favoritesCount(openid) {
  try {
    const a = await db.collection("favorites").where({ openid }).count();
    const b = await db
      .collection("favorites")
      .where({ _openid: _.eq(openid) })
      .count();
    return (a.total || 0) + (b.total || 0);
  } catch (_) {
    return 0;
  }
}

async function inviteInvitedCount(openid) {
  try {
    const { total } = await db
      .collection("user_invite")
      .where({ inviterOpenid: openid })
      .count();
    return total;
  } catch (_) {
    return 0;
  }
}

async function inviteRewardSum(openid) {
  try {
    const { data } = await db
      .collection("invite_reward_log")
      .where({ openid })
      .limit(200)
      .get();
    let sum = 0;
    for (const row of data) {
      sum += Number(row.rewardPoints) || 0;
    }
    return sum;
  } catch (_) {
    return 0;
  }
}

async function lastSignRecord(openid) {
  try {
    const { data } = await db
      .collection("user_sign_record")
      .where({ openid })
      .limit(30)
      .get();
    if (!data.length) return null;
    return data.sort((a, b) => String(b.signDate).localeCompare(String(a.signDate)))[0];
  } catch (_) {
    return null;
  }
}

async function activeMemberDay() {
  try {
    const now = Date.now();
    const { data } = await db
      .collection("member_day_activity")
      .where({ status: "active" })
      .limit(30)
      .get();
    return (
      data.find(
        (d) =>
          Number(d.startTime) <= now &&
          Number(d.endTime) >= now
      ) || null
    );
  } catch (_) {
    return null;
  }
}

async function exchangeGoodsPreview() {
  try {
    const { data } = await db
      .collection("points_exchange_goods")
      .where({ status: "on" })
      .limit(20)
      .get();
    return data
      .sort((a, b) => Number(b.createTime || 0) - Number(a.createTime || 0))
      .slice(0, 3);
  } catch (_) {
    return [];
  }
}

async function appendPointsLog(openid, payload) {
  try {
    await db.collection("user_points_log").add({
      data: {
        openid,
        type: payload.type,
        changeValue: payload.changeValue,
        beforeValue: payload.beforeValue,
        afterValue: payload.afterValue,
        remark: payload.remark || "",
        createTime: Date.now(),
      },
    });
  } catch (err) {
    console.warn("user_points_log write skipped", err);
  }
}

/** 与旧 commerce 流程对齐：下单仍读 members.points 时保持同步 */
async function syncMemberPoints(openid, pointsVal) {
  try {
    const { data } = await db
      .collection("members")
      .where({ _openid: _.eq(openid) })
      .limit(1)
      .get();
    if (data[0]) {
      await db.collection("members").doc(data[0]._id).update({
        data: { points: Number(pointsVal) || 0 },
      });
    }
  } catch (_) {
    /* ignore */
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const OPENID = wxContext.OPENID;
  if (!OPENID) {
    return { ok: false, error: "未获取到用户身份" };
  }

  const action = event.action;

  try {
    if (action === "getProfile") {
      const user = await ensureUser(OPENID);
      const [
        orderStats,
        favCount,
        invited,
        rewardPts,
        lastSign,
        memberDay,
        goodsPreview,
      ] = await Promise.all([
        orderStatistics(OPENID),
        favoritesCount(OPENID),
        inviteInvitedCount(OPENID),
        inviteRewardSum(OPENID),
        lastSignRecord(OPENID),
        activeMemberDay(),
        exchangeGoodsPreview(),
      ]);

      const level = Number(user.memberLevel) || 0;
      const growth = Number(user.growth) || 0;
      const next = nextLevelNeedGrowth(level, growth);
      const today = shanghaiYmd();
      const signedToday = user.lastSignDate === today;

      return {
        ok: true,
        signedToday,
        user: {
          ...user,
          levelName: LEVEL_NAMES[level] || LEVEL_NAMES[0],
        },
        orderStats,
        favoritesCount: favCount,
        inviteCount: invited,
        inviteRewardPoints: rewardPts,
        lastSign,
        memberDay,
        exchangeGoodsPreview: goodsPreview,
        nextLevel: next,
        levelNames: LEVEL_NAMES,
      };
    }

    if (action === "updateUser") {
      const user = await ensureUser(OPENID);
      const patch = {};
      if (event.nickName != null) patch.nickName = String(event.nickName).slice(0, 32);
      if (event.avatarUrl != null) patch.avatarUrl = String(event.avatarUrl).slice(0, 512);
      if (event.phone != null) patch.phone = String(event.phone).slice(0, 20);
      if (event.gender != null) patch.gender = Number(event.gender) || 0;
      if (!Object.keys(patch).length) {
        return { ok: false, error: "无可更新字段" };
      }
      patch.lastLogin = Date.now();
      await db.collection("users").doc(user._id).update({ data: patch });
      return { ok: true };
    }

    if (action === "sign") {
      const user = await ensureUser(OPENID);
      const today = shanghaiYmd();
      if (user.lastSignDate === today) {
        return {
          ok: false,
          code: "SIGNED",
          message: "今日已签到",
          continuousSignDays: user.continuousSignDays || 0,
        };
      }

      let continuous = 1;
      const last = user.lastSignDate;
      if (last && last === ymdMinusOne(today)) {
        continuous = (Number(user.continuousSignDays) || 0) + 1;
      }

      let bonus = 0;
      if (continuous === 3 || continuous === 7 || continuous === 30) {
        bonus = continuous === 30 ? 200 : continuous === 7 ? 50 : 20;
      }
      const base = 10;
      const totalPts = base + bonus;

      const beforePts = Number(user.points) || 0;
      const afterPts = beforePts + totalPts;

      await db.collection("users").doc(user._id).update({
        data: {
          points: afterPts,
          continuousSignDays: continuous,
          lastSignDate: today,
          lastLogin: Date.now(),
        },
      });

      await db.collection("user_sign_record").add({
        data: {
          openid: OPENID,
          signDate: today,
          rewardPoints: totalPts,
          continuousDays: continuous,
          createTime: Date.now(),
        },
      });

      await appendPointsLog(OPENID, {
        type: "sign",
        changeValue: totalPts,
        beforeValue: beforePts,
        afterValue: afterPts,
        remark: `每日签到${bonus ? `+连续${continuous}天奖励` : ""}`,
      });

      await syncMemberPoints(OPENID, afterPts);

      return {
        ok: true,
        rewardPoints: totalPts,
        basePoints: base,
        bonusPoints: bonus,
        continuousSignDays: continuous,
        points: afterPts,
      };
    }

    if (action === "logout") {
      return { ok: true, message: "客户端请清除 Storage 并重新进入" };
    }

    if (action === "getOrderStatistics") {
      const stats = await orderStatistics(OPENID);
      return { ok: true, orderStats: stats };
    }

    if (action === "bindPhone") {
      const user = await ensureUser(OPENID);
      let phone = "";
      try {
        const { list } = await cloud.getOpenData({
          list: event.cloudIDList || event.cloudIDs || [],
        });
        if (list && list[0]) {
          const row = list[0];
          const blob = row.json != null ? row.json : row.data;
          if (blob) {
            const raw = typeof blob === "string" ? JSON.parse(blob) : blob;
            phone = String(
              raw.purePhoneNumber || raw.phoneNumber || ""
            ).replace(/\D/g, "");
          }
        }
      } catch (e) {
        console.warn("bindPhone getOpenData", e);
      }
      if (!phone) {
        return { ok: false, error: "未获取到手机号，请重试" };
      }
      await db.collection("users").doc(user._id).update({
        data: { phone: String(phone).slice(0, 20), lastLogin: Date.now() },
      });
      return { ok: true, phone };
    }

    if (action === "bindPhoneByCode") {
      const code = event.code;
      if (!code) return { ok: false, error: "缺少手机号授权 code" };
      const user = await ensureUser(OPENID);
      try {
        const res = await cloud.openapi.phonenumber.getPhoneNumber({ code });
        const info = res.phoneInfo || res.phone_info;
        const phone = String(
          (info && (info.purePhoneNumber || info.phoneNumber)) || ""
        ).replace(/\D/g, "");
        if (!phone) {
          return { ok: false, error: "未解析到手机号" };
        }
        await db.collection("users").doc(user._id).update({
          data: { phone: phone.slice(0, 20), lastLogin: Date.now() },
        });
        return { ok: true, phone: phone.slice(0, 20) };
      } catch (e) {
        console.warn("bindPhoneByCode", e);
        return { ok: false, error: e.message || "获取手机号失败" };
      }
    }

    if (action === "getPointsLogs") {
      const page = Math.max(1, Number(event.page) || 1);
      const pageSize = Math.min(50, Math.max(1, Number(event.pageSize) || 20));
      const skip = (page - 1) * pageSize;
      try {
        const { data } = await db
          .collection("user_points_log")
          .where({ openid: OPENID })
          .orderBy("createTime", "desc")
          .skip(skip)
          .limit(pageSize)
          .get();
        return { ok: true, list: data || [], page, pageSize };
      } catch (err) {
        console.warn("getPointsLogs fallback", err);
        const { data } = await db
          .collection("user_points_log")
          .where({ openid: OPENID })
          .limit(100)
          .get();
        const sorted = (data || []).sort(
          (a, b) => Number(b.createTime || 0) - Number(a.createTime || 0)
        );
        return {
          ok: true,
          list: sorted.slice(skip, skip + pageSize),
          page,
          pageSize,
        };
      }
    }

    if (action === "getExchangeGoods") {
      const page = Math.max(1, Number(event.page) || 1);
      const pageSize = Math.min(50, Math.max(1, Number(event.pageSize) || 20));
      const skip = (page - 1) * pageSize;
      const { data } = await db
        .collection("points_exchange_goods")
        .where({ status: "on" })
        .orderBy("createTime", "desc")
        .skip(skip)
        .limit(pageSize)
        .get();
      return { ok: true, list: data || [] };
    }

    if (action === "getInviteList") {
      const { data } = await db
        .collection("user_invite")
        .where({ inviterOpenid: OPENID })
        .orderBy("createTime", "desc")
        .limit(50)
        .get();
      return { ok: true, list: data || [] };
    }

    if (action === "getInviteRewards") {
      const page = Math.max(1, Number(event.page) || 1);
      const pageSize = Math.min(50, Math.max(1, Number(event.pageSize) || 20));
      const skip = (page - 1) * pageSize;
      const { data } = await db
        .collection("invite_reward_log")
        .where({ openid: OPENID })
        .orderBy("createTime", "desc")
        .skip(skip)
        .limit(pageSize)
        .get();
      return { ok: true, list: data || [], page, pageSize };
    }

    if (action === "getFavoritesList") {
      try {
        const { data } = await db
          .collection("favorites")
          .where({ openid: OPENID })
          .limit(80)
          .get();
        const sorted = (data || []).sort(
          (a, b) => Number(b.createTime || 0) - Number(a.createTime || 0)
        );
        return { ok: true, list: sorted };
      } catch (_) {
        return { ok: true, list: [] };
      }
    }

    if (action === "getExchangeOrders") {
      const page = Math.max(1, Number(event.page) || 1);
      const pageSize = Math.min(50, Math.max(1, Number(event.pageSize) || 20));
      const skip = (page - 1) * pageSize;
      try {
        const { data } = await db
          .collection("points_exchange_order")
          .where({ openid: OPENID })
          .orderBy("createTime", "desc")
          .skip(skip)
          .limit(pageSize)
          .get();
        return { ok: true, list: data || [], page, pageSize };
      } catch (_) {
        const { data } = await db
          .collection("points_exchange_order")
          .where({ openid: OPENID })
          .limit(100)
          .get();
        const sorted = (data || []).sort(
          (a, b) => Number(b.createTime || 0) - Number(a.createTime || 0)
        );
        return {
          ok: true,
          list: sorted.slice(skip, skip + pageSize),
          page,
          pageSize,
        };
      }
    }

    if (action === "inviteBind") {
      const code = String(event.inviteCode || "")
        .trim()
        .toUpperCase();
      if (!code) return { ok: false, error: "请输入邀请码" };
      const user = await ensureUser(OPENID);
      if (user.inviterOpenid) {
        return { ok: false, error: "已绑定邀请人，不可重复绑定" };
      }
      if (user.inviteCode === code) {
        return { ok: false, error: "不能使用自己的邀请码" };
      }
      const { data } = await db
        .collection("users")
        .where({ inviteCode: code })
        .limit(1)
        .get();
      const inviter = data[0];
      if (!inviter) return { ok: false, error: "邀请码无效" };
      const inviterOpenid = inviter.openid;
      if (!inviterOpenid || inviterOpenid === OPENID) {
        return { ok: false, error: "邀请码无效" };
      }
      let walkId = inviterOpenid;
      for (let depth = 0; depth < 8; depth += 1) {
        if (walkId === OPENID) {
          return { ok: false, error: "不允许循环邀请" };
        }
        const { data: chain } = await db
          .collection("users")
          .where({ openid: walkId })
          .limit(1)
          .get();
        const node = chain[0];
        if (!node || !node.inviterOpenid) break;
        walkId = node.inviterOpenid;
      }
      await db.collection("users").doc(user._id).update({
        data: { inviterOpenid, lastLogin: Date.now() },
      });
      await db.collection("user_invite").add({
        data: {
          openid: OPENID,
          inviteCode: code,
          inviterOpenid,
          inviteTime: Date.now(),
          createTime: Date.now(),
        },
      });
      return { ok: true, inviterOpenid };
    }

    return { ok: false, error: "未知 action" };
  } catch (e) {
    console.error(e);
    return { ok: false, error: e.message || "服务器错误" };
  }
};
