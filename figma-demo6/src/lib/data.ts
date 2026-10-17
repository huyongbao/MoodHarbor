export type Profile = { age: number; gender: string; occupation: string }
export type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  partner: string
  time: number
  media?: string
  audio?: boolean
  level?: number
}
export type Conversation = {
  id: string
  title: string
  time: number
  messages: Message[]
}
export type State = {
  schemaVersion: 1
  profile: Profile | null
  partner: string
  conversations: Conversation[]
  dark: boolean
}
export const initialState: State = {
  schemaVersion: 1,
  profile: null,
  partner: "zhou",
  conversations: [],
  dark: false,
}
export const partners = [
  {
    id: "zhou",
    name: "老周",
    title: "踏实倾听",
    description: "路上的不容易，坐下来慢慢说。",
    tag: "像一位懂你的老朋友",
  },
  {
    id: "lan",
    name: "阿岚",
    title: "温和鼓励",
    description: "不必一直硬撑，我陪你缓一缓。",
    tag: "温柔接住你的每句话",
  },
]
export const topics = ["超时委屈", "路上奔波", "客户差评", "想找人说说话"]
export const occupations = [
  "外卖骑手",
  "快递员",
  "网约车司机",
  "其他新就业形态",
]
export const stories = [
  {
    title: "那一单超时以后",
    category: "关于委屈",
    time: "3 分钟",
    lead: "“那天有人跟我说，慢一点，安全最重要。”",
    paragraphs: [
      "雨下得很急。老陈在小区门口等了十分钟，电话打了三遍，还是没找到收餐的人。订单超时的提示一响，心里一下子堵住了。",
      "他把车停在便利店旁，没急着接下一单。店里的大姐递来一张纸巾，说：先擦擦，雨这么大，安全最重要。",
      "那一单的委屈没有立刻消失。但被人当回事的那一刻，他终于能松口气了。",
      "路上总有赶不上的时候。停一下，不代表你不够努力。",
    ],
  },
  {
    title: "差评不是我的全部",
    category: "关于差评",
    time: "2 分钟",
    lead: "跑了那么多单，别让一条差评盖住所有认真。",
    paragraphs: [
      "小许盯着那条差评看了很久。自己明明提前打了电话，也认真确认过地址，怎么还是没做好？",
      "在驿站歇脚时，同伴问他：今天送了多少单？三十二单。那其他三十一单呢？",
      "他愣了一下。好像真的，有人道了谢，有人说辛苦了，还有人帮他按了电梯。",
      "一条评价，只是一小段经历，不是对你整个人的定义。今天的认真，依然算数。",
    ],
  },
  {
    title: "路边那把空着的椅子",
    category: "同行互助",
    time: "3 分钟",
    lead: "有时候，一句“来，坐会儿”，就够了。",
    paragraphs: [
      "午高峰过后，阿江坐在路沿上，水已经喝光了，腿有些发软。",
      "旁边的骑手朝他招手：驿站有水，来，坐会儿。两个人不认识，却聊起了熟悉的路口和难找的楼栋。",
      "没聊什么大道理，只是一起坐了十分钟。再出发的时候，肩膀好像没那么紧了。",
      "我们不一定能替彼此跑下一单，但可以留一把椅子，让对方歇一歇。",
    ],
  },
  {
    title: "今天，早点收工",
    category: "给自己放个假",
    time: "2 分钟",
    lead: "照顾好自己，也是今天一件很重要的事。",
    paragraphs: [
      "连着跑了几天，小陆总觉得再跑一单就回家。可一单接着一单，天又黑了。",
      "今天他给自己定了个时间，到点就收工。回家的路上买了份热饭，和家里打了个电话。",
      "少跑几单，他也有点舍不得。但睡了个好觉，第二天的路走得稳了许多。",
      "不用等到撑不住才休息。你和你的辛苦，都值得被照顾。",
    ],
  },
]
export const scenarioNames = [
  "需要立即获得帮助",
  "连续失眠、难以支撑",
  "投诉带来的委屈",
  "日常跑单疲惫",
]
export const replies = [
  "先把自己的安全放在第一位。你不用一个人扛着，请联系身边可信的人，或使用下面的求助电话。这个演示无法提供紧急救援。",
  "这些天没有休息好，又一直撑着，确实很不容易。先找个安全的地方坐一会儿。也可以找能真正听你说话的人，下面这些电话也许能帮上忙。",
  "认真跑了这么久，却遇到投诉，心里堵得慌也是人之常情。先不急着说服自己，委屈可以慢慢说。要不要先一起松口气？",
  "跑了一天，身体累，心里也难免装了不少事。这里不用赶时间，也不用组织好语言。今天最想说的那件事，咱们慢慢聊。",
]
export function uid() {
  return crypto.randomUUID()
}
export const STORAGE_KEY = "xiehuier.demo.v1"
export function loadState(): { state: State; warning: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { state: initialState, warning: "" }
    const s = JSON.parse(raw)
    // Preserve existing demo records when retiring the third placeholder partner.
    if (s.partner === "lin") s.partner = "lan"
    if (Array.isArray(s.conversations)) {
      for (const conversation of s.conversations) {
        if (Array.isArray(conversation?.messages)) {
          for (const message of conversation.messages) {
            if (message?.partner === "lin") message.partner = "lan"
          }
        }
      }
    }
    if (
      s.schemaVersion !== 1 ||
      !partners.some((p) => p.id === s.partner) ||
      !Array.isArray(s.conversations) ||
      typeof s.dark !== "boolean"
    )
      throw Error()
    if (
      s.profile &&
      (!Number.isInteger(s.profile.age) ||
        s.profile.age < 1 ||
        s.profile.age > 120 ||
        !occupations.includes(s.profile.occupation) ||
        !["男", "女", "不愿透露"].includes(s.profile.gender))
    )
      throw Error()
    if (
      !s.conversations.every(
        (c: Conversation) =>
          typeof c.id === "string" &&
          typeof c.title === "string" &&
          typeof c.time === "number" &&
          Array.isArray(c.messages) &&
          c.messages.every(
            (m) =>
              typeof m.content === "string" &&
              typeof m.id === "string" &&
              ["user", "assistant"].includes(m.role),
          ),
      )
    )
      throw Error()
    return { state: s, warning: "" }
  } catch {
    return {
      state: initialState,
      warning: "本机记录暂时无法读取，已进入新的演示。",
    }
  }
}
