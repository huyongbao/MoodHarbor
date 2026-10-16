const api = require("../../utils/api");

Page({
  data: {
    age: "28",
    gender: "男",
    job: "外卖骑手",
    genders: ["男", "女", "不便透露"],
    jobs: ["外卖骑手", "快递员", "网约车司机", "其他新就业形态"],
  },

  onLoad() {
    api.getProfile().then((res) => {
      const p = res.data || {};
      if (p.occupation) {
        this.setData({
          age: String(p.age || 28),
          gender: p.gender || "男",
          job: p.occupation,
        });
      }
    });
  },

  onAgeMinus() { this.setData({ age: String(Math.max(16, Number(this.data.age) - 1)) }); },
  onAgePlus() { this.setData({ age: String(Math.min(70, Number(this.data.age) + 1)) }); },
  onGender(e) { this.setData({ gender: e.currentTarget.dataset.v }); },
  onJob(e) { this.setData({ job: e.currentTarget.dataset.v }); },

  onSave() {
    api
      .saveProfile({ age: Number(this.data.age), gender: this.data.gender, occupation: this.data.job })
      .then(() => {
        wx.showToast({ title: "已保存", icon: "success" });
        setTimeout(() => wx.navigateBack(), 600);
      });
  },

  onBack() { wx.navigateBack(); },
});
