const api = require("../../utils/api");

Page({
  data: {
    age: "28",
    gender: "男",
    job: "外卖骑手",
    genders: ["男", "女", "不便透露"],
    jobs: ["外卖骑手", "快递员", "网约车司机", "其他新就业形态"],
    submitting: false,
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

  onAgeMinus() {
    const v = Math.max(16, Number(this.data.age) - 1);
    this.setData({ age: String(v) });
  },
  onAgePlus() {
    const v = Math.min(70, Number(this.data.age) + 1);
    this.setData({ age: String(v) });
  },
  onAgeInput(e) {
    this.setData({ age: e.detail.value.replace(/\D/g, "").slice(0, 2) });
  },
  onGender(e) {
    this.setData({ gender: e.currentTarget.dataset.v });
  },
  onJob(e) {
    this.setData({ job: e.currentTarget.dataset.v });
  },

  onSubmit() {
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    // PRD 5.2：PUT /user/profile（V6.2 幂等）
    api
      .saveProfile({ age: Number(this.data.age), gender: this.data.gender, occupation: this.data.job })
      .then(() => {
        wx.redirectTo({ url: "/pages/home/home" });
      })
      .finally(() => this.setData({ submitting: false }));
  },
});
