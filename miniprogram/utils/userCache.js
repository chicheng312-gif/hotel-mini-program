const KEY = "mall_user_profile_bundle_v1";
const TTL_MS = 60 * 1000;

function readProfileCache() {
  try {
    const raw = wx.getStorageSync(KEY);
    if (!raw || !raw.t || !raw.payload) return null;
    if (Date.now() - raw.t > TTL_MS) return null;
    return raw.payload;
  } catch {
    return null;
  }
}

function writeProfileCache(payload) {
  try {
    wx.setStorageSync(KEY, { t: Date.now(), payload });
  } catch {
    /* ignore */
  }
}

function clearProfileCache() {
  try {
    wx.removeStorageSync(KEY);
  } catch {
    /* ignore */
  }
}

module.exports = { readProfileCache, writeProfileCache, clearProfileCache };
