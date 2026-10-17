const api = require("../../utils/api");
const app = getApp();

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

  // Demo6 空状态「去聊聊」：与首页 goTalk 同链路（新用户先完善资料，老用户直接开会话进 talk）
  goChat() {
    if (this._routing) return;
    this._routing = true;
    const done = () => { this._routing = false; };
    const enter = () => {
      api
        .createConversation()
        .then((res) => {
          app.globalData.conversationId = res.data.conversationId;
          wx.navigateTo({ url: "/pages/talk/talk" });
        })
        .finally(done);
    };
    const goSetup = () => {
      done();
      wx.navigateTo({ url: "/pages/companion-select/companion-select" });
    };
    const isReady = (s) => !!(s && s.digitalHumanSelected && s.profileCompleted);
    api
      .ensureLogin()
      .then(() => api.getInitStatus())
      .then((res) => {
        isReady(res.data) ? enter() : goSetup();
      })
      .catch(enter);
  },

  // Demo6 record-footer 单条删除
  onDel(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: "删除这条记录？",
      content: "这条会话将删除，无法恢复。",
      confirmText: "删除",
      confirmColor: "#a95f50",
      success: (res) => {
        if (res.confirm) {
          api.deleteConversation(id).then(() => {
            wx.showToast({ title: "已删除", icon: "success" });
            this.setData({ list: this.data.list.filter((c) => c.id !== id) });
          });
        }
      },
    });
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
