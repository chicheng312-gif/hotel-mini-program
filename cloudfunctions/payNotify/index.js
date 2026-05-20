const cloud = require("wx-server-sdk");

const CLOUD_ENV_ID =
  process.env.WX_CLOUD_ENV || process.env.TCB_ENV || "sense3-d9gwdv4w5af2e8624";
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV || CLOUD_ENV_ID });

const db = cloud.database();
const _ = db.command;

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

exports.main = async (event) => {
  try {
    const returnCode = event.returnCode || event.return_code;
    const resultCode = event.resultCode || event.result_code;
    if (returnCode === "SUCCESS" && resultCode === "SUCCESS") {
      const outTradeNo = event.outTradeNo || event.out_trade_no;
      if (outTradeNo) {
        await fulfillOrder(outTradeNo);
      }
    }
  } catch (e) {
    console.error("payNotify", e);
  }
  return { errcode: 0, errmsg: "success" };
};
