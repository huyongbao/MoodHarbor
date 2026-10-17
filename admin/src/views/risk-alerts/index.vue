<template>
  <div class="page">
    <el-card shadow="never">
      <el-tabs v-model="activeTab" @tab-change="onTabChange">
        <!-- ================= 预警工单（一级红 / 二级橙） ================= -->
        <el-tab-pane label="预警工单" name="alerts">
          <div class="filter-bar">
            <el-select v-model="query.level" placeholder="预警等级" clearable style="width: 140px">
              <el-option label="一级（红）" :value="1" />
              <el-option label="二级（橙）" :value="2" />
            </el-select>
            <el-select v-model="query.status" placeholder="跟进状态" clearable style="width: 140px">
              <el-option v-for="(v, k) in ALERT_STATUS" :key="k" :label="v.label" :value="k" />
            </el-select>
            <el-button type="primary" :icon="Search" @click="load(1)">查询</el-button>
            <el-button @click="reset">重置</el-button>
            <span class="muted" style="margin-left: auto">
              排序：一级优先置顶；橙单恶化时系统自动升级为红单（跟进时间线留痕）
            </span>
          </div>

          <el-table v-loading="loading" :data="rows" stripe>
            <el-table-column label="等级" width="170">
              <template #default="{ row }">
                <el-tag :type="row.level === 1 ? 'danger' : 'warning'" effect="dark">
                  {{ row.level === 1 ? '一级（红）' : '二级（橙）' }}
                </el-tag>
                <el-tooltip
                  v-if="row.escalatedFrom"
                  :content="`由二级（橙）升级 · ${row.escalatedAt || ''} · ${row.escalatedReason || ''}`"
                  placement="top"
                >
                  <el-tag type="danger" effect="plain" style="margin-left: 6px">橙升红</el-tag>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column prop="nickname" label="用户（脱敏）" width="130" />
            <el-table-column prop="triggerWords" label="触发关键词" min-width="200" show-overflow-tooltip />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="ALERT_STATUS[row.status]?.type">{{ ALERT_STATUS[row.status]?.label || row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="handledBy" label="跟进人" width="110">
              <template #default="{ row }">{{ row.handledBy || '—' }}</template>
            </el-table-column>
            <el-table-column prop="remark" label="跟进备注" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">{{ row.remark || '—' }}</template>
            </el-table-column>
            <el-table-column prop="createdAt" label="上报时间" width="170" />
            <el-table-column prop="updatedAt" label="更新时间" width="170" />
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="viewConversation(row)">对话</el-button>
                <el-button
                  v-if="canHandle && (ALERT_TRANSITIONS[row.status]?.length || 0) > 0"
                  type="primary"
                  link
                  @click="openHandle(row)"
                >
                  跟进
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <el-pagination
            v-model:current-page="query.page"
            v-model:page-size="query.pageSize"
            :total="total"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            class="el-pagination table-pager"
            @current-change="load()"
            @size-change="load(1)"
          />
        </el-tab-pane>

        <!-- ================= 黄色观察（三级升级评估留痕） ================= -->
        <el-tab-pane name="watch">
          <template #label>
            黄色观察
            <el-badge v-if="watchTotal > 0" :value="watchTotal" type="warning" style="margin-left: 4px" />
          </template>
          <div class="filter-bar">
            <el-select v-model="watchQuery.escalated" placeholder="升级评估" clearable style="width: 160px">
              <el-option label="已触发升级（升橙）" value="1" />
              <el-option label="维持疏导（黄）" value="0" />
            </el-select>
            <el-button type="primary" :icon="Search" @click="loadWatch(1)">查询</el-button>
            <span class="muted" style="margin-left: auto">
              三级（中风险）：共情疏导与正常化，无需强制转介，但系统保留升级评估留痕（轨迹 = 近 3 次风险等级）
            </span>
          </div>

          <el-table v-loading="watchLoading" :data="watchRows" stripe>
            <el-table-column label="评估结果" width="180">
              <template #default="{ row }">
                <el-tag :type="row.escalated ? 'warning' : 'primary'" effect="dark">
                  {{ row.escalated ? `已升级至二级（橙）` : '维持三级疏导（黄）' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="nickname" label="用户（脱敏）" width="130" />
            <el-table-column label="风险轨迹（近3次）" width="180">
              <template #default="{ row }">
                <template v-if="row.trajectory && row.trajectory.length">
                  <el-tag
                    v-for="(lv, i) in row.trajectory"
                    :key="i"
                    :type="RISK_LEVELS[lv]?.type"
                    size="small"
                    style="margin-right: 4px"
                  >
                    {{ lv }}
                  </el-tag>
                </template>
                <span v-else>—</span>
              </template>
            </el-table-column>
            <el-table-column prop="reason" label="评估原因" min-width="240" show-overflow-tooltip />
            <el-table-column prop="createdAt" label="评估时间" width="170" />
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="viewConversation(row)">对话</el-button>
              </template>
            </el-table-column>
          </el-table>

          <el-pagination
            v-model:current-page="watchQuery.page"
            v-model:page-size="watchQuery.pageSize"
            :total="watchTotal"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            class="el-pagination table-pager"
            @current-change="loadWatch()"
            @size-change="loadWatch(1)"
          />
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 跟进对话框（含跟进时间线） -->
    <el-dialog v-model="dialogVisible" title="更新跟进状态" width="560px">
      <template v-if="current">
        <el-descriptions :column="1" border size="small" class="handle-desc">
          <el-descriptions-item label="预警编号">{{ current.id }}</el-descriptions-item>
          <el-descriptions-item label="等级">
            <el-tag :type="current.level === 1 ? 'danger' : 'warning'" effect="dark">
              {{ current.level === 1 ? '一级（红）' : '二级（橙）' }}
            </el-tag>
            <el-tag v-if="current.escalatedFrom" type="danger" effect="plain" style="margin-left: 6px">
              由二级（橙）升级
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item v-if="current.escalatedFrom" label="升级原因">
            {{ current.escalatedReason || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="触发关键词">{{ current.triggerWords }}</el-descriptions-item>
          <el-descriptions-item label="当前状态">
            <el-tag :type="ALERT_STATUS[current.status]?.type">{{ ALERT_STATUS[current.status]?.label }}</el-tag>
          </el-descriptions-item>
        </el-descriptions>

        <el-form label-width="80px" style="margin-top: 16px">
          <el-form-item label="流转到">
            <el-radio-group v-model="handleForm.status">
              <el-radio-button v-for="s in nextStatuses" :key="s.value" :value="s.value">
                {{ s.label }}
              </el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="跟进备注">
            <el-input v-model="handleForm.remark" type="textarea" :rows="3" placeholder="记录外呼情况、转介结果等（选填）" />
          </el-form-item>
        </el-form>

        <!-- 跟进时间线：人工状态流转 + 系统自动升级，全部留痕 -->
        <div class="timeline-title">跟进时间线</div>
        <el-timeline v-if="followUps.length" style="padding-left: 4px; margin-top: 8px">
          <el-timeline-item
            v-for="f in followUps"
            :key="f.id"
            :type="f.isSystem ? 'danger' : 'primary'"
            :timestamp="f.createdAt"
          >
            <div class="tl-head">
              <el-tag v-if="f.isSystem" type="danger" size="small" effect="plain">系统</el-tag>
              <el-tag v-else type="primary" size="small" effect="plain">{{ f.operator }}</el-tag>
              <span v-if="f.toStatus" class="tl-flow">
                {{ ALERT_STATUS[f.fromStatus]?.label || '—' }} → {{ ALERT_STATUS[f.toStatus]?.label || f.toStatus }}
              </span>
            </div>
            <div class="tl-note">{{ f.note }}</div>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else-if="!followUpsLoading" description="暂无跟进记录" :image-size="60" />
      </template>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import {
  getRiskAlerts, updateRiskAlert, getAlertFollowUps, getRiskEvaluations
} from '@/api/admin'
import { ALERT_STATUS, ALERT_TRANSITIONS, RISK_LEVELS } from '@/constants/risk'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const store = useUserStore()
const canHandle = store.has('alerts:handle')

const activeTab = ref('alerts')

// ---------- 预警工单 ----------
const loading = ref(false)
const rows = ref([])
const total = ref(0)
const query = reactive({ page: 1, pageSize: 10, level: '', status: '' })

async function load(p) {
  if (p) query.page = p
  loading.value = true
  try {
    const data = await getRiskAlerts({ ...query })
    rows.value = data.list
    total.value = data.total
  } finally {
    loading.value = false
  }
}

function reset() {
  query.level = ''
  query.status = ''
  load(1)
}

// ---------- 黄色观察 ----------
const watchLoading = ref(false)
const watchRows = ref([])
const watchTotal = ref(0)
const watchQuery = reactive({ page: 1, pageSize: 10, escalated: '' })
const watchLoaded = ref(false)

function onTabChange(tab) {
  // 首次切入"黄色观察"时才拉取评估列表
  if (tab === 'watch' && !watchLoaded.value) {
    watchLoaded.value = true
    loadWatch()
  }
}

async function loadWatch(p) {
  if (p) watchQuery.page = p
  watchLoading.value = true
  try {
    const data = await getRiskEvaluations({ ...watchQuery })
    watchRows.value = data.list
    watchTotal.value = data.total
  } finally {
    watchLoading.value = false
  }
}

// ---------- 跟进对话框 ----------
const dialogVisible = ref(false)
const saving = ref(false)
const current = ref(null)
const handleForm = reactive({ status: '', remark: '' })
const followUps = ref([])
const followUpsLoading = ref(false)

const nextStatuses = computed(() =>
  (ALERT_TRANSITIONS[current.value?.status] || []).map((s) => ({ value: s, label: ALERT_STATUS[s].label }))
)

async function openHandle(row) {
  current.value = row
  handleForm.status = ''
  handleForm.remark = row.remark || ''
  dialogVisible.value = true
  followUpsLoading.value = true
  try {
    followUps.value = await getAlertFollowUps(row.id)
  } finally {
    followUpsLoading.value = false
  }
}

async function save() {
  if (!handleForm.status) {
    ElMessage.warning('请选择要流转到的状态')
    return
  }
  saving.value = true
  try {
    await updateRiskAlert(current.value.id, {
      status: handleForm.status,
      handledBy: store.username,
      remark: handleForm.remark
    })
    ElMessage.success('跟进状态已更新')
    dialogVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

// ---------- 查看对话：跳转倾诉记录页并自动打开对应会话 ----------
function viewConversation(row) {
  if (!row.conversationId) {
    ElMessage.warning('该记录未关联会话')
    return
  }
  router.push({ path: '/conversations', query: { conversationId: row.conversationId } })
}

onMounted(() => {
  // 支持驾驶舱红警横幅带参跳转：/risk-alerts?level=1&status=pending
  if (route.query.level) query.level = route.query.level
  if (route.query.status) query.status = route.query.status
  load()
})
</script>

<style scoped>
.handle-desc {
  width: 100%;
}
.timeline-title {
  margin-top: 20px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}
.tl-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tl-flow {
  font-size: 12px;
  color: #606266;
}
.tl-note {
  margin-top: 4px;
  font-size: 13px;
  color: #303133;
  white-space: pre-wrap;
}
</style>
