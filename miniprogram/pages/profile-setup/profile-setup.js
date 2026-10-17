const api = require("../../utils/api");
const app = getApp();

Page({
  data: {
    age: "28",
    gender: "男",
    job: "外卖骑手",
    genders: ["男", "女", "不便透露"],
    jobs: ["外卖骑手", "快递员", "网约车司机", "其他新就业形态"],
    submitting: false,
    ageError: "",
  },

  onLoad() {
    // 回显已有资料（编辑场景）
    api.getProfile().then((res) => {
      if (res.data && res.data.occupation) {
        this.setData({
          age: String(res.data.age || "28"),
          gender: res.data.gender || "男",
          job: res.data.occupation || "外卖骑手",
        });
      }
    });
  },

  goBack() {
    wx.navigateBack();
  },

  onAgeInput(e) {
    this.setData({ age: e.detail.value.replace(/\D/g, "").slice(0, 3), ageError: "" });
  },
  onGender(e) {
    this.setData({ gender: e.currentTarget.dataset.v });
  },
  onJob(e) {
    this.setData({ job: e.currentTarget.dataset.v });
  },

  onSubmit() {
    if (this.data.submitting) return;
    // 年龄校验（对齐 Demo6：1–120 整数）
    const age = Number(this.data.age);
    if (!Number.isInteger(age) || age < 1 || age > 120) {
      this.setData({ ageError: "请输入 1–120 之间的整数" });
      return;
    }
    this.setData({ submitting: true });
    // PRD 5.2：PUT /user/profile（V6.2 幂等）
    api
      .saveProfile({ age: Number(this.data.age), gender: this.data.gender, occupation: this.data.job })
      .then(() => {
        // 资料已完善：同步栈底 home 的初始化状态缓存，避免返回后重复走引导
        const pages = getCurrentPages();
        for (let i = 0; i < pages.length; i++) {
          if (pages[i].route === "pages/home/home") {
            pages[i].setData({
              initStatus: Object.assign({}, pages[i].data.initStatus, { profileCompleted: true }),
            });
            break;
          }
        }
        // 对齐 Demo6：资料保存后直接落聊天页（不再回首页）
        return api.createConversation();
      })
      .then((res) => {
        app.globalData.conversationId = res.data.conversationId;
        wx.redirectTo({ url: "/pages/talk/talk" });
      })
      .finally(() => this.setData({ submitting: false }));
  },
});
