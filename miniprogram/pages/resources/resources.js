const api = require("../../utils/api");

Page({
  data: { items: [] },

  onLoad() {
    api.getSelfHelp().then((res) => this.setData({ items: res.data || [] }));
  },

  onPlay(e) {
    const title = e.currentTarget.dataset.title;
    wx.showToast({ title: "播放 " + title, icon: "none" });
    // 正式版：接自助资源音频播放（innerAudioContext）
  },

  onBack() { wx.navigateBack(); },
});
