const api = require("../../utils/api");
const app = getApp();

Page({
  data: {
    companion: null,
    profile: { age: "", gender: "", occupation: "" },
  },

  onShow() {
    // 同步底部导航选中态（我的 = 第 3 个 tab）
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    api.getDigitalHumans().then((res) => {
      const id = wx.getStorageSync("mock_dh_id") || "dh_01";
      const c = (res.data || []).find((d) => d.id === id) || (res.data || [])[0];
      app.globalData.companion = c;
      this.setData({ companion: c });
    });
    api.getProfile().then((res) => this.setData({ profile: res.data || {} }));
  },

  goCompanionEdit() {
    wx.navigateTo({ url: "/pages/companion-edit/companion-edit" });
  },
  goProfileEdit() {
    wx.navigateTo({ url: "/pages/profile-edit/profile-edit" });
  },
  goResources() {
    wx.navigateTo({ url: "/pages/resources/resources" });
  },
  goHotlines() {
    wx.navigateTo({ url: "/pages/hotlines/hotlines" });
  },
});
