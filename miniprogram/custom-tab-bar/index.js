// 自定义底部导航：复刻 Demo6 .bottom-nav（歇会儿 / 倾诉记录 / 我的）
Component({
  data: {
    selected: 0,
    list: [
      { pagePath: "/pages/home/home", icon: "wap-home-o", label: "歇会儿" },
      { pagePath: "/pages/history/history", icon: "orders-o", label: "倾诉记录" },
      { pagePath: "/pages/profile/profile", icon: "user-o", label: "我的" },
    ],
  },
  methods: {
    onTabTap(e) {
      const path = e.currentTarget.dataset.path;
      wx.switchTab({ url: path });
    },
  },
});
