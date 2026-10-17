const api = require("../../utils/api");
const app = getApp();

Page({
  data: {
    companion: null,
    greeting: "",
    selfHelp: [],
    dhUrl: "", // 数字人 H5 预载地址（隐藏 web-view 提前加载 SDK 资源）
    initStatus: null,
    // Demo6 home 屏话题气泡（点击统走 goTalk，talk 页暂不支持话题参数）
    topics: ["超时委屈", "路上奔波", "客户差评", "想找人说说话"],
  },

  onLoad() {
    // 原 guide 页逻辑迁移：静默登录并预热初始化状态，供「开始倾诉」新老用户分流
    api
      .ensureLogin()
      .then(() => api.getInitStatus())
      .then((res) => this.setData({ initStatus: res.data || null }))
      .catch(() => this.setData({ initStatus: null }));
  },

  onShow() {
    // 同步底部导航选中态（custom tabBar 每个页面持有独立实例）
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }

    // 问候语按时段生成
    const h = new Date().getHours();
    let greet = "你好，骑手朋友";
    if (h < 6) greet = "夜深了，骑手朋友";
    else if (h < 12) greet = "早上好，骑手朋友";
    else if (h < 18) greet = "下午好，骑手朋友";
    else greet = "晚上好，骑手朋友";
    this.setData({ greeting: greet });

    // 当前陪伴者
    api.getDigitalHumans().then((res) => {
      const id = wx.getStorageSync("mock_dh_id") || "dh_01";
      const c = (res.data || []).find((d) => d.id === id) || (res.data || [])[0];
      app.globalData.companion = c;
      this.setData({ companion: c });
    });

    // 自助资源
    api.getSelfHelp().then((res) => this.setData({ selfHelp: res.data || [] }));

    // 数字人预载（问题1优化）：home 页挂 1rpx 隐藏 web-view 静默加载 H5，
    // SDK 资源（JS/模型）进入 HTTP 缓存；进 talk 页时同 URL 秒载
    if (!this.data.dhUrl && !app.globalData.dhUrl) {
      api.request("/digital-human/view").then((res) => {
        const d = res.data || {};
        if (d.configured && d.url) {
          app.globalData.dhUrl = d.url;
          this.setData({ dhUrl: d.url });
        }
      }).catch(() => {});
    }
  },

  goTalk() {
    if (this._routing) return;
    this._routing = true;
    const done = () => { this._routing = false; };
    // PRD：进入倾诉先创建会话拿 conversationId
    const enter = () => {
      api
        .createConversation()
        .then((res) => {
          app.globalData.conversationId = res.data.conversationId;
          wx.navigateTo({ url: "/pages/talk/talk" });
        })
        .finally(done);
    };
    // 新用户首次需完善：选聊天伙伴 → 填资料，之后由 profile-setup 直接进 talk
    const goSetup = () => {
      done();
      wx.navigateTo({ url: "/pages/companion-select/companion-select" });
    };
    const isReady = (s) => !!(s && s.digitalHumanSelected && s.profileCompleted);

    const cached = this.data.initStatus;
    if (cached) {
      isReady(cached) ? enter() : goSetup();
      return;
    }
    // 冷启动预热未完成：现场拉一次初始化状态，失败兜底直接进聊天
    api
      .ensureLogin()
      .then(() => api.getInitStatus())
      .then((res) => {
        this.setData({ initStatus: res.data || null });
        isReady(res.data) ? enter() : goSetup();
      })
      .catch(enter);
  },

  goBreath() {
    wx.navigateTo({ url: "/pages/breath/breath" });
  },

  goStories() {
    // 同行故事：原型页暂未在小程序落地，先给占位提示
    wx.showToast({ title: "同行故事即将上线", icon: "none" });
  },

  goHotlines() {
    wx.navigateTo({ url: "/pages/hotlines/hotlines" });
  },

  goProfile() {
    wx.switchTab({ url: "/pages/profile/profile" });
  },
});
