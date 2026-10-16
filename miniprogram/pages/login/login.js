const api = require("../../utils/api");

Page({
  onWechatLogin() {
    api.login().then((res) => {
      const token = res.data && res.data.token;
      if (token) wx.setStorageSync("token", token);
      wx.redirectTo({ url: "/pages/companion-select/companion-select" });
    });
  },
});
