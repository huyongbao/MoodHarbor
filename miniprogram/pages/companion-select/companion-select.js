const api = require("../../utils/api");

Page({
  data: {
    companions: [],
    selectedId: "",
    selected: null,
    submitting: false,
  },

  onLoad() {
    // PRD 5.1：GET /digital-humans 拉取数字人列表
    api.getDigitalHumans().then((res) => {
      const list = res.data || [];
      this.setData({ companions: list, selectedId: list[0] && list[0].id, selected: list[0] });
    });
  },

  goBack() {
    wx.navigateBack();
  },

  onSelect(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.companions.find((c) => c.id === id);
    this.setData({ selectedId: id, selected: item });
  },

  onConfirm() {
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    // PRD 5.1：POST /user/digital-human 保存
    api.saveDigitalHuman(this.data.selectedId).then(() => {
      const app = getApp();
      app.globalData.companion = this.data.selected;
      wx.redirectTo({ url: "/pages/profile-setup/profile-setup" });
    }).finally(() => this.setData({ submitting: false }));
  },
});
