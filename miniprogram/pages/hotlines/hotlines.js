const api = require("../../utils/api");

Page({
  data: { hotlines: [], showEmergency: false },

  onLoad() {
    api.getHotlines().then((res) => this.setData({ hotlines: res.data || [] }));
  },

  onCall(e) {
    wx.makePhoneCall({ phoneNumber: e.currentTarget.dataset.phone });
  },

  // 显式自伤求助入口（demo 亮点，行业最佳实践）
  onEmergency() {
    this.setData({ showEmergency: true });
  },
  onCloseEmergency() {
    this.setData({ showEmergency: false });
  },

  onBack() { wx.navigateBack(); },
});
