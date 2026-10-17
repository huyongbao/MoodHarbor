// breath —— 「呼吸一下」一分钟引导呼吸（移植 figma-demo6 breath 屏逻辑）
// 60 秒 = 6 轮 × 10 秒：每轮前 4 秒吸气、后 6 秒呼气
const TOTAL = 60;

Page({
  data: {
    seconds: 0,
    breathing: false,
    // 以下由 render() 统一派生（WXML 表达能力有限）
    title: "先松松肩，慢慢来。",
    coreLabel: "慢下来",
    coreSub: "跟着自己的节奏",
    roundText: "第 1 / 6 轮 · 剩余 60 秒",
    progressPercent: 0,
    mainBtnText: "开始 · 一分钟呼吸",
    done: false,
    running: false,
    exhale: false,
  },

  onLoad() {
    this.render();
  },

  onHide() {
    // 对齐 Demo6：离开页面即暂停
    if (this.data.breathing) {
      this.stopTimer();
      this.setData({ breathing: false });
      this.render();
    }
  },

  onUnload() {
    this.stopTimer();
  },

  goBack() {
    wx.navigateBack();
  },

  onToggle() {
    if (this.data.done) return;
    const breathing = !this.data.breathing;
    this.setData({ breathing });
    if (breathing) this.startTimer();
    else this.stopTimer();
    this.render();
  },

  onReset() {
    this.stopTimer();
    this.setData({ seconds: 0, breathing: false });
    this.render();
  },

  startTimer() {
    this.stopTimer();
    this._timer = setInterval(() => {
      const s = this.data.seconds;
      if (s >= TOTAL - 1) {
        // 最后一秒：停表并进入完成态（对齐 Demo6 s>=59 → 60）
        this.stopTimer();
        this.setData({ seconds: TOTAL, breathing: false });
      } else {
        this.setData({ seconds: s + 1 });
      }
      this.render();
    }, 1000);
  },

  stopTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  // 派生文案/视觉态统一计算
  render() {
    const { seconds: s, breathing } = this.data;
    const done = s === TOTAL;
    const inhale = s % 10 < 4;
    this.setData({
      done,
      running: breathing,
      exhale: s % 10 >= 4,
      title: done
        ? "缓过来一点了吗？"
        : !breathing && s === 0
          ? "先松松肩，慢慢来。"
          : breathing
            ? inhale
              ? "用鼻子，慢慢吸气"
              : "用嘴巴，轻轻呼气"
            : "歇一下，随时继续。",
      coreLabel: done ? "做得很好" : breathing ? (inhale ? "吸气" : "呼气") : "慢下来",
      coreSub: done
        ? "这一分钟，属于你"
        : breathing
          ? `${inhale ? 4 - (s % 10) : 10 - (s % 10)} 秒`
          : "跟着自己的节奏",
      roundText: done
        ? "6 / 6 轮完成"
        : `第 ${Math.min(6, Math.floor(s / 10) + 1)} / 6 轮 · 剩余 ${TOTAL - s} 秒`,
      progressPercent: (s / TOTAL) * 100,
      mainBtnText: breathing ? "暂停一下" : s ? "继续练习" : "开始 · 一分钟呼吸",
    });
  },

  goChat() {
    // Demo6 语义：来自聊天则返回会话，否则回首页重新进入倾诉
    const pages = getCurrentPages();
    const prev = pages[pages.length - 2];
    if (prev && prev.route && prev.route.indexOf("talk") > -1) {
      wx.navigateBack();
    } else {
      wx.reLaunch({ url: "/pages/home/home" });
    }
  },

  goHome() {
    wx.reLaunch({ url: "/pages/home/home" });
  },
});
