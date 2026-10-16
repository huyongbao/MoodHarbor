const app = getApp();
const api = require("../../utils/api");

Page({
  data: {
    guideIndex: 0,
    pages: [
      { step: "01", tag: "随时倾诉", title: "你的情绪，\n值得被认真听见", copy: "被催单、被误解、忙了一整天……不用硬扛。这里随时有人听你慢慢说。" },
      { step: "02", tag: "安心陪伴", title: "不评判，\n也不催你振作", copy: "语音、文字都可以。小愈会理解你的感受，陪你把心里的结一点点松开。" },
      { step: "03", tag: "安全守护", title: "难熬的时候，\n我们一起找帮助", copy: "所有倾诉都会加密保护。当你需要更多支持时，专业热线也会及时出现。" },
    ],
  },

  onLoad() {
    // PRD 5.3：已初始化过的用户跳过引导直达首页
    api.getInitStatus().then((res) => {
      const s = res.data;
      if (s && s.digitalHumanSelected && s.profileCompleted) {
        wx.redirectTo({ url: "/pages/home/home" });
      }
    });
  },

  onSkip() {
    wx.redirectTo({ url: "/pages/login/login" });
  },

  onNext() {
    const i = this.data.guideIndex;
    if (i < 2) {
      this.setData({ guideIndex: i + 1 });
    } else {
      wx.redirectTo({ url: "/pages/login/login" });
    }
  },
});
