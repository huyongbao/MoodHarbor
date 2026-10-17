// pages/talk/talk.js
// 沉浸式 3D 数字人对话页（方案 A · 倾诉页主形态）
// 分层：web-view（数字人+字幕+转写区+热线卡，全在 H5）
//       cover-view（按住说话按钮，原生，真机覆盖 web-view）
//       隐藏 camera（1rpx 不可见）取帧 → 后端 Py-Feat 表情分析（页面无摄像头画面）
// 链路：按住说话 → 录音 → 上传 → 后端(ASR+语音情感+表情+LLM判定) →
//       hash#asr=转写 + hash#speak=回复（数字人开口+字幕）+ 干预路由
// 注意：历史消息照常落库（记录页可回看），页面只显示当前一句（沉浸式）
const api = require("../../utils/api");
const app = getApp();

const EMERGENCY_HOTLINE = "025-96889910";

Page({
  data: {
    dhUrl: "",            // 数字人 H5 地址（空 = 未配置，显示兜底）
    configured: null,     // null=加载中 false=未配置 true=就绪
    recording: false,
    processing: false,     // 语音上传+分析中（按钮态）
  },

  conversationId: "",
  recorderManager: null,
  cameraCtx: null,
  faceTimer: null,

  onLoad() {
    // 倾诉会话
    api.request("/conversations", { method: "POST" }).then((res) => {
      this.conversationId = (res.data && res.data.conversationId) || "";
    }).catch(() => {});
    // 数字人地址（优先用 home 页预取的全局 URL，省一次请求）
    if (app.globalData.dhUrl) {
      this.setData({ configured: true, dhUrl: app.globalData.dhUrl });
    } else {
      api.request("/digital-human/view").then((res) => {
        const d = res.data || {};
        this.setData({ configured: !!d.configured, dhUrl: d.url || "" });
        if (d.url) app.globalData.dhUrl = d.url;
      }).catch(() => this.setData({ configured: false }));
    }
    // 隐藏摄像头表情识别（页面无画面，仅取帧分析）
    this._initHiddenFaceDetect();
  },

  onUnload() {
    if (this.faceTimer) clearInterval(this.faceTimer);
  },

  // ================= 隐藏摄像头：表情识别（无画面）=================
  _initHiddenFaceDetect() {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting["scope.camera"] === false) {
          return; // 拒绝过：静默跳过（语音/文字判定不受影响）
        }
        this.cameraCtx = wx.createCameraContext();
        // 每 4 秒静默拍一帧做表情分析（分析结果随对话判定使用）
        this.faceTimer = setInterval(() => {
          this.cameraCtx && this.cameraCtx.takePhoto({
            quality: "low",
            success: (res) => {
              this._latestFacePath = res.tempImagePath; // 供对话时随语音一起送
            },
            fail: () => {},
          });
        }, 4000);
      },
    });
  },

  // ================= 按住说话（cover-view）=================
  onHoldStart() {
    if (this.data.recording || this.data.processing) return;
    // 关键：先启动录音（touchstart 回调里避免同步 setData 阻塞 touchend —— 
    // 微信双线程已知坑：touchstart 中 setData 会导致 touchend 丢失）
    this._recording = true;
    this._ensureRecorder().start({
      duration: 60000,
      format: "mp3",
      sampleRate: 16000,
      encodeBitRate: 48000,
    });
    setTimeout(() => {
      this.setData({ recording: true });
      wx.vibrateShort({ type: "light" });
    }, 0);
  },

  onHoldEnd() {
    // 用实例标记判断（不依赖 setData 后的 data，防阻塞竞态）
    if (!this._recording) return;
    this._recording = false;
    this.setData({ recording: false, processing: true });
    this.sendHash("asr=waiting"); // 转写中占位
    this._ensureRecorder().stop();
  },

  _ensureRecorder() {
    if (this.recorderManager) return this.recorderManager;
    const rm = wx.getRecorderManager();
    rm.onStop((res) => {
      if (!res.tempFilePath) {
        this.setData({ processing: false });
        return;
      }
      this._sendVoice(res.tempFilePath);
    });
    rm.onError(() => this.setData({ processing: false }));
    this.recorderManager = rm;
    return rm;
  },

  // ================= 语音对话链路 =================
  _sendVoice(tempFilePath) {
    api.uploadFile(tempFilePath).then((up) => {
      const payload = {
        conversationId: this.conversationId,
        inputTypes: ["audio"],
        audioUrl: (up.data && up.data.fileUrl) || "",
      };
      // 有最新表情帧：一并上传参与多模态判定（图片走 imageUrl）
      const doChat = (finalPayload) => {
        api.request("/chat/completions", { method: "POST", data: finalPayload })
          .then((r) => this._handleReply(r.data || {}))
          .catch(() => this._handleNetError());
      };
      if (this._latestFacePath) {
        const facePath = this._latestFacePath;
        this._latestFacePath = null;
        api.uploadFile(facePath).then((up2) => {
          doChat(Object.assign({}, payload, {
            inputTypes: ["audio", "image"],
            imageUrl: (up2.data && up2.data.fileUrl) || "",
          }));
        }).catch(() => doChat(payload)); // 表情上传失败不影响语音对话
      } else {
        doChat(payload);
      }
    }).catch(() => this._handleNetError());
  },

  // AI 回复处理：转写上屏 → 数字人说话+字幕 → 干预路由
  _handleReply(d) {
    this.setData({ processing: false });
    // 1. 用户转写显示（只保留当前一句）
    if (d.asrText) this.sendHash("asr=" + encodeURIComponent(d.asrText));
    // 2. 数字人开口 + 字幕
    if (d.replyText) this.sendHash("speak=" + encodeURIComponent(d.replyText));
    // 3. 干预路由（PRD 8.2 映射）
    const iv = d.intervention || { type: "normal" };
    if (iv.type === "hotline") {
      this.sendHash("hotline=show");       // 二级：H5 热线处置卡（温和推荐）
    } else if (iv.type === "emergency") {
      this._showEmergencyModal();          // 一级：原生强制弹窗（安全红线）
    }
    // 三级 comfort：数字人回复本身含资源引导，无额外 UI
  },

  _showEmergencyModal() {
    // 一级高危：wx.showModal 原生弹窗（层级最高，盖住 web-view）
    // PRD 红线：强制弹窗不可立即关闭 —— 无取消按钮，确认即拨号
    wx.showModal({
      title: "你并不孤单",
      content: "我能感受到您现在的痛苦。有专业人员可以陪您聊一聊：\n\n24 小时心理支持热线 12356\n南京市总工会宁师傅热线 " + EMERGENCY_HOTLINE,
      confirmText: "拨打热线",
      showCancel: false,
      success: (r) => {
        if (r.confirm) {
          wx.makePhoneCall({ phoneNumber: EMERGENCY_HOTLINE }).catch(() => {});
        }
      },
    });
  },

  _handleNetError() {
    this.setData({ processing: false });
    this.sendHash("asr=" + encodeURIComponent("（网络开小差了，再说一遍试试）"));
  },

  // ================= hash 指令下发（H5 300ms 轮询）=================
  sendHash(cmd) {
    if (!this.data.dhUrl) return;
    const base = this.data.dhUrl.split("#")[0];
    this.setData({ dhUrl: base + "#" + cmd });
  },

  // H5 → 小程序消息（后退等时机；电话兜底）
  onWebviewMessage(e) {
    const list = (e.detail && e.detail.data) || [];
    const data = list[list.length - 1];
    if (!data) return;
    if (data.type === "call_hotline") {
      wx.makePhoneCall({ phoneNumber: data.phone || EMERGENCY_HOTLINE }).catch(() => {});
    }
  },

  onWebviewLoad() {
    // SDK 加载进度提示由 H5 呈现
  },
});
