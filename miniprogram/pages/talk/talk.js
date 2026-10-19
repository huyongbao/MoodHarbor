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
    configured: null,     // null=加载中 false=未配置/不可达 true=就绪
    recording: false,
    processing: false,     // 语音上传+分析中（按钮态）
    canRetry: false,       // 兜底页是否显示「重新加载数字人」
    asrText: "",           // 兜底页：用户转写
    replyText: "",         // 兜底页：AI 回复
    companionName: "小满",  // 兜底页：陪伴者名字
    fallbackTitle: "3D 数字人未配置",
    fallbackDesc: "请在 backend/.env 填写 DH_APP_ID_FEMALE / DH_APP_ID_MALE（魔珐星云 xingyun3d.com 创建驱动应用获取）后重启后端",
  },

  conversationId: "",
  recorderManager: null,
  cameraCtx: null,
  faceTimer: null,

  onLoad() {
    // tab 化常驻：onLoad 只在当天首次进入时执行一次，之后切走/回来都是 onShow
    // 导航标题对齐图2：显示当前陪伴者名字（小满 / 知远）
    const companion = app.globalData.companion;
    const dhId = (companion && companion.id) || wx.getStorageSync("mock_dh_id") || "dh_01";
    const dhName = (companion && companion.name) || (dhId === "dh_02" ? "知远" : "小满");
    wx.setNavigationBarTitle({ title: dhName });
    this.setData({ companionName: dhName });
    // 隐藏摄像头表情识别（页面无画面，仅取帧分析）
    this._initHiddenFaceDetect();
    // 建会话并把 token + conversationId 带进 H5 地址（H5 内录音直连后端）；
    // 会话的生命周期由 H5 管理：结束/超时后 H5 自己 ensureConversation 开新会话
    api.request("/conversations", { method: "POST" })
      .then((res) => { this.conversationId = (res.data && res.data.conversationId) || ""; })
      .catch(() => {})
      .then(() => this._initWebview());
  },

  onShow() {
    // 自定义 tabBar：倾诉页沉浸式，不高亮任何 tab
    if (typeof this.getTabBar === "function" && this.getTabBar()) {
      this.getTabBar().setData({ selected: -1 });
    }
    // 摄像头取帧：切走时停了，回来恢复
    if (!this.faceTimer) this._initHiddenFaceDetect();
    // 首页带入的情绪/话题 → 走「写入-消费」指令通道下发给 H5 数字人
    const ctx = app.globalData.talkContext;
    if (ctx && ctx.at && this._ctxAt !== ctx.at) {
      this._ctxAt = ctx.at;
      app.globalData.talkContext = null;
      if (ctx.topic) {
        api.request("/mp/ui-directive", {
          method: "POST",
          data: { payload: { topic: ctx.topic, at: ctx.at } },
        }).catch(() => {});
      }
    }
    // 兜底页自动恢复：用户切走/再回来时若还是 fallback，5s 间隔重试一次
    // —— cloudflared 偶尔瞬断或 Quick Tunnel 全网传播延迟，离开再回来就能看到数字人
    if (this.data.configured === false) {
      const now = Date.now();
      if (!this._lastFallbackAt || now - this._lastFallbackAt > 5000) {
        this._lastFallbackAt = now;
        this._initWebview();
      }
    }
  },

  onHide() {
    // tab 切走：页面实例保留（web-view/数字人活着），只停掉摄像头取帧（省电）
    if (this.faceTimer) { clearInterval(this.faceTimer); this.faceTimer = null; }
  },

  // cover-view 盖不住 web-view，按住说话改由 H5 自己录音并直连后端，
  // 所以这里把 token / conversationId 透传进 URL；debug=1 用于真机排查
  // （开发者工具执行 wx.setStorageSync("dh_debug", true) 后再进本页即生效）
  _initWebview() {
    const build = (url) => {
      if (!url) return "";
      const token = wx.getStorageSync("token") || "";
      const sep = url.indexOf("?") > -1 ? "&" : "?";
      let u = url + sep + "token=" + encodeURIComponent(token) +
        "&cid=" + encodeURIComponent(this.conversationId || "");
      if (wx.getStorageSync("dh_debug")) u += "&debug=1";
      return u;
    };
    if (app.globalData.dhUrl) {
      this.setData({ configured: true, dhUrl: build(app.globalData.dhUrl) });
      return;
    }
    api.request("/digital-human/view").then((res) => {
      const d = res.data || {};
      if (d.url) app.globalData.dhUrl = d.url;
      if (d.configured && d.url) {
        this.setData({ configured: true, dhUrl: build(d.url) });
        return;
      }
      // 后端已探活过隧道：不通就直接走兜底，不再把死链丢给 web-view
      this._fallback(d.reason, d.url || app.globalData.dhUrl || "");
    }).catch(() => this._fallback("network_error", ""));
  },

  // 降级到 2D 对话页：保留完整语音对话能力，只是没有 3D 形象
  _fallback(reason, failedUrl) {
    const map = {
      tunnel_unreachable: ["3D 数字人暂时连不上", "公网隧道未连通，已切换为语音对话模式，功能不受影响。"],
      missing_credentials: ["3D 数字人未配置", "请在 backend/.env 填写 DH_APP_ID_FEMALE / DH_APP_ID_MALE（魔珐星云 xingyun3d.com 创建驱动应用获取）后重启后端"],
      no_public_base_url: ["3D 数字人未配置", "backend/.env 缺少 PUBLIC_BASE_URL，请确认隧道已启动"],
      network_error: ["连不上服务", "请确认后端已启动（双击桌面「启动歇会儿」）"],
    };
    const t = map[reason] || map.network_error;
    if (failedUrl) this._failedUrl = failedUrl;
    this._lastFallbackAt = Date.now();  // 记时间戳，onShow 据此节流重试
    // 清掉 globalData 缓存：否则下次进页面直接复用这个死地址，永远好不了
    app.globalData.dhUrl = "";
    this.setData({
      configured: false,
      dhUrl: "",                       // 置空让 web-view 卸载，露出兜底页
      canRetry: true,                  // 兜底页始终显示重试按钮（5s 后也允许自动重试）
      fallbackTitle: t[0],
      fallbackDesc: t[1],
    });
  },

  onWebviewError() {
    // web-view 加载失败（隧道断了 / 域名漂移 / 证书问题）：兜住，别白屏
    this._fallback("tunnel_unreachable", this.data.dhUrl || this._failedUrl || "");
  },

  onRetryWebview() {
    // 重新向后端要地址（后端会重新探活）；globalData 先清掉，避免命中旧缓存
    app.globalData.dhUrl = "";
    this.setData({ configured: null, dhUrl: "", canRetry: false });
    this._initWebview();
  },

  onUnload() {
    if (this.faceTimer) clearInterval(this.faceTimer);
  },

  // ================= 隐藏摄像头：表情识别（无画面）=================
  _initHiddenFaceDetect() {
    if (this.faceTimer) return; // 已在取帧，避免 onShow 重复启动
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

  // ================= 按住说话（仅"数字人未配置"兜底页使用）=================
  // 正常流程下 web-view 盖住整页且 cover-view 无法覆盖 web-view，
  // 语音交互由 H5 内部完成（见 backend/digital_human/index.html）
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

  // ================= 语音对话链路（仅"数字人未配置"兜底页使用）=================
  _sendVoice(tempFilePath) {
    // 会话懒创建：常驻页的 cid 可能已被 H5 结束/重建，兜底页用到时再补
    const ensureCid = this.conversationId
      ? Promise.resolve(this.conversationId)
      : api.request("/conversations", { method: "POST" })
          .then((res) => { this.conversationId = (res.data && res.data.conversationId) || ""; return this.conversationId; });
    ensureCid.then(() => api.uploadFile(tempFilePath)).then((up) => {
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
    // H5 每 300ms 轮询一次 hash，指令连发时前一条会被覆盖 →
    // 按"您的那句 → 数字人回复 → 热线卡"顺序错峰下发
    const seq = (this._replySeq = (this._replySeq || 0) + 1);
    const later = (fn, ms) => setTimeout(() => {
      if (seq === this._replySeq) fn(); // 期间又发起新一轮对话，放弃旧回复
    }, ms);

    // 1. 用户转写显示（统一走 H5 上方字幕卡，说话人显示"您"）
    if (d.asrText) {
      this.sendHash("asr=" + encodeURIComponent(d.asrText));
      this.setData({ asrText: d.asrText });   // 兜底页也同步上屏
    }

    // 2. 数字人开口 + 字幕
    const speakAt = d.asrText && d.replyText ? 1000 : 0;
    if (d.replyText) {
      this.setData({ replyText: d.replyText });
      if (speakAt) later(() => this.sendHash("speak=" + encodeURIComponent(d.replyText)), speakAt);
      else this.sendHash("speak=" + encodeURIComponent(d.replyText));
    }

    // 3. 干预路由（PRD 8.2 映射）
    const iv = d.intervention || { type: "normal" };
    if (iv.type === "hotline") {
      // 二级：H5 热线处置卡（温和推荐），排在回复之后，避免抢掉字幕指令
      later(() => this.sendHash("hotline=show"), speakAt + 800);
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
