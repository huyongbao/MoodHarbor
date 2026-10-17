// utils/config.js —— 环境配置
// USE_MOCK = true  → 本地假数据（PRD 8.2 契约的完整 Mock，联调切 false）
// 后端就绪后把 USE_MOCK 改为 false
//
// HOST 规则（团队协作约定）：
//   - 微信开发者工具/模拟器：保持 LAN_IP = ""，自动走 127.0.0.1，
//     永远指向自己电脑上启动的后端，任何人 clone 后无需修改
//   - 真机预览/调试：临时填自己电脑的局域网 IP（手机与电脑需同一 Wi-Fi），
//     调试完改回 "" 再提交，避免把个人 IP 带进仓库
const USE_MOCK = false;
// 真机调试中：填本机局域网 IP（手机与电脑同一 Wi-Fi），调试完改回 "" 再提交
const LAN_IP = "192.168.110.220";
const HOST = LAN_IP || "127.0.0.1";
const BASE_URL = "http://" + HOST + ":8000/api/v1";

function api(path) {
  return USE_MOCK ? path : BASE_URL + path;
}

function authHeader() {
  const token = wx.getStorageSync("token") || "";
  return token ? { Authorization: "Bearer " + token } : {};
}

module.exports = { USE_MOCK, BASE_URL, api, authHeader };
