const api = require("../../utils/api");
const app = getApp();

Page({
  data: {
    companion: null,
    greeting: "",
    selfHelp: [],
    dhUrl: "", // 数字人 H5 预载地址（隐藏 web-view 提前加载 SDK 资源）
  },

  onShow() {
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
    // PRD：进入倾诉先创建会话拿 conversationId
    api.createConversation().then((res) => {
      app.globalData.conversationId = res.data.conversationId;
      wx.navigateTo({ url: "/pages/talk/talk" });
    });
  },

  goResources() {
    wx.navigateTo({ url: "/pages/resources/resources" });
  },

  goHistory() {
    wx.switchTab ? wx.navigateTo({ url: "/pages/history/history" }) : wx.navigateTo({ url: "/pages/history/history" });
  },

  goHotlines() {
    wx.navigateTo({ url: "/pages/hotlines/hotlines" });
  },

  goProfile() {
    wx.navigateTo({ url: "/pages/profile/profile" });
  },
});
