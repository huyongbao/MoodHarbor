const api = require("../../utils/api");
const app = getApp();

Page({
  data: { companions: [], selectedId: "" },

  onLoad() {
    api.getDigitalHumans().then((res) => {
      const list = res.data || [];
      const cur = wx.getStorageSync("mock_dh_id") || "dh_01";
      this.setData({ companions: list, selectedId: cur });
    });
  },

  onSelect(e) {
    this.setData({ selectedId: e.currentTarget.dataset.id });
  },

  onConfirm() {
    api.saveDigitalHuman(this.data.selectedId).then(() => {
      const c = this.data.companions.find((x) => x.id === this.data.selectedId);
      app.globalData.companion = c;
      wx.showToast({ title: "已更换", icon: "success" });
      setTimeout(() => wx.navigateBack(), 600);
    });
  },

  onBack() { wx.navigateBack(); },
});
