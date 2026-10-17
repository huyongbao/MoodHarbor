const api = require("../../utils/api");

Page({
  data: { list: [] },

  onShow() {
    // 同步底部导航选中态（倾诉记录 = 第 2 个 tab）
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    api.getConversations().then((res) => this.setData({ list: res.data || [] }));
  },

  onItem(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: "/pages/history-detail/history-detail?id=" + id });
  },

  // PRD V6.1：一键清除范围 = 对话记录 + 向量库记忆（提示文案如实）
  onClearAll() {
    wx.showModal({
      title: "清除全部倾诉记录",
      content: "将删除你的全部对话记录与 AI 记忆（预警记录因安全责任保留）。此操作不可恢复，确定吗？",
      confirmText: "清除",
      confirmColor: "#a95f50",
      success: (res) => {
        if (res.confirm) {
          api.deleteConversation("all").then(() => {
            wx.showToast({ title: "已清除", icon: "success" });
            this.setData({ list: [] });
          });
        }
      },
    });
  },
});
