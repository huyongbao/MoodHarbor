const api = require("../../utils/api");
const app = getApp();

Page({
  data: {
    companion: null,
    profile: { age: "", gender: "", occupation: "" },
    dark: false, // 夜间模式偏好（Demo6 toggle，本机暂存）
  },

  onShow() {
    // 同步底部导航选中态（我的 = 第 3 个 tab）
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    this.setData({ dark: !!wx.getStorageSync("darkMode") });
    api.getDigitalHumans().then((res) => {
      const id = wx.getStorageSync("mock_dh_id") || "dh_01";
      const c = (res.data || []).find((d) => d.id === id) || (res.data || [])[0];
      app.globalData.companion = c;
      this.setData({ companion: c });
    });
    api.getProfile().then((res) => this.setData({ profile: res.data || {} }));
  },

  toggleDark() {
    const dark = !this.data.dark;
    this.setData({ dark });
    wx.setStorageSync("darkMode", dark);
  },

  goPrivacy() {
    wx.showModal({
      title: "隐私与演示说明",
      content: "歇会儿提供心理支持与陪伴，不替代专业医疗诊断。",
      showCancel: false,
      confirmText: "知道了",
    });
  },

  goCompanionEdit() {
    wx.navigateTo({ url: "/pages/companion-edit/companion-edit" });
  },
  goProfileEdit() {
    wx.navigateTo({ url: "/pages/profile-edit/profile-edit" });
  },
  goHotlines() {
    wx.navigateTo({ url: "/pages/hotlines/hotlines" });
  },
});
