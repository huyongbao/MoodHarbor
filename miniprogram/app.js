// app.js —— 歇会儿 全局入口
const { login } = require("./utils/api");
const config = require("./utils/config");

App({
  globalData: {
    // 登录态
    token: "",
    userInfo: null,
    // 初始化状态（PRD 5.3）
    initStatus: null,
    // 当前数字人
    companion: null,
    // 当前会话（PRD POST /conversations）
    conversationId: "",
  },

  onLaunch() {
    // 启动即登录拿 token（Mock 模式下直接成功）
    login()
      .then((res) => {
        this.globalData.token = (res.data && res.data.token) || "";
        return this.checkInit();
      })
      .catch((err) => {
        console.warn("[app] 启动初始化失败，进入页面后重试", err);
      });
  },

  // PRD 5.3 初始化状态判断：决定首次进入跳转目标
  checkInit() {
    const that = this;
    return new Promise((resolve) => {
      wx.request({
        url: config.api("/user/init-status"),
        method: "GET",
        header: config.authHeader(),
        success(res) {
          const data = res.data && res.data.data;
          that.globalData.initStatus = data;
          resolve(data);
        },
        fail() {
          // 失败不阻塞，默认走 guide
          resolve(null);
        },
      });
    });
  },
});
