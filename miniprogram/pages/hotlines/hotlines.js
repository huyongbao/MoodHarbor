const api = require("../../utils/api");

Page({
  data: {
    hotlines: [],
    showEmergency: false,
    // 紧急弹窗号码列表（Demo6 care 一级清单）
    emergencyLines: [
      { phone: "12356", label: "全国援助热线" },
      { phone: "110", label: "遇到危险 · 报警" },
      { phone: "120", label: "需要紧急医疗帮助" },
    ],
  },

  onLoad() {
    api.getHotlines().then((res) => this.setData({ hotlines: res.data || [] }));
  },

  onCall(e) {
    wx.makePhoneCall({ phoneNumber: e.currentTarget.dataset.phone });
  },

  // Demo6「复制」：写入剪贴板（系统会自动提示“内容已复制”）
  onCopy(e) {
    wx.setClipboardData({ data: e.currentTarget.dataset.phone });
  },

  // 显式自伤求助入口（demo 亮点，行业最佳实践）
  onEmergency() {
    this.setData({ showEmergency: true });
  },
  onCloseEmergency() {
    this.setData({ showEmergency: false });
  },

  onBack() {
    wx.navigateBack();
  },
});
