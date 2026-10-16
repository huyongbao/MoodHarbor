<template>
  <div class="page">
    <!-- 工具条：连接状态 + 场景选择 -->
    <el-card shadow="never" class="toolbar-card">
      <div class="toolbar">
        <div class="tb-left">
          <span class="conn-dot" :class="wsState" />
          <span class="conn-text">{{ connText }}</span>
          <el-tag size="small" :type="mode === 'mock' ? 'warning' : 'success'" effect="plain">
            {{ mode === 'mock' ? '模拟推流（后端就绪后自动切换真实通道）' : '实时通道 · 等待后端推流' }}
          </el-tag>
          <template v-if="session">
            <el-divider direction="vertical" />
            <span class="muted">
              会话 {{ session.sessionId }} · 用户 {{ session.userId }}
              {{ session.ended ? '（已结束）' : '（倾诉中）' }}
            </span>
          </template>
        </div>
        <div class="tb-right">
          <el-select v-model="selectedScript" style="width: 250px" :disabled="wsState !== 'idle'" placeholder="选择演示场景">
            <el-option v-for="s in DEBUG_SCRIPTS" :key="s.id" :value="s.id" :label="s.name" />
          </el-select>
          <el-button type="primary" :loading="wsState === 'connecting'" :disabled="wsState !== 'idle'" @click="startStream">
            开始推流
          </el-button>
          <el-button :disabled="wsState === 'idle'" @click="stopStream">断开</el-button>
        </div>
      </div>
      <div class="script-desc muted">{{ currentScript?.desc }}</div>
    </el-card>

    <el-row :gutter="16" class="main-row">
      <!-- 区域一：实时多模态流 -->
      <el-col :span="14">
        <el-card shadow="never">
          <template #header>
            <div class="card-head">
              <span>区域一 · 实时多模态流</span>
              <span class="muted small">视频 / 表情（Py-Feat）/ 语音转写（FunASR）/ 情感分析（emotion2vec+ · EmoLLM）</span>
            </div>
          </template>

          <!-- 视频帧 + 表情联动 -->
          <div class="video-box">
            <img v-if="videoFrame" :src="videoFrame" class="video-frame" alt="用户实时视频帧" />
            <div v-else class="video-standby">
              <p class="standby-title">待机中</p>
              <p class="muted">选择场景后点击「开始推流」，实时接收小程序端用户的倾诉画面与分析数据</p>
            </div>
            <div v-if="videoFrame" class="video-overlay">
              <span v-if="session && !session.ended" class="live-badge">LIVE</span>
              <el-tag v-if="modality.facial" :type="emotionTagType(modality.facial.emotion)" effect="dark" size="small">
                表情：{{ EMOTION_LABELS[modality.facial.emotion] }} {{ pct(modality.facial.confidence) }}
              </el-tag>
            </div>
          </div>

          <!-- 四路模态状态 -->
          <el-row :gutter="12" class="modality-grid">
            <el-col :span="8">
              <div class="modality-card">
                <div class="m-name">表情分析 <span class="muted small">Py-Feat</span></div>
                <template v-if="modality.facial">
                  <el-tag :type="emotionTagType(modality.facial.emotion)" effect="dark" size="small">
                    {{ EMOTION_LABELS[modality.facial.emotion] }}
                  </el-tag>
                  <el-progress :percentage="pctNum(modality.facial.confidence)" :stroke-width="8" :show-text="false" class="m-bar" />
                  <span class="muted small">置信度 {{ pct(modality.facial.confidence) }}</span>
                </template>
                <span v-else class="muted">—</span>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="modality-card">
                <div class="m-name">语音情感 <span class="muted small">emotion2vec+</span></div>
                <template v-if="modality.voice">
                  <el-tag :type="emotionTagType(modality.voice.emotion)" effect="dark" size="small">
                    {{ EMOTION_LABELS[modality.voice.emotion] }}
                  </el-tag>
                  <el-progress :percentage="pctNum(modality.voice.confidence)" :stroke-width="8" :show-text="false" class="m-bar" />
                  <span class="muted small">置信度 {{ pct(modality.voice.confidence) }}</span>
                </template>
                <span v-else class="muted">—</span>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="modality-card">
                <div class="m-name">文本情感 <span class="muted small">EmoLLM</span></div>
                <template v-if="session && modality.textEmotion === null">
                  <el-tag type="danger" effect="dark" size="small">模型不可用</el-tag>
                  <span class="muted small" style="margin-top: 6px">将由规则兜底接管，防漏报</span>
                </template>
                <template v-else-if="modality.textEmotion">
                  <el-tag :type="RISK_LEVELS[modality.textEmotion.riskLevel].type" effect="dark" size="small">
                    {{ RISK_LEVELS[modality.textEmotion.riskLevel].label }}
                  </el-tag>
                  <el-progress :percentage="pctNum(modality.textEmotion.confidence)" :stroke-width="8" :show-text="false" class="m-bar" />
                  <span class="muted small">置信度 {{ pct(modality.textEmotion.confidence) }}</span>
                </template>
                <span v-else class="muted">—</span>
              </div>
            </el-col>
          </el-row>

          <!-- 语音转写流 -->
          <div class="transcript-head">
            <span>语音转写流（FunASR）</span>
            <span class="muted small">isFinal=完整句 · 数字人回应按最终等级选用话术</span>
          </div>
          <el-scrollbar max-height="220px" class="transcript-scroll">
            <div v-for="t in transcript" :key="t.id" class="t-row" :class="[t.role, { partial: !t.isFinal }]">
              <span class="t-time">{{ t.time }}</span>
              <span class="t-text">{{ t.text }}</span>
              <el-tag v-if="t.role === 'user' && t.level" size="small" :type="RISK_LEVELS[t.level].type" effect="plain">
                {{ t.level }}级
              </el-tag>
              <el-tag v-if="t.role === 'assistant'" size="small" type="success" effect="plain">数字人</el-tag>
              <el-tag v-if="t.role === 'user'" size="small" :type="t.isFinal ? 'info' : 'warning'" effect="plain">
                {{ t.isFinal ? '完整句' : '转写中' }}
              </el-tag>
            </div>
            <el-empty v-if="!transcript.length" description="等待转写数据…" :image-size="56" />
          </el-scrollbar>
        </el-card>
      </el-col>

      <!-- 区域二：矛盾分析面板 -->
      <el-col :span="10">
        <el-card shadow="never">
          <template #header>
            <div class="card-head">
              <span>区域二 · 矛盾分析面板</span>
              <span class="muted small">PRD 9.2 第5步 · 十二 矛盾校准</span>
            </div>
          </template>

          <!-- 最新融合结论 -->
          <div v-if="latest" class="verdict" :class="{ contradict: !latest.final.consistent }">
            <el-tag :type="RISK_LEVELS[latest.final.riskLevel].type" effect="dark" size="large">
              最终 {{ RISK_LEVELS[latest.final.riskLevel].label }}
            </el-tag>
            <el-tag :type="latest.final.consistent ? 'success' : 'danger'" size="large" effect="plain">
              {{ latest.final.consistent ? '三模态一致' : '矛盾检出 · 已提升' }}
            </el-tag>
            <span class="muted">融合置信度 {{ pct(latest.final.confidence) }}</span>
          </div>
          <div v-else class="verdict verdict-empty">
            <span class="muted">推流开始后，每句完整转写将在这里展示完整判定链</span>
          </div>

          <!-- 会话统计 -->
          <div class="stat-chips">
            <el-tag effect="plain" type="info">分析轮次 {{ stats.rounds }}</el-tag>
            <el-tag effect="plain" :type="stats.contradictionHits ? 'danger' : 'info'">矛盾检出 {{ stats.contradictionHits }}</el-tag>
            <el-tag effect="plain" :type="stats.trendHits ? 'warning' : 'info'">趋势提升 {{ stats.trendHits }}</el-tag>
            <el-tag effect="plain" :type="stats.maxLevel <= 2 ? 'danger' : 'info'">最高风险 {{ stats.maxLevel }} 级</el-tag>
          </div>

          <!-- 判定链时间线 -->
          <el-scrollbar max-height="430px" class="ana-scroll">
            <el-timeline class="ana-timeline">
              <el-timeline-item
                v-for="(a, idx) in analyses"
                :key="a.id"
                :type="RISK_LEVELS[a.final.riskLevel].type"
                :timestamp="`第 ${analyses.length - idx} 轮 · ${a.time}`"
                placement="top"
              >
                <div class="ana-card">
                  <div class="ana-head">
                    <el-tag :type="RISK_LEVELS[a.final.riskLevel].type" effect="dark">
                      {{ RISK_LEVELS[a.final.riskLevel].label }}
                    </el-tag>
                    <el-tag size="small" :type="a.final.consistent ? 'success' : 'danger'" effect="plain">
                      {{ a.final.consistent ? '一致' : '矛盾检出' }}
                    </el-tag>
                    <span class="muted small">置信度 {{ pct(a.final.confidence) }}</span>
                  </div>
                  <div class="ana-input muted small">
                    输入 → 文本：{{ a.input.text ? `${a.input.text.riskLevel}级 / ${pct(a.input.text.confidence)}` : '模型不可用' }}
                    ｜表情：{{ a.input.facial ? `${EMOTION_LABELS[a.input.facial.emotion]} ${pct(a.input.facial.confidence)}` : '—' }}
                    ｜语音：{{ a.input.voice ? `${EMOTION_LABELS[a.input.voice.emotion]} ${pct(a.input.voice.confidence)}` : '—' }}
                  </div>
                  <div v-for="s in a.steps" :key="s.key" class="step-row" :class="{ hit: s.triggered, hot: s.triggered && s.key === 'contradiction' }">
                    <div class="step-line">
                      <span class="step-name">{{ s.name }}</span>
                      <el-tag size="small" :type="s.triggered ? (s.key === 'contradiction' ? 'danger' : 'warning') : 'info'" effect="plain">
                        {{ s.triggered ? '触发' : '通过' }}
                      </el-tag>
                    </div>
                    <div class="step-detail muted small">{{ s.detail }}</div>
                  </div>
                </div>
              </el-timeline-item>
            </el-timeline>
            <el-empty v-if="!analyses.length" description="暂无矛盾分析结果" :image-size="56" />
          </el-scrollbar>
        </el-card>
      </el-col>
    </el-row>

    <!-- PRD 9.5：单句快速评测（文本通道，保留原有能力） -->
    <el-card shadow="never" class="legacy-card">
      <el-collapse v-model="legacyOpen">
        <el-collapse-item name="eval" title="单句快速评测（PRD 9.5 · 文本评测通道，模拟「模型输出 + 规则兜底」链路）">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form label-width="90px">
                <el-form-item label="预设用例">
                  <el-select v-model="selectedCase" placeholder="选择 PRD 测试话术样例" style="width: 100%" @change="applyCase">
                    <el-option v-for="c in cases" :key="c.id" :value="c.id" :label="`[${c.expect}] ${c.text.slice(0, 20)}…`" />
                  </el-select>
                </el-form-item>
                <el-form-item label="测试语句">
                  <el-input v-model="evalText" type="textarea" :rows="3" placeholder="输入待评测的用户倾诉语句…" />
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" :loading="evaluating" @click="submitEval">提交评测</el-button>
                </el-form-item>
              </el-form>
            </el-col>
            <el-col :span="12">
              <template v-if="evalResult">
                <el-descriptions :column="1" border size="small">
                  <el-descriptions-item label="风险等级">
                    <el-tag :type="RISK_LEVELS[evalResult.riskLevel].type" effect="dark">{{ RISK_LEVELS[evalResult.riskLevel].label }}</el-tag>
                    <span class="muted" style="margin-left: 8px">置信度 {{ Math.round(evalResult.confidence * 100) }}%</span>
                  </el-descriptions-item>
                  <el-descriptions-item label="判定依据">{{ evalResult.reason }}</el-descriptions-item>
                  <el-descriptions-item label="干预动作">
                    <el-tag :type="INTERVENTION_TYPES[evalResult.intervention.type]?.type" effect="dark">
                      {{ INTERVENTION_TYPES[evalResult.intervention.type]?.label || evalResult.intervention.type }}
                    </el-tag>
                  </el-descriptions-item>
                </el-descriptions>
              </template>
              <el-empty v-else description="提交语句后查看模型输出" :image-size="56" />
            </el-col>
          </el-row>
        </el-collapse-item>
      </el-collapse>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { evalRisk, getDebugPresetCases } from '@/api/admin'
import { RISK_LEVELS, INTERVENTION_TYPES } from '@/constants/risk'
import { DEBUG_SCRIPTS, EMOTION_LABELS, createDebugWs } from '@/utils/debugWs'

/* ------------------------------ 推流通道 ------------------------------ */
const selectedScript = ref('contradiction')
const currentScript = computed(() => DEBUG_SCRIPTS.find((s) => s.id === selectedScript.value))

const session = ref(null)
const videoFrame = ref('')
const modality = ref({ facial: null, voice: null, textEmotion: undefined })
const transcript = ref([])
const analyses = ref([])
const stats = ref({ rounds: 0, contradictionHits: 0, trendHits: 0, maxLevel: 4 })
let lastPartialIdx = null
let rowId = 0

const ws = createDebugWs({ onMessage: handleMessage })
const wsState = ws.state
const mode = ws.mode

const connText = computed(
  () => ({ idle: '未连接', connecting: '连接中…', connected: '已连接 · 数据接收中' })[wsState.value] || '未连接'
)
const latest = computed(() => analyses.value[0] || null)

function pct(v) {
  return `${Math.round(v * 100)}%`
}
function pctNum(v) {
  return Math.round(v * 100)
}
function emotionTagType(emo) {
  return emo === 'happy' ? 'success' : emo === 'calm' ? 'info' : 'danger'
}
function fmtTime(ts) {
  return new Date(ts || Date.now()).toLocaleTimeString('zh-CN', { hour12: false })
}

function resetRuntime() {
  session.value = null
  videoFrame.value = ''
  modality.value = { facial: null, voice: null, textEmotion: undefined }
  transcript.value = []
  analyses.value = []
  stats.value = { rounds: 0, contradictionHits: 0, trendHits: 0, maxLevel: 4 }
  lastPartialIdx = null
}

function handleMessage(msg) {
  if (msg.type === 'session_start') {
    resetRuntime()
    session.value = { ...msg, ended: false }
    ElMessage.success('推流会话已开始，正在接收多模态数据')
  } else if (msg.type === 'modality_update') {
    if (msg.video?.frame) videoFrame.value = msg.video.frame
    if (msg.facial) modality.value.facial = msg.facial
    if (msg.voice) modality.value.voice = msg.voice
    if (msg.textEmotion !== undefined) modality.value.textEmotion = msg.textEmotion
    if (msg.asr?.text) {
      const item = {
        id: ++rowId,
        time: fmtTime(msg.timestamp),
        role: 'user',
        text: msg.asr.text,
        isFinal: !!msg.asr.isFinal,
        level: msg.asr.isFinal ? msg.textEmotion?.riskLevel ?? null : null
      }
      if (!msg.asr.isFinal) {
        // 中间结果：替换上一条 partial，避免转写流碎片化
        if (lastPartialIdx !== null && transcript.value[lastPartialIdx]) {
          transcript.value.splice(lastPartialIdx, 1, item)
        } else {
          transcript.value.push(item)
          lastPartialIdx = transcript.value.length - 1
        }
      } else {
        if (lastPartialIdx !== null && transcript.value[lastPartialIdx]) {
          transcript.value.splice(lastPartialIdx, 1, item)
        } else {
          transcript.value.push(item)
        }
        lastPartialIdx = null
      }
    }
  } else if (msg.type === 'assistant_reply') {
    transcript.value.push({ id: ++rowId, time: fmtTime(msg.timestamp), role: 'assistant', text: msg.text, isFinal: true, level: null })
  } else if (msg.type === 'contradiction_analysis') {
    analyses.value.unshift({ id: ++rowId, time: fmtTime(msg.timestamp), input: msg.input, steps: msg.steps, final: msg.final })
    stats.value.rounds++
    if (msg.steps.find((s) => s.key === 'contradiction')?.triggered) stats.value.contradictionHits++
    if (msg.steps.find((s) => s.key === 'trend')?.triggered) stats.value.trendHits++
    stats.value.maxLevel = Math.min(stats.value.maxLevel, msg.final.riskLevel)
    if (!msg.final.consistent) {
      ElMessage.warning(`矛盾检出：文本与表情/语音方向不一致，已按 PRD 规则提升至 ${msg.final.riskLevel} 级`)
    }
  } else if (msg.type === 'session_end') {
    if (session.value) session.value.ended = true
    const s = msg.summary || {}
    ElMessage.info(`会话结束：共 ${s.rounds ?? 0} 轮分析，矛盾检出 ${s.contradictionHits ?? 0} 次，最高风险 ${s.maxLevel ?? 4} 级`)
  }
}

function startStream() {
  resetRuntime()
  ws.start(selectedScript.value)
}
function stopStream() {
  ws.stop()
  if (session.value) session.value.ended = true
}
onUnmounted(() => ws.stop())

/* ------------------------------ 单句评测（PRD 9.5） ------------------------------ */
const legacyOpen = ref([])
const cases = ref([])
const selectedCase = ref('')
const evalText = ref('')
const evaluating = ref(false)
const evalResult = ref(null)

function applyCase(id) {
  const c = cases.value.find((x) => x.id === id)
  if (c) evalText.value = c.text
}
async function submitEval() {
  if (!evalText.value.trim()) {
    ElMessage.warning('请输入测试语句')
    return
  }
  evaluating.value = true
  try {
    evalResult.value = await evalRisk({ text: evalText.value, inputTypes: ['text'] })
  } finally {
    evaluating.value = false
  }
}

onMounted(async () => {
  try {
    const data = await getDebugPresetCases()
    cases.value = data?.cases || []
  } catch {
    cases.value = []
  }
})
</script>

<style scoped>
.toolbar-card :deep(.el-card__body) {
  padding: 14px 20px;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.tb-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.tb-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.conn-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #909399;
  flex-shrink: 0;
}
.conn-dot.connecting {
  background: #e6a23c;
  animation: blink 0.8s infinite;
}
.conn-dot.connected {
  background: #67c23a;
  animation: blink 1.6s infinite;
}
@keyframes blink {
  50% {
    opacity: 0.35;
  }
}
.conn-text {
  font-size: 14px;
  font-weight: 600;
}
.script-desc {
  margin-top: 8px;
  font-size: 12px;
}
.main-row {
  margin-top: 16px;
}
.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.small {
  font-size: 12px;
}

/* 视频 */
.video-box {
  position: relative;
  background: #0d1117;
  border-radius: 6px;
  overflow: hidden;
  aspect-ratio: 8/5;
}
.video-frame {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.video-standby {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
  padding: 0 40px;
}
.standby-title {
  color: #cfd8e3;
  font-size: 16px;
  margin: 0;
}
.video-standby .muted {
  color: #6e7a8a;
  font-size: 12px;
  margin: 0;
}
.video-overlay {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.live-badge {
  background: #f56c6c;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  padding: 2px 8px;
  border-radius: 3px;
  animation: blink 1.2s infinite;
}

/* 模态卡 */
.modality-grid {
  margin-top: 12px;
}
.modality-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px 12px;
  min-height: 96px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.m-name {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}
.m-bar {
  width: 100%;
}

/* 转写流 */
.transcript-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin: 14px 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}
.transcript-scroll {
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 6px;
}
.t-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
}
.t-time {
  color: #909399;
  font-size: 12px;
  font-family: monospace;
  flex-shrink: 0;
}
.t-text {
  flex: 1;
}
.t-row.user .t-text {
  color: #303133;
}
.t-row.assistant .t-text {
  color: #5a9e6f;
}
.t-row.partial .t-text {
  color: #a8abb2;
  font-style: italic;
}

/* 矛盾分析 */
.verdict {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}
.verdict.contradict {
  border-color: #f89898;
  background: #fef0f0;
}
.verdict-empty {
  justify-content: center;
}
.stat-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 10px 0 4px;
}
.ana-scroll {
  margin-top: 8px;
}
.ana-timeline {
  padding-left: 4px;
  padding-right: 4px;
}
.ana-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px 12px;
}
.ana-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ana-input {
  margin: 8px 0;
  line-height: 1.6;
}
.step-row {
  padding: 6px 10px;
  border-radius: 4px;
  margin-bottom: 4px;
  background: #fafafa;
}
.step-row.hit {
  background: #fdf6ec;
  border-left: 3px solid #e6a23c;
}
.step-row.hot {
  background: #fef0f0;
  border-left: 3px solid #f56c6c;
}
.step-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.step-name {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}
.step-detail {
  margin-top: 2px;
  line-height: 1.5;
}
.muted {
  color: #909399;
}

.legacy-card {
  margin-top: 16px;
}
</style>
