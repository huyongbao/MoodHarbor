const api = require("../../utils/api");
const app = getApp();

Page({
  data: {
    companion: null,
    greeting: "",
    selfHelp: [],
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
  },

  // 「我想聊聊」→ 倾诉页已 tab 化常驻（数字人 SDK/模型只加载一次）：
  // switchTab 切换，页面实例保留，二次进入秒开。
  // 情绪/话题上下文经 globalData.talkContext 带入（tab 页不能带 URL 参数），
  // 由 talk 页 onShow 消费并通过指令接口下发给 H5 数字人。
  goTalk() {
    const app = getApp();
    app.globalData.talkContext = {
      topic: this._selectedTopic || "",
      at: Date.now(),
    };
    wx.switchTab({ url: "/pages/talk/talk" });
  },

  // 话题气泡：先记下所选话题再进倾诉页
  onTopicTap(e) {
    this._selectedTopic = (e.currentTarget && e.currentTarget.dataset.topic) || "";
    this.goTalk();
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
