const api = require("../../utils/api");
const debugStream = require("../../utils/debugStream");
const app = getApp();

Page({
  data: {
    companion: null,
    conversationId: "",
    inputText: "",
    messages: [], // { role: 'user'|'ai', content }
    recording: false,
    sending: false,
    // 分级干预弹窗（PRD 8.2 映射表）
    showIntervention: false,
    intervention: null, // { type, hotline, selfHelp, level }
    emergencyLocked: false, // 一级：强制弹窗不可立即关闭
    emergencyCountdown: 0,
    // 三级资源推荐
    showSelfHelpStrip: false,
    selfHelpItems: [],
    // 语音提示
    inputTypes: ["text"],
    // 调试推流（管理台实时观察模式）
    debugStreaming: false,
    debugSessionId: "",
    cameraHint: "",
    scrollInto: "",
    inputMode: "voice",
    dh3dAvailable: false,  // 3D 数字人是否已配置           // voice=按住说话（默认）| text=键盘
    faceActive: false,            // 表情识别运行中
    faceStatus: "未开启",          // 调试状态：未开启/初始化/运行中/受限
    faceLastResult: "",           // 最近一次表情识别结果
  },

  recorderManager: null,

  onLoad() {
    const companion = app.globalData.companion || {
      id: "dh_01", name: "小愈", className: "warm", trait: "温柔耐心",
    };
    this.setData({
      companion,
      conversationId: app.globalData.conversationId || "",
    });
    if (!this.data.conversationId) {
      api.createConversation().then((res) => {
        app.globalData.conversationId = res.data.conversationId;
        this.setData({ conversationId: res.data.conversationId });
      });
    }
    // 欢迎语
    this.setData({
      messages: [{ role: "ai", content: "不用急，慢慢说。这里没有评判，只有倾听。" }],
    });
    // 自动开启表情识别（倾诉页进入即开，调试状态可见）
    this._initFaceDetect();
    // 检查 3D 数字人是否已配置
    api.request("/digital-human/view").then((res) => {
      this.setData({ dh3dAvailable: !!(res.data && res.data.configured) });
    }).catch(() => {});
  },

  // ---------- 文本输入 ----------
  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  onSendText() {
    const text = this.data.inputText.trim();
    if (!text || this.data.sending) return;
    this.setData({ inputText: "" });
    this.doChat({ inputTypes: ["text"], text });
  },

  // ---------- 输入模式 ----------
  onToggleInputMode() {
    this.setData({ inputMode: this.data.inputMode === "voice" ? "text" : "voice" });
  },

  // ---------- 按住说话（按住录音，松开发送）----------
  onHoldStart() {
    if (this.data.recording || this.data.sending) return;
    this.startRecording();
    wx.vibrateShort({ type: "light" }); // 按下震动反馈
  },

  onHoldEnd() {
    if (!this.data.recording) return;
    this.stopRecording(); // onStop 里自动走上传→对话→推流
  },

  // ---------- 语音输入（RecorderManager）----------
  toggleRecording() {
    if (this.data.recording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  },

  startRecording() {
    if (!this.recorderManager) {
      this.recorderManager = wx.getRecorderManager();
      this.recorderManager.onStop((res) => {
        this.setData({ recording: false });
        if (res.tempFilePath) {
          // 调试推流模式：语音段同步上报（后端 ASR+emotion2vec 实时分析广播）
          if (this.data.debugStreaming) {
            debugStream.sendAudio(this.data.debugSessionId, res.tempFilePath);
          }
          // PRD 8.1 两步流程：先 /upload 拿 URL，再传 chat
          api.uploadFile(res.tempFilePath).then((up) => {
            this.doChat({ inputTypes: ["audio"], audioUrl: up.data.fileUrl, text: "" });
          });
        }
      });
    }
    this.setData({ recording: true });
    this.recorderManager.start({ duration: 60000, format: "mp3" });
  },

  stopRecording() {
    if (this.recorderManager) this.recorderManager.stop();
  },

  // ---------- 表情输入（拍照/选图）----------
  onCapture() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["camera", "album"],
      success: (res) => {
        const file = res.tempFiles[0].tempFilePath;
        api.uploadFile(file).then((up) => {
          // V6.2 多模态组合：如已有语音文本则组合发送；此处独立发送表情模态
          this.doChat({ inputTypes: ["image"], imageUrl: up.data.fileUrl, text: "" });
        });
      },
    });
  },

  // ---------- 快捷话题 ----------
  onPrompt(e) {
    const text = e.currentTarget.dataset.t;
    this.doChat({ inputTypes: ["text"], text });
  },

  // ---------- 核心：对话 + 分级干预 ----------
  doChat(payload) {
    if (this.data.sending) return;
    // 调试推流模式：文本同步上报（管理台实时看到判定链）
    if (this.data.debugStreaming && payload.text) {
      debugStream.sendText(this.data.debugSessionId, payload.text);
    }
    payload.conversationId = this.data.conversationId;
    payload.digitalHumanId = (this.data.companion && this.data.companion.id) || "dh_01";

    // 语音输入：后端 ASR 转写后返回的文本在响应里，先展示占位，AI 回复后回填
    const isAudio = payload.inputTypes.indexOf("audio") > -1;
    const userMsg = payload.text || (isAudio ? "🎤 语音倾诉中…" : "📷 [表情照见]");
    const placeholderIdx = this.data.messages.length; // 占位消息索引（用于回填 ASR 文本）
    this.setData({
      sending: true,
      messages: this.data.messages.concat([{ role: "user", content: userMsg }]),
      showSelfHelpStrip: false,
      scrollInto: "msg-bottom",
    });

    api
      .chat(payload)
      .then((res) => {
        const d = res.data || {};
        const msgs = this.data.messages.concat([{ role: "ai", content: d.replyText }]);
        // 语音输入：用后端 ASR 转写回填用户消息（替代占位文案）
        if (d.asrText && placeholderIdx !== undefined && msgs[placeholderIdx]) {
          msgs[placeholderIdx] = { role: "user", content: d.asrText };
        }
        this.setData({ messages: msgs, sending: false, scrollInto: "msg-bottom" });

        // PRD 8.2 映射表：按 intervention.type 呈现
        const iv = d.intervention || { type: "normal", selfHelp: [] };
        if (iv.type === "emergency") {
          // 一级：强制弹窗 + 不可立即关闭（5 秒倒计时解锁）
          this.setData({ showIntervention: true, intervention: iv, emergencyLocked: true, emergencyCountdown: 5 });
          this.tickEmergency();
          api.reportRiskAlert(1, this.data.conversationId); // 后台预警
        } else if (iv.type === "hotline") {
          // 二级：温和弹窗，可关闭
          this.setData({ showIntervention: true, intervention: iv, emergencyLocked: false });
          api.reportRiskAlert(2, this.data.conversationId);
        } else if (iv.selfHelp && iv.selfHelp.length) {
          // 三级：底部自助资源推荐卡
          this.setData({ showSelfHelpStrip: true, selfHelpItems: iv.selfHelp });
        }
      })
      .catch(() => {
        this.setData({
          sending: false,
          messages: this.data.messages.concat([{ role: "ai", content: "我在的，刚才没听清，你可以再说一次吗？" }]),
        });
      });
  },

  // 一级弹窗倒计时（PRD：不可立即关闭）
  tickEmergency() {
    const timer = setInterval(() => {
      const c = this.data.emergencyCountdown - 1;
      if (c <= 0) {
        clearInterval(timer);
        this.setData({ emergencyLocked: false, emergencyCountdown: 0 });
      } else {
        this.setData({ emergencyCountdown: c });
      }
    }, 1000);
  },

  closeIntervention() {
    if (this.data.emergencyLocked) return;
    this.setData({ showIntervention: false });
  },

  onCallHotline(e) {
    wx.makePhoneCall({ phoneNumber: e.currentTarget.dataset.phone });
  },

  onBack() {
    wx.navigateBack();
  },

  // ================= 调试推流（契约 4.12：管理台实时观察）=================
  onToggleDebugStream() {
    if (this.data.debugStreaming) {
      this.stopDebugStream();
    } else {
      this.startDebugStream();
    }
  },

  startDebugStream() {
    // 前置：申请摄像头权限（真机上 scope.camera 授权弹窗）
    wx.getSetting({
      success: (res) => {
        if (res.authSetting["scope.camera"] === false) {
          // 曾拒绝过：引导去设置开启
          wx.showModal({
            title: "需要摄像头权限",
            content: "实时推流需要访问摄像头。请在设置中允许「摄像头」权限后重试。",
            confirmText: "去设置",
            success: (r) => { if (r.confirm) wx.openSetting(); },
          });
          return;
        }
        this._beginStream();
      },
    });
  },

  _beginStream() {
    debugStream.startSession(this.data.conversationId).then((sessionId) => {
      this.setData({ debugStreaming: true, debugSessionId: sessionId });
      wx.showToast({ title: "推流已开启", icon: "success" });
      // 实时帧流：onCameraFrame 官方 API（约 20-30fps 原始帧，节流后 500ms/帧推流）
      this.cameraCtx = wx.createCameraContext();
      this.frameOk = false; // 拍帧成功标记
      const listener = this.cameraCtx.onCameraFrame((frame) => {
        const now = Date.now();
        // 节流：500ms 一帧推管理台（≈2fps 平滑视频）
        if (now - (this._lastFrameTs || 0) < 500) return;
        this._lastFrameTs = now;
        this.frameOk = true;
        // frame.data 是 ArrayBuffer（YUV/RGBA 原始帧）→ 画到离屏 canvas 转 JPEG base64
        this._pushCameraFrame(frame);
      });
      listener.start({ success: () => {}, fail: (e) => this._fallbackToTakePhoto(e) });
      this._frameListener = listener;
    });
  },

  // 原始帧 → 压缩 JPEG base64 → 推流（离屏 canvas 转码）
  _pushCameraFrame(frame) {
    const w = frame.width, h = frame.height;
    if (!this._offscreen) {
      this._offscreen = wx.createOffscreenCanvas({ type: "2d", width: w, height: h });
      this._offctx = this._offscreen.getContext("2d");
      this._imgData = this._offctx.createImageData(w, h);
    }
    // RGBA 数据直接放
    this._imgData.data.set(new Uint8Array(frame.data));
    this._offctx.putImageData(this._imgData, 0, 0);
    // 转 JPEG（quality 0.5，帧体积 ~15-30KB）
    const dataUrl = this._offscreen.toDataURL("image/jpeg", 0.5);
    // 直接发 base64（无需写临时文件）
    debugStream.sendFrameB64(this.data.debugSessionId, dataUrl.split(",")[1]);
  },

  // onCameraFrame 不可用时的降级：takePhoto 定时
  _fallbackToTakePhoto(err) {
    this.setData({ cameraHint: "实时帧不可用，已降级定时拍照模式" });
    this.frameTimer = setInterval(() => {
      if (!this.data.debugStreaming) return;
      this.cameraCtx && this.cameraCtx.takePhoto({
        quality: "low",
        success: (res) => {
          this.frameOk = true;
          debugStream.sendFrame(this.data.debugSessionId, res.tempImagePath);
        },
        fail: () => {
          if (!this.frameOk) {
            this.setData({ cameraHint: "摄像头取帧受限：文字与语音分析不受影响" });
          }
        },
      });
    }, 1000);
  },

  stopDebugStream() {
    if (this.frameTimer) clearInterval(this.frameTimer);
    if (this._frameListener) { this._frameListener.stop(); this._frameListener = null; }
    this._offscreen = null; // 释放离屏 canvas
    debugStream.endSession(this.data.debugSessionId);
    this.setData({ debugStreaming: false, debugSessionId: "" });
    wx.showToast({ title: "推流已结束", icon: "none" });
  },

  // 文本倾诉在推流模式下同步上报（复用 sendText 触发判定链）
  debugSendText(text) {
    debugStream.sendText(this.data.debugSessionId, text);
  },


  // 点右上角小窗手动拍一帧（camera 定时取帧受限时的降级）
  onManualFrame() {
    if (!this.data.debugStreaming || !this.cameraCtx) return;
    this.cameraCtx.takePhoto({
      quality: "low",
      success: (res) => {
        this.frameOk = true;
        debugStream.sendFrame(this.data.debugSessionId, res.tempImagePath);
        wx.showToast({ title: "已送帧", icon: "success", duration: 800 });
      },
      fail: () => {
        this.setData({ cameraHint: "此环境 camera 不可用（真机预览包限制），文字与语音分析不受影响" });
      },
    });
  },

  onCameraError() {
    this.setData({ cameraHint: "摄像头初始化失败（预览包/权限限制），文字与语音分析不受影响" });
  },


  // ================= 表情识别（进入页面自动开启，调试状态可见）=================
  _initFaceDetect() {
    this.setData({ faceStatus: "初始化中…" });
    wx.getSetting({
      success: (res) => {
        if (res.authSetting["scope.camera"] === false) {
          this.setData({ faceStatus: "受限：摄像头权限被拒", faceActive: false });
          wx.showModal({
            title: "需要摄像头权限",
            content: "实时表情识别需要访问摄像头。请在设置中允许后重试。",
            confirmText: "去设置",
            success: (r) => { if (r.confirm) wx.openSetting(); },
          });
          return;
        }
        this.setData({ faceActive: true, faceStatus: "运行中 · 取帧尝试" });
        this.cameraCtx = wx.createCameraContext();
        this._faceFrameOk = false; // 取帧成功标记（超时判定用）
        // 取帧超时哨兵：12s 内无一帧成功 → 判定当前环境 camera 受限
        this._faceWatchdog = setTimeout(() => {
          if (!this._faceFrameOk && this.data.faceActive) {
            this.setData({ faceStatus: "受限：取帧无响应（模拟器/预览包无摄像头），语音与文字不受影响" });
          }
        }, 12000);
        // 每 3 秒拍一帧做表情分析
        this.faceTimer = setInterval(() => {
          if (!this.data.faceActive) return;
          this.cameraCtx && this.cameraCtx.takePhoto({
            quality: "low",
            success: (res) => {
              this._faceFrameOk = true;
              this.setData({ faceStatus: "运行中 · 取帧成功" });
              // 推流模式下送后端分析；非推流仅更新状态
              if (this.data.debugStreaming) {
                debugStream.sendFrame(this.data.debugSessionId, res.tempFilePath);
              }
            },
            fail: () => {
              this.setData({ faceStatus: "受限：取帧失败（预览包限制，语音/文字不受影响）", faceActive: false });
            },
          });
        }, 3000);
      },
    });
  },


  // ================= 3D 数字人（魔珐星云 web-view）=================
  openDigitalHuman(e) {
    const text = (e && e.currentTarget && e.currentTarget.dataset.text) || "";
    wx.navigateTo({
      url: "/pages/digital-human/digital-human" + (text ? "?speak=" + encodeURIComponent(text) : ""),
    });
  },

  onUnload() {
    if (this.data.debugStreaming) this.stopDebugStream();
    if (this.faceTimer) clearInterval(this.faceTimer);
    if (this._faceWatchdog) clearTimeout(this._faceWatchdog);
  },
});
