const api = require("../../utils/api");
const app = getApp();

Page({
  data: {
    companion: null,
    greeting: "",
    selfHelp: [],
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
