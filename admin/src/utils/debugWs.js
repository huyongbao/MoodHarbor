/**
 * 多模态感知调试 · WebSocket 推流层（对齐 PRD 9.2 多模态融合 / 9.5 调试台 / 十二 矛盾校准）
 *
 * 真实链路（后端就绪后自动生效，页面无需改动）：
 *   小程序端用户对着摄像头倾诉 → 后端实时分析
 *   （Py-Feat 表情 / FunASR 转写 / emotion2vec+ 语音情感 / EmoLLM 文本情感）
 *   → WebSocket 推送到管理后台调试页，矛盾融合判定由后端计算后推送。
 *
 * —— WS 端点 ——
 *   ws(s)://<host>/api/v1/admin/ws/debug/multimodal?token=<JWT>
 *
 * —— 消息契约（服务端 → 管理后台，均为 JSON，需与后端同步实现）——
 * 1) 会话开始：
 *    { type:'session_start', sessionId:'s_xxx', userId:10005, startedAt:<ms> }
 * 2) 模态数据更新（每路模态可选携带，时间片约 200~800ms）：
 *    { type:'modality_update', sessionId, timestamp,
 *      video:       { frame:'data:image/jpeg;base64,...' },                     // 关键帧
 *      facial:      { emotion:'sad|calm|happy|fear|angry', confidence:0.88 },   // Py-Feat
 *      voice:       { emotion:'sad|calm|happy|fear|angry', confidence:0.81 },   // emotion2vec+
 *      asr:         { text:'没事，就是累了。', isFinal:true },                   // FunASR，false=中间结果
 *      textEmotion: { riskLevel:4, confidence:0.62 } | null }                   // EmoLLM，null=模型不可用
 * 3) 矛盾分析结果（每句 isFinal 后推送一轮）：
 *    { type:'contradiction_analysis', sessionId, timestamp,
 *      input:{ text:{riskLevel,confidence}|null, facial:{...}|null, voice:{...}|null, asrText:'...' },
 *      steps:[ { key:'model|confidence|rule_fallback|contradiction|trend', name, triggered, detail } ],
 *      final:{ riskLevel:1-4, consistent:true|false, confidence:0.74 } }
 * 4) 数字人回应（按 final 等级选用干预话术，作为"算法正常工作"的旁证）：
 *    { type:'assistant_reply', sessionId, timestamp, text:'...' }
 * 5) 会话结束：
 *    { type:'session_end', sessionId, endedAt, summary:{ rounds, contradictionHits, trendHits, maxLevel } }
 *
 * VITE_USE_MOCK=true 时按预设剧本定时模拟上述全部消息（含 PRD 十二矛盾用例自动注入），
 * 矛盾分析引擎按 PRD 9.2 第 5 步 + PRD 十二「矛盾提升 / 趋势提升 / 规则兜底」规则本地实现。
 */
import { ref } from 'vue'

export const EMOTION_LABELS = {
  happy: '开心',
  calm: '平静',
  sad: '悲伤',
  fear: '恐惧',
  angry: '愤怒'
}

/** 高痛苦情绪集合（PRD 十二：表情高度悲伤/恐惧 → 视为与低风险文本矛盾） */
const DISTRESS = ['sad', 'fear', 'angry']
/** 矛盾判定中表情/语音信号需达到的置信度门槛 */
const DISTRESS_CONF_THRESHOLD = 0.7

const pct = (v) => `${Math.round(v * 100)}%`

/** 极简关键词规则兜底（与后端规则引擎同源语义，仅 Mock 演示用） */
function ruleFallbackLevel(text = '') {
  const t = String(text)
  if (/遗书|跳下去|不想活|自杀|轻生|了此一生/.test(t)) return 1
  if (/撑不住|没意思|垮了|崩溃|绝望|活不下去/.test(t)) return 2
  if (/投诉|罚款|气死|烦|扣分|白跑|疼|腰伤/.test(t)) return 3
  return 4
}

/**
 * 矛盾分析引擎（PRD 9.2 第 5 步 + PRD 十二），Mock 阶段在本地模拟后端判定链：
 * ① 模型初始判定（EmoLLM 文本情感，可能不可用）
 * ② 置信度融合：≥0.8 直接采信模型；<0.8 与规则兜底加权，取更高风险等级
 * ③ 规则兜底：模型不可用或低置信且命中极高危词 → 强制升级，防漏报
 * ④ 矛盾提升：文本低风险(≥3级) + 表情/语音高痛苦 → riskLevel 数值 -1（升一级）
 * ⑤ 趋势提升：Mem0 记录连续三轮同等级且 ≤3 → riskLevel 数值 -1（升一级）
 */
export function analyzeContradiction({ text, facial, voice, asrText = '', history = [] }) {
  const steps = []
  const ruleLv = ruleFallbackLevel(asrText)
  let level = 4

  // ① 模型初始判定
  if (text) {
    steps.push({
      key: 'model',
      name: '① 模型初始判定（EmoLLM）',
      triggered: true,
      detail: `文本情感判定 ${text.riskLevel} 级，置信度 ${pct(text.confidence)}`
    })
  } else {
    steps.push({ key: 'model', name: '① 模型初始判定（EmoLLM）', triggered: false, detail: '模型输出不可用（超时/异常）' })
  }

  // ② 置信度融合
  if (text && text.confidence >= 0.8) {
    level = text.riskLevel
    steps.push({
      key: 'confidence',
      name: '② 置信度融合',
      triggered: false,
      detail: `置信度 ${pct(text.confidence)} ≥ 0.80，直接采信模型结果`
    })
  } else if (text) {
    level = Math.min(text.riskLevel, ruleLv)
    steps.push({
      key: 'confidence',
      name: '② 置信度融合',
      triggered: true,
      detail: `置信度 ${pct(text.confidence)} < 0.80，与规则兜底得分融合，取更高风险等级（模型 ${text.riskLevel} 级 / 规则 ${ruleLv} 级 → ${level} 级）`
    })
  }

  // ③ 规则兜底（防漏报）
  if (!text) {
    level = ruleLv
    steps.push({
      key: 'rule_fallback',
      name: '③ 规则兜底（防漏报）',
      triggered: true,
      detail:
        ruleLv <= 2
          ? `EmoLLM 不可用，关键词规则接管：命中${ruleLv === 1 ? '极高' : '高'}危表达，强制按 ${ruleLv} 级处理，确保不漏报`
          : `EmoLLM 不可用，关键词规则接管：规则判定 ${ruleLv} 级`
    })
  } else if (text.confidence < 0.8 && ruleLv === 1) {
    level = 1
    steps.push({ key: 'rule_fallback', name: '③ 规则兜底（防漏报）', triggered: true, detail: '低置信但命中极高危表达，强制提升为一级，防止漏报' })
  } else {
    steps.push({ key: 'rule_fallback', name: '③ 规则兜底（防漏报）', triggered: false, detail: '未命中极高危词，不干预' })
  }

  // ④ 矛盾提升检测（PRD 9.2 第 5 步）
  const facialHit = !!(facial && DISTRESS.includes(facial.emotion) && facial.confidence >= DISTRESS_CONF_THRESHOLD)
  const voiceHit = !!(voice && DISTRESS.includes(voice.emotion) && voice.confidence >= DISTRESS_CONF_THRESHOLD)
  if (level >= 3 && (facialHit || voiceHit)) {
    const from = level
    level -= 1
    const signals = [
      facialHit && `表情「${EMOTION_LABELS[facial.emotion]}」${pct(facial.confidence)}`,
      voiceHit && `语音「${EMOTION_LABELS[voice.emotion]}」${pct(voice.confidence)}`
    ]
      .filter(Boolean)
      .join('、')
    steps.push({
      key: 'contradiction',
      name: '④ 矛盾提升检测',
      triggered: true,
      detail: `文本 ${from} 级（低风险），但 ${signals} 检出高痛苦信号——"嘴上说没事，表情很悲伤"（PRD 9.2 第5步）→ 自动提升一级：${from} → ${level}`
    })
  } else {
    steps.push({
      key: 'contradiction',
      name: '④ 矛盾提升检测',
      triggered: false,
      detail: level >= 3 ? '表情/语音未检出高痛苦信号，与文本方向一致' : '文本已属高风险（≤2级），无需矛盾提升'
    })
  }

  // ⑤ 趋势提升检测（Mem0 历史情绪）
  const seq = [...history, level].slice(-3)
  if (seq.length === 3 && seq.every((l) => l === level) && level <= 3) {
    const from = level
    level -= 1
    steps.push({
      key: 'trend',
      name: '⑤ 趋势提升检测（Mem0）',
      triggered: true,
      detail: `连续三轮风险持续为 ${from} 级，情绪趋势持续恶化（PRD 十二）→ 提升一级：${from} → ${level}`
    })
  } else {
    steps.push({ key: 'trend', name: '⑤ 趋势提升检测（Mem0）', triggered: false, detail: '无连续同等级恶化趋势' })
  }

  const consistent = !(text && text.riskLevel >= 3 && (facialHit || voiceHit))
  const confs = [text?.confidence, facial?.confidence, voice?.confidence].filter((x) => typeof x === 'number')
  const confidence = confs.length ? +(confs.reduce((a, b) => a + b, 0) / confs.length).toFixed(2) : 0.5

  return { steps, final: { riskLevel: level, consistent, confidence } }
}

/* ------------------------------ Mock 模拟视频帧 ------------------------------
 * 用 canvas 程序化生成"骑手倾诉"模拟画面（头盔 + 表情联动 + 音频波形 + 时间码），
 * 验证 base64 关键帧渲染管线；后端就绪后该函数随 Mock 分支一并移除。
 */
let frameSeq = 0
const frameCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null

export function drawMockFrame(emotion = 'calm') {
  if (!frameCanvas) return ''
  frameSeq++
  const W = 480
  const H = 300
  if (frameCanvas.width !== W) {
    frameCanvas.width = W
    frameCanvas.height = H
  }
  const ctx = frameCanvas.getContext('2d')

  // 背景：暗色房间
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#26313f')
  g.addColorStop(1, '#12181f')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // 窗光光斑（缓慢漂移）
  ctx.fillStyle = 'rgba(130,160,210,0.09)'
  ctx.beginPath()
  ctx.ellipse(90 + (frameSeq % 50), 62, 48, 30, 0, 0, Math.PI * 2)
  ctx.fill()

  // 肩部（骑手服）
  ctx.fillStyle = '#2c4a6e'
  ctx.beginPath()
  ctx.ellipse(W / 2, 322, 112, 92, 0, 0, Math.PI * 2)
  ctx.fill()
  // 反光条
  ctx.fillStyle = 'rgba(244,165,63,0.85)'
  ctx.fillRect(W / 2 - 74, 272, 148, 6)

  // 脸
  const cx = W / 2
  const cy = 150
  const r = 62
  ctx.fillStyle = '#e8b98a'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()

  // 头盔（黄色，骑手特征）
  ctx.fillStyle = '#f4a53f'
  ctx.beginPath()
  ctx.arc(cx, cy - 10, r + 7, Math.PI * 0.98, Math.PI * 2.02)
  ctx.fill()
  ctx.fillRect(cx - r - 7, cy - 18, (r + 7) * 2, 8)

  // 眉毛
  ctx.strokeStyle = '#5a4632'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  if (emotion === 'sad') {
    // 皱眉：内高外低
    ctx.moveTo(cx - 34, cy - 20)
    ctx.lineTo(cx - 14, cy - 27)
    ctx.moveTo(cx + 14, cy - 27)
    ctx.lineTo(cx + 34, cy - 20)
  } else if (emotion === 'fear') {
    // 高挑
    ctx.moveTo(cx - 34, cy - 33)
    ctx.lineTo(cx - 14, cy - 36)
    ctx.moveTo(cx + 14, cy - 36)
    ctx.lineTo(cx + 34, cy - 33)
  } else {
    ctx.moveTo(cx - 33, cy - 26)
    ctx.lineTo(cx - 14, cy - 27)
    ctx.moveTo(cx + 14, cy - 27)
    ctx.lineTo(cx + 33, cy - 26)
  }
  ctx.stroke()

  // 眼睛
  ctx.fillStyle = '#3a2c1e'
  const eyeR = emotion === 'fear' ? 6.5 : 4.5
  ctx.beginPath()
  ctx.arc(cx - 24, cy - 8, eyeR, 0, Math.PI * 2)
  ctx.arc(cx + 24, cy - 8, eyeR, 0, Math.PI * 2)
  ctx.fill()

  // 嘴
  ctx.strokeStyle = '#8a5a3a'
  ctx.lineWidth = 4
  ctx.beginPath()
  if (emotion === 'sad') {
    ctx.moveTo(cx - 22, cy + 32)
    ctx.quadraticCurveTo(cx, cy + 19, cx + 22, cy + 32)
    ctx.stroke()
  } else if (emotion === 'happy') {
    ctx.moveTo(cx - 20, cy + 25)
    ctx.quadraticCurveTo(cx, cy + 40, cx + 20, cy + 25)
    ctx.stroke()
  } else if (emotion === 'fear') {
    ctx.fillStyle = '#7a4a3a'
    ctx.beginPath()
    ctx.ellipse(cx, cy + 30, 11, 9, 0, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.moveTo(cx - 20, cy + 26)
    ctx.quadraticCurveTo(cx, cy + 29, cx + 20, cy + 26)
    ctx.stroke()
  }

  // 底部音频波形
  ctx.strokeStyle = 'rgba(96,211,148,0.85)'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let x = 0; x <= W; x += 4) {
    const y = H - 24 + Math.sin(x / 13 + frameSeq * 0.55) * 7 * Math.sin((x / W) * Math.PI)
    if (x === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()

  // 角标：REC + 时间码 + 水印
  ctx.fillStyle = frameSeq % 2 === 0 ? '#ff4d4f' : 'rgba(255,77,79,0.35)'
  ctx.beginPath()
  ctx.arc(22, 22, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = '12px monospace'
  ctx.textAlign = 'left'
  ctx.fillText('REC', 33, 26)

  const totalSec = frameSeq * 0.35
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0')
  const ss = String(Math.floor(totalSec % 60)).padStart(2, '0')
  const ff = String(Math.floor((totalSec % 1) * 10))
  ctx.textAlign = 'right'
  ctx.fillText(`${mm}:${ss}.${ff}`, W - 14, 26)

  ctx.fillStyle = 'rgba(255,255,255,0.32)'
  ctx.font = '11px sans-serif'
  ctx.fillText('模拟视频帧 · SIMULATED', W - 14, H - 44)

  return frameCanvas.toDataURL('image/jpeg', 0.62)
}

/* ------------------------------ 预设演示剧本 ------------------------------
 * 基于 PRD 十二「测试话术样例集」与矛盾校准样例编排，覆盖：
 * 矛盾提升 / 规则兜底(模型不可用) / 一致高风险 / 趋势提升 / 基线正常。
 */
export const DEBUG_SCRIPTS = [
  {
    id: 'contradiction',
    userId: 10005,
    name: '矛盾提升 · "没事，就是累了"',
    desc: '文本四级（低置信 0.62）+ 表情悲伤 0.88 + 语音压抑 0.81 → 矛盾提升为三级（PRD 十二核心样例）',
    steps: [
      { delay: 800, facial: { emotion: 'calm', confidence: 0.74 }, voice: { emotion: 'calm', confidence: 0.72 }, asr: { text: '喂，小满，能听到我说话吗？', isFinal: true }, textEmotion: { riskLevel: 4, confidence: 0.91 }, analyze: true },
      { delay: 2800, facial: { emotion: 'calm', confidence: 0.69 }, asr: { text: '今天跑了三十单，有点累…', isFinal: false } },
      {
        delay: 2600,
        facial: { emotion: 'sad', confidence: 0.88 },
        voice: { emotion: 'sad', confidence: 0.81 },
        asr: { text: '没事，就是累了。', isFinal: true },
        textEmotion: { riskLevel: 4, confidence: 0.62 },
        analyze: true,
        reply: '你说只是累了，不过我注意到你的状态好像比"累"要沉重一些。愿意多和我说说吗？我一直在。'
      },
      { delay: 3600, end: true }
    ]
  },
  {
    id: 'suicide',
    userId: 10007,
    name: '一级预警 · 遗书信号（规则兜底）',
    desc: 'EmoLLM 超时不可用 → 规则兜底命中极高危词强制一级，验证"模型失效也不漏报"（PRD 9.2 第5步）',
    steps: [
      { delay: 800, facial: { emotion: 'calm', confidence: 0.7 }, voice: { emotion: 'calm', confidence: 0.68 }, asr: { text: '小满，还在吗？', isFinal: true }, textEmotion: { riskLevel: 4, confidence: 0.9 }, analyze: true },
      {
        delay: 2800,
        facial: { emotion: 'sad', confidence: 0.85 },
        voice: { emotion: 'sad', confidence: 0.78 },
        asr: { text: '今晚送完最后一单，我就从桥上跳下去。', isFinal: true },
        textEmotion: null,
        analyze: true,
        reply: '听到你承受了这么多，我很心疼。你现在的安全对我最重要，我想陪着你一起面对。请先看看这个电话，他们随时都在：12356。'
      },
      { delay: 3600, end: true }
    ]
  },
  {
    id: 'exhaustion',
    userId: 10011,
    name: '二级预警 · 三天没合眼',
    desc: '文本二级 0.86 + 表情悲伤 0.75 → 方向一致的高风险，直接热线推荐，验证模型正常输出',
    steps: [
      {
        delay: 800,
        facial: { emotion: 'sad', confidence: 0.75 },
        voice: { emotion: 'sad', confidence: 0.73 },
        asr: { text: '我三天没合眼了，感觉自己快撑不住了。', isFinal: true },
        textEmotion: { riskLevel: 2, confidence: 0.86 },
        analyze: true,
        reply: '三天没合眼还在坚持，真的太不容易了。你的身体已经在报警了，别一个人扛着。这里有热线 12356 和"宁师傅"，他们能给你更专业的支持。'
      },
      { delay: 3600, end: true }
    ]
  },
  {
    id: 'trend',
    userId: 10024,
    name: '趋势提升 · 连续三级恶化',
    desc: '腰伤→疼得睡不着→熬不住，连续三轮三级 → Mem0 趋势提升为二级（PRD 十二·趋势提升样例）',
    steps: [
      { delay: 800, facial: { emotion: 'calm', confidence: 0.72 }, voice: { emotion: 'calm', confidence: 0.7 }, asr: { text: '最近腰伤又犯了，坐着开车都疼。', isFinal: true }, textEmotion: { riskLevel: 3, confidence: 0.85 }, analyze: true },
      { delay: 2600, facial: { emotion: 'sad', confidence: 0.71 }, voice: { emotion: 'sad', confidence: 0.69 }, asr: { text: '疼得晚上都睡不好。', isFinal: true }, textEmotion: { riskLevel: 3, confidence: 0.83 }, analyze: true },
      {
        delay: 2600,
        facial: { emotion: 'sad', confidence: 0.78 },
        voice: { emotion: 'sad', confidence: 0.75 },
        asr: { text: '感觉实在熬不住了。', isFinal: true },
        textEmotion: { riskLevel: 3, confidence: 0.84 },
        analyze: true,
        reply: '带着腰伤还在连轴转，你的身体已经在报警了。我想郑重推荐一个电话：12356，也可以联系"宁师傅"热线聊聊。'
      },
      { delay: 3600, end: true }
    ]
  },
  {
    id: 'normal',
    userId: 10002,
    name: '基线正常 · 四级无矛盾',
    desc: '表情/语音/文本全部一致平静 → 四级不误报，验证链路健康基线',
    steps: [
      {
        delay: 800,
        facial: { emotion: 'happy', confidence: 0.82 },
        voice: { emotion: 'calm', confidence: 0.78 },
        asr: { text: '今天跑了三十单，累是累，但收入还行。', isFinal: true },
        textEmotion: { riskLevel: 4, confidence: 0.9 },
        analyze: true,
        reply: '三十单！这份踏实和拼劲真了不起。记得吃饭别凑合，注意休息哦。'
      },
      { delay: 3600, end: true }
    ]
  }
]

/* ------------------------------ WS 工厂 ------------------------------ */

export function createDebugWs({ onMessage }) {
  const mode = import.meta.env.VITE_USE_MOCK === 'true' ? 'mock' : 'real'
  const state = ref('idle') // idle | connecting | connected
  let timers = []
  let wsRef = null
  let history = []

  const later = (fn, ms) => timers.push(setTimeout(fn, ms))

  function emit(msg) {
    onMessage && onMessage(msg)
  }

  function clearAll() {
    timers.forEach((t) => {
      clearTimeout(t)
      clearInterval(t)
    })
    timers = []
    if (wsRef) {
      try {
        wsRef.onclose = null
        wsRef.close()
      } catch {
        /* noop */
      }
      wsRef = null
    }
  }

  function runMockScript(script) {
    const sessionId = `s_dbg_${Date.now().toString(36)}`
    emit({ type: 'session_start', sessionId, userId: script.userId, startedAt: Date.now() })
    history = []
    let contradictionHits = 0
    let trendHits = 0

    // 关键帧循环：700ms 一帧，画面随当前情绪联动
    let currentEmotion = 'calm'
    const frameTimer = setInterval(() => {
      emit({ type: 'modality_update', sessionId, timestamp: Date.now(), video: { frame: drawMockFrame(currentEmotion) } })
    }, 700)
    timers.push(frameTimer)

    let seqT = 400
    script.steps.forEach((step) => {
      seqT += step.delay
      later(() => {
        if (step.end) {
          clearInterval(frameTimer)
          emit({
            type: 'session_end',
            sessionId,
            endedAt: Date.now(),
            summary: { rounds: history.length, contradictionHits, trendHits, maxLevel: history.length ? Math.min(...history) : 4 }
          })
          later(() => {
            clearAll()
            state.value = 'idle'
          }, 1200)
          return
        }
        if (step.facial) currentEmotion = step.facial.emotion
        const msg = { type: 'modality_update', sessionId, timestamp: Date.now() }
        ;['facial', 'voice', 'asr', 'textEmotion'].forEach((k) => {
          if (step[k] !== undefined) msg[k] = step[k]
        })
        emit(msg)

        if (step.analyze) {
          const input = { text: step.textEmotion, facial: step.facial || null, voice: step.voice || null, asrText: step.asr?.text || '' }
          const result = analyzeContradiction({ ...input, history })
          history.push(result.final.riskLevel)
          if (result.steps.find((s) => s.key === 'contradiction')?.triggered) contradictionHits++
          if (result.steps.find((s) => s.key === 'trend')?.triggered) trendHits++
          emit({ type: 'contradiction_analysis', sessionId, timestamp: Date.now(), input, steps: result.steps, final: result.final })
          if (step.reply) later(() => emit({ type: 'assistant_reply', sessionId, timestamp: Date.now(), text: step.reply }), 1000)
        }
      }, seqT)
    })
  }

  function start(scriptId) {
    clearAll()
    if (mode === 'mock') {
      const script = DEBUG_SCRIPTS.find((s) => s.id === scriptId) || DEBUG_SCRIPTS[0]
      state.value = 'connecting'
      later(() => {
        state.value = 'connected'
        runMockScript(script)
      }, 500)
    } else {
      // 真实模式：连接后端 WS，接收小程序端实时会话推流
      state.value = 'connecting'
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const token = localStorage.getItem('mh_admin_token') || ''
      try {
        wsRef = new WebSocket(`${proto}://${window.location.host}/api/v1/admin/ws/debug/multimodal?token=${encodeURIComponent(token)}`)
        wsRef.onopen = () => {
          state.value = 'connected'
        }
        wsRef.onmessage = (e) => {
          try {
            emit(JSON.parse(e.data))
          } catch {
            /* 非 JSON 消息忽略 */
          }
        }
        wsRef.onclose = () => {
          if (state.value !== 'idle') state.value = 'idle'
        }
        wsRef.onerror = () => {
          state.value = 'idle'
        }
      } catch {
        state.value = 'idle'
      }
    }
  }

  function stop() {
    clearAll()
    state.value = 'idle'
  }

  return { state, mode, start, stop }
}
