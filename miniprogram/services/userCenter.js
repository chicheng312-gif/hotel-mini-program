const { callUserCenter } = require("../utils/cloudCall.js");

async function callFn(data) {
  const res = await callUserCenter(data || {});
  return res.result || {};
}

function getProfile() {
  return callFn({ action: "getProfile" });
}

function updateUser(payload) {
  return callFn({ action: "updateUser", ...payload });
}

function signDaily() {
  return callFn({ action: "sign" });
}

function bindPhoneByCode(code) {
  return callFn({ action: "bindPhoneByCode", code });
}

function getOrderStatistics() {
  return callFn({ action: "getOrderStatistics" });
}

module.exports = {
  getProfile,
  updateUser,
  signDaily,
  bindPhoneByCode,
  getOrderStatistics,
};
