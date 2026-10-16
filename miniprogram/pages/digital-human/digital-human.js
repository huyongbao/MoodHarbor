// pages/digital-human/digital-human.js
// 3D 数字人页（魔珐星云 SDK via web-view）
const api = require("../../utils/api");
const app = getApp();

Page({
  data: {
    url: "",
    configured: true,
    loading: true,
    pendingText: "", // 从 talk 页带过来的首句
  },

  onLoad(options) {
    const pending = decodeURIComponent(options.speak || "");
    this.setData({ pendingText: pending });
    api.request("/digital-human/view").then((res) => {
      const d = res.data || {};
      if (!d.configured) {
        // 未配置密钥：显示兜底提示
        this.setData({ configured: false, loading: false });
        return;
      }
      this.setData({ url: d.url, loading: false });
    }).catch(() => this.setData({ configured: false, loading: false }));
  },

  // web-view 加载完成：如有待说话文本，通过 hash 传递驱动 speak
  onWebviewLoad() {
    if (this.data.pendingText) {
      const text = this.data.pendingText;
      this.setData({ pendingText: "" });
      setTimeout(() => this.speak(text), 2500); // 等 SDK 初始化
    }
  },

  // 对外暴露：驱动数字人说话（本页内 web-view hash 通信）
  speak(text) {
    // web-view 的 hash 无法直接改（跨边界），改用 URL 重载方式携带 speak 参数
    const base = this.data.url.split("#")[0];
    this.setData({ url: base + "#speak=" + encodeURIComponent(text) });
  },

  onBack() {
    wx.navigateBack();
  },
});
