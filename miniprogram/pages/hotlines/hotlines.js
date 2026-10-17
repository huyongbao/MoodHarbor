const api = require("../../utils/api");

// 无号码渠道的呈现标签（按名称关键字匹配，未命中回落「支持渠道」）
const CHANNEL_TAGS = [
  { match: "公众号", icon: "chat-o", tag: "线上服务" },
  { match: "驿站", icon: "location-o", tag: "线下活动" },
];

Page({
  data: {
    hotlines: [],
    channels: [],
    showEmergency: false,
    // 紧急弹窗号码列表（Demo6 care 一级清单）
    emergencyLines: [
      { phone: "12356", label: "全国援助热线" },
      { phone: "110", label: "遇到危险 · 报警" },
      { phone: "120", label: "需要紧急医疗帮助" },
    ],
  },

  onLoad() {
    api.getHotlines().then((res) => {
      const all = res.data || [];
      const hasPhone = (h) => {
        const p = (h.phone || "").trim();
        return !!p && p !== "-";
      };
      this.setData({
        // 有号码的援助热线（可拨打/复制），置前
        hotlines: all.filter(hasPhone),
        // 无号码的援助机构（不提供拨打），集中在下方以渠道卡呈现
        channels: all
          .filter((h) => !hasPhone(h))
          .map((h) => {
            const t =
              CHANNEL_TAGS.find((x) => h.name.indexOf(x.match) >= 0) || {
                icon: "info-o",
                tag: "支持渠道",
              };
            return { ...h, icon: t.icon, tag: t.tag };
          }),
      });
    });
  },

  onCall(e) {
    wx.makePhoneCall({ phoneNumber: e.currentTarget.dataset.phone });
  },

  // Demo6「复制」：写入剪贴板（系统会自动提示“内容已复制”）
  onCopy(e) {
    wx.setClipboardData({ data: e.currentTarget.dataset.phone });
  },

  // 显式自伤求助入口（demo 亮点，行业最佳实践）
  onEmergency() {
    this.setData({ showEmergency: true });
  },
  onCloseEmergency() {
    this.setData({ showEmergency: false });
  },

  onBack() {
    wx.navigateBack();
  },
});
