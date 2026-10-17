// pages/digital-human/digital-human.js
// 沉浸式 3D 数字人对话页（魔珐星云 SDK via web-view）
// 分层：背景=web-view（3D 数字人渲染 + 字幕卡 + 热线卡，全在 H5 内）
//       前景=cover-view（按住说话按钮，原生录音，真机覆盖 web-view 生效）
// 通信：小程序 → H5：url#hash 指令（speak=文本 / hotline=show）
//      H5 → 小程序：wx.miniProgram.postMessage（后退/销毁等时机，仅辅助）
const api = require("../../utils/api");
const app = getApp();

Page({
  data: {
    url: "",
    configured: true,
    loading: true,
    pendingText: "", // 从 talk 页带过来的首句
    recording: false, // 录音中（按钮态）
  },

  conversationId: "",
  recorderManager: null,

  onLoad(options) {
    const pending = decodeURIComponent(options.speak || "");
    this.setData({ pendingText: pending });
    // 创建倾诉会话（数字人页内直接对话）
    api.request("/conversations", { method: "POST" }).then((res) => {
      this.conversationId = (res.data && res.data.conversationId) || "";
    }).catch(() => {});
    api.request("/digital-human/view").then((res) => {
      const d = res.data || {};
      if (!d.configured) {
        this.setData({ configured: false, loading: false });
        return;
      }
      this.setData({ url: d.url, loading: false });
    }).catch(() => this.setData({ configured: false, loading: false }));
  },

  onWebviewLoad() {
    if (this.data.pendingText) {
      const text = this.data.pendingText;
      this.setData({ pendingText: "" });
      setTimeout(() => this.speak(text), 2500); // 等 SDK 初始化
    }
  },

  // H5 → 小程序消息（仅特定时机触发：后退/销毁/分享）
  onWebviewMessage(e) {
    const list = (e.detail && e.detail.data) || [];
    const data = list[list.length - 1];
    if (!data) return;
    if (data.type === "call_hotline") {
      wx.makePhoneCall({ phoneNumber: data.phone || "025-96889910" }).catch(() => {});
    }
  },

  // ================= 按住说话（原生 cover-view 按钮 + RecorderManager）=================
  onHoldStart() {
    if (this.data.recording) return;
    this._ensureRecorder().start({
      duration: 60000,
      format: "mp3",
      sampleRate: 16000,
      encodeBitRate: 48000,
    });
    this.setData({ recording: true });
    wx.vibrateShort({ type: "light" });
  },

  onHoldEnd() {
    if (!this.data.recording) return;
    this.setData({ recording: false });
    this._ensureRecorder().stop();
  },

  _ensureRecorder() {
    if (this.recorderManager) return this.recorderManager;
    const rm = wx.getRecorderManager();
    rm.onStop((res) => {
      if (!res.tempFilePath) return;
      // 上传 → 后端 ASR+情感分析+LLM → 回复驱动数字人说话+字幕
      api.uploadFile(res.tempFilePath).then((up) => {
        api.request("/chat/completions", {
          method: "POST",
          data: {
            conversationId: this.conversationId,
            inputTypes: ["audio"],
            audioUrl: (up.data && up.data.fileUrl) || "",
          },
        }).then((r) => {
          const d = r.data || {};
          if (d.replyText) this.speak(d.replyText);
          // 二级及以上干预 → H5 显示热线提示卡（PRD 8.2 映射）
          const iv = d.intervention || {};
          if (iv.type === "hotline" || iv.type === "emergency") {
            this.sendHash("hotline=show");
          }
        }).catch(() => {
          this.speak("我这边信号不太好，你再说一遍好吗？");
        });
      }).catch(() => {
        this.speak("语音发送失败，请检查网络后再试。");
      });
    });
    this.recorderManager = rm;
    return rm;
  },

  // ================= hash 指令下发（H5 每 300ms 轮询）=================
  sendHash(cmd) {
    const base = this.data.url.split("#")[0];
    this.setData({ url: base + "#" + cmd });
  },

  // 驱动数字人说话（H5 内 SDK speak + 字幕卡同步显示）
  speak(text) {
    this.sendHash("speak=" + encodeURIComponent(text));
  },

  onBack() {
    wx.navigateBack();
  },
});
