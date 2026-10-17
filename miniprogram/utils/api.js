// utils/api.js —— 请求封装（PRD 8.1 统一约定）
// - 统一响应 { code, message, data }，body code 为业务分支准绳
// - code: 0 成功；401 token 失效（自动重登）；400/403/500 抛错
// - Mock 开关在 utils/config.js
const config = require("./config");
const mock = require("./mock");

// 底层请求：只处理 HTTP + 统一响应结构；retried 防止 401 重试死循环
function request(path, options, retried) {
  const { method = "GET", data = {}, header = {} } = options || {};
  return new Promise((resolve, reject) => {
    if (config.USE_MOCK) {
      // ---- Mock 模式：路由到 utils/mock.js ----
      mock.handle(path, method, data, resolve);
      return;
    }
    wx.request({
      url: config.api(path),
      method,
      data,
      header: Object.assign({ "Content-Type": "application/json" }, config.authHeader(), header),
      success(res) {
        const body = res.data || {};
        if (res.statusCode === 200 && body.code === 0) {
          resolve({ code: 0, message: body.message, data: body.data });
        } else if (body.code === 401) {
          // token 失效：清态 → 静默重登 → 用新 token 重试原请求（仅一次）
          wx.removeStorageSync("token");
          if (retried) {
            reject({ code: 401, message: body.message || "登录已失效" });
            return;
          }
          ensureLogin()
            .then(() => request(path, options, true).then(resolve).catch(reject))
            .catch(reject);
        } else {
          reject({ code: body.code || res.statusCode, message: body.message || "请求失败" });
        }
      },
      fail(err) {
        reject({ code: -1, message: "网络异常，请稍后再试", raw: err });
      },
    });
  });
}

// PRD 8.1 文件两步流程：先 /upload 拿 URL，再随业务接口传 URL
function uploadFile(filePath) {
  return new Promise((resolve, reject) => {
    if (config.USE_MOCK) {
      resolve({ code: 0, data: { fileUrl: "mock://" + filePath } });
      return;
    }
    wx.uploadFile({
      url: config.api("/upload"),
      filePath,
      name: "file",
      header: config.authHeader(),
      success(res) {
        const body = JSON.parse(res.data || "{}");
        body.code === 0 ? resolve(body) : reject(body);
      },
      fail: reject,
    });
  });
}

// ---- 业务接口（PRD 8.2 清单）----

// ---- 登录（PRD 8.1）----

// 真实登录请求：POST /auth/wechat-login
// 开发者工具调试阶段：后端 WX_LOGIN_MOCK=true，用固定 openid（wx_dev_demo），
// 不调 wx.login、不获取真实微信 openid
// 真实联调（后端 WX_LOGIN_MOCK=false）时改回：wx.login 拿临时 code 传入 data
function doLogin() {
  return request("/auth/wechat-login", { method: "POST", data: { code: "dev" } });
}

// 静默登录：无 token 时登录并写入 storage（并发场景只发起一次）
let _loginPromise = null;
function ensureLogin() {
  if (wx.getStorageSync("token")) return Promise.resolve();
  if (!_loginPromise) {
    _loginPromise = doLogin()
      .then((res) => {
        const token = res.data && res.data.token;
        if (!token) throw { code: -1, message: "登录失败" };
        wx.setStorageSync("token", token);
        _loginPromise = null;
      })
      .catch((e) => {
        _loginPromise = null;
        throw e;
      });
  }
  return _loginPromise;
}

// 对外登录（login 页使用）：统一走 ensureLogin，token 已由其写入 storage
function login() {
  return ensureLogin().then(() => ({
    code: 0,
    message: "ok",
    data: { token: wx.getStorageSync("token") },
  }));
}

// 初始化状态：GET /user/init-status
function getInitStatus() {
  return request("/user/init-status");
}

// 数字人列表：GET /digital-humans
function getDigitalHumans() {
  return request("/digital-humans");
}

// 保存选中数字人：POST /user/digital-human
function saveDigitalHuman(id) {
  return request("/user/digital-human", { method: "POST", data: { digitalHumanId: id } });
}

// 用户资料：GET /user/profile
function getProfile() {
  return request("/user/profile");
}

// 用户资料：PUT /user/profile（V6.2 幂等）
function saveProfile(profile) {
  return request("/user/profile", { method: "PUT", data: profile });
}

// 创建会话：POST /conversations
function createConversation() {
  return request("/conversations", { method: "POST", data: {} });
}

// 对话：POST /chat/completions（V6.2 inputTypes 数组组合输入）
function chat(payload) {
  return request("/chat/completions", { method: "POST", data: payload });
}

// 倾诉记录列表：GET /conversations
function getConversations() {
  return request("/conversations");
}

// 对话详情：GET /conversations/{id}
function getConversationDetail(id) {
  return request("/conversations/" + id);
}

// 删除/清空记录：DELETE /conversations/{id}（id="all" 为一键清除）
function deleteConversation(id) {
  return request("/conversations/" + id, { method: "DELETE", data: {} });
}

// 热线列表：GET /hotlines
function getHotlines() {
  return request("/hotlines");
}

// 自助资源：GET /self-help
function getSelfHelp() {
  return request("/self-help");
}

// 预警上报：POST /risk-alerts（可由后端自动生成）
function reportRiskAlert(level, conversationId) {
  return request("/risk-alerts", {
    method: "POST",
    data: { level, conversationId, source: "miniprogram" },
  });
}

module.exports = {
  request,
  uploadFile,
  login,
  ensureLogin,
  getInitStatus,
  getDigitalHumans,
  saveDigitalHuman,
  getProfile,
  saveProfile,
  createConversation,
  chat,
  getConversations,
  getConversationDetail,
  deleteConversation,
  getHotlines,
  getSelfHelp,
  reportRiskAlert,
};
