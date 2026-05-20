/**
 * 云函数调用封装：拉长超时 + 超时后重试（缓解冷启动）
 * 文档：config.timeout 最大 60000ms
 */

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_MAX_RETRIES = 1;

function isTimeoutLike(err) {
  if (!err) return false;
  const msg = String(err.message || err.errMsg || "");
  if (/timeout/i.test(msg)) return true;
  if (err.errCode === -1 && /timed?\s*out/i.test(msg)) return true;
  return false;
}

/**
 * @param {string} name 云函数名
 * @param {object} data 入参
 * @param {{ timeout?: number, maxRetries?: number }} [options]
 */
async function callCloudFunction(name, data, options = {}) {
  const timeout = options.timeout != null ? options.timeout : DEFAULT_TIMEOUT_MS;
  const maxRetries =
    options.maxRetries != null ? options.maxRetries : DEFAULT_MAX_RETRIES;
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await wx.cloud.callFunction({
        name,
        data: data || {},
        config: { timeout },
      });
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries && isTimeoutLike(e)) {
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

function callCommerce(data, options) {
  return callCloudFunction("commerce", data, options);
}

function callUserCenter(data, options) {
  return callCloudFunction("userCenter", data, options);
}

module.exports = {
  callCloudFunction,
  callCommerce,
  callUserCenter,
  DEFAULT_TIMEOUT_MS,
};
