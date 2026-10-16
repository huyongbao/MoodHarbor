// utils/config.js —— 环境配置
// USE_MOCK = true  → 本地假数据（PRD 8.2 契约的完整 Mock，联调切 false）
// 后端就绪后把 USE_MOCK 改为 false，BASE_URL 换成 FastAPI 地址
const USE_MOCK = false;
const BASE_URL = "http://192.168.110.220:8000/api/v1";

function api(path) {
  return USE_MOCK ? path : BASE_URL + path;
}

function authHeader() {
  const token = wx.getStorageSync("token") || "";
  return token ? { Authorization: "Bearer " + token } : {};
}

module.exports = { USE_MOCK, BASE_URL, api, authHeader };
