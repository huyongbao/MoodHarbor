<template>
  <div class="page">
    <!-- 红色预警横幅：存在未闭环一级预警时置顶提醒，点击直达待跟进红警列表 -->
    <el-alert
      v-if="level1Open > 0"
      type="error"
      :closable="false"
      class="red-banner"
      @click="goRedAlerts"
    >
      <template #title>
        <span>
          红色预警：当前有 {{ level1Open }} 条一级（极高风险）预警未闭环，需立即触发转介并人工跟进
        </span>
        <el-button type="danger" size="small" plain style="margin-left: 12px">立即处理</el-button>
      </template>
    </el-alert>

    <!-- 指标卡 -->
    <el-row :gutter="16" style="margin-top: 12px">
      <el-col v-for="card in statCards" :key="card.label" :span="6">
        <el-card shadow="never" class="stat-card">
          <div class="stat-body">
            <div class="stat-icon" :style="{ background: card.color }">
              <el-icon :size="24"><component :is="card.icon" /></el-icon>
            </div>
            <div>
              <div class="stat-num">{{ card.value }}</div>
              <div class="muted">{{ card.label }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 图表第一行 -->
    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :span="14">
        <el-card shadow="never">
          <template #header>近 7 日活跃与新增用户</template>
          <div ref="trendRef" class="chart" />
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card shadow="never">
          <template #header>情绪分布（近期倾诉）</template>
          <div ref="emotionRef" class="chart" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 图表第二行 -->
    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :span="14">
        <el-card shadow="never">
          <template #header>近 7 日倾诉时长（分钟）</template>
          <div ref="minutesRef" class="chart" />
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card shadow="never">
          <template #header>预警等级分布</template>
          <div ref="alertRef" class="chart" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { h, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import { User, Clock, Bell, Warning } from '@element-plus/icons-vue'
import { getDashboard } from '@/api/admin'

const router = useRouter()
const data = ref(null)
const level1Open = ref(0)

function goRedAlerts() {
  // 横幅统计口径为 pending+processing，跳转只按等级过滤，避免"跟进中"红警被过滤为空
  router.push({ path: '/risk-alerts', query: { level: 1 } })
}

const statCards = ref([
  { label: '今日活跃用户', value: '-', icon: h(User), color: '#4d9de0' },
  { label: '注册用户总数', value: '-', icon: h(User), color: '#5a9e6f' },
  { label: '今日倾诉时长(分钟)', value: '-', icon: h(Clock), color: '#f0845c' },
  { label: '待处理预警', value: '-', icon: h(Bell), color: '#f56c6c' }
])

const trendRef = ref()
const emotionRef = ref()
const minutesRef = ref()
const alertRef = ref()
let charts = []

function renderCharts() {
  if (!data.value) return
  const d = data.value

  const trend = echarts.init(trendRef.value)
  trend.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['活跃用户', '新增用户'] },
    grid: { left: 40, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: d.activeTrend.map((x) => x.date) },
    yAxis: { type: 'value' },
    series: [
      { name: '活跃用户', type: 'line', smooth: true, data: d.activeTrend.map((x) => x.active), itemStyle: { color: '#4d9de0' }, areaStyle: { opacity: 0.12 } },
      { name: '新增用户', type: 'line', smooth: true, data: d.activeTrend.map((x) => x.newUsers), itemStyle: { color: '#5a9e6f' } }
    ]
  })

  const emotion = echarts.init(emotionRef.value)
  emotion.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, type: 'scroll' },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '44%'],
        label: { formatter: '{b}\n{d}%' },
        data: d.emotionDist,
        color: ['#7ec8a9', '#f0b45c', '#8f9fd6', '#e08a8a', '#b7a0d8', '#c9cdd4']
      }
    ]
  })

  const minutes = echarts.init(minutesRef.value)
  minutes.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: d.minutesTrend.map((x) => x.date) },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', name: '倾诉时长', data: d.minutesTrend.map((x) => x.minutes), itemStyle: { color: '#f0845c', borderRadius: [4, 4, 0, 0] } }]
  })

  const alert = echarts.init(alertRef.value)
  const levelColors = ['#f56c6c', '#f0a24d', '#5a9ad6', '#90b8d8']
  alert.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: d.alertLevels.map((x) => x.level) },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      {
        type: 'bar',
        barWidth: 32,
        data: d.alertLevels.map((x, i) => ({ value: x.count, itemStyle: { color: levelColors[i], borderRadius: [4, 4, 0, 0] } }))
      }
    ]
  })

  charts = [trend, emotion, minutes, alert]
}

function onResize() {
  charts.forEach((c) => c.resize())
}

onMounted(async () => {
  data.value = await getDashboard()
  statCards.value[0].value = data.value.todayActive
  statCards.value[1].value = data.value.totalUsers
  statCards.value[2].value = data.value.todayMinutes
  statCards.value[3].value = data.value.pendingAlerts
  level1Open.value = data.value.level1Open || 0
  renderCharts()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  charts.forEach((c) => c.dispose())
})
</script>

<style scoped>
.red-banner {
  cursor: pointer;
}
.stat-card :deep(.el-card__body) {
  padding: 18px;
}
.stat-body {
  display: flex;
  align-items: center;
  gap: 14px;
}
.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.stat-num {
  font-size: 26px;
  font-weight: 600;
  color: #303133;
  line-height: 1.2;
}
.chart {
  height: 280px;
}
</style>
