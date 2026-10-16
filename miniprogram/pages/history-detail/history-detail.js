const api = require("../../utils/api");

Page({
  data: { id: "", messages: [], companionName: "小愈" },

  onLoad(options) {
    const id = options.id || "";
    this.setData({ id });
    api.getConversationDetail(id).then((res) => this.setData({ messages: res.data || [] }));
    const app = getApp();
    if (app.globalData.companion) {
      this.setData({ companionName: app.globalData.companion.name });
    }
  },

  onDelete() {
    wx.showModal({
      title: "删除这条记录",
      content: "删除后不可恢复，确定吗？",
      confirmColor: "#a95f50",
      success: (res) => {
        if (res.confirm) {
          api.deleteConversation(this.data.id).then(() => {
            wx.showToast({ title: "已删除", icon: "success" });
            setTimeout(() => wx.navigateBack(), 600);
          });
        }
      },
    });
  },

  onBack() {
    wx.navigateBack();
  },
});
