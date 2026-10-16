// utils/mock.js —— 本地 Mock（严格按 PRD V6.3 接口契约）
// 后端就绪后 utils/config.js 里 USE_MOCK=false 即切换联调
// 含 PRD 十二章测试话术的关键词兜底规则，用于演示四级干预前端表现

const ok = (data) => ({ code: 0, message: "success", data });

// ---- 本地存储辅助 ----
function store(key, fallback) {
  const v = wx.getStorageSync(key);
  if (v === "" || v === undefined || v === null) {
    wx.setStorageSync(key, fallback);
    return fallback;
  }
  return v;
}

const digitalHumans = [
  { id: "dh_01", name: "小愈", trait: "温柔耐心", avatarUrl: "", prompt: "共情倾听型", status: 1, className: "warm" },
  { id: "dh_02", name: "阿沐", trait: "沉稳可靠", avatarUrl: "", prompt: "稳定支持型", status: 1, className: "calm" },
  { id: "dh_03", name: "小晴", trait: "开朗亲切", avatarUrl: "", prompt: "积极陪伴型", status: 1, className: "bright" },
];

const hotlines = [
  { id: "hl_01", name: "全国统一心理援助热线", phone: "12356", description: "优先推荐 · 24 小时", level: 1 },
  { id: "hl_02", name: "南京“宁师傅”热线", phone: "025-96889910", description: "职工心理支持", level: 2 },
  { id: "hl_03", name: "青少年服务热线", phone: "12355", description: "心理与成长支持", level: 2 },
];

const selfHelp = [
  { id: "sh_01", title: "3 分钟呼吸放松", type: "audio", duration: "3 分钟", desc: "给紧绷的自己一点空间" },
  { id: "sh_02", title: "下班后放松", type: "audio", duration: "7 分钟", desc: "卸下忙碌一天的疲惫" },
  { id: "sh_03", title: "缓解愤怒", type: "audio", duration: "5 分钟", desc: "给情绪一个缓冲空间" },
  { id: "sh_04", title: "安心入睡", type: "audio", duration: "12 分钟", desc: "在温和引导中慢慢休息" },
];

// ---- 风险分级规则引擎（演示用兜底，正式由后端 EmoLLM 输出）----
// 规则参考 PRD 十二章测试话术样例集
const RISK_RULES = [
  { level: 1, words: ["遗书", "跳下去", "自杀", "不想活", "轻生"] },
  { level: 2, words: ["没意思", "撑不住", "熬不下去", "崩溃", "绝望", "没合眼"] },
  { level: 3, words: ["气死", "投诉", "罚款", "累", "委屈", "白跑", "误解"] },
];

function judgeRisk(text) {
  for (const rule of RISK_RULES) {
    if (rule.words.some((w) => text && text.indexOf(w) > -1)) return rule.level;
  }
  return 4;
}

const REPLIES = {
  1: "我听到了你此刻的痛。你先深呼吸，我在这里陪着你。这条热线那头是专业人员，他们会像我现在一样认真地听你说，现在就拨打好吗？",
  2: "听起来这段时间把你压得很沉。先别急着振作，允许自己撑不住，我们一起慢慢来。如果愿意，12356 那头有专业的人随时接住你。",
  3: "被这样对待真的会很难受，换谁都会委屈。你已经辛苦一整天了，先松口气，我们做个小小的呼吸练习好吗？",
  4: "辛苦了，忙了一天还记得来说说话，这很好。慢慢说，我在听。",
};

function buildIntervention(level) {
  if (level === 1) {
    return { type: "emergency", hotline: hotlines[0], selfHelp: [] };
  }
  if (level === 2) {
    return { type: "hotline", hotline: hotlines[0], selfHelp: [] };
  }
  if (level === 3) {
    return { type: "normal", hotline: null, selfHelp: [selfHelp[0], selfHelp[2]] };
  }
  return { type: "normal", hotline: null, selfHelp: [] };
}

const ACTIONS = { 1: "emergency", 2: "worry", 3: "comfort", 4: "listen" };

// ---- 会话存储 ----
function seedConversations() {
  return store("mock_conversations", [
    {
      id: "c_001",
      title: "被客户误解的一天",
      desc: "小愈陪伴了你 12 分钟",
      time: "今天 20:36",
      createdAt: Date.now(),
    },
    {
      id: "c_002",
      title: "跑完三十单，有点累",
      desc: "完成了一次呼吸放松",
      time: "今天 18:12",
      createdAt: Date.now() - 86400000 / 3,
    },
  ]);
}

function seedMessages(cid) {
  const key = "mock_messages_" + cid;
  const seed = [
    { role: "user", content: "今天又被客户投诉了，明明不是我的问题，这一单还白跑。", riskLevel: 3 },
    { role: "ai", content: "听起来真的很委屈。忙了一天还要承担不属于你的责任，换谁都会生气。" },
    { role: "user", content: "就是觉得特别累，也没人能说。", riskLevel: 4 },
    { role: "ai", content: "现在你不用一个人憋着，我在这里。我们先一起慢慢呼吸，让肩膀松一点，好吗？" },
  ];
  return store(key, seed);
}

// ---- Mock 路由 ----
function handle(path, method, data, resolve) {
  // 登录
  if (path === "/auth/wechat-login" && method === "POST") {
    const token = "mock-token-" + Date.now();
    wx.setStorageSync("token", token);
    setTimeout(() => resolve(ok({ token, userId: "u_mock" })), 200);
    return;
  }

  // 初始化状态（PRD 5.3）
  if (path === "/user/init-status" && method === "GET") {
    const profileDone = store("mock_profile_done", false);
    const dhChosen = store("mock_dh_chosen", false);
    resolve(ok({ digitalHumanSelected: dhChosen, profileCompleted: profileDone }));
    return;
  }

  // 数字人列表
  if (path === "/digital-humans" && method === "GET") {
    resolve(ok(digitalHumans));
    return;
  }

  // 保存数字人
  if (path === "/user/digital-human" && method === "POST") {
    wx.setStorageSync("mock_dh_chosen", true);
    wx.setStorageSync("mock_dh_id", data.digitalHumanId);
    resolve(ok({ digitalHumanId: data.digitalHumanId }));
    return;
  }

  // 用户资料
  if (path === "/user/profile") {
    if (method === "GET") {
      const profile = store("mock_profile", {
        age: "28",
        gender: "男",
        occupation: "外卖骑手",
      });
      resolve(ok(profile));
      return;
    }
    // PUT 幂等（V6.2）
    wx.setStorageSync("mock_profile", data);
    wx.setStorageSync("mock_profile_done", true);
    resolve(ok(data));
    return;
  }

  // 创建会话
  if (path === "/conversations" && method === "POST") {
    const list = seedConversations();
    const conv = {
      id: "c_" + Date.now(),
      title: "新的倾诉",
      desc: "",
      time: "刚刚",
      createdAt: Date.now(),
    };
    list.unshift(conv);
    wx.setStorageSync("mock_conversations", list);
    wx.setStorageSync("mock_messages_" + conv.id, []);
    resolve(ok({ conversationId: conv.id }));
    return;
  }

  // 对话
  if (path === "/chat/completions" && method === "POST") {
    const inputTypes = data.inputTypes || ["text"];
    const text = data.text || "";
    const level = judgeRisk(text);
    const reply = {
      replyText: REPLIES[level],
      digitalHumanAction: ACTIONS[level],
      riskLevel: level,
      intervention: buildIntervention(level),
    };
    // 写入本地会话
    const cid = data.conversationId;
    if (cid) {
      const key = "mock_messages_" + cid;
      const msgs = wx.getStorageSync(key) || [];
      msgs.push({ role: "user", content: text || "[语音/表情输入]", riskLevel: level });
      msgs.push({ role: "ai", content: reply.replyText });
      wx.setStorageSync(key, msgs);
    }
    setTimeout(() => resolve(ok(reply)), 600);
    return;
  }

  // 记录列表
  if (path === "/conversations" && method === "GET") {
    resolve(ok(seedConversations()));
    return;
  }

  // 对话详情
  const detailMatch = path.match(/^\/conversations\/(.+)$/);
  if (detailMatch && method === "GET") {
    resolve(ok(seedMessages(detailMatch[1])));
    return;
  }

  // 删除 / 一键清除（V6.1：清除含向量记忆，前端提示文案已体现）
  if (detailMatch && method === "DELETE") {
    const id = detailMatch[1];
    if (id === "all") {
      const list = seedConversations();
      list.forEach((c) => wx.removeStorageSync("mock_messages_" + c.id));
      wx.setStorageSync("mock_conversations", []);
      resolve(ok({ cleared: "conversations+memories" }));
    } else {
      wx.removeStorageSync("mock_messages_" + id);
      const list = seedConversations().filter((c) => c.id !== id);
      wx.setStorageSync("mock_conversations", list);
      resolve(ok({ deleted: id }));
    }
    return;
  }

  // 热线
  if (path === "/hotlines" && method === "GET") {
    resolve(ok(hotlines));
    return;
  }

  // 自助资源
  if (path === "/self-help" && method === "GET") {
    resolve(ok(selfHelp));
    return;
  }

  // 预警
  if (path === "/risk-alerts" && method === "POST") {
    resolve(ok({ alertId: "ra_" + Date.now(), status: "pending" }));
    return;
  }

  // 未命中
  resolve({ code: 404, message: "Mock 未覆盖该接口: " + method + " " + path, data: null });
}

module.exports = { handle };
