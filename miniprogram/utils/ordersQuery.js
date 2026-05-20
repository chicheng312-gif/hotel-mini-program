/**
 * 订单集合读权限与 CloudBase 安全规则子集校验：
 * database.rules.json orders.read 为 openId / openid / _openid 与 auth.openid 一致，
 * 客户端查询必须带上其中一种占位符（服务端将 {openid} 替换为当前用户）。
 */
const db = wx.cloud.database();
const _ = db.command;

/** 当前用户可见的订单 where（列表用） */
function whereMineOrders() {
  return _.or([
    { openid: "{openid}" },
    { openId: "{openid}" },
    { _openid: "{openid}" },
  ]);
}

/** 指定订单 id + 归属校验（详情用） */
function whereOrderById(orderId) {
  return _.and([{ _id: orderId }, whereMineOrders()]);
}

/** 评价集合 reviews.read: doc.openid == auth.openid */
function whereMyReviewsForOrder(orderId) {
  return { orderId, openid: "{openid}" };
}

module.exports = {
  db,
  _,
  whereMineOrders,
  whereOrderById,
  whereMyReviewsForOrder,
};
