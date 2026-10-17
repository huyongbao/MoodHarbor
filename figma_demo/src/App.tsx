import { useState } from "react";

type IconName =
  | "home"
  | "history"
  | "user"
  | "shield"
  | "headphones"
  | "chevron"
  | "trash"
  | "settings"
  | "play"
  | "pause"
  | "back"
  | "phone"
  | "book";

const iconPaths: Record<IconName, React.ReactNode> = {
  home: <><path d="M3 10.8 12 3l9 7.8" /><path d="M5.4 9.2V21h13.2V9.2M9.5 21v-6.5h5V21" /></>,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.2-5.7L3.5 8.5" /><path d="M3.5 4.5v4h4M12 7.5V12l3.2 2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
  shield: <><path d="M12 3 5.5 5.8v5.5c0 4.2 2.7 7.7 6.5 9.7 3.8-2 6.5-5.5 6.5-9.7V5.8L12 3Z" /><path d="m9 12 2 2 4-4" /></>,
  headphones: <><path d="M4 14v-3a8 8 0 0 1 16 0v3" /><path d="M6 13H4.8A1.8 1.8 0 0 0 3 14.8v2.4A1.8 1.8 0 0 0 4.8 19H7v-6H6ZM18 13h1.2a1.8 1.8 0 0 1 1.8 1.8v2.4a1.8 1.8 0 0 1-1.8 1.8H17v-6h1Z" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  trash: <><path d="M4 7h16M9 3h6l1 4H8l1-4ZM7 7l1 14h8l1-14M10 11v6M14 11v6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  play: <path d="m9 7 8 5-8 5V7Z" />,
  pause: <><path d="M9 7v10M15 7v10" /></>,
  back: <path d="m15 5-7 7 7 7" />,
  phone: <path d="M7.3 3.5 10 8 7.8 9.8a15 15 0 0 0 6.4 6.4L16 14l4.5 2.7-.9 3.4c-.2.7-.9 1.1-1.6 1A18 18 0 0 1 2.9 6c-.1-.7.3-1.4 1-1.6l3.4-.9Z" />,
  book: <><path d="M4 4h6a2 2 0 0 1 2 2v15a3 3 0 0 0-3-3H4V4ZM20 4h-6a2 2 0 0 0-2 2v15a3 3 0 0 1 3-3h5V4Z" /></>,
};

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7">
        {iconPaths[name]}
      </g>
    </svg>
  );
}

const Wave = ({ active = false }: { active?: boolean }) => (
  <div className={`wave ${active ? "wave-active" : ""}`} aria-hidden="true">
    {[10, 18, 26, 15, 32, 22, 12, 28, 19, 9, 24, 16].map((height, index) => (
      <i key={index} style={{ height }} />
    ))}
  </div>
);

function Companion() {
  return (
    <div className="companion-wrap" aria-label="你的数字心理疏导师，小愈">
      <div className="halo halo-one" />
      <div className="halo halo-two" />
      <div className="leaf leaf-left" />
      <div className="leaf leaf-right" />
      <div className="companion">
        <div className="hair-back" />
        <div className="neck" />
        <div className="body" />
        <div className="face">
          <div className="hair-front" />
          <span className="eye eye-left" />
          <span className="eye eye-right" />
          <span className="nose" />
          <span className="smile" />
          <span className="blush blush-left" />
          <span className="blush blush-right" />
        </div>
      </div>
      <span className="online-dot" />
    </div>
  );
}

const prompts = ["今天有点累", "被客户误解了", "我想安静一下"];

type View =
  | "guide"
  | "login"
  | "companionSelect"
  | "profileSetup"
  | "home"
  | "talk"
  | "history"
  | "historyDetail"
  | "profile"
  | "profileEdit"
  | "companionEdit"
  | "resources"
  | "hotlines";

const guidePages = [
  {
    step: "01",
    tag: "随时倾诉",
    title: "你的情绪，\n值得被认真听见",
    copy: "被催单、被误解、忙了一整天……不用硬扛。这里随时有人听你慢慢说。",
  },
  {
    step: "02",
    tag: "安心陪伴",
    title: "不评判，\n也不催你振作",
    copy: "语音、文字都可以。小愈会理解你的感受，陪你把心里的结一点点松开。",
  },
  {
    step: "03",
    tag: "安全守护",
    title: "难熬的时候，\n我们一起找帮助",
    copy: "所有倾诉都会加密保护。当你需要更多支持时，专业热线也会及时出现。",
  },
];

const companions = [
  { id: "xiaoyu", name: "小愈", trait: "温柔耐心", className: "avatar-warm", quote: "慢慢说，我一直在听" },
  { id: "amu", name: "阿沐", trait: "沉稳可靠", className: "avatar-calm", quote: "先歇口气，别一个人扛" },
  { id: "xiaoqing", name: "小晴", trait: "开朗亲切", className: "avatar-bright", quote: "今天也辛苦你了" },
];

function Portrait({ variant = "avatar-warm", large = false }: { variant?: string; large?: boolean }) {
  return (
    <div className={`portrait ${variant} ${large ? "portrait-large" : ""}`}>
      <span className="portrait-hair" />
      <span className="portrait-face"><i /><b /></span>
      <span className="portrait-body" />
    </div>
  );
}

function PageHeader({ title, onBack, action }: { title: string; onBack: () => void; action?: string }) {
  return (
    <header className="page-header">
      <button className="back-button" onClick={onBack} aria-label="返回"><Icon name="back" size={22} /></button>
      <strong>{title}</strong>
      {action ? <button className="text-action">{action}</button> : <span className="header-spacer" />}
    </header>
  );
}

export default function App() {
  const [view, setView] = useState<View>("guide");
  const [guideIndex, setGuideIndex] = useState(0);
  const [selectedCompanion, setSelectedCompanion] = useState("xiaoyu");
  const [age, setAge] = useState("28");
  const [gender, setGender] = useState("男");
  const [job, setJob] = useState("外卖骑手");
  const [recording, setRecording] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState("");
  const [playing, setPlaying] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);

  const activeCompanion = companions.find((item) => item.id === selectedCompanion) ?? companions[0];
  const showNav = ["home", "history", "profile"].includes(view);

  const setTab = (tab: "home" | "history" | "profile") => setView(tab);

  return (
    <main className="app-shell">
      <div className="phone">
        <div className="status-bar">
          <span>9:41</span>
          <div className="status-icons">
            <span className="signal">▮▮▮▮</span>
            <span className="wifi">⌁</span>
            <span className="battery"><i /></span>
          </div>
        </div>

        <section className={`screen ${!showNav ? "screen-full" : ""}`}>
          {view === "guide" && (
            <div className={`onboarding guide-theme-${guideIndex}`}>
              <button className="skip-button" onClick={() => setView("login")}>跳过</button>
              <div className="guide-visual">
                <span className="guide-number">{guidePages[guideIndex].step}</span>
                <div className="guide-orbit orbit-one" />
                <div className="guide-orbit orbit-two" />
                {guideIndex === 0 && (
                  <div className="rider-scene">
                    <span className="rider-helmet" />
                    <span className="rider-head" />
                    <span className="rider-body" />
                    <span className="rider-box">今日<br />已送 32 单</span>
                  </div>
                )}
                {guideIndex === 1 && <><Portrait variant="avatar-warm" large /><div className="sound-rings"><i /><i /><i /></div></>}
                {guideIndex === 2 && (
                  <div className="safe-visual">
                    <Icon name="shield" size={62} />
                    <span>对话加密</span>
                    <div className="safe-line" />
                  </div>
                )}
              </div>
              <div className="guide-content">
                <span className="guide-tag">{guidePages[guideIndex].tag}</span>
                <h1>{guidePages[guideIndex].title}</h1>
                <p>{guidePages[guideIndex].copy}</p>
                <div className="guide-dots">
                  {guidePages.map((_, index) => <i key={index} className={guideIndex === index ? "active" : ""} />)}
                </div>
                <button
                  className="primary-button"
                  onClick={() => guideIndex < 2 ? setGuideIndex(guideIndex + 1) : setView("login")}
                >
                  {guideIndex < 2 ? "下一步" : "开始使用"}
                  <Icon name="chevron" size={18} />
                </button>
              </div>
            </div>
          )}

          {view === "login" && (
            <div className="auth-view">
              <div className="brand-mark"><span /><i /></div>
              <p className="eyebrow">歇会儿</p>
              <h1>先歇一会儿，<br />这里可以放心说</h1>
              <p className="auth-copy">登录后，你的专属疏导师会记住你的偏好。所有对话都经过加密保护。</p>
              <div className="auth-promise">
                <span><Icon name="shield" size={18} />不公开身份</span>
                <span><Icon name="trash" size={18} />记录随时清除</span>
              </div>
              <div className="auth-actions">
                <button className="wechat-button" onClick={() => setView("companionSelect")}>
                  <span className="wechat-bubble">··</span>
                  微信一键登录
                </button>
                <p>登录即表示同意《用户协议》和《隐私政策》</p>
              </div>
            </div>
          )}

          {view === "companionSelect" && (
            <div className="setup-view">
              <div className="setup-progress"><i className="active" /><i /><span>1 / 2</span></div>
              <p className="eyebrow">选择你的陪伴者</p>
              <h1>想让谁听你说？</h1>
              <p className="setup-intro">凭第一感觉选就好，以后也能随时更换。</p>
              <div className="companion-options">
                {companions.map((item) => (
                  <button
                    className={selectedCompanion === item.id ? "selected" : ""}
                    key={item.id}
                    onClick={() => setSelectedCompanion(item.id)}
                  >
                    <Portrait variant={item.className} />
                    <span className="companion-option-copy">
                      <strong>{item.name}<small>{item.trait}</small></strong>
                      <p>“{item.quote}”</p>
                    </span>
                    <span className="radio-mark"><i /></span>
                  </button>
                ))}
              </div>
              <div className="sticky-actions">
                <button className="primary-button" onClick={() => setView("profileSetup")}>就选 {activeCompanion.name}<Icon name="chevron" size={18} /></button>
              </div>
            </div>
          )}

          {view === "profileSetup" && (
            <div className="setup-view">
              <div className="setup-progress"><i className="active" /><i className="active" /><span>2 / 2</span></div>
              <p className="eyebrow">让陪伴更懂你</p>
              <h1>简单认识一下</h1>
              <p className="setup-intro">只用于提供更贴合的回应，不会在任何地方公开。</p>
              <div className="form-block">
                <label>你的年龄</label>
                <div className="age-input">
                  <button onClick={() => setAge(String(Math.max(16, Number(age) - 1)))}>−</button>
                  <input value={age} onChange={(event) => setAge(event.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" />
                  <span>岁</span>
                  <button onClick={() => setAge(String(Math.min(70, Number(age) + 1)))}>＋</button>
                </div>
              </div>
              <div className="form-block">
                <label>你的性别</label>
                <div className="choice-grid gender-grid">
                  {["男", "女", "不便透露"].map((item) => <button className={gender === item ? "selected" : ""} onClick={() => setGender(item)} key={item}>{item}</button>)}
                </div>
              </div>
              <div className="form-block">
                <label>你的职业</label>
                <div className="choice-grid">
                  {["外卖骑手", "快递员", "网约车司机", "其他新就业形态"].map((item) => <button className={job === item ? "selected" : ""} onClick={() => setJob(item)} key={item}>{item}</button>)}
                </div>
              </div>
              <div className="sticky-actions">
                <button className="primary-button" onClick={() => setView("home")}>完成，进入树洞<Icon name="chevron" size={18} /></button>
                <p><Icon name="shield" size={13} />资料已加密，仅用于个性化陪伴</p>
              </div>
            </div>
          )}

          {view === "home" && (
            <div className="dashboard-view">
              <header className="dashboard-header">
                <div><p className="eyebrow">晚上好，骑手朋友</p><h1>今天辛苦了</h1></div>
                <button className="home-avatar" onClick={() => setView("profile")}><Portrait variant={activeCompanion.className} /></button>
              </header>
              <button className="continue-card" onClick={() => setView("talk")}>
                <div className="continue-copy">
                  <span className="live-pill"><i />{activeCompanion.name} 在线</span>
                  <h2>有话想说，就来坐一会儿</h2>
                  <p>不用组织语言，想到哪儿说到哪儿</p>
                  <span className="start-pill"><Icon name="headphones" size={20} />开始倾诉</span>
                </div>
                <div className="home-companion"><Portrait variant={activeCompanion.className} large /></div>
              </button>
              <div className="shift-note">
                <span className="shift-icon"><i /><b /></span>
                <div><strong>先照顾好自己，再继续出发</strong><p>短暂停靠时，请先确认车辆已停稳</p></div>
              </div>
              <div className="section-heading"><h2>快速帮助</h2><span>一步就能找到</span></div>
              <div className="quick-grid">
                <button onClick={() => setView("resources")}><span className="quick-icon breathe"><i /></span><strong>放松一下</strong><small>3 分钟舒缓紧绷</small></button>
                <button onClick={() => setView("history")}><span className="quick-icon memory"><Icon name="history" size={24} /></span><strong>继续上次</strong><small>回到昨晚的对话</small></button>
              </div>
              <button className="help-strip" onClick={() => setView("hotlines")}>
                <span className="help-icon"><Icon name="phone" size={20} /></span>
                <span><strong>现在特别难熬？</strong><small>专业援助热线随时在这里</small></span>
                <Icon name="chevron" size={17} />
              </button>
              <p className="home-safety"><Icon name="shield" size={14} />你的倾诉已加密保护，不会公开给他人</p>
            </div>
          )}

          {view === "talk" && (
            <div className="home-view">
              <header className="topbar">
                <button className="back-button" onClick={() => setView("home")} aria-label="返回首页"><Icon name="back" size={22} /></button>
                <div className="talk-title"><h1>和{activeCompanion.name}聊聊</h1><p><i />正在陪伴</p></div>
                <button className="privacy-pill" aria-label="隐私保护说明">
                  <Icon name="shield" size={15} />
                  <span>已加密</span>
                </button>
              </header>

              <div className="hero">
                <div className="aurora aurora-one" />
                <div className="aurora aurora-two" />
                <Companion />
                <div className="guide-copy">
                  <span className="guide-name">{activeCompanion.name}</span>
                  <span className="guide-state"><i /> 正在陪伴</span>
                </div>
                <div className="speech-card">
                  <p>{selectedPrompt ? `“${selectedPrompt}，我在听。”` : "“不用急，慢慢说。这里没有评判，只有倾听。”"}</p>
                </div>
              </div>

              <section className={`voice-panel ${recording ? "is-recording" : ""}`}>
                <div className="voice-title">
                  <div>
                    <span className="section-kicker">{recording ? "正在倾听" : `和${activeCompanion.name}聊聊`}</span>
                    <h2>{recording ? "说出此刻的感受" : "今天发生了什么？"}</h2>
                  </div>
                  <Wave active={recording} />
                </div>

                <button
                  className="record-button"
                  onClick={() => setRecording((value) => !value)}
                  type="button"
                >
                  <span className="record-ripple" />
                  <span className="record-core">
                    {recording ? <span className="stop-mark" /> : <Icon name="headphones" size={30} />}
                  </span>
                </button>
                <p className="record-hint">{recording ? "点击结束，我会认真听完" : "按住说话，也可以轻触开始"}</p>

                <div className="prompt-row">
                  {prompts.map((prompt) => (
                    <button
                      className={selectedPrompt === prompt ? "selected" : ""}
                      key={prompt}
                      onClick={() => setSelectedPrompt(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </section>

              <section className="resource-card">
                <button className="resource-play" onClick={() => setPlaying((value) => !value)}>
                  <Icon name={playing ? "pause" : "play"} size={20} />
                </button>
                <div className="resource-info">
                  <span>3 分钟放松练习</span>
                  <p>{playing ? "正在播放 · 跟随呼吸节奏" : "给紧绷的自己一点空间"}</p>
                </div>
                <div className={`mini-wave ${playing ? "playing" : ""}`}>
                  {[8, 14, 20, 11, 17].map((h, i) => <i key={i} style={{ height: h }} />)}
                </div>
              </section>
            </div>
          )}

          {view === "history" && (
            <div className="sub-view">
              <header className="sub-header">
                <div>
                  <p className="eyebrow">只属于你的角落</p>
                  <h1>倾诉记录</h1>
                </div>
                <button className="round-action" aria-label="清空倾诉记录"><Icon name="trash" size={19} /></button>
              </header>
              <div className="insight-card">
                <span className="insight-label">本周情绪天气</span>
                <div className="insight-main">
                  <div className="weather-mark"><i /><i /><i /></div>
                  <div><strong>多云转晴</strong><p>你已经连续 3 天照顾自己的感受</p></div>
                </div>
              </div>
              <div className="date-label">今天</div>
              {[
                ["被客户误解的一天", "小愈陪伴了你 12 分钟", "20:36"],
                ["跑完三十单，有点累", "完成了一次呼吸放松", "18:12"],
              ].map(([title, desc, time]) => (
                <button className="history-item" key={title} onClick={() => setView("historyDetail")}>
                  <span className="history-dot" />
                  <span className="history-copy"><strong>{title}</strong><small>{desc}</small></span>
                  <span className="history-time">{time}<Icon name="chevron" size={14} /></span>
                </button>
              ))}
              <div className="date-label">昨天</div>
              <button className="history-item">
                <span className="history-dot soft" />
                <span className="history-copy"><strong>终于结束忙碌的一天</strong><small>小愈陪伴了你 8 分钟</small></span>
                <span className="history-time">22:04<Icon name="chevron" size={14} /></span>
              </button>
              <p className="privacy-note"><Icon name="shield" size={15} />记录已加密保存，你可以随时清除</p>
            </div>
          )}

          {view === "historyDetail" && (
            <div className="detail-view">
              <PageHeader title="倾诉详情" onBack={() => setView("history")} action="删除" />
              <div className="detail-meta"><span>今天 20:36</span><i />共聊了 12 分钟</div>
              <div className="chat-day">已为你隐藏敏感信息</div>
              <div className="message user-message">今天又被客户投诉了，明明不是我的问题，这一单还白跑。</div>
              <div className="message ai-message"><strong>{activeCompanion.name}</strong>听起来真的很委屈。忙了一天还要承担不属于你的责任，换谁都会生气。</div>
              <div className="message user-message">就是觉得特别累，也没人能说。</div>
              <div className="message ai-message">现在你不用一个人憋着，我在这里。我们先一起慢慢呼吸，让肩膀松一点，好吗？</div>
              <button className="detail-resource" onClick={() => setView("resources")}><span><Icon name="play" size={18} /></span><div><strong>你完成了 3 分钟呼吸放松</strong><p>再次播放</p></div><Icon name="chevron" size={16} /></button>
              <p className="privacy-note"><Icon name="shield" size={15} />此记录已加密保存</p>
            </div>
          )}

          {view === "profile" && (
            <div className="sub-view">
              <header className="sub-header">
                <div><p className="eyebrow">照顾自己，从了解开始</p><h1>我的</h1></div>
                <button className="round-action" aria-label="设置"><Icon name="settings" size={19} /></button>
              </header>
              <div className="profile-card">
                <div className="profile-avatar"><span>林</span></div>
                <div><strong>夜行者 0836</strong><p>已安心相伴 28 天</p></div>
                <span className="profile-badge">平稳</span>
              </div>
              <h2 className="group-title">我的陪伴</h2>
              <button className="companion-card" onClick={() => setView("companionEdit")}>
                <Portrait variant={activeCompanion.className} />
                <span><strong>数字疏导师 · {activeCompanion.name}</strong><small>{activeCompanion.trait}地陪你慢慢说</small></span>
                <Icon name="chevron" size={17} />
              </button>
              <h2 className="group-title">个人与安全</h2>
              <div className="settings-list">
                {[
                  ["user", "基本信息", `${job} · ${age} 岁`, "profileEdit"],
                  ["book", "自助资源", "呼吸、放松与睡眠", "resources"],
                  ["headphones", "心理援助热线", "需要时，随时可用", "hotlines"],
                ].map(([icon, label, value, target]) => (
                  <button key={label} onClick={() => setView(target as View)}>
                    <span className="setting-icon"><Icon name={icon as IconName} size={19} /></span>
                    <span className="setting-label">{label}<small>{value}</small></span>
                    <Icon name="chevron" size={16} />
                  </button>
                ))}
              </div>
              <p className="disclaimer">歇会儿提供心理支持与陪伴，不替代专业医疗诊断。</p>
            </div>
          )}

          {view === "profileEdit" && (
            <div className="detail-view">
              <PageHeader title="基本信息" onBack={() => setView("profile")} action="保存" />
              <div className="edit-card">
                <div className="form-block"><label>年龄</label><div className="age-input"><button onClick={() => setAge(String(Math.max(16, Number(age) - 1)))}>−</button><input value={age} readOnly /><span>岁</span><button onClick={() => setAge(String(Math.min(70, Number(age) + 1)))}>＋</button></div></div>
                <div className="form-block"><label>性别</label><div className="choice-grid gender-grid">{["男", "女", "不便透露"].map((item) => <button className={gender === item ? "selected" : ""} onClick={() => setGender(item)} key={item}>{item}</button>)}</div></div>
                <div className="form-block"><label>职业</label><div className="choice-grid">{["外卖骑手", "快递员", "网约车司机", "其他新就业形态"].map((item) => <button className={job === item ? "selected" : ""} onClick={() => setJob(item)} key={item}>{item}</button>)}</div></div>
              </div>
              <p className="privacy-note"><Icon name="shield" size={15} />资料仅用于改善陪伴体验</p>
            </div>
          )}

          {view === "companionEdit" && (
            <div className="detail-view">
              <PageHeader title="更换陪伴者" onBack={() => setView("profile")} />
              <p className="setup-intro">选择让你最放松的声音与陪伴方式。</p>
              <div className="companion-options compact">
                {companions.map((item) => (
                  <button className={selectedCompanion === item.id ? "selected" : ""} key={item.id} onClick={() => setSelectedCompanion(item.id)}>
                    <Portrait variant={item.className} />
                    <span className="companion-option-copy"><strong>{item.name}<small>{item.trait}</small></strong><p>“{item.quote}”</p></span>
                    <span className="radio-mark"><i /></span>
                  </button>
                ))}
              </div>
              <button className="primary-button page-bottom-button" onClick={() => setView("profile")}>确认更换</button>
            </div>
          )}

          {view === "resources" && (
            <div className="detail-view resource-view">
              <PageHeader title="自助放松" onBack={() => setView(showNav ? "profile" : "home")} />
              <div className="resource-hero">
                <span>此刻推荐</span><h2>先做一次深呼吸</h2><p>不用赶时间，跟着节奏慢慢来</p>
                <button onClick={() => setPlaying(!playing)}><Icon name={playing ? "pause" : "play"} size={24} />{playing ? "暂停练习" : "开始 3 分钟练习"}</button>
              </div>
              <div className="section-heading"><h2>更多资源</h2><span>按你的状态选择</span></div>
              <div className="resource-list">
                {[["7 分钟", "下班后放松", "卸下忙碌一天的疲惫"], ["5 分钟", "缓解愤怒", "给情绪一个缓冲空间"], ["12 分钟", "安心入睡", "在温和引导中慢慢休息"]].map(([time, title, copy], index) => (
                  <button key={title}><span className={`resource-art art-${index + 1}`}><i /></span><div><small>{time}</small><strong>{title}</strong><p>{copy}</p></div><Icon name="play" size={18} /></button>
                ))}
              </div>
            </div>
          )}

          {view === "hotlines" && (
            <div className="detail-view hotline-view">
              <PageHeader title="心理援助" onBack={() => setView("home")} />
              <div className="hotline-intro"><Icon name="phone" size={30} /><div><h2>你不需要独自撑着</h2><p>以下热线由专业人员接听，可匿名倾诉。</p></div></div>
              <div className="hotline-list">
                {[["全国统一心理援助热线", "12356", "24 小时"], ["南京“宁师傅”热线", "025-96889910", "职工心理支持"], ["青少年服务热线", "12355", "心理与成长支持"]].map(([name, phone, label], index) => (
                  <div className="hotline-card" key={phone}><div><span>{index === 0 ? "优先推荐" : label}</span><strong>{name}</strong><b>{phone}</b></div><button aria-label={`拨打${name}`}><Icon name="phone" size={20} />拨打</button></div>
                ))}
              </div>
              <button className="emergency-link" onClick={() => setShowEmergency(true)}>我有伤害自己的想法，需要立即帮助</button>
              <p className="hotline-note">若正处于危险中，请立即拨打 110 或 120，或前往最近的医院急诊。</p>
            </div>
          )}
        </section>

        {showNav && <nav className="bottom-nav" aria-label="主导航">
          {[
            ["home", "home", "首页"],
            ["history", "history", "记录"],
            ["profile", "user", "我的"],
          ].map(([value, icon, label]) => (
            <button
              className={view === value ? "active" : ""}
              key={value}
              onClick={() => setTab(value as "home" | "history" | "profile")}
            >
              <span className="nav-icon"><Icon name={icon as IconName} size={22} /></span>
              <span>{label}</span>
            </button>
          ))}
        </nav>}
        {showEmergency && (
          <div className="modal-backdrop">
            <div className="emergency-modal" role="dialog" aria-modal="true">
              <span className="modal-shield"><Icon name="shield" size={28} /></span>
              <h2>先确保你现在是安全的</h2>
              <p>请放下可能伤害自己的物品，走到有人的地方。专业人员会陪你度过这一刻。</p>
              <button className="emergency-call"><Icon name="phone" size={20} />立即拨打 12356</button>
              <button className="emergency-call secondary">紧急危险：拨打 110 / 120</button>
              <button className="modal-close" onClick={() => setShowEmergency(false)}>我现在安全，返回热线列表</button>
            </div>
          </div>
        )}
        <div className="home-indicator" />
      </div>
    </main>
  );
}
