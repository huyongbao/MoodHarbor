import { useEffect, useRef, useState } from "react"
import { Avatar, BrandArt, Icon } from "./components/Artwork"
import Modal from "./components/Modal"
import {
  Conversation,
  loadState,
  Message,
  occupations,
  partners,
  Profile,
  replies,
  scenarioNames,
  State,
  STORAGE_KEY,
  stories,
  topics,
  uid,
} from "./lib/data"

type Page = {
  name: "home" | "records" | "mine" | "partners" | "profile" | "chat" | "breath" | "stories" | "story"
  id?: string
  topic?: string
  voice?: boolean
  index?: number
  edit?: boolean
}
type Popup = "privacy" | "hotlines" | "scenarios" | "images" | "voice" | "delete" | "clear" | "call" | "care" | null
const boot = loadState()

export default function App() {
  const [state, setState] = useState<State>(boot.state)
  const [stack, setStack] = useState<Page[]>([{ name: "home" }])
  const page = stack[stack.length - 1]
  const [popup, setPopup] = useState<Popup>(null)
  const [toast, setToast] = useState(boot.warning)
  const [pendingEntry, setPendingEntry] = useState<{
    topic?: string
    voice?: boolean
  }>({})
  const [draftPartner, setDraftPartner] = useState(state.partner)
  const [draftProfile, setDraftProfile] = useState({
    age: state.profile?.age.toString() || "",
    gender: state.profile?.gender || "不愿透露",
    occupation: state.profile?.occupation || "",
  })
  const [errors, setErrors] = useState(false)
  const [text, setText] = useState("")
  const [media, setMedia] = useState("")
  const [audio, setAudio] = useState(false)
  const [pending, setPending] = useState<string[]>([])
  const [failed, setFailed] = useState<{ id: string; level: number } | null>(
    null,
  )
  const [failNext, setFailNext] = useState(false)
  const [level, setLevel] = useState(4)
  const [careLevel, setCareLevel] = useState(2)
  const [countdown, setCountdown] = useState(0)
  const [callNumber, setCallNumber] = useState("")
  const callReturn = useRef<Popup>("hotlines")
  const [deleteId, setDeleteId] = useState("")
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [breathSeconds, setBreathSeconds] = useState(0)
  const [breathing, setBreathing] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const endRef = useRef<HTMLDivElement>(null)
  const currentPage = useRef(page)
  const currentState = useRef(state)
  currentPage.current = page
  currentState.current = state
  const partner = partners.find((p) => p.id === state.partner)!
  const conversation = state.conversations.find((c) => c.id === page.id)
  const root = ["home", "records", "mine"].includes(page.name)
  const go = (p: Page) => setStack((s) => [...s, p])
  const back = () => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : [{ name: "home" }]))
    setMedia("")
    setText("")
    setAudio(false)
    setRecording(false)
    setPopup(null)
  }
  const tab = (name: "home" | "records" | "mine") => {
    setStack([{ name }])
    setText("")
    setMedia("")
    setAudio(false)
  }
  const closePopup = () => {
    if (popup === "call") {
      setPopup(callReturn.current)
      return
    }
    setPopup(null)
    setRecording(false)
  }

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      setToast("本次内容暂时无法保存，刷新后可能丢失。")
    }
  }, [state])
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4200)
      return () => clearTimeout(t)
    }
  }, [toast])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [conversation?.messages.length, pending.length])
  useEffect(() => {
    if (!recording || popup !== "voice") return
    const t = setInterval(() => setRecordSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [recording, popup])
  useEffect(() => {
    if (!countdown) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])
  useEffect(() => {
    if (page.name !== "breath") {
      setBreathing(false)
      return
    }
    if (!breathing) return
    const t = setInterval(
      () =>
        setBreathSeconds((s) => {
          if (s >= 59) {
            setBreathing(false)
            return 60
          }
          return s + 1
        }),
      1000,
    )
    return () => clearInterval(t)
  }, [page.name, breathing])

  function startChat(topic?: string, voice = false) {
    setText("")
    setMedia("")
    setAudio(false)
    setLevel(4)
    setFailed(null)
    if (!state.profile) {
      setPendingEntry({ topic, voice })
      setDraftPartner(state.partner)
      setErrors(false)
      go({ name: "partners" })
      return
    }
    go({ name: "chat", id: uid(), topic, voice })
    if (voice) {
      setRecordSeconds(0)
      setPopup("voice")
    }
  }
  function saveProfile() {
    const age = Number(draftProfile.age)
    if (
      !Number.isInteger(age) ||
      age < 1 ||
      age > 120 ||
      !draftProfile.occupation
    ) {
      setErrors(true)
      return
    }
    const profile: Profile = {
      age,
      gender: draftProfile.gender,
      occupation: draftProfile.occupation,
    }
    setState((s) => ({
      ...s,
      profile,
      partner: page.edit ? s.partner : draftPartner,
    }))
    if (page.edit) {
      back()
      setToast("基本信息已保存")
    } else {
      setStack((s) => [
        ...s.slice(0, -2),
        { name: "chat", id: uid(), ...pendingEntry },
      ])
      if (pendingEntry.voice) {
        setRecordSeconds(0)
        setPopup("voice")
      }
    }
  }
  function requestReply(id: string, chosenLevel: number, shouldFail = false) {
    setPending((p) => [...p, id])
    const replyingPartner = state.partner
    const timer = setTimeout(() => {
      setPending((p) => p.filter((x) => x !== id))
      if (!currentState.current.conversations.some((c) => c.id === id)) return
      if (shouldFail) {
        setFailed({ id, level: chosenLevel })
        return
      }
      const reply: Message = {
        id: uid(),
        role: "assistant",
        content: replies[chosenLevel - 1],
        partner: replyingPartner,
        time: Date.now(),
        level: chosenLevel,
      }
      setState((s) => ({
        ...s,
        conversations: s.conversations.map((c) =>
          c.id === id
            ? { ...c, time: Date.now(), messages: [...c.messages, reply] }
            : c,
        ),
      }))
      if (chosenLevel <= 2 && currentPage.current.id === id) {
        setCareLevel(chosenLevel)
        setCountdown(chosenLevel === 1 ? 5 : 0)
        setPopup("care")
      }
    }, 850)
    timers.current.push(timer)
  }
  function send(override?: string, forcedLevel?: number) {
    const content = (override ?? text).trim()
    if ((!content && !media) || pending.includes(page.id!)) return
    const id = page.id!
    const message: Message = {
      id: uid(),
      role: "user",
      content: content || "想和你分享这个场景",
      partner: state.partner,
      time: Date.now(),
      media: media || undefined,
      audio,
    }
    setState((s) => {
      const exists = s.conversations.some((c) => c.id === id)
      const c: Conversation = {
        id,
        title: page.topic || content.slice(0, 18) || "聊聊路上的事",
        time: Date.now(),
        messages: [message],
      }
      return {
        ...s,
        conversations: exists
          ? s.conversations.map((c) =>
              c.id === id
                ? { ...c, time: Date.now(), messages: [...c.messages, message] }
                : c,
            )
          : [c, ...s.conversations],
      }
    })
    setText("")
    setMedia("")
    setAudio(false)
    setFailed(null)
    requestReply(id, forcedLevel || level, failNext)
    setFailNext(false)
    setLevel(4)
  }
  function openProfile() {
    setDraftProfile({
      age: state.profile?.age.toString() || "",
      gender: state.profile?.gender || "不愿透露",
      occupation: state.profile?.occupation || "",
    })
    setErrors(false)
    go({ name: "profile", edit: true })
  }
  const header = (
    title: string,
    subtitle?: string,
    action?: React.ReactNode,
  ) => (
    <header className="page-header">
      <button className="icon-button" aria-label="返回" onClick={back}>
        <Icon name="back" />
      </button>
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action || <span className="header-spacer" />}
    </header>
  )
  const button = (label: string, onClick: () => void, secondary = false) => (
    <button
      className={secondary ? "button secondary" : "button primary"}
      onClick={onClick}
    >
      {label}
    </button>
  )

  return (
    <div className={`app-shell ${state.dark ? "dark" : ""}`}>
      <main className={`${root ? "with-tabs" : ""} page-${page.name}`}>
        {page.name === "home" && (
          <div className="home">
            <div className="home-topline">
              <span className="wordmark">
                <span className="brand-dot" />
                路上的情绪补给站
              </span>
              <button
                className="home-help"
                onClick={() => setPopup("privacy")}
                aria-label="了解歇会儿"
              >
                <Icon name="info" size={19} />
              </button>
            </div>
            <section className="home-brand">
              <div className="brand-eyebrow">TAKE A LITTLE BREAK</div>
              <h1>
                歇会儿<span className="title-period">。</span>
              </h1>
              <p>先停一分钟，心里别硬扛</p>
            </section>
            <section className="hero-art" aria-label="选择想聊的话题">
              <div className="hero-orbit orbit-one" />
              <div className="hero-orbit orbit-two" />
              <BrandArt />
              {topics.map((topic, i) => (
                <button
                  className={`topic-bubble bubble-${i}`}
                  key={topic}
                  onClick={() => startChat(topic)}
                >
                  {topic}
                  <span />
                </button>
              ))}
              <div className="hero-caption">
                <span />
                这一站，为自己停一下
                <span />
              </div>
            </section>
            <div className="home-cards">
              <section className="talk-card">
                <div className="talk-card-top">
                  <span className="mini-label">
                    <span />
                    随时想说，随时都在
                  </span>
                  <Icon name="chat" size={23} />
                </div>
                <h2>今天遇到什么事？</h2>
                <p>不必一个人消化，来这儿说说。</p>
                <button
                  className="button primary talk-cta"
                  onClick={() => startChat()}
                >
                  <Icon name="chat" size={22} />
                  我想聊聊
                  <Icon name="arrow" size={20} />
                </button>
              </section>
              <section className="feature-card">
                {[
                  ["mic", "语音说说", "开口就轻松"],
                  ["breath", "呼吸一下", "跟着慢慢来"],
                  ["story", "同行故事", "有人和你懂"],
                ].map(([icon, title, desc], i) => (
                  <button
                    key={title}
                    onClick={() =>
                      i === 0
                        ? startChat(undefined, true)
                        : i === 1
                          ? (setBreathSeconds(0), go({ name: "breath" }))
                          : go({ name: "stories" })
                    }
                  >
                    <span className={`feature-icon feature-${i}`}>
                      <Icon name={icon} size={30} />
                    </span>
                    <strong>{title}</strong>
                    <span>{desc}</span>
                  </button>
                ))}
              </section>
              <div className="home-bottom">
                <Icon name="shield" size={15} />
                <span>先停稳车，再安心聊。</span>
              </div>
              <button className="demo-link" onClick={() => setPopup("privacy")}>
                纯前端演示 · 了解隐私与使用说明
                <Icon name="arrow" size={12} />
              </button>
            </div>
          </div>
        )}

        {page.name === "partners" && (
          <>
            {header(page.edit ? "换一位聊天伙伴" : "找个合拍的伙伴")}
            <div className="content">
              <div className="step-label">
                {page.edit ? "你的倾听搭子" : "第 1 步 / 共 2 步"}
                <span className="step-track">
                  <i />
                  <i className={page.edit ? "filled" : ""} />
                </span>
              </div>
              <h2 className="section-title">你想和谁聊聊？</h2>
              <p className="muted intro">没有标准答案，选一个让你自在的。</p>
              <div className="partner-list">
                {partners.map((p) => (
                  <button
                    className={`partner-card ${
                      draftPartner === p.id ? "selected" : ""
                    }`}
                    key={p.id}
                    onClick={() => setDraftPartner(p.id)}
                  >
                    <Avatar id={p.id} portrait />
                    <div>
                      <h3>
                        {p.name}
                        <span>{p.title}</span>
                      </h3>
                      <p>{p.description}</p>
                      <small>{p.tag}</small>
                    </div>
                    <span className="radio">
                      {draftPartner === p.id && <Icon name="check" size={14} />}
                    </span>
                  </button>
                ))}
              </div>
              <div className="info-note">
                <Icon name="info" size={18} />
                <p>
                  伙伴是演示形象，未连接真人或数字人服务。你说的话，不需要完美。
                </p>
              </div>
              {button(page.edit ? "就选这位伙伴" : "下一步", () => {
                if (page.edit) {
                  setState((s) => ({ ...s, partner: draftPartner }))
                  back()
                  setToast("聊天伙伴已更换")
                } else go({ name: "profile" })
              })}
            </div>
          </>
        )}

        {page.name === "profile" && (
          <>
            {header(page.edit ? "基本信息" : "简单认识一下")}
            <div className="content">
              <div className="step-label">
                {page.edit ? "只保存在这台设备" : "第 2 步 / 共 2 步"}
                <span className="step-track">
                  <i />
                  <i className="filled" />
                </span>
              </div>
              <h2 className="section-title">
                怎么称呼都行，
                <br />
                自在最重要。
              </h2>
              <p className="muted intro">简单了解你，让这段陪伴更合拍。</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  saveProfile()
                }}
                className="profile-form"
              >
                <label>
                  年龄 <span className="required">*</span>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    step="1"
                    value={draftProfile.age}
                    onChange={(e) =>
                      setDraftProfile((p) => ({ ...p, age: e.target.value }))
                    }
                    placeholder="请输入演示年龄"
                  />
                  {errors &&
                    (!Number.isInteger(Number(draftProfile.age)) ||
                      Number(draftProfile.age) < 1 ||
                      Number(draftProfile.age) > 120) && (
                      <small className="error">请输入 1–120 之间的整数</small>
                    )}
                </label>
                <fieldset>
                  <legend>性别</legend>
                  <div className="choice-row">
                    {["男", "女", "不愿透露"].map((g) => (
                      <button
                        key={g}
                        type="button"
                        className={
                          draftProfile.gender === g ? "choice active" : "choice"
                        }
                        onClick={() =>
                          setDraftProfile((p) => ({ ...p, gender: g }))
                        }
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>
                    职业 <span className="required">*</span>
                  </legend>
                  <div className="occupation-grid">
                    {occupations.map((o) => (
                      <button
                        key={o}
                        type="button"
                        className={
                          draftProfile.occupation === o
                            ? "choice active"
                            : "choice"
                        }
                        onClick={() =>
                          setDraftProfile((p) => ({ ...p, occupation: o }))
                        }
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                  {errors && !draftProfile.occupation && (
                    <small className="error">请选择一个职业</small>
                  )}
                </fieldset>
                <div className="info-note">
                  <Icon name="shield" size={19} />
                  <p>
                    仅用于本机原型演示，请勿填写真实敏感信息。不接入微信登录。
                  </p>
                </div>
                <button className="button primary" type="submit">
                  {page.edit ? "保存信息" : "开始聊聊"}
                </button>
              </form>
            </div>
          </>
        )}

        {page.name === "chat" && (
          <div className="chat-page">
            {header(
              partner.name,
              "演示伙伴 · 慢慢说，我在听",
              <button
                className="icon-button"
                aria-label="聊天演示菜单"
                onClick={() => setPopup("scenarios")}
              >
                <Icon name="more" />
              </button>,
            )}
            <div className="chat-scroll">
              <div className="companion-banner">
                <Avatar id={state.partner} portrait />
                <div>
                  <strong>
                    {pending.includes(page.id!)
                      ? "正在回复…"
                      : "路上辛苦了，先歇一会儿。"}
                  </strong>
                  <p>不评判，不催促，陪你慢慢说。</p>
                </div>
              </div>
              <div className="chat-date">今天 · 这一刻，留给自己</div>
              <div className="message assistant">
                <Avatar id={state.partner} />
                <div className="message-body">
                  <span className="message-name">
                    {partner.name} · 演示伙伴
                  </span>
                  <div className="message-bubble">
                    嗨，我是{partner.name}。先把车停稳，喝口水吧。
                    {page.topic ? `关于“${page.topic}”，` : ""}
                    有什么想说的，咱们慢慢聊。
                  </div>
                </div>
              </div>
              {!conversation?.messages.length && (
                <div className="quick-topics">
                  {(page.topic
                    ? [
                        `想聊聊${page.topic}`,
                        "今天跑单有点累",
                        "我就是想找人说说话",
                      ]
                    : [
                        "今天跑单有点累",
                        "遇到差评，心里挺委屈",
                        "我就是想找人说说话",
                      ]
                  ).map((t) => (
                    <button key={t} onClick={() => send(t)}>
                      {t}
                      <Icon name="arrow" size={15} />
                    </button>
                  ))}
                </div>
              )}
              {conversation?.messages.map((m) => (
                <div key={m.id} className={`message ${m.role}`}>
                  {m.role === "assistant" && <Avatar id={m.partner} />}
                  <div className="message-body">
                    {m.role === "assistant" && (
                      <span className="message-name">
                        {partners.find((p) => p.id === m.partner)?.name ||
                          "伙伴"}{" "}
                        · 预设回复
                      </span>
                    )}
                    <div className="message-bubble">
                      {m.audio && (
                        <div className="media-label">
                          <Icon name="mic" size={15} />
                          模拟转写
                        </div>
                      )}
                      {m.media && (
                        <div className="demo-media">
                          <Icon name="image" size={27} />
                          <span>{m.media} · 场景插画演示</span>
                        </div>
                      )}
                      {m.content}
                    </div>
                    {m.level === 3 && (
                      <button
                        className="resource-card"
                        onClick={() => {
                          setBreathSeconds(0)
                          go({ name: "breath" })
                        }}
                      >
                        <span>
                          <Icon name="breath" size={24} />
                        </span>
                        <div>
                          <strong>跟着呼吸，松一口气</strong>
                          <small>1 分钟 · 给自己缓冲一下</small>
                        </div>
                        <Icon name="arrow" size={17} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {pending.includes(page.id!) && (
                <div className="typing">
                  <span />
                  <span />
                  <span />
                  <small>{partner.name}正在回复</small>
                </div>
              )}
              {failed?.id === page.id && (
                <div className="retry-card">
                  模拟回复失败，不是你的问题。
                  <button
                    onClick={() => {
                      const current = failed
                      if (!current) return
                      requestReply(current.id, current.level)
                      setFailed(null)
                    }}
                  >
                    重试
                  </button>
                </div>
              )}
              <div ref={endRef} />
            </div>
            <div className="chat-composer">
              <div className="chat-disclaimer">
                回复为预设演示，不提供诊断或紧急救援
              </div>
              {media && (
                <div className="attachment">
                  <Icon name="image" size={18} />
                  {media}
                  <button onClick={() => setMedia("")} aria-label="移除图片">
                    <Icon name="close" size={16} />
                  </button>
                </div>
              )}
              {audio && (
                <div className="attachment">
                  <Icon name="mic" size={16} />
                  模拟语音转写
                  <button
                    onClick={() => {
                      setAudio(false)
                      setText("")
                    }}
                    aria-label="移除模拟语音"
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              )}
              <form
                className="input-row"
                onSubmit={(e) => {
                  e.preventDefault()
                  send()
                }}
              >
                <input
                  aria-label="想说的话"
                  value={text}
                  maxLength={500}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="想说什么，都可以…"
                />
                <button
                  type="submit"
                  className="send-button"
                  aria-label="发送消息"
                  disabled={
                    (!text.trim() && !media) || pending.includes(page.id!)
                  }
                >
                  <Icon name="send" size={21} />
                </button>
              </form>
              <div className="composer-tools">
                <button
                  onClick={() => {
                    setRecordSeconds(0)
                    setPopup("voice")
                  }}
                >
                  <Icon name="mic" size={20} />
                  语音演示
                </button>
                <button onClick={() => setPopup("images")}>
                  <Icon name="image" size={20} />
                  图片演示
                </button>
                <button className="end-chat" onClick={() => tab("records")}>
                  结束本次聊天
                </button>
              </div>
            </div>
          </div>
        )}

        {page.name === "breath" && (
          <>
            {header("呼吸一下", "这一分钟，不用赶路")}
            <div className="breath-content">
              <div className="safety-note">
                <Icon name="shield" size={17} />
                请先停稳车辆，在安全的地方练习
              </div>
              <span className="mini-label teal">给自己一点喘息的时间</span>
              <h2>
                {breathSeconds === 60
                  ? "缓过来一点了吗？"
                  : !breathing && breathSeconds === 0
                    ? "先松松肩，慢慢来。"
                    : breathing
                      ? breathSeconds % 10 < 4
                        ? "用鼻子，慢慢吸气"
                        : "用嘴巴，轻轻呼气"
                      : "歇一下，随时继续。"}
              </h2>
              <div
                className={`breath-visual ${breathing ? "running" : ""} ${
                  breathSeconds % 10 >= 4 ? "exhale" : ""
                }`}
              >
                <div className="breath-ring ring-outer" />
                <div className="breath-ring ring-inner" />
                <div className="breath-core">
                  <Icon
                    name={breathSeconds === 60 ? "check" : "breath"}
                    size={42}
                  />
                  <strong>
                    {breathSeconds === 60
                      ? "做得很好"
                      : breathing
                        ? breathSeconds % 10 < 4
                          ? "吸气"
                          : "呼气"
                        : "慢下来"}
                  </strong>
                  <span>
                    {breathSeconds === 60
                      ? "这一分钟，属于你"
                      : breathing
                        ? `${
                            breathSeconds % 10 < 4
                              ? 4 - (breathSeconds % 10)
                              : 10 - (breathSeconds % 10)
                          } 秒`
                        : "跟着自己的节奏"}
                  </span>
                </div>
              </div>
              <div className="breath-progress">
                <span>吸气 4 秒 · 呼气 6 秒</span>
                <strong>
                  {breathSeconds === 60
                    ? "6 / 6 轮完成"
                    : `第 ${Math.min(6, Math.floor(breathSeconds / 10) + 1)} / 6 轮 · 剩余 ${60 - breathSeconds} 秒`}
                </strong>
                <div className="progress-track">
                  <span style={{ width: `${(breathSeconds / 60) * 100}%` }} />
                </div>
              </div>
              {breathSeconds === 60 ? (
                <>
                  {button("回去聊聊", () =>
                    stack[stack.length - 2]?.name === "chat"
                      ? back()
                      : startChat(),
                  )}
                  {button("回首页", () => tab("home"), true)}
                </>
              ) : (
                <>
                  {button(
                    breathing
                      ? "暂停一下"
                      : breathSeconds
                        ? "继续练习"
                        : "开始 · 一分钟呼吸",
                    () => setBreathing((b) => !b),
                  )}
                  <button
                    className="text-button"
                    onClick={() => {
                      setBreathSeconds(0)
                      setBreathing(false)
                    }}
                  >
                    <Icon name="refresh" size={16} />
                    重新开始
                  </button>
                </>
              )}
              <p className="breath-footnote">
                不用憋气，也不用刻意用力。
                <br />
                如果感到不适，停下来正常呼吸就好。
              </p>
            </div>
          </>
        )}

        {page.name === "stories" && (
          <>
            {header("同行故事", "路上的心事，不止你一个")}
            <div className="content">
              <div className="story-intro">
                <Icon name="story" size={36} />
                <h2>不同的路，相似的心事。</h2>
                <p>坐下来，听听同行怎么说。</p>
              </div>
              <div className="story-list">
                {stories.map((s, i) => (
                  <button
                    className="story-card"
                    key={s.title}
                    onClick={() => go({ name: "story", index: i })}
                  >
                    <div className={`story-art story-art-${i}`}>
                      <Icon
                        name={["shield", "chat", "heart", "moon"][i]}
                        size={37}
                      />
                      <span>0{i + 1}</span>
                    </div>
                    <div className="story-card-text">
                      <span className="story-category">
                        {s.category} · {s.time}
                      </span>
                      <h3>{s.title}</h3>
                      <p>{s.lead}</p>
                    </div>
                    <Icon name="arrow" size={17} />
                  </button>
                ))}
              </div>
              <p className="page-footnote">
                故事为本地演示内容，非真实用户投稿
              </p>
            </div>
          </>
        )}
        {page.name === "story" && (
          <>
            {header("同行故事")}
            <article className="story-detail content">
              <span className="story-category">
                {stories[page.index!].category} · {stories[page.index!].time}
                阅读
              </span>
              <h2>{stories[page.index!].title}</h2>
              <blockquote>{stories[page.index!].lead}</blockquote>
              {stories[page.index!].paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
              <div className="story-end">
                <Icon name="heart" size={22} />
                <span>每一份认真，都值得被看见。</span>
              </div>
              {button("我也想说说", () =>
                startChat(stories[page.index!].title),
              )}
              <p className="page-footnote">演示故事，非真实投稿</p>
            </article>
          </>
        )}

        {page.name === "records" && (
          <div className="tab-page">
            <div className="tab-heading">
              <span className="eyebrow">YOUR MOMENTS</span>
              <div>
                <h1>倾诉记录</h1>
                {state.conversations.length > 0 && (
                  <button
                    className="subtle-button"
                    onClick={() => setPopup("clear")}
                  >
                    <Icon name="trash" size={17} />
                    清空
                  </button>
                )}
              </div>
              <p>说出来的心事，都在这里。</p>
            </div>
            {!state.conversations.length ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Icon name="history" size={43} />
                </div>
                <h2>心事，可以从这里放下。</h2>
                <p>
                  还没有倾诉记录。
                  <br />
                  想说的时候，随时来坐坐。
                </p>
                {button("去聊聊", () => startChat())}
              </div>
            ) : (
              <div className="record-list">
                {[...state.conversations]
                  .sort((a, b) => b.time - a.time)
                  .map((c) => (
                    <div className="record-card" key={c.id}>
                      <button
                        className="record-main"
                        onClick={() => {
                          setText("")
                          setMedia("")
                          setAudio(false)
                          go({ name: "chat", id: c.id })
                        }}
                      >
                        <span className="record-icon">
                          <Icon name="chat" size={23} />
                        </span>
                        <div>
                          <small>
                            {new Date(c.time).toLocaleDateString("zh-CN", {
                              month: "long",
                              day: "numeric",
                            })}{" "}
                            ·{" "}
                            {new Date(c.time).toLocaleTimeString("zh-CN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </small>
                          <h3>{c.title}</h3>
                          <p>{c.messages[c.messages.length - 1]?.content}</p>
                        </div>
                        <Icon name="arrow" size={16} />
                      </button>
                      <div className="record-footer">
                        <span>{c.messages.length} 条消息 · 仅本机可见</span>
                        <button
                          aria-label={`删除${c.title}`}
                          onClick={() => {
                            setDeleteId(c.id)
                            setPopup("delete")
                          }}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
            <p className="page-footnote">
              <Icon name="shield" size={14} />
              记录仅存于此浏览器，请勿保存敏感信息
            </p>
          </div>
        )}

        {page.name === "mine" && (
          <div className="tab-page">
            <div className="tab-heading">
              <span className="eyebrow">A LITTLE SPACE FOR YOU</span>
              <h1>我的</h1>
              <p>奔波的日子，也记得照顾自己。</p>
            </div>
            <div className="my-profile">
              <Avatar id={state.partner} />
              <div>
                <h2>{state.profile ? "路上的朋友" : "你好，路上的朋友"}</h2>
                <p>
                  {state.profile
                    ? `${state.profile.occupation} · ${state.profile.age} 岁`
                    : "还没认识？聊聊时再慢慢来。"}
                </p>
                <span className="profile-badge">
                  {state.profile ? "本机演示身份" : "访客 · 无需登录"}
                </span>
              </div>
            </div>
            <div className="settings-group">
              <button
                className="setting-row"
                onClick={() => {
                  setDraftPartner(state.partner)
                  go({ name: "partners", edit: true })
                }}
              >
                <span className="setting-icon">
                  <Icon name="chat" />
                </span>
                <span>聊天伙伴</span>
                <small>
                  {partner.name} · {partner.title}
                </small>
                <Icon name="arrow" size={17} />
              </button>
              <button className="setting-row" onClick={openProfile}>
                <span className="setting-icon">
                  <Icon name="user" />
                </span>
                <span>基本信息</span>
                <small>{state.profile ? "修改" : "未完善"}</small>
                <Icon name="arrow" size={17} />
              </button>
              <button
                className="setting-row"
                role="switch"
                aria-checked={state.dark}
                onClick={() => setState((s) => ({ ...s, dark: !s.dark }))}
              >
                <span className="setting-icon">
                  <Icon name="moon" />
                </span>
                <span>夜间模式</span>
                <span className={`toggle ${state.dark ? "on" : ""}`}>
                  <i />
                </span>
              </button>
            </div>
            <div className="settings-group">
              <button
                className="setting-row"
                onClick={() => setPopup("hotlines")}
              >
                <span className="setting-icon">
                  <Icon name="phone" />
                </span>
                <span>需要更多帮助</span>
                <small>帮助热线</small>
                <Icon name="arrow" size={17} />
              </button>
              <button
                className="setting-row"
                onClick={() => setPopup("privacy")}
              >
                <span className="setting-icon">
                  <Icon name="shield" />
                </span>
                <span>隐私与演示说明</span>
                <Icon name="arrow" size={17} />
              </button>
            </div>
            <div className="mine-quote">
              <BrandArt small />
              <strong>下一单之前，先照顾好自己。</strong>
              <span>歇会儿 · 路上的情绪补给站</span>
            </div>
            <p className="page-footnote">
              交互原型 v1.0 · 所有智能能力均为预设演示
            </p>
          </div>
        )}
      </main>

      {root && (
        <nav className="bottom-nav" aria-label="主要导航">
          {[
            ["home", "home", "歇会儿"],
            ["records", "history", "倾诉记录"],
            ["mine", "user", "我的"],
          ].map(([name, icon, label]) => (
            <button
              key={name}
              className={page.name === name ? "active" : ""}
              aria-current={page.name === name ? "page" : undefined}
              onClick={() => tab(name as "home" | "records" | "mine")}
            >
              <span>
                <Icon name={icon} size={23} />
              </span>
              {label}
            </button>
          ))}
        </nav>
      )}
      {toast && (
        <div role="status" className="toast">
          {toast}
        </div>
      )}
      {popup && (
        <Modal
          title={
            popup === "privacy"
              ? "安心使用，先了解这些"
              : popup === "hotlines"
                ? "你不用一个人扛着"
                : popup === "scenarios"
                  ? "聊天演示菜单"
                  : popup === "images"
                    ? "分享一个路上场景"
                    : popup === "voice"
                      ? "语音说说 · 演示"
                      : popup === "call"
                        ? "确认拨打电话"
                        : popup === "care"
                          ? careLevel === 1
                            ? "先确保你此刻的安全"
                            : "让更多人陪你一起扛"
                          : popup === "clear"
                            ? "清除全部倾诉记录？"
                            : "删除这条记录？"
          }
          onClose={closePopup}
          locked={
            (popup === "care" ||
              (popup === "call" && callReturn.current === "care")) &&
            countdown > 0
          }
        >
          {popup === "privacy" && (
            <div className="modal-copy">
              <div className="privacy-emblem">
                <Icon name="shield" size={35} />
              </div>
              <h3>这是一处可以试着聊聊的地方。</h3>
              <p>
                这是纯前端交互原型，聊天、语音、图片和伙伴均为演示。未接入真实
                AI、微信、录音、摄像头或数字人服务。
              </p>
              <p>
                资料与对话仅存在当前浏览器的 localStorage，
                <strong>不加密，不适合保存敏感信息</strong>
                。清理浏览器数据会丢失本机记录。
              </p>
              <p>
                本原型不提供诊断、风险识别、真人跟进或紧急救援。有实际危险时，请立即联系
                110、120 或身边可信的人。
              </p>
              {button("了解了，安心歇会儿", closePopup)}
            </div>
          )}
          {(popup === "hotlines" || popup === "care") && (
            <div className="modal-copy">
              {popup === "care" && (
                <div
                  className={`care-symbol ${careLevel === 1 ? "urgent" : ""}`}
                >
                  <Icon name="heart" size={30} />
                </div>
              )}
              <p>
                {popup === "care" && careLevel === 1
                  ? "如果你或身边的人正处于危险中，请立即拨打 110 或 120，或联系身边可信的人。尽量待在安全、有人的地方。"
                  : "如果现在很难受，可以找一位真正能听你说话的人。拨通电话，试着把心里的话说出来。"}
              </p>
              {(popup === "care" && careLevel === 1
                ? [
                    ["12356", "全国援助热线"],
                    ["110", "遇到危险 · 报警"],
                    ["120", "需要紧急医疗帮助"],
                  ]
                : [
                    ["12356", "全国援助热线"],
                    ["025-96889910", "南京“宁师傅”热线"],
                  ]
              ).map(([phone, label]) => (
                <div className="hotline-card" key={phone}>
                  <div>
                    <small>{label}</small>
                    <strong>{phone}</strong>
                  </div>
                  <button
                    aria-label={`拨打${phone}`}
                    onClick={() => {
                      setCallNumber(phone)
                      callReturn.current = popup
                      setPopup("call")
                    }}
                  >
                    <Icon name="phone" size={22} />
                  </button>
                  <button
                    className="copy-number"
                    onClick={() => {
                      navigator.clipboard
                        ?.writeText(phone)
                        .then(() => setToast("号码已复制"))
                        .catch(() =>
                          setToast(`复制失败，请手动记录：${phone}`),
                        ) || setToast(`请手动记录：${phone}`)
                    }}
                  >
                    复制
                  </button>
                </div>
              ))}
              <small className="muted">
                地方渠道可能受地区和服务时间限制。点击电话后需再次确认，不会自动拨号。
              </small>
              {popup === "care" && (
                <p className="demo-caption">
                  此卡片由预设场景触发，不代表真实风险识别。原型未通知任何后台或救援人员。
                </p>
              )}
              {button(
                countdown
                  ? `请先阅读 · ${countdown} 秒`
                  : popup === "care"
                    ? "我已了解，继续聊聊"
                    : "我知道了",
                () => {
                  if (!countdown) closePopup()
                },
                true,
              )}
            </div>
          )}
          {popup === "call" && (
            <div className="modal-copy">
              <p>设备将尝试通过电话应用拨打：</p>
              <div className="phone-display">{callNumber}</div>
              <p className="muted">
                在桌面设备上可能无法拨号，也可以手动记录号码。
                {countdown > 0 ? "关闭此确认后将返回紧急支持卡。" : ""}
              </p>
              <a
                className="button primary"
                href={`tel:${callNumber}`}
                onClick={() => {
                  setPopup(callReturn.current)
                }}
              >
                确认拨打
              </a>
              {button("返回热线卡片", () => setPopup(callReturn.current), true)}
            </div>
          )}
          {popup === "scenarios" && (
            <div className="scenario-list">
              <p className="muted">
                体验关怀场景。通过预设场景触发，不分析你实际输入的内容。
              </p>
              {scenarioNames.map((name, i) => (
                <button
                  key={name}
                  onClick={() => {
                    closePopup()
                    send(`【关怀场景演示】${name}`, i + 1)
                  }}
                  disabled={pending.includes(page.id!)}
                >
                  <span className={`scenario-dot dot-${i}`} />
                  {name}
                  <Icon name="arrow" size={16} />
                </button>
              ))}
              <div className="scenario-divider" />
              {["多模态矛盾示例", "近期趋势升级示例"].map((label, i) => (
                <button
                  key={label}
                  disabled={pending.includes(page.id!)}
                  onClick={() => {
                    closePopup()
                    send(
                      `【固定示例】${label}：${
                        i
                          ? "假设连续多次情绪变差，展示更多支持；本原型不进行记忆推理。"
                          : "假设文字与表情不一致，展示呼吸资源；本原型不识别图片。 "
                      }`,
                      i ? 2 : 3,
                    )
                  }}
                >
                  {label}
                  <Icon name="arrow" size={16} />
                </button>
              ))}
              <button
                onClick={() => {
                  setFailNext(true)
                  closePopup()
                  setToast("下一次消息将模拟失败，可点击重试。")
                }}
              >
                体验一次回复失败
                <Icon name="refresh" size={17} />
              </button>
              <button
                onClick={() => {
                  closePopup()
                  tab("records")
                }}
              >
                结束本次聊天
                <Icon name="check" size={17} />
              </button>
            </div>
          )}
          {popup === "images" && (
            <div className="modal-copy">
              <p className="muted">
                仅选择内置演示场景，不访问相册、不做表情分析。
              </p>
              <div className="image-options">
                {["雨天跑单", "驿站歇脚", "夜色归途"].map((label, i) => (
                  <button
                    key={label}
                    onClick={() => {
                      setMedia(label)
                      closePopup()
                    }}
                  >
                    <div className={`scene-preview scene-${i}`}>
                      <Icon name={["shield", "breath", "moon"][i]} size={40} />
                    </div>
                    <strong>{label}</strong>
                    <small>内置场景插画</small>
                  </button>
                ))}
              </div>
            </div>
          )}
          {popup === "voice" && (
            <div className="voice-panel">
              <p className="muted">不会使用麦克风，完成后生成预设转写。</p>
              <div className={`voice-wave ${recording ? "recording" : ""}`}>
                {Array.from({ length: 17 }, (_, i) => (
                  <i
                    key={i}
                    style={{
                      height: `${12 + ((i * 17) % 38)}px`,
                      animationDelay: `${i * 0.07}s`,
                    }}
                  />
                ))}
              </div>
              <strong className="record-time">
                {Math.floor(recordSeconds / 60)
                  .toString()
                  .padStart(2, "0")}
                :{(recordSeconds % 60).toString().padStart(2, "0")}
              </strong>
              <p>
                {recording ? "正在模拟录音，想停就停" : "点一下，试试语音说说"}
              </p>
              {button(recording ? "完成模拟录音" : "开始模拟录音", () => {
                if (!recording) setRecording(true)
                else {
                  setText("今天跑了好多单，有点累，想找个人说说话。")
                  setAudio(true)
                  closePopup()
                }
              })}
              {button("取消", closePopup, true)}
            </div>
          )}
          {(popup === "clear" || popup === "delete") && (
            <div className="modal-copy">
              <p>
                {popup === "clear"
                  ? "这会清除此浏览器内全部演示会话。伙伴、基本资料和主题偏好会保留。"
                  : "这条会话将从此浏览器中删除，无法恢复。"}
              </p>
              <p className="muted">
                仅影响本机原型记录，不涉及任何服务器数据。
              </p>
              <button
                className="button danger"
                onClick={() => {
                  setState((s) => ({
                    ...s,
                    conversations:
                      popup === "clear"
                        ? []
                        : s.conversations.filter((c) => c.id !== deleteId),
                  }))
                  setFailed(null)
                  closePopup()
                  setToast("演示记录已删除")
                }}
              >
                确认{popup === "clear" ? "清除全部" : "删除"}
              </button>
              {button("再想想", closePopup, true)}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
